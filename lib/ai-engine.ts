import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { GoogleGenAI, Type } from "@google/genai";
import sharp from "sharp";
import {
  AIProvider,
  AIPhotoMode,
  AspectRatio,
  GeneratedContentPayload,
  ImageAIProvider,
  PostFormat,
  PublishTargets,
} from "./types";

export function cleanCreativePrompt(raw?: string | null): string {
  return (raw || "")
    .replace(/\[cite:\s*[^\]]+\]/gi, "")
    .replace(/^Prompt da imagem\s*,?\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const META_GRAPH_BASE_URL = "https://graph.facebook.com/v21.0";

export interface R2StorageConfig {
  accountId?: string | null;
  accessKeyId?: string | null;
  secretAccessKey?: string | null;
  bucketName?: string | null;
  publicUrl?: string | null;
}

function getR2Client(r2Config?: R2StorageConfig) {
  const hasCompleteCustomR2 = Boolean(
    r2Config?.accountId?.trim() &&
    r2Config?.accessKeyId?.trim() &&
    r2Config?.secretAccessKey?.trim() &&
    r2Config?.bucketName?.trim() &&
    r2Config?.publicUrl?.trim()
  );

  const accountId = hasCompleteCustomR2
    ? r2Config!.accountId!.trim()
    : process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = hasCompleteCustomR2
    ? r2Config!.accessKeyId!.trim()
    : process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = hasCompleteCustomR2
    ? r2Config!.secretAccessKey!.trim()
    : process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = hasCompleteCustomR2
    ? r2Config!.bucketName!.trim()
    : process.env.R2_BUCKET_NAME?.trim();
  const publicUrl = (
    hasCompleteCustomR2
      ? r2Config!.publicUrl!.trim()
      : process.env.R2_PUBLIC_URL?.trim() || ""
  ).replace(/\/+$/, "");

  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucketName ||
    !publicUrl
  ) {
    throw new Error(
      "Credenciais do Cloudflare R2 ausentes (configure na aba Integrações ou nas variáveis de ambiente)."
    );
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return { client, bucketName, publicUrl };
}

export async function uploadBufferToR2(
  buffer: Buffer,
  key: string,
  contentType = "image/png",
  r2Config?: R2StorageConfig
): Promise<string> {
  const { client, bucketName, publicUrl } = getR2Client(r2Config);
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return `${publicUrl}/${key}`;
}

export async function testR2Connection(r2Config?: R2StorageConfig): Promise<{
  valid: boolean;
  mode: "custom" | "global_fallback";
  bucket?: string;
  message: string;
}> {
  const hasCompleteCustomR2 = Boolean(
    r2Config?.accountId?.trim() &&
    r2Config?.accessKeyId?.trim() &&
    r2Config?.secretAccessKey?.trim() &&
    r2Config?.bucketName?.trim() &&
    r2Config?.publicUrl?.trim()
  );

  try {
    const { client, bucketName } = getR2Client(r2Config);
    await client.send(
      new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 1 })
    );
    return {
      valid: true,
      mode: hasCompleteCustomR2 ? "custom" : "global_fallback",
      bucket: bucketName,
      message: hasCompleteCustomR2
        ? `Bucket próprio "${bucketName}" conectado com sucesso.`
        : `Usando bucket padrão do servidor ("${bucketName}").`,
    };
  } catch (err) {
    return {
      valid: false,
      mode: hasCompleteCustomR2 ? "custom" : "global_fallback",
      message:
        err instanceof Error
          ? `Falha no Cloudflare R2: ${err.message}`
          : "Falha ao conectar no Cloudflare R2.",
    };
  }
}

function appendLog(logs: string[], msg: string) {
  logs.push(`[${new Date().toISOString()}] ${msg}`);
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `${label} atingiu tempo limite (${Math.round(ms / 1000)}s).`
              )
            ),
          ms
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildCopywritingPrompt(params: {
  companyName: string;
  topicTitle: string;
  promptInstructions: string;
  offerPrice?: string | null;
  benefits: string[];
  format: PostFormat;
  slidesCount: number;
  ctaDefault: string;
  previousHeadlines: string[];
}): string {
  const antiRepeatBlock =
    params.previousHeadlines.length > 0
      ? `\nMEMÓRIA ANTI-REPETIÇÃO (NUNCA repita nem copie estes últimos títulos já publicados neste assunto):\n${params.previousHeadlines
        .map((h, i) => `${i + 1}. "${h}"`)
        .join("\n")}\n`
      : "";

  const benefitsBlock =
    params.benefits.length > 0
      ? `DIFERENCIAIS / BENEFÍCIOS PRINCIPAIS:\n${params.benefits
        .map((b) => `- ${b}`)
        .join("\n")}`
      : "";

  const angleRotationHint =
    params.previousHeadlines.length > 0
      ? `\nROTAÇÃO DE ÂNGULO (OBRIGATÓRIO): Escolha UM ângulo/diferencial diferente dos últimos posts (por exemplo: alternar entre 1- Fim dos curiosos/simulador + iCal Airbnb/Booking, 2- PIX direto na conta sem intermediários, 3- Atendimento IA 24h no WhatsApp + contratos PDF automáticos, 4- Controle de aprovação + cronograma de limpeza e financeiro, 5- Site próprio 100% editável pelo dono) para cada post ter chamada e benefícios inéditos.`
      : "";

  return `Você é o estrategista de marketing e copywriter sênior escrevendo para a empresa "${params.companyName}".

ASSUNTO DO POST: ${params.topicTitle}
INSTRUÇÕES E BRIEFING DO CLIENTE:
${cleanCreativePrompt(params.promptInstructions)}

OFERTA / PREÇO EM DESTAQUE: ${params.offerPrice || "Consulte condições especiais"}
CTA PADRÃO DESEJADO: ${params.ctaDefault}
${benefitsBlock}
FORMATO SOLICITADO: ${params.format === "CAROUSEL"
      ? `CARROSSEL com EXATAMENTE ${params.slidesCount} slides`
      : "IMAGEM ÚNICA (1 slide principal)"
    }
${antiRepeatBlock}${angleRotationHint}
REGRAS ESTRITAS:
0. Se as instruções acima citarem explicitamente um título entre aspas para o topo da arte (ex: "CONTROLE TUDO + ATENDIMENTO COM IA"), use EXATAMENTE esse título em "headline_arte".
1. NUNCA use emojis nos textos das artes (tema_visual, headline_arte, subtitulo_arte, dor_vs_solucao, destaque_selo, beneficios, slides). Use emojis APENAS no campo "legenda".
2. tema_visual: Frase curta (2 a 4 palavras) para badge no topo da arte.
3. headline_arte: De 5 a 8 palavras, forte, publicitária e inédita (ortografia 100% perfeita em português com todos os acentos corretos).
4. subtitulo_arte: Frase informativa de 8 a 12 palavras explicando a proposta de valor e reforçando o benefício ou preço (${params.offerPrice || ""}).
5. dor_vs_solucao: Frase persuasiva de 10 a 14 palavras contrastando a dor do cliente com a solução prática.
6. destaque_selo: Selo em caixa alta de 3 a 6 palavras (ex: "PIX DIRETO NA CONTA • SEM INTERMEDIÁRIOS" ou "0% COMISSÃO • 100% SEU").
7. beneficios: Array com exatamente 4 diferenciais informativos e completos de **5 a 7 palavras cada** (ex: "Simulador de orçamento em tempo real", "Calendário integrado Airbnb e Booking", "Contrato e recibo digital em PDF", "Atendimento com IA 24h no WhatsApp") escritos com ortografia e acentuação 100% perfeitas em português (não corte para 2 palavras genéricas e não escreva parágrafos longos de várias frases).
8. slides: Array com EXATAMENTE ${params.format === "CAROUSEL" ? params.slidesCount : 1
    } objetos, cada um contendo:
   - badge (ex: "PASSO 01", "DESTAQUE", "OFERTA")
   - title (título curto do slide, máx. 7 palavras)
   - body (frase informativa e clara de 10 a 14 palavras para ficar legível e nítida na arte)
   - highlight (opcional, dado ou preço curto de até 5 palavras)${
     params.format === "CAROUSEL"
       ? `
   IMPORTANTE PARA CARROSSEL CONTÍNUO: Escreva os ${params.slidesCount} slides como uma HISTÓRIA EM SEQUÊNCIA para a pessoa ir arrastando e lendo:
   * Slide 1: Gancho forte de abertura (dor ou curiosidade) que convida a arrastar para o lado. NÃO despeje todos os benefícios nem o preço completo aqui.
   * Slides intermediários: Continuação lógica passo a passo (cada slide desenvolve 1 ideia conectada ao slide anterior).
   * Último slide (Slide ${params.slidesCount}): Conclusão + oferta/preço (${params.offerPrice || "condição especial"}) + CTA final ("${params.ctaDefault}").`
       : ""
   }
9. legenda: Copy persuasiva em português do Brasil com parágrafos curtos, emojis estratégicos e CTA final alinhado a "${params.ctaDefault}".
10. hashtags: Lista de hashtags relevantes separadas por espaço.

Retorne EXCLUSIVAMENTE um JSON válido com as chaves:
{
  "tema_visual": string,
  "headline_arte": string,
  "subtitulo_arte": string,
  "dor_vs_solucao": string,
  "destaque_selo": string,
  "beneficios": string[],
  "slides": [{ "badge": string, "title": string, "body": string, "highlight": string }],
  "legenda": string,
  "hashtags": string
}`;
}

function normalizePayload(
  raw: Partial<GeneratedContentPayload>,
  slidesCount: number,
  fallbackBenefits: string[]
): GeneratedContentPayload {
  const slides = Array.isArray(raw.slides) ? raw.slides : [];
  while (slides.length < slidesCount) {
    const num = slides.length + 1;
    slides.push({
      badge: `SLIDE ${num}`,
      title: raw.headline_arte || "Solução Completa Para Você",
      body:
        raw.subtitulo_arte ||
        "Qualidade, agilidade e atendimento personalizado para o seu negócio.",
      highlight: raw.destaque_selo || "",
    });
  }

  return {
    tema_visual: raw.tema_visual || "Destaque Especial",
    headline_arte: raw.headline_arte || "Transforme Seus Resultados Hoje",
    subtitulo_arte: raw.subtitulo_arte || "Conheça nossa condição especial",
    dor_vs_solucao:
      raw.dor_vs_solucao ||
      "Chega de perder tempo com soluções improvisadas que não convertem.",
    destaque_selo: raw.destaque_selo || "OFERTA ESPECIAL",
    beneficios:
      Array.isArray(raw.beneficios) && raw.beneficios.length > 0
        ? raw.beneficios.slice(0, 6)
        : fallbackBenefits.slice(0, 6),
    slides: slides.slice(0, slidesCount),
    legenda: raw.legenda || "Confira essa novidade! Comente EU QUERO.",
    hashtags: raw.hashtags || "#MarketingDigital #Qualidade #Novidade",
  };
}

function extractJsonString(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text.trim();
}

async function runGeminiText(
  apiKey: string,
  prompt: string,
  logs: string[]
): Promise<{ raw: Partial<GeneratedContentPayload>; model: string }> {
  const ai = new GoogleGenAI({ apiKey });
  const envModel = process.env.GEMINI_MODEL?.trim();
  const candidates = Array.from(
    new Set([
      ...(envModel ? [envModel] : []),
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
    ])
  );

  let lastError: unknown;
  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    appendLog(logs, `Multi-IA [Gemini]: Tentando modelo ${model}...`);
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                tema_visual: { type: Type.STRING },
                headline_arte: { type: Type.STRING },
                subtitulo_arte: { type: Type.STRING },
                dor_vs_solucao: { type: Type.STRING },
                destaque_selo: { type: Type.STRING },
                beneficios: { type: Type.ARRAY, items: { type: Type.STRING } },
                slides: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      badge: { type: Type.STRING },
                      title: { type: Type.STRING },
                      body: { type: Type.STRING },
                      highlight: { type: Type.STRING },
                    },
                    required: ["badge", "title", "body"],
                  },
                },
                legenda: { type: Type.STRING },
                hashtags: { type: Type.STRING },
              },
              required: [
                "tema_visual",
                "headline_arte",
                "subtitulo_arte",
                "dor_vs_solucao",
                "destaque_selo",
                "beneficios",
                "slides",
                "legenda",
                "hashtags",
              ],
            },
            temperature: 0.9,
          },
        }),
        10_000,
        `Gemini (${model})`
      );
      if (!response.text) throw new Error("Resposta vazia do Gemini.");
      return {
        raw: JSON.parse(extractJsonString(response.text)),
        model: `GEMINI (${model})`,
      };
    } catch (err) {
      lastError = err;
      appendLog(
        logs,
        `Multi-IA [Gemini ${model}] falhou: ${err instanceof Error ? err.message : String(err)
        }`
      );
      if (i < candidates.length - 1) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Todos os modelos Gemini falharam.");
}

async function runOpenAIText(
  apiKey: string,
  prompt: string,
  logs: string[]
): Promise<{ raw: Partial<GeneratedContentPayload>; model: string }> {
  const models = ["gpt-4.1-mini", "gpt-4o-mini"];
  let lastError: unknown;

  for (const model of models) {
    appendLog(logs, `Multi-IA [OpenAI]: Tentando ${model}...`);
    try {
      const payload: Record<string, unknown> = {
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Você responde apenas com JSON válido em português do Brasil.",
          },
          { role: "user", content: prompt },
        ],
      };
      if (!model.startsWith("gpt-5")) {
        payload.temperature = 0.85;
      }

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };

      if (!res.ok || !data.choices?.[0]?.message?.content) {
        throw new Error(
          `OpenAI (${model}) falhou (HTTP ${res.status}): ${
            data.error?.message || res.statusText
          }`
        );
      }

      return {
        raw: JSON.parse(extractJsonString(data.choices[0].message.content)),
        model: `OPENAI (${model})`,
      };
    } catch (err) {
      lastError = err;
      appendLog(
        logs,
        `Multi-IA [OpenAI ${model}] falhou: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Todos os modelos de texto OpenAI falharam.");
}

async function runClaudeText(
  apiKey: string,
  prompt: string,
  logs: string[]
): Promise<{ raw: Partial<GeneratedContentPayload>; model: string }> {
  const models = ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"];
  let lastErr: unknown;

  for (const model of models) {
    appendLog(logs, `Multi-IA [Claude]: Tentando ${model}...`);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          temperature: 0.85,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
        error?: { message?: string };
      };

      const textBlock = data.content?.find((c) => c.type === "text")?.text;
      if (!res.ok || !textBlock) {
        throw new Error(
          `Claude HTTP ${res.status}: ${data.error?.message || res.statusText}`
        );
      }

      return {
        raw: JSON.parse(extractJsonString(textBlock)),
        model: `CLAUDE (${model})`,
      };
    } catch (err) {
      lastErr = err;
      appendLog(
        logs,
        `Multi-IA [Claude ${model}] falhou: ${err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error("Modelos Anthropic Claude falharam.");
}

export async function generateContentWithMultiAI(params: {
  companyName: string;
  topicTitle: string;
  promptInstructions: string;
  offerPrice?: string | null;
  benefits: string[];
  format: PostFormat;
  slidesCount: number;
  ctaDefault: string;
  previousHeadlines: string[];
  preferredProvider: AIProvider;
  keys: {
    gemini?: string | null;
    openai?: string | null;
    anthropic?: string | null;
  };
  logs: string[];
}): Promise<{ content: GeneratedContentPayload; providerUsed: string }> {
  const prompt = buildCopywritingPrompt({
    companyName: params.companyName,
    topicTitle: params.topicTitle,
    promptInstructions: params.promptInstructions,
    offerPrice: params.offerPrice,
    benefits: params.benefits,
    format: params.format,
    slidesCount: params.slidesCount,
    ctaDefault: params.ctaDefault,
    previousHeadlines: params.previousHeadlines,
  });

  const order: AIProvider[] = Array.from(
    new Set([params.preferredProvider, "GEMINI", "OPENAI", "CLAUDE"] as AIProvider[])
  );

  const available = order.filter((p) => {
    if (p === "GEMINI") return Boolean(params.keys.gemini?.trim());
    if (p === "OPENAI") return Boolean(params.keys.openai?.trim());
    if (p === "CLAUDE") return Boolean(params.keys.anthropic?.trim());
    return false;
  });

  if (available.length === 0) {
    throw new Error(
      "Nenhuma chave de IA (Gemini, OpenAI ou Claude) configurada nas Integrações desta empresa."
    );
  }

  let lastError: unknown;
  for (const provider of available) {
    try {
      let res: { raw: Partial<GeneratedContentPayload>; model: string };
      if (provider === "GEMINI") {
        res = await runGeminiText(params.keys.gemini!, prompt, params.logs);
      } else if (provider === "OPENAI") {
        res = await runOpenAIText(params.keys.openai!, prompt, params.logs);
      } else {
        res = await runClaudeText(params.keys.anthropic!, prompt, params.logs);
      }

      const normalized = normalizePayload(
        res.raw,
        params.format === "CAROUSEL" ? params.slidesCount : 1,
        params.benefits
      );
      appendLog(
        params.logs,
        `Passo A concluído via ${res.model}: "${normalized.headline_arte}".`
      );
      return { content: normalized, providerUsed: res.model };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Falha em todos os provedores de IA disponíveis.");
}

export async function enhanceProductPhotoWithAI(params: {
  companyId: string;
  originalPhotoUrl: string;
  aiPhotoMode: AIPhotoMode;
  aiPhotoPrompt?: string | null;
  preferredImageAI: ImageAIProvider;
  keys: { gemini?: string | null; openai?: string | null };
  r2Config?: R2StorageConfig;
  logs: string[];
}): Promise<string | null> {
  if (
    params.aiPhotoMode !== "ENHANCE" ||
    !params.aiPhotoPrompt?.trim() ||
    params.aiPhotoPrompt
      .toLowerCase()
      .includes("usar foto original apenas")
  ) {
    return null;
  }

  try {
    const imgRes = await fetch(params.originalPhotoUrl, {
      signal: AbortSignal.timeout(8000),
    });
    if (!imgRes.ok) {
      appendLog(
        params.logs,
        "Ambientação IA: não foi possível baixar a foto original, mantendo original."
      );
      return null;
    }
    const mimeType = imgRes.headers.get("content-type") || "image/png";
    const originalBuffer = Buffer.from(await imgRes.arrayBuffer());

    const editInstruction = `${params.aiPhotoPrompt.trim()}. Preserve fielmente o produto original, suas cores, formato e detalhes, gerando fotografia publicitária nítida e iluminada em alta qualidade.`;

    if (
      (params.preferredImageAI === "OPENAI" ||
        params.preferredImageAI === "OPENAI_MINI") &&
      params.keys.openai
    ) {
      const openAiModels =
        params.preferredImageAI === "OPENAI_MINI"
          ? ["gpt-image-1-mini", "gpt-image-1.5", "chatgpt-image-latest"]
          : [
              "chatgpt-image-latest",
              "gpt-image-1.5",
              "gpt-image-2",
              "gpt-image-1-mini",
            ];
      for (const openAiModel of openAiModels) {
        try {
          appendLog(
            params.logs,
            `Ambientação IA: gerando cenário do produto via OpenAI (${openAiModel})...`
          );
          const form = new FormData();
          form.append("model", openAiModel);
          form.append("prompt", editInstruction);
          form.append("size", "1024x1024");
          form.append(
            "image",
            new Blob([originalBuffer], { type: mimeType }),
            "product.png"
          );

          const res = await fetch("https://api.openai.com/v1/images/edits", {
            method: "POST",
            headers: { Authorization: `Bearer ${params.keys.openai}` },
            body: form,
            signal: AbortSignal.timeout(45_000),
          });

          const data = (await res.json()) as {
            data?: Array<{ b64_json?: string; url?: string }>;
            error?: { message?: string };
          };

          const item = data.data?.[0];
          let outBuf: Buffer | null = null;
          if (res.ok && item?.b64_json) {
            outBuf = Buffer.from(item.b64_json, "base64");
          } else if (res.ok && item?.url) {
            const fetched = await fetch(item.url, {
              signal: AbortSignal.timeout(15_000),
            });
            if (fetched.ok) outBuf = Buffer.from(await fetched.arrayBuffer());
          }

          if (outBuf) {
            const uploaded = await uploadBufferToR2(
              outBuf,
              `companies/${params.companyId}/enhanced/${Date.now()}.png`,
              "image/png",
              params.r2Config
            );
            appendLog(
              params.logs,
              `Ambientação IA (OpenAI ${openAiModel}) concluída: ${uploaded}`
            );
            return uploaded;
          }

          appendLog(
            params.logs,
            `Ambientação IA (OpenAI ${openAiModel}) ignorada (${
              data.error?.message || res.statusText
            }).`
          );
        } catch (err) {
          appendLog(
            params.logs,
            `Ambientação IA (OpenAI ${openAiModel}) erro: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }

    if (params.keys.gemini) {
      const geminiEditModels = [
        "gemini-3.1-flash-image-preview",
        "gemini-2.5-flash-image",
      ];
      for (const editModel of geminiEditModels) {
        try {
          appendLog(
            params.logs,
            `Ambientação IA: tentando edição da foto via ${editModel}...`
          );
          const ai = new GoogleGenAI({ apiKey: params.keys.gemini });
          const res = await withTimeout(
            ai.models.generateContent({
              model: editModel,
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      inlineData: {
                        mimeType,
                        data: originalBuffer.toString("base64"),
                      },
                    },
                    { text: editInstruction },
                  ],
                },
              ],
              config: { responseModalities: ["IMAGE", "TEXT"] },
            }),
            18_000,
            `Gemini Image (${editModel})`
          );

          const parts = res.candidates?.[0]?.content?.parts || [];
          const imgPart = parts.find((p) => p.inlineData?.data);
          if (imgPart?.inlineData?.data) {
            const outBuf = Buffer.from(imgPart.inlineData.data, "base64");
            const outMime = imgPart.inlineData.mimeType || "image/png";
            const uploaded = await uploadBufferToR2(
              outBuf,
              `companies/${params.companyId}/enhanced/${Date.now()}.png`,
              outMime,
              params.r2Config
            );
            appendLog(
              params.logs,
              `Ambientação IA (${editModel}) concluída: ${uploaded}`
            );
            return uploaded;
          }
        } catch (err) {
          appendLog(
            params.logs,
            `Ambientação IA (${editModel}) sem cota ou indisponível: ${err instanceof Error ? err.message.slice(0, 140) : String(err)
            }`
          );
        }
      }
    }
  } catch (err) {
    appendLog(
      params.logs,
      `Ambientação IA fallback para foto original: ${err instanceof Error ? err.message : String(err)
      }`
    );
  }

  return null;
}

export class AICreditError extends Error {
  failedProvider: "GEMINI" | "OPENAI";
  alternativeProvider: "GEMINI" | "OPENAI" | null;
  constructor(
    message: string,
    failedProvider: "GEMINI" | "OPENAI",
    alternativeProvider: "GEMINI" | "OPENAI" | null
  ) {
    super(message);
    this.name = "AICreditError";
    this.failedProvider = failedProvider;
    this.alternativeProvider = alternativeProvider;
  }
}

function isCreditOrQuotaError(msg: string): boolean {
  return /429|quota|insufficient_quota|credit_balance|billing|RESOURCE_EXHAUSTED|limit:\s*0|exceeded/i.test(
    msg
  );
}

export async function applyBrandLogoToImageBuffer(
  imageBuf: Buffer,
  brandLogoLightUrl?: string | null,
  brandLogoDarkUrl?: string | null
): Promise<Buffer> {
  const lightUrl = brandLogoLightUrl?.trim() || null;
  const darkUrl = brandLogoDarkUrl?.trim() || null;
  if (!lightUrl && !darkUrl) return imageBuf;

  try {
    const baseImage = sharp(imageBuf);
    const baseMeta = await baseImage.metadata();
    const canvasW = baseMeta.width || 1024;
    const canvasH = baseMeta.height || 1024;
    const isVertical = canvasH / canvasW >= 1.35;

    const maxLogoW = Math.max(120, Math.round(canvasW * 0.21));
    const maxLogoH = Math.max(48, Math.round(canvasW * 0.085));
    const marginX = Math.max(28, Math.round(canvasW * 0.042));
    const marginBottom = isVertical
      ? Math.max(80, Math.round(canvasH * 0.085))
      : Math.max(28, Math.round(canvasH * 0.04));

    // Mede a luminosidade real da região do canto inferior esquerdo da arte
    let isDarkBackground = false;
    try {
      const sampleLeft = Math.min(marginX, canvasW - 20);
      const sampleTop = Math.max(0, canvasH - maxLogoH - marginBottom);
      const sampleW = Math.min(maxLogoW, canvasW - sampleLeft);
      const sampleH = Math.min(maxLogoH, canvasH - sampleTop);
      const regionStats = await sharp(imageBuf)
        .extract({
          left: sampleLeft,
          top: sampleTop,
          width: Math.max(10, sampleW),
          height: Math.max(10, sampleH),
        })
        .stats();
      const rMean = regionStats.channels[0]?.mean ?? 200;
      const gMean = regionStats.channels[1]?.mean ?? 200;
      const bMean = regionStats.channels[2]?.mean ?? 200;
      const luminance = 0.299 * rMean + 0.587 * gMean + 0.114 * bMean;
      isDarkBackground = luminance < 135;
    } catch {
      isDarkBackground = false;
    }

    // Escolhe a logo ideal para o fundo detectado (Fundo Escuro -> darkUrl; Fundo Claro -> lightUrl)
    const chosenUrl = isDarkBackground
      ? darkUrl || lightUrl
      : lightUrl || darkUrl;
    if (!chosenUrl) return imageBuf;

    // Se o fundo da arte é escuro mas o cliente só enviou a logo de fundo claro (ou vice-versa), aplica uma pílula suave de contraste
    const needsContrastPill =
      (isDarkBackground && !darkUrl && Boolean(lightUrl)) ||
      (!isDarkBackground && !lightUrl && Boolean(darkUrl));

    const logoRes = await fetch(chosenUrl, {
      signal: AbortSignal.timeout(8000),
    });
    if (!logoRes.ok) return imageBuf;
    const rawLogoBuf = Buffer.from(await logoRes.arrayBuffer());

    let trimmedLogoBuf = rawLogoBuf;
    try {
      trimmedLogoBuf = await sharp(rawLogoBuf).trim().png().toBuffer();
    } catch {
      trimmedLogoBuf = rawLogoBuf;
    }

    const resizedLogoBuf = await sharp(trimmedLogoBuf)
      .resize({
        width: maxLogoW,
        height: maxLogoH,
        fit: "inside",
        withoutEnlargement: false,
      })
      .png()
      .toBuffer();

    const logoMeta = await sharp(resizedLogoBuf).metadata();
    const lw = logoMeta.width || maxLogoW;
    const lh = logoMeta.height || maxLogoH;

    const left = Math.min(marginX, Math.max(0, canvasW - lw));
    const top = Math.min(
      Math.max(marginX, canvasH - lh - marginBottom),
      Math.max(0, canvasH - lh)
    );

    const layers: Array<{ input: Buffer; left: number; top: number }> = [];

    if (needsContrastPill) {
      const padX = 14;
      const padY = 10;
      const pillW = Math.min(canvasW, lw + padX * 2);
      const pillH = Math.min(canvasH, lh + padY * 2);
      const pillFill = isDarkBackground
        ? "rgba(255,255,255,0.92)"
        : "rgba(15,23,42,0.88)";
      const pillSvg = Buffer.from(
        `<svg width="${pillW}" height="${pillH}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${pillW}" height="${pillH}" rx="14" ry="14" fill="${pillFill}" />
        </svg>`
      );
      layers.push({
        input: pillSvg,
        left: Math.max(0, left - padX),
        top: Math.max(0, top - padY),
      });
    }

    layers.push({
      input: resizedLogoBuf,
      left,
      top,
    });

    return await sharp(imageBuf).composite(layers).png().toBuffer();
  } catch {
    return imageBuf;
  }
}

async function encodeCreativeJpegBuffer(
  imageBuf: Buffer
): Promise<{ buffer: Buffer; ext: string; mime: string }> {
  try {
    const jpegBuf = await sharp(imageBuf)
      .flatten({ background: "#0F172A" })
      .jpeg({ quality: 92 })
      .toBuffer();
    return { buffer: jpegBuf, ext: "jpg", mime: "image/jpeg" };
  } catch {
    return { buffer: imageBuf, ext: "png", mime: "image/png" };
  }
}

export async function generateFullCreativeWithAI(params: {
  companyId: string;
  promptText: string;
  aspectRatio: AspectRatio;
  preferredImageAI: ImageAIProvider;
  allowFallback?: boolean;
  referencePhotoUrl?: string | null;
  brandLogoUrl?: string | null;
  brandLogoDarkUrl?: string | null;
  keys: { gemini?: string | null; openai?: string | null };
  r2Config?: R2StorageConfig;
  maxWaitMs?: number;
  isCarouselSlide?: boolean;
  logs: string[];
}): Promise<string | null> {
  const baseCleanedPrompt = cleanCreativePrompt(params.promptText);
  if (!baseCleanedPrompt) return null;

  const startedAt = Date.now();
  const budgetMs = Math.max(
    15_000,
    Math.min(45_000, params.maxWaitMs ?? 45_000)
  );

  const hasOfficialLogo = Boolean(
    params.brandLogoUrl?.trim() || params.brandLogoDarkUrl?.trim()
  );
  const fullBleedAndOrthoRule = `Fundo 100% full-bleed de ponta a ponta até o último pixel superior e inferior — PROIBIDO faixa branca, mancha branca, névoa clara no topo ou borda externa. Posicione o título levemente abaixo da borda sobre o próprio fundo contínuo, sem cortar nenhuma letra. Ortografia e acentuação perfeitas em português do Brasil (ç, ã, á, é, ó), usando tipografia limpa em faixas largas sem espremer letras.`;
  const cleanedPrompt = hasOfficialLogo
    ? `${baseCleanedPrompt}\n\n${fullBleedAndOrthoRule} Não desenhe logotipo nem assinatura no canto inferior esquerdo; mantenha esse cantinho com apenas o fundo contínuo para aplicar a logomarca PNG oficial.`
    : `${baseCleanedPrompt}\n\n${fullBleedAndOrthoRule} Não invente símbolos ou ícones de logotipo falsos no rodapé.`;

  let refBuf: Buffer | null = null;
  let refMime = "image/png";
  if (params.referencePhotoUrl) {
    try {
      const refRes = await fetch(params.referencePhotoUrl, {
        signal: AbortSignal.timeout(8000),
      });
      if (refRes.ok) {
        refMime = refRes.headers.get("content-type") || "image/png";
        refBuf = Buffer.from(await refRes.arrayBuffer());
      }
    } catch {
      refBuf = null;
    }
  }

  const normalizedPref: "GEMINI" | "OPENAI" =
    params.preferredImageAI === "OPENAI" ||
    params.preferredImageAI === "OPENAI_MINI"
      ? "OPENAI"
      : "GEMINI";
  const otherProvider: "GEMINI" | "OPENAI" =
    normalizedPref === "OPENAI" ? "GEMINI" : "OPENAI";
  const hasOtherKey =
    otherProvider === "OPENAI"
      ? Boolean(params.keys.openai?.trim())
      : Boolean(params.keys.gemini?.trim());
  const order: Array<"GEMINI" | "OPENAI"> = params.allowFallback
    ? [normalizedPref, otherProvider]
    : [normalizedPref];

  let creditErrorDetected: { provider: "GEMINI" | "OPENAI"; detail: string } | null =
    null;

  for (const provider of order) {
    if (provider === "OPENAI" && params.keys.openai?.trim()) {
      const openAiKey = params.keys.openai.trim();
      const gptSize = params.aspectRatio === "1:1" ? "1024x1024" : "1024x1536";
      const openAiModels = params.isCarouselSlide
        ? params.preferredImageAI === "OPENAI_MINI"
          ? ["gpt-image-1-mini", "chatgpt-image-latest"]
          : ["chatgpt-image-latest", "gpt-image-1-mini"]
        : params.preferredImageAI === "OPENAI_MINI"
        ? ["gpt-image-1-mini", "gpt-image-1.5", "chatgpt-image-latest"]
        : [
            "chatgpt-image-latest",
            "gpt-image-1.5",
            "gpt-image-2",
            "gpt-image-1-mini",
          ];

      const extractOpenAiBuffer = async (data: {
        data?: Array<{ b64_json?: string; url?: string }>;
      }): Promise<Buffer | null> => {
        const first = data.data?.[0];
        if (first?.b64_json) return Buffer.from(first.b64_json, "base64");
        if (first?.url) {
          const r = await fetch(first.url, { signal: AbortSignal.timeout(15_000) });
          if (r.ok) return Buffer.from(await r.arrayBuffer());
        }
        return null;
      };

      for (const openAiModel of openAiModels) {
        const remaining = budgetMs - (Date.now() - startedAt);
        if (remaining < 6_000) break;
        try {
          let res: Response;
          if (refBuf) {
            appendLog(
              params.logs,
              `Criativo IA: gerando arte completa via OpenAI (${openAiModel} edit)...`
            );
            const form = new FormData();
            form.append("model", openAiModel);
            form.append("prompt", cleanedPrompt);
            form.append("size", gptSize);
            form.append(
              "image",
              new Blob([new Uint8Array(refBuf)], { type: refMime }),
              "ref.png"
            );
            res = await fetch("https://api.openai.com/v1/images/edits", {
              method: "POST",
              headers: { Authorization: `Bearer ${openAiKey}` },
              body: form,
              signal: AbortSignal.timeout(remaining),
            });
          } else {
            appendLog(
              params.logs,
              `Criativo IA: gerando arte completa via OpenAI (${openAiModel})...`
            );
            res = await fetch("https://api.openai.com/v1/images/generations", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${openAiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: openAiModel,
                prompt: cleanedPrompt,
                size: gptSize,
              }),
              signal: AbortSignal.timeout(remaining),
            });
          }

          const data = (await res.json()) as {
            data?: Array<{ b64_json?: string; url?: string }>;
            error?: { message?: string };
          };
          const rawOutBuf = res.ok ? await extractOpenAiBuffer(data) : null;
          if (rawOutBuf) {
            const stampedBuf = hasOfficialLogo
              ? await applyBrandLogoToImageBuffer(
                  rawOutBuf,
                  params.brandLogoUrl,
                  params.brandLogoDarkUrl
                )
              : rawOutBuf;
            const { buffer: outBuf, ext, mime } = await encodeCreativeJpegBuffer(stampedBuf);
            const url = await uploadBufferToR2(
              outBuf,
              `companies/${params.companyId}/ai-creatives/${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 6)}.${ext}`,
              mime,
              params.r2Config
            );
            appendLog(
              params.logs,
              `Criativo 100% IA (OpenAI ${openAiModel}) concluído: ${url}`
            );
            return url;
          }
          const errMsg = data.error?.message || res.statusText;
          if (isCreditOrQuotaError(errMsg) && !creditErrorDetected) {
            creditErrorDetected = { provider: "OPENAI", detail: errMsg };
          }
          appendLog(
            params.logs,
            `Criativo IA (OpenAI ${openAiModel}) indisponível: ${errMsg}`
          );
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          if (isCreditOrQuotaError(errMsg) && !creditErrorDetected) {
            creditErrorDetected = { provider: "OPENAI", detail: errMsg };
          }
          appendLog(
            params.logs,
            `Criativo IA (OpenAI ${openAiModel}) erro: ${errMsg}`
          );
        }
      }
    }

    if (provider === "GEMINI" && params.keys.gemini?.trim()) {
      const ai = new GoogleGenAI({ apiKey: params.keys.gemini.trim() });
      const geminiModels = params.isCarouselSlide
        ? ["gemini-3.1-flash-image-preview", "gemini-2.5-flash-image"]
        : [
            "gemini-3.1-flash-image-preview",
            "gemini-3-pro-image-preview",
            "gemini-nano-banana-2.1",
            "gemini-2.5-flash-image",
          ];
      for (const model of geminiModels) {
        const remaining = Math.min(20_000, budgetMs - (Date.now() - startedAt));
        if (remaining < 5_000) break;
        try {
          appendLog(
            params.logs,
            `Criativo IA: tentando gerar arte completa via ${model}...`
          );
          const parts: Array<
            { inlineData: { mimeType: string; data: string } } | { text: string }
          > = [];
          if (refBuf) {
            parts.push({
              inlineData: { mimeType: refMime, data: refBuf.toString("base64") },
            });
          }
          parts.push({
            text: `${cleanedPrompt}\nProporção: ${params.aspectRatio}. Renderize textos nítidos em português do Brasil exatamente como solicitado no prompt.`,
          });

          const res = await withTimeout(
            ai.models.generateContent({
              model,
              contents: [{ role: "user", parts }],
              config: { responseModalities: ["IMAGE", "TEXT"] },
            }),
            remaining,
            `Criativo ${model}`
          );
          const resParts = res.candidates?.[0]?.content?.parts || [];
          const imgPart = resParts.find((p) => p.inlineData?.data);
          if (imgPart?.inlineData?.data) {
            const rawOutBuf = Buffer.from(imgPart.inlineData.data, "base64");
            const stampedBuf = hasOfficialLogo
              ? await applyBrandLogoToImageBuffer(
                  rawOutBuf,
                  params.brandLogoUrl,
                  params.brandLogoDarkUrl
                )
              : rawOutBuf;
            const { buffer: outBuf, ext, mime } = await encodeCreativeJpegBuffer(stampedBuf);
            const url = await uploadBufferToR2(
              outBuf,
              `companies/${params.companyId}/ai-creatives/${Date.now()}.${ext}`,
              mime,
              params.r2Config
            );
            appendLog(
              params.logs,
              `Criativo 100% IA (${model}) concluído: ${url}`
            );
            return url;
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          if (isCreditOrQuotaError(errMsg) && !creditErrorDetected) {
            creditErrorDetected = { provider: "GEMINI", detail: errMsg };
          }
          appendLog(
            params.logs,
            `Criativo IA (${model}) indisponível: ${errMsg}`
          );
        }
      }
    }
  }

  if (creditErrorDetected) {
    const label =
      creditErrorDetected.provider === "OPENAI"
        ? "OpenAI"
        : "Google Gemini";
    throw new AICreditError(
      `Post não gerado: chave ${label} sem crédito, cota ou faturamento ativo.`,
      creditErrorDetected.provider,
      hasOtherKey ? otherProvider : null
    );
  }

  return null;
}

export async function inspectMetaTokenValidity(metaToken: string): Promise<{
  valid: boolean;
  name?: string;
  expires_at: string | null;
  days_remaining: number | null;
  warning?: string;
  permissions: string[];
}> {
  try {
    const meRes = await fetch(
      `${META_GRAPH_BASE_URL}/me?fields=id,name&access_token=${encodeURIComponent(
        metaToken
      )}`
    );
    const meData = (await meRes.json()) as {
      id?: string;
      name?: string;
      error?: { message?: string };
    };
    if (!meRes.ok || !meData.id) {
      return {
        valid: false,
        expires_at: null,
        days_remaining: null,
        warning: meData.error?.message || "Token Meta inválido ou expirado.",
        permissions: [],
      };
    }

    const permRes = await fetch(
      `${META_GRAPH_BASE_URL}/me/permissions?access_token=${encodeURIComponent(
        metaToken
      )}`
    );
    const permData = (await permRes.json()) as {
      data?: Array<{ permission: string; status: string }>;
    };
    const permissions = (permData.data || [])
      .filter((p) => p.status === "granted")
      .map((p) => p.permission);

    // Tenta consultar data_access_expires_at via debug_token com o próprio token
    const debugRes = await fetch(
      `${META_GRAPH_BASE_URL}/debug_token?input_token=${encodeURIComponent(
        metaToken
      )}&access_token=${encodeURIComponent(metaToken)}`
    );
    const debugData = (await debugRes.json()) as {
      data?: { expires_at?: number; data_access_expires_at?: number };
    };

    const expUnix = debugData.data?.expires_at;
    let expiresAt: string | null = null;
    let daysRemaining: number | null = null;
    let warning: string | undefined;

    if (expUnix && expUnix > 0) {
      const expMs = expUnix * 1000;
      expiresAt = new Date(expMs).toISOString();
      daysRemaining = Math.ceil((expMs - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysRemaining <= 7) {
        warning = `Atenção: seu token Meta expira em ${daysRemaining} dia(s). Gere um Token de Usuário do Sistema permanente.`;
      }
    }

    return {
      valid: true,
      name: meData.name,
      expires_at: expiresAt,
      days_remaining: daysRemaining,
      warning,
      permissions,
    };
  } catch (err) {
    return {
      valid: false,
      expires_at: null,
      days_remaining: null,
      warning:
        err instanceof Error ? err.message : "Erro ao validar token Meta.",
      permissions: [],
    };
  }
}

export async function buildVertical916FromFeedUrl(params: {
  companyId: string;
  feedImageUrl: string;
  r2Config?: R2StorageConfig;
  logs?: string[];
}): Promise<string> {
  try {
    const res = await fetch(params.feedImageUrl, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return params.feedImageUrl;
    const rawBuf = Buffer.from(await res.arrayBuffer());
    const rotated = sharp(rawBuf).rotate().flatten({ background: "#F5EFE6" });
    const meta = await rotated.metadata();
    const w = meta.width || 1080;
    const h = meta.height || 1080;

    // Se já for vertical (~9:16), apenas padroniza em 1080x1920 JPEG
    if (h / w >= 1.5) {
      const verticalBuf = await rotated
        .resize(1080, 1920, { fit: "cover" })
        .jpeg({ quality: 92 })
        .toBuffer();
      return await uploadBufferToR2(
        verticalBuf,
        `companies/${params.companyId}/stories-916/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 6)}.jpg`,
        "image/jpeg",
        params.r2Config
      );
    }

    // Redimensiona a arte central para largura 1080px mantendo proporção original
    const resizedBuf = await rotated
      .resize({ width: 1080, height: 1440, fit: "inside" })
      .jpeg({ quality: 94 })
      .toBuffer();
    const resizedMeta = await sharp(resizedBuf).metadata();
    const rw = resizedMeta.width || 1080;
    const rh = resizedMeta.height || 1080;
    const stripH = Math.min(10, Math.max(2, Math.floor(rh * 0.02)));

    // Extrai a cor média real da borda superior e da borda inferior da própria arte (sem blur)
    const [topStats, botStats] = await Promise.all([
      sharp(resizedBuf)
        .extract({ left: 0, top: 0, width: rw, height: stripH })
        .stats(),
      sharp(resizedBuf)
        .extract({ left: 0, top: rh - stripH, width: rw, height: stripH })
        .stats(),
    ]);

    const toHex = (n: number) =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, "0");
    const topHex = `#${toHex(topStats.channels[0]?.mean ?? 245)}${toHex(
      topStats.channels[1]?.mean ?? 239
    )}${toHex(topStats.channels[2]?.mean ?? 230)}`;
    const botHex = `#${toHex(botStats.channels[0]?.mean ?? 184)}${toHex(
      botStats.channels[1]?.mean ?? 74
    )}${toHex(botStats.channels[2]?.mean ?? 39)}`;

    const topOffset = Math.max(0, Math.round((1920 - rh) / 2));
    const botStartPct = Math.round(((topOffset + rh) / 1920) * 100);
    const topEndPct = Math.round((topOffset / 1920) * 100);

    const bgSvg = Buffer.from(
      `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${topHex}" />
            <stop offset="${topEndPct}%" stop-color="${topHex}" />
            <stop offset="${botStartPct}%" stop-color="${botHex}" />
            <stop offset="100%" stop-color="${botHex}" />
          </linearGradient>
        </defs>
        <rect width="1080" height="1920" fill="url(#bg)" />
      </svg>`
    );

    const outBuf = await sharp(bgSvg)
      .composite([
        {
          input: resizedBuf,
          top: topOffset,
          left: Math.max(0, Math.round((1080 - rw) / 2)),
        },
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

    const url = await uploadBufferToR2(
      outBuf,
      `companies/${params.companyId}/stories-916/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)}.jpg`,
      "image/jpeg",
      params.r2Config
    );
    return url;
  } catch (err) {
    if (params.logs) {
      appendLog(
        params.logs,
        `Adaptação 9:16 aviso: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return params.feedImageUrl;
  }
}

export async function publishToMetaChannels(params: {
  igUserId?: string | null;
  fbPageId?: string | null;
  metaAccessToken?: string | null;
  imageUrls: string[];
  storyImageUrls?: string[];
  caption: string;
  publishToStories?: boolean;
  publishTargets?: PublishTargets;
  logs: string[];
}): Promise<{ instagramPostId: string | null; facebookPostId: string | null }> {
  const token = params.metaAccessToken?.trim();
  const t = params.publishTargets;
  const doIgFeed = t ? t.ig_feed : true;
  const doFbFeed = t ? t.fb_feed : true;
  const doIgStories = t ? t.ig_stories : Boolean(params.publishToStories);
  const doFbStories = t ? t.fb_stories : Boolean(params.publishToStories);

  if (!doIgFeed && !doFbFeed && !doIgStories && !doFbStories) {
    return { instagramPostId: null, facebookPostId: null };
  }

  if (!token) {
    throw new Error(
      "META_ACCESS_TOKEN não configurado nas Integrações desta empresa."
    );
  }
  if (params.imageUrls.length === 0) {
    throw new Error("Nenhuma imagem disponível para publicar.");
  }

  let instagramPostId: string | null = null;
  let facebookPostId: string | null = null;
  const feedErrors: { ig: Error | null; fb: Error | null } = {
    ig: null,
    fb: null,
  };
  const storyImgUrl = params.storyImageUrls?.[0] || params.imageUrls[0];

  const publishIgMediaWithRetry = async (
    igId: string,
    creationId: string
  ): Promise<{ ok: boolean; id?: string; errorMessage: string }> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      await new Promise((r) => setTimeout(r, 2500));
      const pubRes = await fetch(
        `${META_GRAPH_BASE_URL}/${igId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: creationId,
            access_token: token,
          }),
        }
      );
      const pubData = (await pubRes.json()) as {
        id?: string;
        error?: { message?: string; code?: number };
      };
      if (pubRes.ok && pubData.id) {
        return { ok: true, id: pubData.id, errorMessage: "" };
      }
      const errMsg = pubData.error?.message || pubRes.statusText;
      const shouldRetry =
        attempt === 0 &&
        (pubData.error?.code === 9007 ||
          /9007|not ready|not available/i.test(errMsg));
      if (!shouldRetry) {
        return { ok: false, errorMessage: errMsg };
      }
    }
    return { ok: false, errorMessage: "Meta IG media_publish timeout" };
  };

  await Promise.all([
    // 1. INSTAGRAM BUSINESS (FEED)
    (async () => {
      if (!doIgFeed) return;
      if (!params.igUserId?.trim()) {
        appendLog(params.logs, "Meta IG: IG_USER_ID não informado, pulando.");
        return;
      }
      const igId = params.igUserId.trim();
      try {
        if (params.imageUrls.length === 1) {
          appendLog(
            params.logs,
            "Meta IG: Criando container de imagem única..."
          );
          const mediaRes = await fetch(`${META_GRAPH_BASE_URL}/${igId}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image_url: params.imageUrls[0],
              caption: params.caption,
              access_token: token,
            }),
          });
          const mediaData = (await mediaRes.json()) as {
            id?: string;
            error?: { message?: string };
          };
          if (!mediaRes.ok || !mediaData.id) {
            throw new Error(
              `Meta IG /media falhou: ${
                mediaData.error?.message || mediaRes.statusText
              }`
            );
          }

          appendLog(
            params.logs,
            `Meta IG: Container ${mediaData.id} criado. Publicando...`
          );
          const pubResult = await publishIgMediaWithRetry(igId, mediaData.id);
          if (!pubResult.ok || !pubResult.id) {
            throw new Error(
              `Meta IG /media_publish falhou: ${pubResult.errorMessage}`
            );
          }
          instagramPostId = pubResult.id;
          appendLog(
            params.logs,
            `Meta IG: Publicado com sucesso (ID ${instagramPostId}).`
          );
        } else {
          appendLog(
            params.logs,
            `Meta IG Carrossel: Criando ${params.imageUrls.length} itens...`
          );
          const childrenIds = await Promise.all(
            params.imageUrls.map(async (imgUrl, idx) => {
              const childRes = await fetch(
                `${META_GRAPH_BASE_URL}/${igId}/media`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    image_url: imgUrl,
                    is_carousel_item: true,
                    access_token: token,
                  }),
                }
              );
              const childData = (await childRes.json()) as {
                id?: string;
                error?: { message?: string };
              };
              if (!childRes.ok || !childData.id) {
                throw new Error(
                  `Meta IG carrossel slide ${idx + 1} falhou: ${
                    childData.error?.message || childRes.statusText
                  }`
                );
              }
              return childData.id;
            })
          );

          const carRes = await fetch(`${META_GRAPH_BASE_URL}/${igId}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              media_type: "CAROUSEL",
              children: childrenIds,
              caption: params.caption,
              access_token: token,
            }),
          });
          const carData = (await carRes.json()) as {
            id?: string;
            error?: { message?: string };
          };
          if (!carRes.ok || !carData.id) {
            throw new Error(
              `Meta IG container CAROUSEL falhou: ${
                carData.error?.message || carRes.statusText
              }`
            );
          }

          appendLog(
            params.logs,
            `Meta IG Carrossel: Container ${carData.id} criado. Publicando...`
          );
          const pubResult = await publishIgMediaWithRetry(igId, carData.id);
          if (!pubResult.ok || !pubResult.id) {
            throw new Error(
              `Meta IG /media_publish carrossel falhou: ${pubResult.errorMessage}`
            );
          }
          instagramPostId = pubResult.id;
          appendLog(
            params.logs,
            `Meta IG Carrossel: Publicado com sucesso (ID ${instagramPostId}).`
          );
        }
      } catch (err) {
        feedErrors.ig = err instanceof Error ? err : new Error(String(err));
        appendLog(params.logs, `Meta IG Feed erro: ${feedErrors.ig.message}`);
      }
    })(),

    // 2. INSTAGRAM STORIES (em paralelo desde o início)
    (async () => {
      if (!doIgStories || !storyImgUrl || !params.igUserId?.trim()) return;
      const igId = params.igUserId.trim();
      try {
        appendLog(params.logs, "Meta IG Stories: Criando Story...");
        const stMediaRes = await fetch(`${META_GRAPH_BASE_URL}/${igId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: storyImgUrl,
            media_type: "STORIES",
            access_token: token,
          }),
        });
        const stMediaData = (await stMediaRes.json()) as {
          id?: string;
          error?: { message?: string };
        };
        if (!stMediaRes.ok || !stMediaData.id) {
          appendLog(
            params.logs,
            `Meta IG Stories aviso: ${
              stMediaData.error?.message || stMediaRes.statusText
            }`
          );
          return;
        }
        const stPubResult = await publishIgMediaWithRetry(igId, stMediaData.id);
        if (stPubResult.ok && stPubResult.id) {
          appendLog(
            params.logs,
            `Meta IG Stories: Publicado com sucesso (ID ${stPubResult.id}).`
          );
        } else {
          appendLog(
            params.logs,
            `Meta IG Stories aviso: ${stPubResult.errorMessage}`
          );
        }
      } catch (err) {
        appendLog(
          params.logs,
          `Meta IG Stories aviso: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    })(),

    // 3. PÁGINA DO FACEBOOK (Page Token -> Feed e Stories em paralelo)
    (async () => {
      if (!doFbFeed && !doFbStories) return;
      if (!params.fbPageId?.trim()) {
        if (doFbFeed) {
          appendLog(params.logs, "Meta FB: FB_PAGE_ID não informado, pulando.");
        }
        return;
      }
      const fbId = params.fbPageId.trim();
      let fbPageToken: string | null = null;
      let pageName = fbId;
      try {
        appendLog(
          params.logs,
          "Meta FB: Obtendo Page Access Token da Página..."
        );
        const pageTokenRes = await fetch(
          `${META_GRAPH_BASE_URL}/${fbId}?fields=access_token,name&access_token=${encodeURIComponent(
            token
          )}`
        );
        const pageTokenData = (await pageTokenRes.json()) as {
          access_token?: string;
          name?: string;
          error?: { message?: string };
        };
        if (!pageTokenRes.ok || !pageTokenData.access_token) {
          throw new Error(
            `Meta FB Page Token falhou: ${
              pageTokenData.error?.message || pageTokenRes.statusText
            }`
          );
        }
        fbPageToken = pageTokenData.access_token;
        pageName = pageTokenData.name || fbId;
      } catch (err) {
        feedErrors.fb = err instanceof Error ? err : new Error(String(err));
        appendLog(params.logs, `Meta FB erro: ${feedErrors.fb.message}`);
        return;
      }

      await Promise.all([
        // 3A. Facebook Feed
        (async () => {
          if (!doFbFeed || !fbPageToken) return;
          try {
            if (params.imageUrls.length === 1) {
              const fbRes = await fetch(`${META_GRAPH_BASE_URL}/${fbId}/photos`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  url: params.imageUrls[0],
                  message: params.caption,
                  access_token: fbPageToken,
                }),
              });
              const fbData = (await fbRes.json()) as {
                id?: string;
                post_id?: string;
                error?: { message?: string };
              };
              const fbPostId = fbData.post_id || fbData.id;
              if (!fbRes.ok || !fbPostId) {
                throw new Error(
                  `Meta FB /photos falhou: ${
                    fbData.error?.message || fbRes.statusText
                  }`
                );
              }
              facebookPostId = fbPostId;
              appendLog(
                params.logs,
                `Meta FB: Foto única publicada na Página "${pageName}" (ID ${facebookPostId}).`
              );
            } else {
              appendLog(
                params.logs,
                `Meta FB Multi-Fotos: Enviando ${params.imageUrls.length} slides sem publicar para compor o álbum no feed...`
              );
              const attachedMedia = await Promise.all(
                params.imageUrls.map(async (imgUrl, i) => {
                  const photoRes = await fetch(
                    `${META_GRAPH_BASE_URL}/${fbId}/photos`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        url: imgUrl,
                        published: false,
                        access_token: fbPageToken,
                      }),
                    }
                  );
                  const photoData = (await photoRes.json()) as {
                    id?: string;
                    error?: { message?: string };
                  };
                  if (!photoRes.ok || !photoData.id) {
                    throw new Error(
                      `Meta FB slide ${i + 1} (/photos published=false) falhou: ${
                        photoData.error?.message || photoRes.statusText
                      }`
                    );
                  }
                  return { media_fbid: photoData.id };
                })
              );

              const feedRes = await fetch(`${META_GRAPH_BASE_URL}/${fbId}/feed`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  message: params.caption,
                  attached_media: attachedMedia,
                  access_token: fbPageToken,
                }),
              });
              const feedData = (await feedRes.json()) as {
                id?: string;
                error?: { message?: string };
              };

              if (feedRes.ok && feedData.id) {
                facebookPostId = feedData.id;
                appendLog(
                  params.logs,
                  `Meta FB Multi-Fotos: Post com ${attachedMedia.length} imagens publicado na Página "${pageName}" (ID ${facebookPostId}).`
                );
              } else {
                appendLog(
                  params.logs,
                  `Meta FB /feed aviso (${
                    feedData.error?.message || feedRes.statusText
                  }). Executando fallback para foto de capa em /photos...`
                );
                const fallbackRes = await fetch(
                  `${META_GRAPH_BASE_URL}/${fbId}/photos`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      url: params.imageUrls[0],
                      message: params.caption,
                      access_token: fbPageToken,
                    }),
                  }
                );
                const fallbackData = (await fallbackRes.json()) as {
                  id?: string;
                  post_id?: string;
                  error?: { message?: string };
                };
                const fbPostId = fallbackData.post_id || fallbackData.id;
                if (!fallbackRes.ok || !fbPostId) {
                  throw new Error(
                    `Meta FB fallback /photos falhou: ${
                      fallbackData.error?.message || fallbackRes.statusText
                    }`
                  );
                }
                facebookPostId = fbPostId;
                appendLog(
                  params.logs,
                  `Meta FB: Capa publicada via fallback (ID ${facebookPostId}).`
                );
              }
            }
          } catch (err) {
            feedErrors.fb = err instanceof Error ? err : new Error(String(err));
            appendLog(
              params.logs,
              `Meta FB Feed erro: ${feedErrors.fb.message}`
            );
          }
        })(),

        // 3B. Facebook Stories
        (async () => {
          if (!doFbStories || !storyImgUrl || !fbPageToken) return;
          try {
            appendLog(
              params.logs,
              "Meta FB Stories: Criando Story na Página..."
            );
            const photoRes = await fetch(
              `${META_GRAPH_BASE_URL}/${fbId}/photos`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  url: storyImgUrl,
                  published: false,
                  access_token: fbPageToken,
                }),
              }
            );
            const photoData = (await photoRes.json()) as {
              id?: string;
              error?: { message?: string };
            };
            if (!photoRes.ok || !photoData.id) {
              appendLog(
                params.logs,
                `Meta FB Stories aviso (upload): ${
                  photoData.error?.message || photoRes.statusText
                }`
              );
              return;
            }
            const stRes = await fetch(
              `${META_GRAPH_BASE_URL}/${fbId}/photo_stories`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  photo_id: photoData.id,
                  access_token: fbPageToken,
                }),
              }
            );
            const stData = (await stRes.json()) as {
              post_id?: string;
              success?: boolean;
              error?: { message?: string };
            };
            if (stRes.ok && (stData.post_id || stData.success)) {
              appendLog(
                params.logs,
                `Meta FB Stories: Publicado com sucesso (${
                  stData.post_id || "OK"
                }).`
              );
            } else {
              appendLog(
                params.logs,
                `Meta FB Stories aviso: ${
                  stData.error?.message || stRes.statusText
                }`
              );
            }
          } catch (err) {
            appendLog(
              params.logs,
              `Meta FB Stories aviso: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        })(),
      ]);
    })(),
  ]);

  if (doIgFeed && doFbFeed && feedErrors.ig && feedErrors.fb) {
    throw new Error(
      `IG: ${feedErrors.ig.message} | FB: ${feedErrors.fb.message}`
    );
  }
  if (doIgFeed && !doFbFeed && feedErrors.ig) {
    throw feedErrors.ig;
  }
  if (doFbFeed && !doIgFeed && feedErrors.fb) {
    throw feedErrors.fb;
  }

  return { instagramPostId, facebookPostId };
}

/**
 * Estrutura preparada para publicação de fotos/carrosséis no TikTok (Content Posting API v2).
 * Será ativada automaticamente quando a empresa conectar suas credenciais TikTok Developer.
 */
export async function publishToTikTok(params: {
  tiktokAccessToken?: string | null;
  enabled: boolean;
  imageUrls: string[];
  caption: string;
  logs: string[];
}): Promise<string | null> {
  if (!params.enabled || !params.tiktokAccessToken?.trim()) {
    return null;
  }

  appendLog(
    params.logs,
    "TikTok Photo API v2: Enviando publicação de imagens..."
  );

  let preferredPrivacy:
    | "PUBLIC_TO_EVERYONE"
    | "FOLLOWER_OF_CREATOR"
    | "MUTUAL_FOLLOW_FRIENDS"
    | "SELF_ONLY" = "PUBLIC_TO_EVERYONE";

  try {
    const creatorRes = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.tiktokAccessToken.trim()}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    const creatorData = (await creatorRes.json()) as {
      data?: { privacy_level_options?: string[]; creator_username?: string };
    };
    const opts = creatorData.data?.privacy_level_options || [];
    if (opts.length > 0) {
      if (opts.includes("PUBLIC_TO_EVERYONE")) {
        preferredPrivacy = "PUBLIC_TO_EVERYONE";
      } else if (opts.includes("FOLLOWER_OF_CREATOR")) {
        preferredPrivacy = "FOLLOWER_OF_CREATOR";
      } else if (opts.includes("MUTUAL_FOLLOW_FRIENDS")) {
        preferredPrivacy = "MUTUAL_FOLLOW_FRIENDS";
      } else {
        preferredPrivacy = "SELF_ONLY";
      }
    }
  } catch {
    // Segue com PUBLIC_TO_EVERYONE como tentativa padrão
  }

  const postWithPrivacy = async (
    privacyLevel:
      | "PUBLIC_TO_EVERYONE"
      | "FOLLOWER_OF_CREATOR"
      | "MUTUAL_FOLLOW_FRIENDS"
      | "SELF_ONLY"
  ) => {
    const res = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/content/init/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.tiktokAccessToken!.trim()}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          post_info: {
            title: params.caption.slice(0, 90),
            description: params.caption.slice(0, 4000),
            privacy_level: privacyLevel,
            disable_comment: false,
          },
          source_info: {
            source: "PULL_FROM_URL",
            photo_cover_index: 0,
            photo_images: params.imageUrls,
          },
          post_mode: "DIRECT_POST",
          media_type: "PHOTO",
        }),
      }
    );
    const data = (await res.json()) as {
      data?: { publish_id?: string };
      error?: { code?: string; message?: string };
    };
    return { res, data };
  };

  let { res, data } = await postWithPrivacy(preferredPrivacy);

  if (
    (!res.ok || data.error?.code !== "ok") &&
    preferredPrivacy !== "SELF_ONLY" &&
    /unaudited|integration guidelines|private_accounts|privacy_level/i.test(
      `${data.error?.code || ""} ${data.error?.message || ""}`
    )
  ) {
    appendLog(
      params.logs,
      "TikTok App ainda não auditado para post público: reenviando com privacidade SELF_ONLY (privado)..."
    );
    ({ res, data } = await postWithPrivacy("SELF_ONLY"));
  }

  if (!res.ok || data.error?.code !== "ok") {
    appendLog(
      params.logs,
      `TikTok API aviso: ${data.error?.message || res.statusText}`
    );
    return null;
  }

  const publishId = data.data?.publish_id || null;
  if (publishId) {
    // Aguarda 1s e consulta status inicial do processamento no TikTok
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const statusRes = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${params.tiktokAccessToken.trim()}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify({ publish_id: publishId }),
          signal: AbortSignal.timeout(8000),
        }
      );
      const statusData = (await statusRes.json()) as {
        data?: { status?: string; fail_reason?: string };
      };
      if (statusData.data?.status === "FAILED") {
        appendLog(
          params.logs,
          `TikTok API falhou após envio (${publishId}): ${statusData.data.fail_reason || "FAILED"}`
        );
        return null;
      }
      appendLog(
        params.logs,
        `TikTok API concluído (${statusData.data?.status || "PROCESSING"}): publish_id=${publishId}.`
      );
      return publishId;
    } catch {
      // Se a consulta rápida falhar, mantém o publish_id retornado
    }
  }
  appendLog(
    params.logs,
    `TikTok API concluído: publish_id=${publishId || "enviado"}.`
  );
  return publishId;
}

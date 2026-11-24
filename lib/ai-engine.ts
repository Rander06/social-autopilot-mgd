import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { GoogleGenAI, Type } from "@google/genai";
import {
  AIProvider,
  AIPhotoMode,
  AspectRatio,
  GeneratedContentPayload,
  ImageAIProvider,
  PostFormat,
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
${antiRepeatBlock}
REGRAS ESTRITAS:
0. Se as instruções acima citarem explicitamente um título entre aspas para o topo da arte (ex: "CONTROLE TUDO + ATENDIMENTO COM IA"), use EXATAMENTE esse título em "headline_arte".
1. NUNCA use emojis nos textos das artes (tema_visual, headline_arte, subtitulo_arte, dor_vs_solucao, destaque_selo, beneficios, slides). Use emojis APENAS no campo "legenda".
2. tema_visual: Frase curta (2 a 4 palavras) para badge no topo da arte.
3. headline_arte: Máximo de 7 palavras, forte, publicitária e inédita.
4. subtitulo_arte: Frase curta (até 12 palavras) reforçando o benefício ou preço (${params.offerPrice || ""}).
5. dor_vs_solucao: Frase curta (até 14 palavras) atacando a dor do cliente e mostrando a solução.
6. destaque_selo: Selo curto em caixa alta (ex: "QUALIDADE GARANTIDA" ou "0% COMISSÃO • 100% SEU").
7. beneficios: Array com exatamente 4 a 6 itens curtos (3 a 6 palavras cada).
8. slides: Array com EXATAMENTE ${params.format === "CAROUSEL" ? params.slidesCount : 1
    } objetos, cada um contendo:
   - badge (ex: "PASSO 01", "DESTAQUE", "OFERTA")
   - title (título curto do slide, máx. 7 palavras)
   - body (explicação objetiva em 1 a 2 frases)
   - highlight (opcional, dado ou preço curto)${
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
      "gemini-3-flash-preview",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-3.8-flash",
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
        18_000,
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
        await new Promise((r) => setTimeout(r, 600));
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
  const models = ["gpt-4.1-mini", "gpt-5-mini", "gpt-4o-mini"];
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
        signal: AbortSignal.timeout(20_000),
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

export async function generateFullCreativeWithAI(params: {
  companyId: string;
  promptText: string;
  aspectRatio: AspectRatio;
  preferredImageAI: ImageAIProvider;
  allowFallback?: boolean;
  referencePhotoUrl?: string | null;
  keys: { gemini?: string | null; openai?: string | null };
  r2Config?: R2StorageConfig;
  logs: string[];
}): Promise<string | null> {
  const cleanedPrompt = cleanCreativePrompt(params.promptText);
  if (!cleanedPrompt) return null;

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
      const openAiModels =
        params.preferredImageAI === "OPENAI_MINI"
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
              signal: AbortSignal.timeout(45_000),
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
              signal: AbortSignal.timeout(45_000),
            });
          }

          const data = (await res.json()) as {
            data?: Array<{ b64_json?: string; url?: string }>;
            error?: { message?: string };
          };
          const outBuf = res.ok ? await extractOpenAiBuffer(data) : null;
          if (outBuf) {
            const url = await uploadBufferToR2(
              outBuf,
              `companies/${params.companyId}/ai-creatives/${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 6)}.png`,
              "image/png",
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
      const geminiModels = [
        "gemini-3.1-flash-image-preview",
        "gemini-3-pro-image-preview",
        "gemini-nano-banana-2.1",
        "gemini-2.5-flash-image",
      ];
      for (const model of geminiModels) {
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
            20_000,
            `Criativo ${model}`
          );
          const resParts = res.candidates?.[0]?.content?.parts || [];
          const imgPart = resParts.find((p) => p.inlineData?.data);
          if (imgPart?.inlineData?.data) {
            const outBuf = Buffer.from(imgPart.inlineData.data, "base64");
            const outMime = imgPart.inlineData.mimeType || "image/png";
            const url = await uploadBufferToR2(
              outBuf,
              `companies/${params.companyId}/ai-creatives/${Date.now()}.png`,
              outMime,
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

export async function publishToMetaChannels(params: {
  igUserId?: string | null;
  fbPageId?: string | null;
  metaAccessToken?: string | null;
  imageUrls: string[];
  caption: string;
  logs: string[];
}): Promise<{ instagramPostId: string | null; facebookPostId: string | null }> {
  const token = params.metaAccessToken?.trim();
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

  // 1. INSTAGRAM BUSINESS
  if (params.igUserId?.trim()) {
    const igId = params.igUserId.trim();
    if (params.imageUrls.length === 1) {
      appendLog(params.logs, "Meta IG: Criando container de imagem única...");
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
          `Meta IG /media falhou: ${mediaData.error?.message || mediaRes.statusText
          }`
        );
      }

      appendLog(
        params.logs,
        `Meta IG: Container ${mediaData.id} criado. Aguardando 5s...`
      );
      await new Promise((r) => setTimeout(r, 5000));

      const pubRes = await fetch(
        `${META_GRAPH_BASE_URL}/${igId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: mediaData.id,
            access_token: token,
          }),
        }
      );
      const pubData = (await pubRes.json()) as {
        id?: string;
        error?: { message?: string };
      };
      if (!pubRes.ok || !pubData.id) {
        throw new Error(
          `Meta IG /media_publish falhou: ${pubData.error?.message || pubRes.statusText
          }`
        );
      }
      instagramPostId = pubData.id;
      appendLog(
        params.logs,
        `Meta IG: Publicado com sucesso (ID ${instagramPostId}).`
      );
    } else {
      appendLog(
        params.logs,
        `Meta IG Carrossel: Criando ${params.imageUrls.length} itens...`
      );
      const childrenIds: string[] = [];
      for (let idx = 0; idx < params.imageUrls.length; idx++) {
        const childRes = await fetch(`${META_GRAPH_BASE_URL}/${igId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: params.imageUrls[idx],
            is_carousel_item: true,
            access_token: token,
          }),
        });
        const childData = (await childRes.json()) as {
          id?: string;
          error?: { message?: string };
        };
        if (!childRes.ok || !childData.id) {
          throw new Error(
            `Meta IG carrossel slide ${idx + 1} falhou: ${childData.error?.message || childRes.statusText
            }`
          );
        }
        childrenIds.push(childData.id);
      }

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
          `Meta IG container CAROUSEL falhou: ${carData.error?.message || carRes.statusText
          }`
        );
      }

      appendLog(
        params.logs,
        `Meta IG Carrossel: Container ${carData.id} criado. Aguardando 5s...`
      );
      await new Promise((r) => setTimeout(r, 5000));

      const pubRes = await fetch(
        `${META_GRAPH_BASE_URL}/${igId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: carData.id,
            access_token: token,
          }),
        }
      );
      const pubData = (await pubRes.json()) as {
        id?: string;
        error?: { message?: string };
      };
      if (!pubRes.ok || !pubData.id) {
        throw new Error(
          `Meta IG /media_publish carrossel falhou: ${pubData.error?.message || pubRes.statusText
          }`
        );
      }
      instagramPostId = pubData.id;
      appendLog(
        params.logs,
        `Meta IG Carrossel: Publicado com sucesso (ID ${instagramPostId}).`
      );
    }
  } else {
    appendLog(params.logs, "Meta IG: IG_USER_ID não informado, pulando.");
  }

  // 2. PÁGINA DO FACEBOOK (Obtendo Page Access Token automaticamente)
  if (params.fbPageId?.trim()) {
    const fbId = params.fbPageId.trim();
    appendLog(params.logs, "Meta FB: Obtendo Page Access Token da Página...");
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
        `Meta FB Page Token falhou: ${pageTokenData.error?.message || pageTokenRes.statusText
        }`
      );
    }

    if (params.imageUrls.length === 1) {
      const fbRes = await fetch(`${META_GRAPH_BASE_URL}/${fbId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: params.imageUrls[0],
          message: params.caption,
          access_token: pageTokenData.access_token,
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
          `Meta FB /photos falhou: ${fbData.error?.message || fbRes.statusText}`
        );
      }
      facebookPostId = fbPostId;
      appendLog(
        params.logs,
        `Meta FB: Foto única publicada na Página "${pageTokenData.name || fbId
        }" (ID ${facebookPostId}).`
      );
    } else {
      appendLog(
        params.logs,
        `Meta FB Multi-Fotos: Enviando ${params.imageUrls.length} slides sem publicar para compor o álbum no feed...`
      );
      const attachedMedia: Array<{ media_fbid: string }> = [];

      for (let i = 0; i < params.imageUrls.length; i++) {
        const photoRes = await fetch(`${META_GRAPH_BASE_URL}/${fbId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: params.imageUrls[i],
            published: false,
            access_token: pageTokenData.access_token,
          }),
        });
        const photoData = (await photoRes.json()) as {
          id?: string;
          error?: { message?: string };
        };
        if (!photoRes.ok || !photoData.id) {
          throw new Error(
            `Meta FB slide ${i + 1} (/photos published=false) falhou: ${photoData.error?.message || photoRes.statusText
            }`
          );
        }
        attachedMedia.push({ media_fbid: photoData.id });
      }

      const feedRes = await fetch(`${META_GRAPH_BASE_URL}/${fbId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: params.caption,
          attached_media: attachedMedia,
          access_token: pageTokenData.access_token,
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
          `Meta FB Multi-Fotos: Post com ${attachedMedia.length} imagens publicado na Página "${pageTokenData.name || fbId
          }" (ID ${facebookPostId}).`
        );
      } else {
        appendLog(
          params.logs,
          `Meta FB /feed aviso (${feedData.error?.message || feedRes.statusText
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
              access_token: pageTokenData.access_token,
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
            `Meta FB fallback /photos falhou: ${fallbackData.error?.message || fallbackRes.statusText
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
  } else {
    appendLog(params.logs, "Meta FB: FB_PAGE_ID não informado, pulando.");
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

  const postWithPrivacy = async (privacyLevel: "PUBLIC_TO_EVERYONE" | "SELF_ONLY") => {
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

  let { res, data } = await postWithPrivacy("PUBLIC_TO_EVERYONE");

  if (
    (!res.ok || data.error?.code !== "ok") &&
    /unaudited|integration guidelines|private_accounts|privacy_level/i.test(
      `${data.error?.code || ""} ${data.error?.message || ""}`
    )
  ) {
    appendLog(
      params.logs,
      "TikTok Sandbox/não auditado: reenviando com privacidade SELF_ONLY (privado)..."
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

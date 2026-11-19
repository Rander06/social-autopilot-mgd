import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ImageResponse } from "@vercel/og";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface GeneratedPost {
  tema_visual: string;
  headline_arte: string;
  subtitulo_arte: string;
  dor_vs_solucao: string;
  destaque_selo: string;
  legenda: string;
  hashtags: string;
}

const META_GRAPH_BASE_URL = "https://graph.facebook.com/v21.0";

const CURATED_PROPERTY_PHOTOS = [
  "https://images.unsplash.com/photo-1635108201018-94bbbfac4a79?auto=format&fit=crop&w=1080&q=80",
  "https://images.unsplash.com/photo-1657383543451-e47d1589195d?auto=format&fit=crop&w=1080&q=80",
  "https://images.unsplash.com/photo-1783125127094-ea962d41ba42?auto=format&fit=crop&w=1080&q=80",
  "https://images.unsplash.com/photo-1783125127318-2c6792a58734?auto=format&fit=crop&w=1080&q=80",
  "https://images.unsplash.com/photo-1783125126717-e9c855c86a63?auto=format&fit=crop&w=1080&q=80",
];

const fontCache = new Map<string, ArrayBuffer>();

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value.trim();
}

function appendLog(logs: string[], message: string) {
  const timestamp = new Date().toISOString();
  logs.push(`[${timestamp}] ${message}`);
}

function isRetryableGeminiError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  return (
    /\b(404|429|500|502|503|504)\b/.test(message) ||
    /UNAVAILABLE|RESOURCE_EXHAUSTED|NOT_FOUND|high demand|fetch failed/i.test(
      message
    )
  );
}

async function loadGoogleFont(
  family: string,
  weight: 500 | 700 | 800
): Promise<ArrayBuffer | null> {
  const cacheKey = `${family}:${weight}`;
  const cached = fontCache.get(cacheKey);
  if (cached) return cached;

  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
      family
    )}:wght@${weight}&display=swap`;
    const cssRes = await fetch(cssUrl, {
      headers: {
        // User-Agent legado faz o Google Fonts retornar URLs .ttf compatíveis com Satori
        "User-Agent":
          "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1",
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const match = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?truetype['"]?\)/);
    if (!match?.[1]) return null;

    const fontRes = await fetch(match[1], {
      signal: AbortSignal.timeout(4000),
    });
    if (!fontRes.ok) return null;

    const buffer = await fontRes.arrayBuffer();
    fontCache.set(cacheKey, buffer);
    return buffer;
  } catch {
    return null;
  }
}

async function loadOgFonts() {
  const [w500, w700, w800] = await Promise.all([
    loadGoogleFont("Plus Jakarta Sans", 500),
    loadGoogleFont("Plus Jakarta Sans", 700),
    loadGoogleFont("Plus Jakarta Sans", 800),
  ]);

  const fonts: Array<{
    name: string;
    data: ArrayBuffer;
    weight: 500 | 700 | 800;
    style: "normal";
  }> = [];

  if (w500) {
    fonts.push({
      name: "Plus Jakarta Sans",
      data: w500,
      weight: 500,
      style: "normal",
    });
  }
  if (w700) {
    fonts.push({
      name: "Plus Jakarta Sans",
      data: w700,
      weight: 700,
      style: "normal",
    });
  }
  if (w800) {
    fonts.push({
      name: "Plus Jakarta Sans",
      data: w800,
      weight: 800,
      style: "normal",
    });
  }

  return fonts;
}

async function loadPhotoDataUrl(photoIndex: number): Promise<string | null> {
  const photoUrl =
    CURATED_PROPERTY_PHOTOS[photoIndex % CURATED_PROPERTY_PHOTOS.length];
  try {
    const res = await fetch(photoUrl, {
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function renderCheckSvg(color = "#1E7E53", size = 20) {
  const h = React.createElement;
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      style: { flexShrink: 0 },
    },
    h("circle", {
      cx: "12",
      cy: "12",
      r: "10",
      fill: color,
      fillOpacity: "0.16",
    }),
    h("path", {
      d: "M7.5 12.5L10.5 15.5L16.5 9",
      stroke: color,
      strokeWidth: "2.6",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    })
  );
}

function renderBoltSvg(color = "#C85A32", size = 22) {
  const h = React.createElement;
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      style: { flexShrink: 0 },
    },
    h("path", {
      d: "M13 2L4.5 13.5H11.5L10.5 22L19.5 10.5H12.5L13 2Z",
      fill: color,
    })
  );
}

function renderArrowRightSvg(color = "#FAF5EE", size = 20) {
  const h = React.createElement;
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      style: { flexShrink: 0 },
    },
    h("path", {
      d: "M5 12H19M19 12L13 6M19 12L13 18",
      stroke: color,
      strokeWidth: "2.6",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    })
  );
}

function renderXCrossSvg(color = "#C85A32", size = 18) {
  const h = React.createElement;
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      style: { flexShrink: 0 },
    },
    h("circle", {
      cx: "12",
      cy: "12",
      r: "10",
      fill: color,
      fillOpacity: "0.18",
    }),
    h("path", {
      d: "M9 9L15 15M15 9L9 15",
      stroke: color,
      strokeWidth: "2.4",
      strokeLinecap: "round",
    })
  );
}

async function generatePostWithGemini(logs: string[]): Promise<GeneratedPost> {
  const envModel = process.env.GEMINI_MODEL?.trim();
  const modelCandidates = Array.from(
    new Set([
      ...(envModel ? [envModel] : []),
      "gemini-3-flash-preview",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-3.8-flash",
    ])
  );

  const apiKey = getRequiredEnv("GEMINI_API_KEY");
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Você é o estrategista de marketing e copywriter sênior da agência "Meu Gestor Digital".
Crie um post inédito, persuasivo e focado em conversão para Instagram Business e Página do Facebook vendendo sites completos para donos de chácaras, ranchos, casas de temporada e salões de festas.

DADOS OBRIGATÓRIOS DA OFERTA:
- Preço: 12x de R$149,90
- Zero taxas ou comissões por reserva (100% do lucro fica com o proprietário)
- Recursos incluídos no site:
  1. Simulador de orçamento em tempo real
  2. Calendário online de disponibilidade
  3. Pagamento via PIX com baixa automática
  4. Contrato digital em PDF
  5. Atendimento automático com IA no WhatsApp onde o dono assume quando quiser

REGRAS ESTRITAS:
1. NUNCA cite nomes de clientes, pessoas ou nomes específicos de espaços/propriedades (como "Espaço Lazer" ou similares) nas artes ou legendas.
2. NUNCA use emojis nos campos de texto da arte (tema_visual, headline_arte, subtitulo_arte, dor_vs_solucao, destaque_selo) — use emojis APENAS na legenda.
3. Varie o ângulo criativo a cada geração (ex: fuga de taxas de aplicativos, fechamento no PIX com baixa automática, atendimento 24h com IA no WhatsApp onde o dono assume quando quiser, contrato digital em PDF automático).
4. tema_visual: Frase curta (2 a 4 palavras, sem emojis) resumindo o tema visual (ex: "Lucro 100% Direto", "Reserva no Piloto Automático").
5. headline_arte: Máximo de 7 palavras, sem emojis. Direta, forte e persuasiva para estampar uma arte publicitária 1080x1080.
6. subtitulo_arte: Curto (até 12 palavras, sem emojis), incluindo obrigatoriamente "12x de R$149,90".
7. dor_vs_solucao: Frase curta (até 14 palavras, sem emojis) contrastando a dor do proprietário com a solução (ex: "Chega de perder locações respondendo orçamentos manuais no WhatsApp").
8. destaque_selo: Frase curtíssima em caixa alta para selo (ex: "0% COMISSÃO • 100% SEU LUCRO").
9. legenda: Copy persuasiva em português do Brasil, parágrafos curtos com emojis estratégicos, destacando os benefícios e finalizando com CTA claro convidando a comentar "EU QUERO".
10. hashtags: Lista de hashtags relevantes separadas por espaço.`;

  let lastError: unknown;

  for (let i = 0; i < modelCandidates.length; i++) {
    const modelName = modelCandidates[i];
    appendLog(
      logs,
      `Passo A: Tentando geração de copy com Gemini (${modelName})...`
    );

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tema_visual: {
                type: Type.STRING,
                description:
                  "Tema visual curto sem emojis (2 a 4 palavras).",
              },
              headline_arte: {
                type: Type.STRING,
                description:
                  "Título publicitário impactante sem emojis com no máximo 7 palavras.",
              },
              subtitulo_arte: {
                type: Type.STRING,
                description:
                  "Subtítulo curto sem emojis incluindo obrigatoriamente 12x de R$149,90.",
              },
              dor_vs_solucao: {
                type: Type.STRING,
                description:
                  "Frase curta de contraste atacando a dor do locador (até 14 palavras, sem emojis).",
              },
              destaque_selo: {
                type: Type.STRING,
                description:
                  'Frase curta para selo de oferta (ex: "0% COMISSÃO • 100% SEU LUCRO").',
              },
              legenda: {
                type: Type.STRING,
                description:
                  'Copy persuasiva com emojis e CTA para comentar "EU QUERO".',
              },
              hashtags: {
                type: Type.STRING,
                description: "Hashtags relevantes separadas por espaço.",
              },
            },
            required: [
              "tema_visual",
              "headline_arte",
              "subtitulo_arte",
              "dor_vs_solucao",
              "destaque_selo",
              "legenda",
              "hashtags",
            ],
          },
          temperature: 0.9,
        },
      });

      const rawText = response.text;
      if (!rawText) {
        throw new Error(`O modelo ${modelName} retornou uma resposta vazia.`);
      }

      const parsed = JSON.parse(rawText) as GeneratedPost;
      if (
        !parsed.tema_visual ||
        !parsed.headline_arte ||
        !parsed.subtitulo_arte ||
        !parsed.dor_vs_solucao ||
        !parsed.destaque_selo ||
        !parsed.legenda ||
        !parsed.hashtags
      ) {
        throw new Error(`Resposta JSON de ${modelName} incompleta.`);
      }

      appendLog(
        logs,
        `Passo A concluído (${modelName}): tema_visual="${parsed.tema_visual}", headline="${parsed.headline_arte}".`
      );
      return parsed;
    } catch (error) {
      lastError = error;
      const errMsg = error instanceof Error ? error.message : String(error);
      appendLog(logs, `Passo A (${modelName}) falhou: ${errMsg}`);

      if (!isRetryableGeminiError(error) || i === modelCandidates.length - 1) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Falha ao gerar conteúdo no Gemini.");
}

function buildBrandHeader(
  post: GeneratedPost,
  slideBadge?: string
): React.ReactElement {
  const h = React.createElement;
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "10px",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              backgroundColor: "#C85A32",
              color: "#FAF5EE",
              padding: "10px 20px",
              borderRadius: "999px",
              fontSize: "17px",
              fontWeight: 800,
              letterSpacing: "0.05em",
            },
          },
          post.tema_visual.toUpperCase()
        ),
        slideBadge
          ? h(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  backgroundColor: "rgba(250, 245, 238, 0.16)",
                  border: "1px solid rgba(250, 245, 238, 0.35)",
                  color: "#FAF5EE",
                  padding: "9px 16px",
                  borderRadius: "999px",
                  fontSize: "16px",
                  fontWeight: 700,
                },
              },
              slideBadge
            )
          : null
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "15px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "rgba(250, 245, 238, 0.85)",
          },
        },
        "CHÁCARAS • RANCHOS • TEMPORADA • SALÕES"
      )
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          backgroundColor: "#1E7E53",
          color: "#FAF5EE",
          padding: "14px 26px",
          borderRadius: "18px",
          border: "2px solid rgba(250, 245, 238, 0.25)",
          boxShadow: "0 12px 28px rgba(0, 0, 0, 0.28)",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "30px",
            fontWeight: 800,
            lineHeight: 1.05,
          },
        },
        "12x de R$149,90"
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "13px",
            fontWeight: 800,
            letterSpacing: "0.05em",
            color: "#FAF5EE",
            opacity: 0.92,
            marginTop: "4px",
          },
        },
        post.destaque_selo.toUpperCase()
      )
    )
  );
}

function buildBrandFooter(ctaText = 'COMENTE "EU QUERO"'): React.ReactElement {
  const h = React.createElement;
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        backgroundColor: "#2C1E16",
        color: "#FAF5EE",
        padding: "22px 30px",
        borderRadius: "22px",
        width: "100%",
        boxShadow: "0 14px 32px rgba(44, 30, 22, 0.18)",
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "26px",
            fontWeight: 800,
            color: "#FAF5EE",
          },
        },
        "Meu Gestor Digital"
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "15px",
            fontWeight: 500,
            color: "rgba(250, 245, 238, 0.8)",
            marginTop: "2px",
          },
        },
        "Sites completos para locações e eventos • Sem taxas por reserva"
      )
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "10px",
          backgroundColor: "#C85A32",
          color: "#FAF5EE",
          padding: "14px 24px",
          borderRadius: "14px",
          fontSize: "19px",
          fontWeight: 800,
          whiteSpace: "nowrap",
          flexShrink: 0,
        },
      },
      ctaText,
      renderArrowRightSvg("#FAF5EE", 20)
    )
  );
}

function buildMiniDashboardMockup(): React.ReactElement {
  const h = React.createElement;
  const steps = [
    { step: "1. Simulador", label: "Orçamento na hora", badge: "Online" },
    { step: "2. PIX Auto", label: "Baixa instantânea", badge: "0% Taxa" },
    { step: "3. Contrato", label: "PDF automático", badge: "Assinado" },
    { step: "4. IA WhatsApp", label: "Assuma quando quiser", badge: "24h" },
  ];

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#2C1E16",
        borderRadius: "20px",
        padding: "18px 22px",
        gap: "12px",
        width: "100%",
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "14px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "rgba(250, 245, 238, 0.78)",
          },
        },
        "FLUXO AUTOMÁTICO DA RESERVA NO SEU SITE"
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            backgroundColor: "rgba(30, 126, 83, 0.25)",
            border: "1px solid #1E7E53",
            color: "#8CE0B3",
            padding: "4px 12px",
            borderRadius: "999px",
            fontSize: "13px",
            fontWeight: 700,
          },
        },
        "100% NO PILOTO AUTOMÁTICO"
      )
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          gap: "10px",
        },
      },
      ...steps.map((item) =>
        h(
          "div",
          {
            key: item.step,
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              flex: 1,
              backgroundColor: "rgba(250, 245, 238, 0.08)",
              border: "1px solid rgba(250, 245, 238, 0.14)",
              borderRadius: "14px",
              padding: "12px 13px",
            },
          },
          h(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              },
            },
            h(
              "div",
              {
                style: {
                  display: "flex",
                  fontSize: "15px",
                  fontWeight: 800,
                  color: "#FAF5EE",
                },
              },
              item.step
            ),
            h(
              "div",
              {
                style: {
                  display: "flex",
                  backgroundColor: "#1E7E53",
                  color: "#FAF5EE",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: 700,
                },
              },
              item.badge
            )
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                fontSize: "14px",
                fontWeight: 500,
                color: "rgba(250, 245, 238, 0.8)",
                marginTop: "6px",
              },
            },
            item.label
          )
        )
      )
    )
  );
}

function buildHeroBackdrop(
  photoDataUrl: string | null,
  height = 410
): React.ReactElement {
  const h = React.createElement;
  return h(
    "div",
    {
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "1080px",
        height: `${height}px`,
        display: "flex",
        overflow: "hidden",
        backgroundColor: "#2C1E16",
      },
    },
    photoDataUrl
      ? h("img", {
          src: photoDataUrl,
          alt: "Área de lazer com piscina",
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            width: "1080px",
            height: `${height}px`,
            objectFit: "cover",
          },
        })
      : null,
    h("div", {
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "1080px",
        height: `${height}px`,
        display: "flex",
        backgroundImage: photoDataUrl
          ? "linear-gradient(155deg, rgba(44, 30, 22, 0.92) 0%, rgba(44, 30, 22, 0.82) 55%, rgba(200, 90, 50, 0.78) 100%)"
          : "linear-gradient(140deg, #2C1E16 0%, #5B2E1E 60%, #C85A32 100%)",
      },
    })
  );
}

function buildSinglePostArt(
  post: GeneratedPost,
  photoDataUrl: string | null
): React.ReactElement {
  const h = React.createElement;
  const featureCards = [
    {
      title: "Simulador de Orçamento",
      desc: "Cliente calcula valores em tempo real",
    },
    {
      title: "Calendário Online",
      desc: "Mostra datas disponíveis sem curiosos",
    },
    {
      title: "PIX Baixa Automática",
      desc: "Confirma a reserva na hora sem taxas",
    },
    {
      title: "Contrato Digital PDF",
      desc: "Emitido automaticamente após o sinal",
    },
    {
      title: "IA no WhatsApp 24h",
      desc: "Atende sozinha e você assume quando quiser",
    },
    {
      title: "12x de R$149,90",
      desc: "Sem mensalidade abusiva ou comissão",
    },
  ];

  return h(
    "div",
    {
      style: {
        width: "1080px",
        height: "1080px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#FAF5EE",
        fontFamily: "Plus Jakarta Sans, sans-serif",
        color: "#2C1E16",
        position: "relative",
        overflow: "hidden",
      },
    },
    // Fundo fotográfico superior com overlay escuro/terracota
    buildHeroBackdrop(photoDataUrl, 420),

    // Conteúdo principal em fluxo seguro
    h(
      "div",
      {
        style: {
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "1080px",
          height: "1080px",
          padding: "44px 48px",
        },
      },
      // Cabeçalho de autoridade sobre o hero escuro
      buildBrandHeader(post),

      // Headline + Subtítulo no topo sobre foto
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            marginTop: "6px",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: "58px",
              fontWeight: 800,
              lineHeight: 1.06,
              color: "#FAF5EE",
              letterSpacing: "-0.02em",
            },
          },
          post.headline_arte
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: "25px",
              fontWeight: 700,
              lineHeight: 1.3,
              color: "#FFD2BF",
            },
          },
          post.subtitulo_arte
        )
      ),

      // Cartão branco principal com dor/solução, grid 2 colunas e mini-mockup
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#FFFFFF",
            borderRadius: "28px",
            border: "2px solid rgba(44, 30, 22, 0.1)",
            padding: "26px 28px",
            gap: "18px",
            boxShadow: "0 20px 44px rgba(44, 30, 22, 0.12)",
          },
        },
        // Faixa de dor vs solução
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "12px",
              backgroundColor: "#FAF5EE",
              borderLeft: "6px solid #C85A32",
              borderRadius: "12px",
              padding: "14px 18px",
            },
          },
          renderBoltSvg("#C85A32", 24),
          h(
            "div",
            {
              style: {
                display: "flex",
                fontSize: "20px",
                fontWeight: 700,
                color: "#2C1E16",
                lineHeight: 1.3,
              },
            },
            post.dor_vs_solucao
          )
        ),

        // Grid 2 colunas (452px + 14px + 452px = 918px dentro de 984 - 56 = 928px)
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              gap: "14px",
              width: "100%",
            },
          },
          ...featureCards.map((card, idx) => {
            const isPriceCard = idx === featureCards.length - 1;
            return h(
              "div",
              {
                key: card.title,
                style: {
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "12px",
                  width: "455px",
                  backgroundColor: isPriceCard ? "#EDF7F2" : "#FAF5EE",
                  border: isPriceCard
                    ? "2px solid #1E7E53"
                    : "1px solid rgba(44, 30, 22, 0.12)",
                  borderRadius: "16px",
                  padding: "13px 16px",
                },
              },
              renderCheckSvg(isPriceCard ? "#1E7E53" : "#C85A32", 24),
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                  },
                },
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      fontSize: "19px",
                      fontWeight: 800,
                      color: isPriceCard ? "#1E7E53" : "#2C1E16",
                    },
                  },
                  card.title
                ),
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      fontSize: "15px",
                      fontWeight: 500,
                      color: "rgba(44, 30, 22, 0.78)",
                      marginTop: "2px",
                    },
                  },
                  card.desc
                )
              )
            );
          })
        ),

        // Mini-mockup de fluxo automatizado
        buildMiniDashboardMockup()
      ),

      // Rodapé premium
      buildBrandFooter()
    )
  );
}

function buildCarouselSlide1(
  post: GeneratedPost,
  photoDataUrl: string | null
): React.ReactElement {
  const h = React.createElement;
  return h(
    "div",
    {
      style: {
        width: "1080px",
        height: "1080px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#2C1E16",
        fontFamily: "Plus Jakarta Sans, sans-serif",
        position: "relative",
        overflow: "hidden",
      },
    },
    buildHeroBackdrop(photoDataUrl, 1080),
    h(
      "div",
      {
        style: {
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "1080px",
          height: "1080px",
          padding: "52px",
        },
      },
      buildBrandHeader(post, "SLIDE 1/3"),

      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            backgroundColor: "rgba(44, 30, 22, 0.76)",
            border: "2px solid rgba(250, 245, 238, 0.2)",
            borderRadius: "32px",
            padding: "46px",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: "72px",
              fontWeight: 800,
              lineHeight: 1.05,
              color: "#FAF5EE",
              letterSpacing: "-0.02em",
            },
          },
          post.headline_arte
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "14px",
              backgroundColor: "rgba(250, 245, 238, 0.1)",
              borderLeft: "6px solid #C85A32",
              borderRadius: "14px",
              padding: "18px 22px",
            },
          },
          renderBoltSvg("#C85A32", 26),
          h(
            "div",
            {
              style: {
                display: "flex",
                fontSize: "24px",
                fontWeight: 700,
                color: "#FAF5EE",
                lineHeight: 1.35,
              },
            },
            post.dor_vs_solucao
          )
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: "28px",
              fontWeight: 700,
              color: "#FFD2BF",
            },
          },
          post.subtitulo_arte
        )
      ),

      buildBrandFooter("DESLIZE PARA VER")
    )
  );
}

function buildCarouselSlide2(): React.ReactElement {
  const h = React.createElement;
  const items = [
    {
      num: "01",
      title: "Simulador de Orçamento em Tempo Real",
      desc: "O cliente escolhe datas, quantidade de pessoas e recebe o valor exato na hora, sem depender de você responder.",
    },
    {
      num: "02",
      title: "Calendário Online de Disponibilidade",
      desc: "Acaba com perguntas repetitivas de datas ocupadas e evita conflito de reservas duplas.",
    },
    {
      num: "03",
      title: "Pagamento via PIX com Baixa Automática",
      desc: "Reserva confirmada e data bloqueada automaticamente assim que o PIX cai na sua conta, sem taxas.",
    },
    {
      num: "04",
      title: "Contrato Digital em PDF Automático",
      desc: "Documento completo gerado na hora com os dados do locatário para sua total segurança jurídica.",
    },
    {
      num: "05",
      title: "Atendimento com IA no WhatsApp 24h",
      desc: "Responde dúvidas, envia orçamentos e você assume a conversa manualmente quando quiser.",
    },
  ];

  return h(
    "div",
    {
      style: {
        width: "1080px",
        height: "1080px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#FAF5EE",
        fontFamily: "Plus Jakarta Sans, sans-serif",
        color: "#2C1E16",
        padding: "46px 52px",
      },
    },
    // Cabeçalho claro
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: "18px",
              fontWeight: 800,
              color: "#C85A32",
              letterSpacing: "0.06em",
            },
          },
          "SISTEMA COMPLETO PARA LOCAÇÕES • SLIDE 2/3"
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: "40px",
              fontWeight: 800,
              color: "#2C1E16",
              marginTop: "4px",
            },
          },
          "Tudo funcionando no automático:"
        )
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            backgroundColor: "#1E7E53",
            color: "#FAF5EE",
            padding: "12px 22px",
            borderRadius: "14px",
            fontSize: "22px",
            fontWeight: 800,
          },
        },
        "12x de R$149,90"
      )
    ),

    // Lista dos 5 recursos
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        },
      },
      ...items.map((item) =>
        h(
          "div",
          {
            key: item.num,
            style: {
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "18px",
              backgroundColor: "#FFFFFF",
              border: "2px solid rgba(44, 30, 22, 0.1)",
              borderRadius: "20px",
              padding: "16px 22px",
            },
          },
          h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "52px",
                height: "52px",
                borderRadius: "14px",
                backgroundColor: "#C85A32",
                color: "#FAF5EE",
                fontSize: "22px",
                fontWeight: 800,
                flexShrink: 0,
              },
            },
            item.num
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
              },
            },
            h(
              "div",
              {
                style: {
                  display: "flex",
                  fontSize: "22px",
                  fontWeight: 800,
                  color: "#2C1E16",
                },
              },
              item.title
            ),
            h(
              "div",
              {
                style: {
                  display: "flex",
                  fontSize: "16px",
                  fontWeight: 500,
                  color: "rgba(44, 30, 22, 0.78)",
                  marginTop: "3px",
                },
              },
              item.desc
            )
          )
        )
      )
    ),

    buildBrandFooter("COMPARE E DECIDA")
  );
}

function buildCarouselSlide3(post: GeneratedPost): React.ReactElement {
  const h = React.createElement;
  const oldWay = [
    "Paga taxas altas em plataformas a cada reserva",
    "Perde vendas respondendo orçamentos manuais tarde da noite",
    "Confere comprovante de PIX manualmente no extrato",
    "Preenche contrato no Word um por um",
  ];
  const newWay = [
    "Zero comissão por reserva (100% do lucro é seu)",
    "Simulador + Calendário online fecham reservas 24h",
    "PIX com baixa automática e bloqueio instantâneo",
    "Contrato PDF automático + IA no WhatsApp",
  ];

  return h(
    "div",
    {
      style: {
        width: "1080px",
        height: "1080px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#FAF5EE",
        fontFamily: "Plus Jakarta Sans, sans-serif",
        color: "#2C1E16",
        padding: "46px 52px",
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: "18px",
              fontWeight: 800,
              color: "#1E7E53",
              letterSpacing: "0.06em",
            },
          },
          "COMPARE E DECIDA • SLIDE 3/3"
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: "42px",
              fontWeight: 800,
              color: "#2C1E16",
              marginTop: "4px",
            },
          },
          "Pare de perder dinheiro por reserva"
        )
      )
    ),

    // Comparativo 2 colunas
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row",
          gap: "20px",
          width: "100%",
        },
      },
      // Coluna Sem Site Próprio
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            width: "478px",
            backgroundColor: "#FFFFFF",
            border: "2px solid rgba(200, 90, 50, 0.35)",
            borderRadius: "24px",
            padding: "28px",
            gap: "18px",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              backgroundColor: "rgba(200, 90, 50, 0.14)",
              color: "#C85A32",
              padding: "10px 16px",
              borderRadius: "12px",
              fontSize: "20px",
              fontWeight: 800,
            },
          },
          "JEITO ANTIGO (COM TAXAS)"
        ),
        ...oldWay.map((item) =>
          h(
            "div",
            {
              key: item,
              style: {
                display: "flex",
                flexDirection: "row",
                alignItems: "flex-start",
                gap: "12px",
              },
            },
            renderXCrossSvg("#C85A32", 22),
            h(
              "div",
              {
                style: {
                  display: "flex",
                  fontSize: "19px",
                  fontWeight: 500,
                  color: "rgba(44, 30, 22, 0.85)",
                  lineHeight: 1.35,
                },
              },
              item
            )
          )
        )
      ),
      // Coluna Com Meu Gestor Digital
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            width: "478px",
            backgroundColor: "#EDF7F2",
            border: "3px solid #1E7E53",
            borderRadius: "24px",
            padding: "28px",
            gap: "18px",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              backgroundColor: "#1E7E53",
              color: "#FAF5EE",
              padding: "10px 16px",
              borderRadius: "12px",
              fontSize: "20px",
              fontWeight: 800,
            },
          },
          "SEU SITE PRÓPRIO MGD"
        ),
        ...newWay.map((item) =>
          h(
            "div",
            {
              key: item,
              style: {
                display: "flex",
                flexDirection: "row",
                alignItems: "flex-start",
                gap: "12px",
              },
            },
            renderCheckSvg("#1E7E53", 22),
            h(
              "div",
              {
                style: {
                  display: "flex",
                  fontSize: "19px",
                  fontWeight: 700,
                  color: "#2C1E16",
                  lineHeight: 1.35,
                },
              },
              item
            )
          )
        )
      )
    ),

    // Banner oferta final
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "20px",
          backgroundColor: "#1E7E53",
          color: "#FAF5EE",
          borderRadius: "24px",
          padding: "26px 32px",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: "17px",
              fontWeight: 700,
              opacity: 0.9,
            },
          },
          post.destaque_selo.toUpperCase()
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: "26px",
              fontWeight: 800,
              marginTop: "4px",
            },
          },
          "Site completo + Automação WhatsApp"
        )
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "38px",
            fontWeight: 800,
            whiteSpace: "nowrap",
            flexShrink: 0,
          },
        },
        "12x de R$149,90"
      )
    ),

    buildBrandFooter('COMENTE "EU QUERO"')
  );
}

async function renderPostImageBuffer(
  post: GeneratedPost,
  slideNumber?: 1 | 2 | 3
): Promise<Buffer> {
  const photoIndex = Math.floor(Date.now() / 1000) % CURATED_PROPERTY_PHOTOS.length;
  const [fonts, photoDataUrl] = await Promise.all([
    loadOgFonts(),
    slideNumber === 2 || slideNumber === 3
      ? Promise.resolve(null)
      : loadPhotoDataUrl(photoIndex),
  ]);

  let element: React.ReactElement;
  if (slideNumber === 1) {
    element = buildCarouselSlide1(post, photoDataUrl);
  } else if (slideNumber === 2) {
    element = buildCarouselSlide2();
  } else if (slideNumber === 3) {
    element = buildCarouselSlide3(post);
  } else {
    element = buildSinglePostArt(post, photoDataUrl);
  }

  const imageResponse = new ImageResponse(element, {
    width: 1080,
    height: 1080,
    fonts: fonts.length > 0 ? fonts : undefined,
  });

  const arrayBuffer = await imageResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadImageToR2(
  imageBuffer: Buffer,
  logs: string[],
  suffix?: string
): Promise<string> {
  const accountId = getRequiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = getRequiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getRequiredEnv("R2_SECRET_ACCESS_KEY");
  const bucketName = getRequiredEnv("R2_BUCKET_NAME");
  const publicUrl = getRequiredEnv("R2_PUBLIC_URL").replace(/\/+$/, "");

  const s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const fileName = suffix
    ? `posts/${Date.now()}-${suffix}.png`
    : `posts/${Date.now()}.png`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Body: imageBuffer,
      ContentType: "image/png",
    })
  );

  const finalUrl = `${publicUrl}/${fileName}`;
  appendLog(logs, `Passo C concluído: Imagem enviada ao R2 (${finalUrl}).`);
  return finalUrl;
}

async function publishToInstagram(
  imageUrl: string,
  caption: string,
  logs: string[]
): Promise<string> {
  const igUserId = getRequiredEnv("IG_USER_ID");
  const accessToken = getRequiredEnv("META_ACCESS_TOKEN");

  appendLog(logs, "Passo D (IG): Criando container de mídia única...");
  const mediaResponse = await fetch(
    `${META_GRAPH_BASE_URL}/${igUserId}/media`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      }),
    }
  );

  const mediaData = (await mediaResponse.json()) as {
    id?: string;
    error?: { message?: string; code?: number; fbtrace_id?: string };
  };

  if (!mediaResponse.ok || !mediaData.id) {
    throw new Error(
      `Meta IG /media falhou (HTTP ${mediaResponse.status}): ${
        mediaData.error?.message || mediaResponse.statusText
      }`
    );
  }

  const creationId = mediaData.id;
  appendLog(
    logs,
    `Passo D (IG): Container criado (${creationId}). Aguardando 5s para processamento...`
  );

  await new Promise((resolve) => setTimeout(resolve, 5000));

  const publishResponse = await fetch(
    `${META_GRAPH_BASE_URL}/${igUserId}/media_publish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: accessToken,
      }),
    }
  );

  const publishData = (await publishResponse.json()) as {
    id?: string;
    error?: { message?: string; code?: number; fbtrace_id?: string };
  };

  if (!publishResponse.ok || !publishData.id) {
    throw new Error(
      `Meta IG /media_publish falhou (HTTP ${publishResponse.status}): ${
        publishData.error?.message || publishResponse.statusText
      }`
    );
  }

  appendLog(
    logs,
    `Passo D (IG): Publicado no Instagram com ID ${publishData.id}.`
  );
  return publishData.id;
}

async function publishCarouselToInstagram(
  imageUrls: string[],
  caption: string,
  logs: string[]
): Promise<string> {
  if (imageUrls.length < 2) {
    throw new Error("Um carrossel no Instagram exige ao menos 2 imagens.");
  }

  const igUserId = getRequiredEnv("IG_USER_ID");
  const accessToken = getRequiredEnv("META_ACCESS_TOKEN");

  appendLog(
    logs,
    `Passo D (IG Carrossel): Criando ${imageUrls.length} containers filhos...`
  );

  const childrenIds: string[] = [];
  for (let index = 0; index < imageUrls.length; index++) {
    const childResponse = await fetch(
      `${META_GRAPH_BASE_URL}/${igUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrls[index],
          is_carousel_item: true,
          access_token: accessToken,
        }),
      }
    );

    const childData = (await childResponse.json()) as {
      id?: string;
      error?: { message?: string };
    };

    if (!childResponse.ok || !childData.id) {
      throw new Error(
        `Meta IG carrossel item ${index + 1} falhou: ${
          childData.error?.message || childResponse.statusText
        }`
      );
    }
    childrenIds.push(childData.id);
  }

  appendLog(
    logs,
    `Passo D (IG Carrossel): Criando container pai CAROUSEL com ${childrenIds.length} itens...`
  );

  const carouselResponse = await fetch(
    `${META_GRAPH_BASE_URL}/${igUserId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "CAROUSEL",
        children: childrenIds,
        caption,
        access_token: accessToken,
      }),
    }
  );

  const carouselData = (await carouselResponse.json()) as {
    id?: string;
    error?: { message?: string };
  };

  if (!carouselResponse.ok || !carouselData.id) {
    throw new Error(
      `Meta IG container CAROUSEL falhou: ${
        carouselData.error?.message || carouselResponse.statusText
      }`
    );
  }

  appendLog(
    logs,
    `Passo D (IG Carrossel): Container pai ${carouselData.id} criado. Aguardando 5s...`
  );
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const publishResponse = await fetch(
    `${META_GRAPH_BASE_URL}/${igUserId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: carouselData.id,
        access_token: accessToken,
      }),
    }
  );

  const publishData = (await publishResponse.json()) as {
    id?: string;
    error?: { message?: string };
  };

  if (!publishResponse.ok || !publishData.id) {
    throw new Error(
      `Meta IG /media_publish carrossel falhou: ${
        publishData.error?.message || publishResponse.statusText
      }`
    );
  }

  appendLog(
    logs,
    `Passo D (IG Carrossel): Publicado no Instagram com ID ${publishData.id}.`
  );
  return publishData.id;
}

async function publishToFacebook(
  imageUrl: string,
  message: string,
  logs: string[]
): Promise<string> {
  const fbPageId = getRequiredEnv("FB_PAGE_ID");
  const accessToken = getRequiredEnv("META_ACCESS_TOKEN");

  appendLog(
    logs,
    "Passo D (FB): Obtendo Page Access Token da Página do Facebook..."
  );

  const pageTokenRes = await fetch(
    `${META_GRAPH_BASE_URL}/${fbPageId}?fields=access_token,name&access_token=${encodeURIComponent(
      accessToken
    )}`,
    { method: "GET" }
  );

  const pageTokenData = (await pageTokenRes.json()) as {
    id?: string;
    name?: string;
    access_token?: string;
    error?: { message?: string };
  };

  if (!pageTokenRes.ok || !pageTokenData.access_token) {
    throw new Error(
      `Não foi possível obter o Page Access Token da Página ${fbPageId}. Verifique se o META_ACCESS_TOKEN possui a permissão "pages_manage_posts" e acesso à Página no Graph API Explorer. Detalhe: ${
        pageTokenData.error?.message || pageTokenRes.statusText
      }`
    );
  }

  appendLog(
    logs,
    `Passo D (FB): Page Access Token obtido para "${
      pageTokenData.name || fbPageId
    }". Publicando foto...`
  );

  const fbResponse = await fetch(
    `${META_GRAPH_BASE_URL}/${fbPageId}/photos`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: imageUrl,
        message,
        access_token: pageTokenData.access_token,
      }),
    }
  );

  const fbData = (await fbResponse.json()) as {
    id?: string;
    post_id?: string;
    error?: { message?: string; code?: number; fbtrace_id?: string };
  };

  const facebookPostId = fbData.post_id || fbData.id;
  if (!fbResponse.ok || !facebookPostId) {
    throw new Error(
      `Meta FB /photos falhou (HTTP ${fbResponse.status}): ${
        fbData.error?.message || fbResponse.statusText
      }`
    );
  }

  appendLog(
    logs,
    `Passo D (FB): Publicado no Facebook com ID ${facebookPostId}.`
  );
  return facebookPostId;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret")?.trim();

  const isAuthorized =
    Boolean(cronSecret) &&
    (authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret);

  if (!isAuthorized) {
    return NextResponse.json(
      {
        error:
          "Não autorizado. Informe o CRON_SECRET válido no header Authorization ou no parâmetro ?secret=.",
      },
      { status: 401 }
    );
  }

  const logs: string[] = [];
  const mode =
    request.nextUrl.searchParams.get("tipo") === "carrossel"
      ? "carrossel"
      : "imagem";

  try {
    appendLog(logs, `Execução iniciada no modo "${mode}".`);

    // Passo A: Gerar conteúdo com Gemini
    const post = await generatePostWithGemini(logs);
    const fullCaption = `${post.legenda.trim()}\n\n${post.hashtags.trim()}`;

    if (mode === "carrossel") {
      appendLog(
        logs,
        "Passo B: Renderizando 3 slides PNG 1080x1080 para carrossel..."
      );
      const [slide1Buffer, slide2Buffer, slide3Buffer] = await Promise.all([
        renderPostImageBuffer(post, 1),
        renderPostImageBuffer(post, 2),
        renderPostImageBuffer(post, 3),
      ]);

      const slide1Url = await uploadImageToR2(slide1Buffer, logs, "slide-1");
      const slide2Url = await uploadImageToR2(slide2Buffer, logs, "slide-2");
      const slide3Url = await uploadImageToR2(slide3Buffer, logs, "slide-3");

      const instagramPostId = await publishCarouselToInstagram(
        [slide1Url, slide2Url, slide3Url],
        fullCaption,
        logs
      );
      const facebookPostId = await publishToFacebook(
        slide1Url,
        fullCaption,
        logs
      );

      return NextResponse.json(
        {
          success: true,
          mode,
          imageUrl: slide1Url,
          imageUrls: [slide1Url, slide2Url, slide3Url],
          instagramPostId,
          facebookPostId,
          generatedAt: new Date().toISOString(),
          post,
          logs,
        },
        { status: 200 }
      );
    }

    // Passo B: Renderizar imagem PNG 1080x1080 única com @vercel/og
    appendLog(
      logs,
      "Passo B: Renderizando arte publicitária 1080x1080 com @vercel/og..."
    );
    const imageBuffer = await renderPostImageBuffer(post);
    appendLog(
      logs,
      `Passo B concluído: Buffer PNG gerado (${imageBuffer.byteLength} bytes).`
    );

    // Passo C: Upload no Cloudflare R2
    const imageUrl = await uploadImageToR2(imageBuffer, logs);

    // Passo D: Publicar no Instagram e Facebook (Meta Graph API v21.0)
    const instagramPostId = await publishToInstagram(
      imageUrl,
      fullCaption,
      logs
    );
    const facebookPostId = await publishToFacebook(
      imageUrl,
      fullCaption,
      logs
    );

    return NextResponse.json(
      {
        success: true,
        mode,
        imageUrl,
        instagramPostId,
        facebookPostId,
        generatedAt: new Date().toISOString(),
        post,
        logs,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro interno ao gerar e publicar post.";
    appendLog(logs, `ERRO: ${message}`);

    return NextResponse.json({ error: message, logs }, { status: 500 });
  }
}

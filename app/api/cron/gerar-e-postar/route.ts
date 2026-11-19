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
  legenda: string;
  hashtags: string;
}

const META_GRAPH_BASE_URL = "https://graph.facebook.com/v21.0";

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
2. Varie o ângulo criativo a cada geração (ex: fuga de taxas de aplicativos, fechamento no PIX com baixa automática, atendimento 24h com IA no WhatsApp onde o dono assume quando quiser, contrato digital em PDF automático).
3. tema_visual: Frase curta (2 a 5 palavras) resumindo o tema visual/ângulo principal da arte (ex: "Zero Taxas por Reserva", "PIX com Baixa Automática", "Atendimento IA no WhatsApp").
4. headline_arte: Máximo de 7 palavras. Direta, impactante e legível em arte 1080x1080.
5. subtitulo_arte: Curto (até 12 palavras), incluindo obrigatoriamente "12x de R$149,90".
6. legenda: Copy persuasiva em português do Brasil, parágrafos curtos com emojis estratégicos, destacando os benefícios e finalizando com CTA claro convidando a comentar "EU QUERO".
7. hashtags: Lista de hashtags relevantes separadas por espaço.`;

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
                  "Tema visual/ângulo criativo curto do post (2 a 5 palavras).",
              },
              headline_arte: {
                type: Type.STRING,
                description:
                  "Título impactante para a arte com no máximo 7 palavras.",
              },
              subtitulo_arte: {
                type: Type.STRING,
                description:
                  "Subtítulo curto para a arte incluindo obrigatoriamente 12x de R$149,90.",
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

async function renderPostImageBuffer(
  post: GeneratedPost,
  slideLabel?: string
): Promise<Buffer> {
  const features = [
    "Simulador em Tempo Real",
    "Calendário Online",
    "PIX Baixa Automática",
    "Contrato Digital PDF",
    "IA no WhatsApp (Assuma Quando Quiser)",
  ];

  const h = React.createElement;

  const element = h(
    "div",
    {
      style: {
        width: "1080px",
        height: "1080px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#FAF5EE",
        padding: "54px",
        fontFamily: "sans-serif",
        color: "#2C1E16",
        position: "relative",
      },
    },
    // Barra superior com tema visual e selo de preço
    h(
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
              alignItems: "center",
              backgroundColor: "#C85A32",
              color: "#FAF5EE",
              padding: "10px 22px",
              borderRadius: "999px",
              fontSize: "19px",
              fontWeight: 700,
              letterSpacing: "0.04em",
            },
          },
          slideLabel
            ? `${post.tema_visual.toUpperCase()} • ${slideLabel}`
            : post.tema_visual.toUpperCase()
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: "17px",
              fontWeight: 700,
              color: "#2C1E16",
              opacity: 0.78,
              paddingLeft: "6px",
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
            padding: "14px 28px",
            borderRadius: "18px",
            boxShadow: "0 8px 20px rgba(30, 126, 83, 0.25)",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: "28px",
              fontWeight: 900,
            },
          },
          "12x de R$149,90"
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: "15px",
              fontWeight: 700,
              opacity: 0.9,
              marginTop: "2px",
            },
          },
          "SEM TAXAS POR RESERVA"
        )
      )
    ),
    // Cartão central
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#FFFFFF",
          borderRadius: "36px",
          border: "3px solid rgba(44, 30, 22, 0.12)",
          padding: "50px",
          boxShadow: "0 20px 50px rgba(44, 30, 22, 0.08)",
        },
      },
      h("div", {
        style: {
          display: "flex",
          width: "96px",
          height: "10px",
          backgroundColor: "#C85A32",
          borderRadius: "999px",
          marginBottom: "26px",
        },
      }),
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "62px",
            fontWeight: 900,
            lineHeight: 1.08,
            color: "#2C1E16",
            letterSpacing: "-0.02em",
            marginBottom: "24px",
          },
        },
        post.headline_arte
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "29px",
            fontWeight: 700,
            lineHeight: 1.35,
            color: "#C85A32",
            marginBottom: "30px",
          },
        },
        post.subtitulo_arte
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            gap: "10px",
          },
        },
        ...features.map((item) =>
          h(
            "div",
            {
              key: item,
              style: {
                display: "flex",
                alignItems: "center",
                backgroundColor: "#FAF5EE",
                border: "2px solid rgba(30, 126, 83, 0.35)",
                color: "#2C1E16",
                padding: "9px 16px",
                borderRadius: "12px",
                fontSize: "19px",
                fontWeight: 700,
              },
            },
            `✓ ${item}`
          )
        )
      )
    ),
    // Rodapé com assinatura Meu Gestor Digital
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#2C1E16",
          color: "#FAF5EE",
          padding: "26px 34px",
          borderRadius: "24px",
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
              fontSize: "28px",
              fontWeight: 800,
              letterSpacing: "0.02em",
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
              fontSize: "18px",
              color: "#FAF5EE",
              opacity: 0.85,
              marginTop: "4px",
            },
          },
          "Site completo para locações e eventos"
        )
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            backgroundColor: "#C85A32",
            color: "#FAF5EE",
            padding: "14px 24px",
            borderRadius: "14px",
            fontSize: "21px",
            fontWeight: 800,
          },
        },
        'COMENTE "EU QUERO"'
      )
    )
  );

  const imageResponse = new ImageResponse(element, {
    width: 1080,
    height: 1080,
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

  appendLog(logs, "Passo D (FB): Publicando foto na Página do Facebook...");
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
        access_token: accessToken,
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

    // Passo A: Gerar conteúdo com Gemini 2.5 Flash
    const post = await generatePostWithGemini(logs);
    const fullCaption = `${post.legenda.trim()}\n\n${post.hashtags.trim()}`;

    if (mode === "carrossel") {
      appendLog(
        logs,
        "Passo B: Renderizando 2 slides PNG 1080x1080 para carrossel..."
      );
      const slide1Buffer = await renderPostImageBuffer(post, "1/2");
      const slide2Buffer = await renderPostImageBuffer(
        {
          ...post,
          headline_arte: "Site Completo por 12x de R$149,90",
          subtitulo_arte:
            "Simulador, Calendário, PIX Automático, Contrato PDF e IA no WhatsApp",
        },
        "2/2"
      );

      const slide1Url = await uploadImageToR2(slide1Buffer, logs, "slide-1");
      const slide2Url = await uploadImageToR2(slide2Buffer, logs, "slide-2");

      const instagramPostId = await publishCarouselToInstagram(
        [slide1Url, slide2Url],
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
          imageUrls: [slide1Url, slide2Url],
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
    appendLog(logs, "Passo B: Renderizando arte PNG 1080x1080 com @vercel/og...");
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

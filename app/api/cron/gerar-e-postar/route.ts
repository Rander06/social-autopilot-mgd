import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ImageResponse } from "@vercel/og";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface GeneratedPost {
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

async function generatePostWithGemini(): Promise<GeneratedPost> {
  const apiKey = getRequiredEnv("GEMINI_API_KEY");
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Você é o estrategista de marketing e copywriter sênior da agência "Meu Gestor Digital".
Crie um post inédito, persuasivo e focado em conversão para Instagram e Facebook vendendo sites completos para donos de chácaras, ranchos, casas de temporada e salões de festas.

DADOS OBRIGATÓRIOS DA OFERTA:
- Preço: 12x de R$149,90
- Zero taxas ou comissões por reserva (100% do lucro fica com o proprietário)
- Recursos incluídos no site:
  1. Simulador de orçamento instantâneo
  2. Calendário online de disponibilidade em tempo real
  3. Pagamento via PIX automático
  4. Geração automática de contrato em PDF
  5. Atendimento automatizado por Inteligência Artificial no WhatsApp

REGRAS ESTRITAS:
1. NUNCA cite nomes de clientes, pessoas ou nomes específicos de propriedades/empresas terceiras.
2. Varie o ângulo da abordagem a cada geração (ex: fuga de comissões de plataformas, fechamento automático de reservas no PIX, atendimento 24h por IA no WhatsApp, profissionalismo e fim de curiosos que não fecham).
3. headline_arte: Máximo de 7 palavras. Direta, impactante, fácil de ler em uma arte 1080x1080.
4. subtitulo_arte: Curto (idealmente até 12 palavras), incluindo obrigatoriamente "12x de R$149,90".
5. legenda: Copy persuasiva em português do Brasil, bem formatada em parágrafos curtos com emojis estratégicos, destacando a dor do proprietário e os diferenciais do site, finalizando com um CTA forte convidando o leitor a comentar "EU QUERO".
6. hashtags: Lista de hashtags relevantes separadas por espaço (ex: #Chacara #Rancho #CasaDeTemporada #SalaoDeFestas #MeuGestorDigital).`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
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
        required: ["headline_arte", "subtitulo_arte", "legenda", "hashtags"],
      },
      temperature: 0.9,
    },
  });

  const rawText = response.text;
  if (!rawText) {
    throw new Error("O Gemini retornou uma resposta vazia.");
  }

  const parsed = JSON.parse(rawText) as GeneratedPost;
  if (
    !parsed.headline_arte ||
    !parsed.subtitulo_arte ||
    !parsed.legenda ||
    !parsed.hashtags
  ) {
    throw new Error("Resposta JSON do Gemini incompleta.");
  }

  return parsed;
}

async function renderPostImageBuffer(post: GeneratedPost): Promise<Buffer> {
  const features = [
    "Simulador de Orçamento",
    "Calendário Online",
    "PIX Automático",
    "Contrato em PDF",
    "IA no WhatsApp",
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
        padding: "56px",
        fontFamily: "sans-serif",
        color: "#2C1E16",
        position: "relative",
      },
    },
    // Barra decorativa superior
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
            alignItems: "center",
            backgroundColor: "#C85A32",
            color: "#FAF5EE",
            padding: "12px 24px",
            borderRadius: "999px",
            fontSize: "20px",
            fontWeight: 700,
            letterSpacing: "0.04em",
          },
        },
        "CHÁCARAS • RANCHOS • TEMPORADA • SALÕES"
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            backgroundColor: "#1E7E53",
            color: "#FAF5EE",
            padding: "14px 28px",
            borderRadius: "18px",
            fontSize: "26px",
            fontWeight: 800,
            boxShadow: "0 8px 20px rgba(30, 126, 83, 0.25)",
          },
        },
        "12x de R$149,90"
      )
    ),
    // Cartão central de destaque
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
          padding: "54px",
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
          marginBottom: "28px",
        },
      }),
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "64px",
            fontWeight: 900,
            lineHeight: 1.08,
            color: "#2C1E16",
            letterSpacing: "-0.02em",
            marginBottom: "28px",
          },
        },
        post.headline_arte
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "30px",
            fontWeight: 600,
            lineHeight: 1.35,
            color: "#C85A32",
            marginBottom: "34px",
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
            gap: "12px",
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
                padding: "10px 18px",
                borderRadius: "14px",
                fontSize: "20px",
                fontWeight: 700,
              },
            },
            `✓ ${item}`
          )
        )
      )
    ),
    // Rodapé / Assinatura
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
          padding: "28px 36px",
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
          "Site completo sem taxas por reserva"
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
            padding: "14px 26px",
            borderRadius: "14px",
            fontSize: "22px",
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

async function uploadImageToR2(imageBuffer: Buffer): Promise<string> {
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

  const fileName = `posts/${Date.now()}.png`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Body: imageBuffer,
      ContentType: "image/png",
    })
  );

  return `${publicUrl}/${fileName}`;
}

async function publishToInstagram(
  imageUrl: string,
  caption: string
): Promise<string> {
  const igUserId = getRequiredEnv("IG_USER_ID");
  const accessToken = getRequiredEnv("META_ACCESS_TOKEN");

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
    error?: { message?: string };
  };

  if (!mediaResponse.ok || !mediaData.id) {
    throw new Error(
      `Erro ao criar container de mídia no Instagram: ${
        mediaData.error?.message || mediaResponse.statusText
      }`
    );
  }

  const creationId = mediaData.id;

  // Aguarda 5 segundos para processamento da mídia pela Meta antes da publicação
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
    error?: { message?: string };
  };

  if (!publishResponse.ok || !publishData.id) {
    throw new Error(
      `Erro ao publicar mídia no Instagram: ${
        publishData.error?.message || publishResponse.statusText
      }`
    );
  }

  return publishData.id;
}

async function publishToFacebook(
  imageUrl: string,
  message: string
): Promise<string> {
  const fbPageId = getRequiredEnv("FB_PAGE_ID");
  const accessToken = getRequiredEnv("META_ACCESS_TOKEN");

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
    error?: { message?: string };
  };

  const facebookPostId = fbData.post_id || fbData.id;
  if (!fbResponse.ok || !facebookPostId) {
    throw new Error(
      `Erro ao publicar foto na Página do Facebook: ${
        fbData.error?.message || fbResponse.statusText
      }`
    );
  }

  return facebookPostId;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    // Passo A: Gerar conteúdo com Gemini 2.5 Flash
    const post = await generatePostWithGemini();

    // Passo B: Renderizar imagem PNG 1080x1080 com @vercel/og e converter para Buffer
    const imageBuffer = await renderPostImageBuffer(post);

    // Passo C: Upload no Cloudflare R2
    const imageUrl = await uploadImageToR2(imageBuffer);

    // Montar legenda final com hashtags
    const fullCaption = `${post.legenda.trim()}\n\n${post.hashtags.trim()}`;

    // Passo D: Publicar no Instagram e Facebook (Meta Graph API v21.0)
    const instagramPostId = await publishToInstagram(imageUrl, fullCaption);
    const facebookPostId = await publishToFacebook(imageUrl, fullCaption);

    return NextResponse.json(
      {
        success: true,
        imageUrl,
        instagramPostId,
        facebookPostId,
        generatedAt: new Date().toISOString(),
        post,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro interno ao gerar e publicar post.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

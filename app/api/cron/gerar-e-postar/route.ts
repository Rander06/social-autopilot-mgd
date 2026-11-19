import { NextRequest, NextResponse } from "next/server";
import {
  enhanceProductPhotoWithAI,
  generateContentWithMultiAI,
  publishToMetaChannels,
  publishToTikTok,
  uploadBufferToR2,
} from "@/lib/ai-engine";
import { renderArtSlidesBuffers } from "@/lib/art-renderer";
import { getSessionFromRequest } from "@/lib/crypto";
import {
  appendAuditLog,
  checkCompanyQuotaAndStatus,
  findDueScheduledTopics,
  getBrandSettings,
  getCompanySecrets,
  getLastTopicHeadlines,
  listTopicsByCompany,
  markTopicPhotoUsed,
  pickNextTopicForCompany,
  pickNextTopicPhoto,
  recordGeneratedPost,
} from "@/lib/store";
import {
  AIPhotoMode,
  AspectRatio,
  GeneratedContentPayload,
  PostFormat,
  Topic,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getSaoPauloSlotAndDow(): { slot: string; dow: number } {
  const now = new Date();
  const brStr = now.toLocaleString("en-US", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const parts = brStr.split(", ");
  const dow = dowMap[parts[0]] ?? now.getUTCDay();
  const [hhStr, mmStr] = (parts[1] || "10:00").split(":");
  const mm = Number(mmStr) >= 30 ? "30" : "00";
  return { slot: `${hhStr.padStart(2, "0")}:${mm}`, dow };
}

async function runPostPipeline(params: {
  companyId: string;
  topic?: Topic | null;
  customTitle?: string;
  customPrompt?: string;
  offerPrice?: string | null;
  benefits?: string[];
  format?: PostFormat;
  slidesCount?: number;
  aspectRatio?: AspectRatio;
  aiPhotoMode?: AIPhotoMode;
  aiPhotoPrompt?: string | null;
  manualPhotoUrl?: string | null;
  manualPhotoBase64?: string | null;
  manualPhotoContentType?: string | null;
  editedContent?: GeneratedContentPayload | null;
  previewOnly?: boolean;
  forcePublish?: boolean;
  userId?: string | null;
}) {
  const logs: string[] = [];
  const log = (m: string) => logs.push(`[${new Date().toISOString()}] ${m}`);

  const quota = await checkCompanyQuotaAndStatus(params.companyId);
  if (!quota.allowed) {
    throw new Error(quota.reason || "Empresa bloqueada ou cota atingida.");
  }

  const brand = await getBrandSettings(params.companyId);
  const secrets = await getCompanySecrets(params.companyId);

  const topic = params.topic || null;
  const format: PostFormat =
    params.format || topic?.post_format || "SINGLE";
  const slidesCount =
    format === "CAROUSEL"
      ? Math.min(8, Math.max(2, params.slidesCount || topic?.slides_count || 3))
      : 1;
  const aspectRatio: AspectRatio =
    params.aspectRatio || topic?.aspect_ratio || "1:1";

  if (format === "CAROUSEL" && !quota.plan.allow_carousel) {
    throw new Error(
      `O plano "${quota.plan.name}" não habilita Carrosséis. Faça upgrade no Super Admin.`
    );
  }

  const topicTitle =
    params.customTitle?.trim() || topic?.title || "Campanha Especial";
  const promptInstructions =
    params.customPrompt?.trim() ||
    topic?.prompt_instructions ||
    "Crie um post altamente persuasivo destacando nossos diferenciais.";
  const offerPrice =
    params.offerPrice !== undefined
      ? params.offerPrice
      : topic?.offer_price || null;
  const benefits =
    params.benefits && params.benefits.length > 0
      ? params.benefits
      : topic?.benefits_json || [];
  const aiPhotoMode: AIPhotoMode =
    params.aiPhotoMode || topic?.ai_photo_mode || "NONE";
  const aiPhotoPrompt =
    params.aiPhotoPrompt !== undefined
      ? params.aiPhotoPrompt
      : topic?.ai_photo_prompt || null;

  log(
    `Iniciando pipeline para "${quota.company.name}" | Assunto: "${topicTitle}" | ${format} (${slidesCount}x ${aspectRatio})`
  );

  // 1. Resolver Foto Original do Produto (Manual ou Fila sem Repetição)
  let originalPhotoUrl = params.manualPhotoUrl?.trim() || null;
  let queuedPhoto = null as Awaited<ReturnType<typeof pickNextTopicPhoto>>;

  if (!originalPhotoUrl && params.manualPhotoBase64) {
    const cleanB64 = params.manualPhotoBase64.replace(
      /^data:[^;]+;base64,/,
      ""
    );
    const mime = params.manualPhotoContentType || "image/jpeg";
    const ext = mime.includes("png") ? "png" : "jpg";
    originalPhotoUrl = await uploadBufferToR2(
      Buffer.from(cleanB64, "base64"),
      `companies/${params.companyId}/originals/${Date.now()}.${ext}`,
      mime
    );
    log(`Foto original enviada ao R2: ${originalPhotoUrl}`);
  } else if (!originalPhotoUrl && topic) {
    queuedPhoto = await pickNextTopicPhoto(params.companyId, topic.id);
    if (queuedPhoto) {
      originalPhotoUrl = queuedPhoto.original_url;
      log(
        `Fila de fotos sem repetição selecionou foto ${queuedPhoto.id} (usada ${queuedPhoto.times_used}x).`
      );
    }
  }

  // 2. Ambientação / Melhoria de Foto com IA (se configurado e plano permitir)
  let enhancedPhotoUrl: string | null =
    params.editedContent?.enhanced_photo_url || null;

  if (
    !enhancedPhotoUrl &&
    originalPhotoUrl &&
    aiPhotoMode === "ENHANCE" &&
    quota.plan.allow_ai_photo
  ) {
    enhancedPhotoUrl = await enhanceProductPhotoWithAI({
      companyId: params.companyId,
      originalPhotoUrl,
      aiPhotoMode,
      aiPhotoPrompt,
      preferredImageAI: secrets.preferred_image_ai,
      keys: {
        gemini: secrets.gemini_api_key,
        openai: secrets.openai_api_key,
      },
      logs,
    });
  }

  if (queuedPhoto && !params.previewOnly) {
    await markTopicPhotoUsed(queuedPhoto, enhancedPhotoUrl, aiPhotoPrompt);
  }

  const photoToRender = enhancedPhotoUrl || originalPhotoUrl;

  // 3. Gerar Copy com Multi-IA + Memória Anti-Repetição (ou usar texto editado do preview)
  let content: GeneratedContentPayload;
  let providerUsed = "MANUAL_EDIT";

  if (params.editedContent) {
    content = params.editedContent;
    log("Usando conteúdo editado manualmente pelo usuário no Estúdio.");
  } else {
    const previousHeadlines = await getLastTopicHeadlines(
      params.companyId,
      topic?.id,
      10
    );
    if (previousHeadlines.length > 0) {
      log(
        `Memória anti-repetição carregou ${previousHeadlines.length} títulos anteriores.`
      );
    }

    const aiRes = await generateContentWithMultiAI({
      companyName: quota.company.name,
      topicTitle,
      promptInstructions,
      offerPrice,
      benefits,
      format,
      slidesCount,
      ctaDefault: brand.cta_default,
      previousHeadlines,
      preferredProvider: secrets.preferred_text_ai,
      keys: {
        gemini: secrets.gemini_api_key,
        openai: secrets.openai_api_key,
        anthropic: secrets.anthropic_api_key,
      },
      logs,
    });
    content = aiRes.content;
    providerUsed = aiRes.providerUsed;
  }

  content.original_photo_url = originalPhotoUrl;
  content.enhanced_photo_url = enhancedPhotoUrl;

  // 4. Renderizar Artes PNG via @vercel/og e Subir no Cloudflare R2
  log(`Renderizando ${slidesCount} arte(s) PNG em ${aspectRatio}...`);
  const buffers = await renderArtSlidesBuffers({
    brand,
    content,
    format,
    slidesCount,
    aspectRatio,
    offerPrice,
    productPhotoUrl: photoToRender,
  });

  const imageUrls: string[] = [];
  const stamp = Date.now();
  for (let i = 0; i < buffers.length; i++) {
    const key = `companies/${params.companyId}/posts/${stamp}-slide-${i + 1}.png`;
    const url = await uploadBufferToR2(buffers[i], key, "image/png");
    imageUrls.push(url);
  }
  log(`Upload no R2 concluído (${imageUrls.length} imagem(ns)).`);

  if (params.previewOnly) {
    return {
      previewOnly: true,
      companyId: params.companyId,
      topicId: topic?.id || null,
      topicTitle,
      providerUsed,
      format,
      aspectRatio,
      slidesCount: imageUrls.length,
      imageUrl: imageUrls[0],
      imageUrls,
      post: content,
      logs,
    };
  }

  const approvalMode =
    !params.forcePublish && topic?.approval_mode === "DRAFT"
      ? "DRAFT"
      : "AUTO";

  if (approvalMode === "DRAFT") {
    log(
      "Assunto configurado como Aprovação Manual: salvo como rascunho no Dashboard."
    );
    const savedDraft = await recordGeneratedPost({
      company_id: params.companyId,
      topic_id: topic?.id || null,
      topic_title: topicTitle,
      ai_provider_used: providerUsed,
      format,
      aspect_ratio: aspectRatio,
      slides_count: imageUrls.length,
      headline: content.headline_arte,
      content_json: content,
      image_urls_json: imageUrls,
      ig_post_id: null,
      fb_post_id: null,
      tiktok_post_id: null,
      status: "PENDING_APPROVAL",
      logs_json: logs,
    });

    await appendAuditLog({
      company_id: params.companyId,
      user_id: params.userId,
      action: "POST_DRAFT_CREATED",
      details_json: { post_id: savedDraft.id, headline: content.headline_arte },
    });

    return {
      success: true,
      status: "PENDING_APPROVAL",
      postRecord: savedDraft,
      imageUrl: imageUrls[0],
      imageUrls,
      post: content,
      logs,
    };
  }

  // 5. Publicar na Meta Graph API v21.0 + TikTok (se ativado)
  const fullCaption = `${content.legenda.trim()}\n\n${content.hashtags.trim()}`;
  const { instagramPostId, facebookPostId } = await publishToMetaChannels({
    igUserId: secrets.ig_user_id,
    fbPageId: secrets.fb_page_id,
    metaAccessToken: secrets.meta_access_token,
    imageUrls,
    caption: fullCaption,
    logs,
  });

  const tiktokPostId = await publishToTikTok({
    tiktokAccessToken: secrets.tiktok_access_token,
    enabled: secrets.tiktok_enabled,
    imageUrls,
    caption: fullCaption,
    logs,
  });

  const savedPost = await recordGeneratedPost({
    company_id: params.companyId,
    topic_id: topic?.id || null,
    topic_title: topicTitle,
    ai_provider_used: providerUsed,
    format,
    aspect_ratio: aspectRatio,
    slides_count: imageUrls.length,
    headline: content.headline_arte,
    content_json: content,
    image_urls_json: imageUrls,
    ig_post_id: instagramPostId,
    fb_post_id: facebookPostId,
    tiktok_post_id: tiktokPostId,
    status: "PUBLISHED",
    logs_json: logs,
  });

  await appendAuditLog({
    company_id: params.companyId,
    user_id: params.userId,
    action: "POST_PUBLISHED",
    details_json: {
      post_id: savedPost.id,
      providerUsed,
      instagramPostId,
      facebookPostId,
      tiktokPostId,
    },
  });

  return {
    success: true,
    status: "PUBLISHED",
    mode: format === "CAROUSEL" ? "carrossel" : "imagem",
    imageUrl: imageUrls[0],
    imageUrls,
    instagramPostId,
    facebookPostId,
    tiktokPostId,
    generatedAt: savedPost.created_at,
    post: content,
    postRecord: savedPost,
    logs,
  };
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret")?.trim();
  const session = getSessionFromRequest(request);

  const isAuthorized =
    Boolean(session) ||
    (Boolean(cronSecret) &&
      (authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret));

  if (!isAuthorized) {
    return NextResponse.json(
      {
        error:
          "Não autorizado. Informe o CRON_SECRET válido no header Authorization ou faça login no painel.",
      },
      { status: 401 }
    );
  }

  try {
    const source = request.nextUrl.searchParams.get("source");
    const slotParam = request.nextUrl.searchParams.get("slot");

    // Execução via agendador Supabase pg_cron (por dia e horário exatos)
    if (source === "supabase_cron") {
      const currentBr = getSaoPauloSlotAndDow();
      const targetSlot = slotParam || currentBr.slot;
      const dueList = await findDueScheduledTopics(targetSlot, currentBr.dow);
      const results = [];

      for (const item of dueList) {
        try {
          const r = await runPostPipeline({
            companyId: item.company.id,
            topic: item.topic,
          });
          results.push({ company: item.company.name, topic: item.topic.title, ok: true, result: r });
        } catch (err) {
          results.push({
            company: item.company.name,
            topic: item.topic.title,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return NextResponse.json({
        success: true,
        source: "supabase_cron",
        slot: targetSlot,
        dow: currentBr.dow,
        processed: results.length,
        results,
      });
    }

    // Execução via Vercel Cron ou chamada direta GET
    const companyId =
      request.nextUrl.searchParams.get("companyId")?.trim() ||
      session?.companyId ||
      "comp-mgd";
    const topicId = request.nextUrl.searchParams.get("topicId")?.trim();
    const tipoParam = request.nextUrl.searchParams.get("tipo");

    const topics = await listTopicsByCompany(companyId);
    const topic = topicId
      ? topics.find((t) => t.id === topicId) || null
      : await pickNextTopicForCompany(companyId);

    const result = await runPostPipeline({
      companyId,
      topic,
      format:
        tipoParam === "carrossel"
          ? "CAROUSEL"
          : tipoParam === "imagem"
          ? "SINGLE"
          : undefined,
      forcePublish: true,
      userId: session?.userId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro interno ao gerar e publicar post.";
    return NextResponse.json(
      { error: message, logs: [message] },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");

  const isAuthorized =
    Boolean(session) ||
    (Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`);

  if (!isAuthorized) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const requestedCompanyId =
      typeof body.companyId === "string" ? body.companyId.trim() : "";
    const companyId =
      session?.role === "SUPER_ADMIN" && requestedCompanyId
        ? requestedCompanyId
        : session?.companyId || requestedCompanyId || "comp-mgd";

    const topicId =
      typeof body.topicId === "string" ? body.topicId.trim() : "";
    const topics = await listTopicsByCompany(companyId);
    const topic = topicId ? topics.find((t) => t.id === topicId) || null : null;

    const result = await runPostPipeline({
      companyId,
      topic,
      customTitle:
        typeof body.customTitle === "string" ? body.customTitle : undefined,
      customPrompt:
        typeof body.customPrompt === "string" ? body.customPrompt : undefined,
      offerPrice:
        typeof body.offerPrice === "string" ? body.offerPrice : undefined,
      benefits: Array.isArray(body.benefits)
        ? (body.benefits as string[])
        : undefined,
      format:
        body.format === "CAROUSEL" || body.format === "SINGLE"
          ? body.format
          : undefined,
      slidesCount:
        typeof body.slidesCount === "number" ? body.slidesCount : undefined,
      aspectRatio:
        body.aspectRatio === "1:1" ||
        body.aspectRatio === "4:5" ||
        body.aspectRatio === "9:16"
          ? body.aspectRatio
          : undefined,
      aiPhotoMode:
        body.aiPhotoMode === "ENHANCE" ||
        body.aiPhotoMode === "ORIGINAL_FRAME" ||
        body.aiPhotoMode === "NONE"
          ? body.aiPhotoMode
          : undefined,
      aiPhotoPrompt:
        typeof body.aiPhotoPrompt === "string"
          ? body.aiPhotoPrompt
          : undefined,
      manualPhotoUrl:
        typeof body.manualPhotoUrl === "string"
          ? body.manualPhotoUrl
          : undefined,
      manualPhotoBase64:
        typeof body.manualPhotoBase64 === "string"
          ? body.manualPhotoBase64
          : undefined,
      manualPhotoContentType:
        typeof body.manualPhotoContentType === "string"
          ? body.manualPhotoContentType
          : undefined,
      editedContent:
        body.editedContent && typeof body.editedContent === "object"
          ? (body.editedContent as GeneratedContentPayload)
          : null,
      previewOnly: Boolean(body.previewOnly),
      forcePublish: true,
      userId: session?.userId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro ao processar criação/publicação do post.";
    return NextResponse.json(
      { error: message, logs: [message] },
      { status: 500 }
    );
  }
}

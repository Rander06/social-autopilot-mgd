import { NextRequest, NextResponse } from "next/server";
import {
  AICreditError,
  buildVertical916FromFeedUrl,
  cleanCreativePrompt,
  enhanceProductPhotoWithAI,
  generateContentWithMultiAI,
  generateFullCreativeWithAI,
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
  normalizePublishTargets,
  pickNextTopicForCompany,
  pickNextTopicPhoto,
  recordGeneratedPost,
  refreshTikTokTokenIfNeeded,
  updatePostRecord,
} from "@/lib/store";
import {
  AIPhotoMode,
  AspectRatio,
  GeneratedContentPayload,
  PostFormat,
  PublishTargets,
  Topic,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getSaoPauloSlotAndDow(now = new Date()): { slot: string; dow: number } {
  // Adiciona 5 minutos para tolerar pequenos adiantamentos do pg_cron (ex.: 11:59:58)
  const adjusted = new Date(now.getTime() + 5 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(adjusted);

  const partMap: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") partMap[p.type] = p.value;
  }

  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const dow = dowMap[partMap.weekday || ""] ?? adjusted.getUTCDay();
  const hh = (partMap.hour || "10").padStart(2, "0");
  const mm = Number(partMap.minute || "0") >= 30 ? "30" : "00";
  return { slot: `${hh}:${mm}`, dow };
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
  preferredImageAI?: "GEMINI" | "OPENAI" | "OPENAI_MINI" | null;
  allowImageFallback?: boolean;
  publishToStories?: boolean;
  publishTargets?: Partial<PublishTargets> | null;
  manualPhotoUrl?: string | null;
  manualPhotoBase64?: string | null;
  manualPhotoContentType?: string | null;
  editedContent?: GeneratedContentPayload | null;
  existingImageUrls?: string[] | null;
  existingStoryImageUrls?: string[] | null;
  previewOnly?: boolean;
  saveAsDraft?: boolean;
  forcePublish?: boolean;
  draftPostId?: string | null;
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
  const publishTargets = normalizePublishTargets(
    params.publishTargets || topic?.publish_targets,
    params.publishToStories ?? topic?.publish_to_stories
  );
  const needsFeed = publishTargets.ig_feed || publishTargets.fb_feed;
  const needsVertical =
    publishTargets.ig_stories ||
    publishTargets.fb_stories ||
    publishTargets.tiktok_feed;
  const aspectRatio: AspectRatio =
    !needsFeed && needsVertical ? "9:16" : "1:1";

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
  const effectiveImageAI =
    params.preferredImageAI ||
    topic?.preferred_image_ai ||
    secrets.preferred_image_ai;

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
      mime,
      secrets.r2_config
    );
    log(`Foto original enviada ao R2: ${originalPhotoUrl}`);
  } else if (!originalPhotoUrl && params.editedContent?.original_photo_url) {
    originalPhotoUrl = params.editedContent.original_photo_url.trim();
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
      preferredImageAI: effectiveImageAI,
      keys: {
        gemini: secrets.gemini_api_key,
        openai: secrets.openai_api_key,
      },
      r2Config: secrets.r2_config,
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
  let previousHeadlines: string[] = [];

  if (params.editedContent) {
    content = params.editedContent;
    log("Usando conteúdo editado manualmente pelo usuário no Estúdio.");
  } else {
    previousHeadlines = await getLastTopicHeadlines(
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

  const cleanedPhotoPrompt = cleanCreativePrompt(aiPhotoPrompt);
  const cleanedMainPrompt = cleanCreativePrompt(promptInstructions);
  const hasVisualDirectives = (text: string) =>
    /#[0-9a-f]{6}|fundo\s+|t[íi]tulo\s*:|terracota|creme|mockup|notebook|financeiro|whatsapp|etiqueta|p[íi]lula/i.test(
      text
    );
  const cleanedVisualPrompt = hasVisualDirectives(cleanedMainPrompt) && !hasVisualDirectives(cleanedPhotoPrompt)
    ? cleanedMainPrompt
    : cleanedPhotoPrompt || cleanedMainPrompt;

  if (!params.editedContent) {
    const explicitTitleMatch = cleanedVisualPrompt.match(
      /(?:t[íi]tulo|headline)[^:"\n]{0,60}:\s*["“]([^"”]+)["”]/i
    );
    if (explicitTitleMatch?.[1]?.trim()) {
      content.headline_arte = explicitTitleMatch[1].trim();
    }
  }

  content.original_photo_url = originalPhotoUrl;
  content.enhanced_photo_url = enhancedPhotoUrl;

  // 4. Renderizar Artes PNG via @vercel/og (ou Criativo IA / Arte Pronta) e Subir no Cloudflare R2
  const imageUrls: string[] = [];

  if (
    !params.previewOnly &&
    params.existingImageUrls &&
    params.existingImageUrls.length > 0
  ) {
    log(
      `Reutilizando ${params.existingImageUrls.length} arte(s) já gerada(s) na prévia (sem gerar nova imagem).`
    );
    imageUrls.push(...params.existingImageUrls);
  } else if (aiPhotoMode === "RAW_ART" && photoToRender) {
    log("Modo Arte Pronta: usando imagem enviada diretamente sem sobrepor textos.");
    for (let i = 0; i < slidesCount; i++) {
      imageUrls.push(photoToRender);
    }
  } else if (aiPhotoMode === "AI_FULL_CREATIVE") {
    const basePrompt =
      cleanedVisualPrompt || `${content.headline_arte} - ${promptInstructions}`;
    const shouldAllowFallback =
      Boolean(params.allowImageFallback) ||
      (!params.forcePublish && Boolean(secrets.allow_image_ai_fallback));

    const CREATIVE_LAYOUT_DIRECTIONS = [
      {
        id: "FULL_WIDTH_BANDS",
        description:
          "Layout publicitário com fotografia luminosa panorâmica no topo e faixas horizontais largas de ponta a ponta abaixo, com ícones nítidos à esquerda de cada faixa (1 linha por diferencial para escrita perfeita e fonte uniforme).",
      },
      {
        id: "EDITORIAL_SPLIT",
        description:
          "Layout editorial limpo em 2 colunas: coluna esquerda sólida/degradê com título, lista vertical espaçada em faixas largas e CTA à direita; metade direita com fotografia luminosa real do ambiente.",
      },
      {
        id: "DARK_ELEGANT_POSTER",
        description:
          "Layout noturno sofisticado com fotografia aconchegante ao entardecer, degradê escuro de alto contraste e faixas horizontais bem espaçadas com tipografia limpa em branco e dourado.",
      },
      {
        id: "CLEAN_HERO_CARD",
        description:
          "Layout de agência com foto luminosa ocupando a parte superior e um cartão amplo e limpo na metade inferior exibindo os tópicos em linhas largas bem espaçadas e botão CTA.",
      },
    ];

    const layoutIndex =
      (previousHeadlines.length +
        Math.floor(Math.random() * CREATIVE_LAYOUT_DIRECTIONS.length)) %
      CREATIVE_LAYOUT_DIRECTIONS.length;
    const chosenLayout = CREATIVE_LAYOUT_DIRECTIONS[layoutIndex];
    log(`Direção de arte selecionada: ${chosenLayout.id}`);

    const userHasCustomLayout = hasVisualDirectives(cleanedVisualPrompt);
    const layoutDirectiveBlock = userHasCustomLayout
      ? `Estilo visual: respeite as instruções do briefing mantendo composição limpa (${chosenLayout.id}).`
      : `Estilo visual (${chosenLayout.id}): ${chosenLayout.description}`;

    let aiResults: Array<string | null> = [];
    try {
      if (slidesCount === 1) {
        const singleStructuredPrompt = `${basePrompt}

${layoutDirectiveBlock}

Âncora principal da arte:
- Título em destaque: "${content.headline_arte}"
${offerPrice ? `- Valor em destaque: "Por apenas ${offerPrice}"\n` : ""}- Botão CTA: "${brand.cta_default}"`;

        const singleUrl = await generateFullCreativeWithAI({
          companyId: params.companyId,
          promptText: singleStructuredPrompt,
          aspectRatio,
          preferredImageAI: effectiveImageAI,
          allowFallback: shouldAllowFallback,
          referencePhotoUrl: photoToRender,
          brandLogoUrl: brand.logo_url,
          brandLogoDarkUrl: brand.logo_dark_url,
          keys: {
            gemini: secrets.gemini_api_key,
            openai: secrets.openai_api_key,
          },
          r2Config: secrets.r2_config,
          logs,
        });
        aiResults = [singleUrl];
      } else {
        const firstSlide = content.slides[0];
        const slide1Title = firstSlide?.title || content.headline_arte;
        const slide1Body = (firstSlide?.body || content.subtitulo_arte)
          .split(/\s+/)
          .slice(0, 12)
          .join(" ");
        const slide1Prompt = `${basePrompt.slice(0, 450)}

DIRETRIZ DE CARROSSEL CONTÍNUO (SLIDE 1/${slidesCount} — CAPA):
- Tag Superior: "${firstSlide?.badge || content.tema_visual}"
- Título Principal: "${slide1Title}"
- Subtítulo Curto: "${slide1Body}"
- Indicador no Canto Inferior Direito: "Arraste → 1/${slidesCount}"`;

        const slide1Url = await generateFullCreativeWithAI({
          companyId: params.companyId,
          promptText: slide1Prompt,
          aspectRatio,
          preferredImageAI: effectiveImageAI,
          allowFallback: shouldAllowFallback,
          referencePhotoUrl: photoToRender,
          brandLogoUrl: brand.logo_url,
          brandLogoDarkUrl: brand.logo_dark_url,
          keys: {
            gemini: secrets.gemini_api_key,
            openai: secrets.openai_api_key,
          },
          r2Config: secrets.r2_config,
          logs,
        });

        if (!slide1Url) {
          aiResults = [null];
        } else {
          const remainingResults = await Promise.all(
            Array.from({ length: slidesCount - 1 }, (_, i) => {
              const idx = i + 1;
              const isLastSlide = idx === slidesCount - 1;
              const sl = content.slides[idx] || {
                badge: isLastSlide ? "OFERTA" : `PASSO ${idx + 1}`,
                title: content.headline_arte,
                body: content.subtitulo_arte,
                highlight: offerPrice || content.destaque_selo,
              };
              const offerHighlight = offerPrice || sl.highlight || content.destaque_selo;
              const footerSigRule =
                brand.logo_url || brand.logo_dark_url
                  ? `deixe o canto inferior esquerdo livre para a logomarca oficial PNG`
                  : `assinatura tipográfica limpa "${brand.footer_name}"`;
              const slidePrompt = isLastSlide
                ? `Slide ${idx + 1} de ${slidesCount} (FECHAMENTO DO CARROSSEL). Use a imagem de referência (Slide 1) como guia visual OBRIGATÓRIO: mantenha EXATAMENTE a mesma paleta de cores, fundo, tipografia, iluminação e estilo gráfico do Slide 1 (sem mudar de tema e sem bordas brancas externas). Conteúdo deste slide final (${sl.badge}): título grande "${sl.title}", texto nítido "${sl.body}", destaque em pílula/selo "${offerHighlight}", CTA "${brand.cta_default}" e ${footerSigRule}. No canto inferior direito mostre apenas "${idx + 1}/${slidesCount}" (sem seta de continuar).`
                : `Slide ${idx + 1} de ${slidesCount} (CONTINUAÇÃO DO CARROSSEL). Use a imagem de referência (Slide 1) como guia visual OBRIGATÓRIO: mantenha EXATAMENTE a mesma paleta de cores, fundo, tipografia, iluminação e estilo gráfico do Slide 1 (sem mudar de tema e sem bordas brancas externas), dando continuidade visual da esquerda para a direita. Conteúdo deste slide (${sl.badge}): título grande "${sl.title}", texto explicativo nítido "${sl.body}". No canto inferior direito adicione o indicador "Arraste →" (${idx + 1}/${slidesCount}) convidando a rolar para o próximo slide.`;

              return generateFullCreativeWithAI({
                companyId: params.companyId,
                promptText: slidePrompt,
                aspectRatio,
                preferredImageAI: effectiveImageAI,
                allowFallback: shouldAllowFallback,
                referencePhotoUrl: slide1Url,
                brandLogoUrl: brand.logo_url,
                brandLogoDarkUrl: brand.logo_dark_url,
                keys: {
                  gemini: secrets.gemini_api_key,
                  openai: secrets.openai_api_key,
                },
                r2Config: secrets.r2_config,
                logs,
              });
            })
          );
          aiResults = [slide1Url, ...remainingResults];
        }
      }
    } catch (err) {
      if (err instanceof AICreditError) {
        log(err.message);
        if (!params.forcePublish) {
          await recordGeneratedPost({
            company_id: params.companyId,
            topic_id: topic?.id || null,
            topic_title: topicTitle,
            ai_provider_used: providerUsed,
            format,
            aspect_ratio: aspectRatio,
            slides_count: slidesCount,
            headline: content.headline_arte,
            content_json: content,
            image_urls_json: [],
            ig_post_id: null,
            fb_post_id: null,
            tiktok_post_id: null,
            status: "ERROR",
            logs_json: [err.message, ...logs],
          });
        }
        throw err;
      }
      throw err;
    }

    const anyFailed = aiResults.some((u) => !u);
    if (!anyFailed) {
      for (const u of aiResults) {
        if (u) imageUrls.push(u);
      }
    } else {
      log(
        "Parte das imagens 100% IA ficou indisponível; aplicando Fallback Estilo Agência nos slides restantes."
      );
      const fallbackBuffers = await renderArtSlidesBuffers({
        brand,
        content,
        format,
        slidesCount,
        aspectRatio,
        offerPrice,
        productPhotoUrl: photoToRender,
        aiPhotoMode: "EDITORIAL_MOCKUP",
        customPrompt: cleanedVisualPrompt || promptInstructions,
      });
      const stamp = Date.now();
      for (let i = 0; i < slidesCount; i++) {
        const aiUrl = aiResults[i];
        if (aiUrl) {
          imageUrls.push(aiUrl);
        } else {
          const key = `companies/${params.companyId}/posts/${stamp}-slide-${i + 1}.png`;
          const url = await uploadBufferToR2(
            fallbackBuffers[i],
            key,
            "image/png",
            secrets.r2_config
          );
          imageUrls.push(url);
        }
      }
    }
  } else {
    log(
      `Renderizando ${slidesCount} arte(s) PNG (${aiPhotoMode}) em ${aspectRatio}...`
    );
    const buffers = await renderArtSlidesBuffers({
      brand,
      content,
      format,
      slidesCount,
      aspectRatio,
      offerPrice,
      productPhotoUrl: photoToRender,
      aiPhotoMode,
      customPrompt: cleanedVisualPrompt || promptInstructions,
    });

    const stamp = Date.now();
    for (let i = 0; i < buffers.length; i++) {
      const key = `companies/${params.companyId}/posts/${stamp}-slide-${i + 1}.png`;
      const url = await uploadBufferToR2(
        buffers[i],
        key,
        "image/png",
        secrets.r2_config
      );
      imageUrls.push(url);
    }
  }
  log(`Upload no R2 concluído (${imageUrls.length} imagem(ns)).`);

  let storyImageUrls: string[] = [];
  if (
    !params.previewOnly &&
    params.existingStoryImageUrls &&
    params.existingStoryImageUrls.length > 0
  ) {
    storyImageUrls = [...params.existingStoryImageUrls];
  } else if (needsVertical) {
    if (aspectRatio === "9:16") {
      storyImageUrls = [...imageUrls];
    } else {
      storyImageUrls = await Promise.all(
        imageUrls.map((u) =>
          buildVertical916FromFeedUrl({
            companyId: params.companyId,
            feedImageUrl: u,
            r2Config: secrets.r2_config,
            logs,
          })
        )
      );
      log(
        `Versão vertical 1080×1920 (9:16) preparada para Stories/TikTok (${storyImageUrls.length} imagem(ns)).`
      );
    }
  }

  if (params.previewOnly) {
    let activeDraftId = params.draftPostId || null;

    if (activeDraftId) {
      const updated = await updatePostRecord(activeDraftId, {
        headline: content.headline_arte,
        content_json: content,
        image_urls_json: imageUrls,
        format,
        aspect_ratio: aspectRatio,
        slides_count: imageUrls.length,
        logs_json: logs,
      });
      if (!updated) {
        activeDraftId = null;
      } else {
        log(`Rascunho ${activeDraftId} atualizado com novas artes e textos.`);
      }
    }

    if (!activeDraftId && params.saveAsDraft) {
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
      activeDraftId = savedDraft.id;
      log(`Rascunho ${activeDraftId} salvo com artes e textos editados.`);
    }

    return {
      previewOnly: true,
      draftPostId: activeDraftId,
      companyId: params.companyId,
      topicId: topic?.id || null,
      topicTitle,
      providerUsed,
      format,
      aspectRatio,
      slidesCount: imageUrls.length,
      imageUrl: imageUrls[0],
      imageUrls,
      storyImageUrls,
      publishTargets,
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
      storyImageUrls,
      publishTargets,
      post: content,
      logs,
    };
  }

  // 5. Publicar em paralelo na Meta Graph API v21.0 + TikTok (se ativado)
  const fullCaption = `${content.legenda.trim()}\n\n${content.hashtags.trim()}`;
  const freshTikTokToken = await refreshTikTokTokenIfNeeded(params.companyId);
  const siteBaseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://social.pilotflow.com.br"
  )
    .trim()
    .replace(/\/+$/, "");
  const verticalOrFeedForTikTok =
    storyImageUrls.length > 0 ? storyImageUrls : imageUrls;
  const tiktokImageUrls = verticalOrFeedForTikTok.map(
    (u) => `${siteBaseUrl}/api/media/proxy?url=${encodeURIComponent(u)}`
  );

  const [{ instagramPostId, facebookPostId }, tiktokPostId] = await Promise.all([
    publishToMetaChannels({
      igUserId: secrets.ig_user_id,
      fbPageId: secrets.fb_page_id,
      metaAccessToken: secrets.meta_access_token,
      imageUrls,
      storyImageUrls,
      caption: fullCaption,
      publishTargets,
      publishToStories:
        publishTargets.ig_stories || publishTargets.fb_stories,
      logs,
    }),
    publishToTikTok({
      tiktokAccessToken: freshTikTokToken,
      enabled: Boolean(secrets.tiktok_enabled && publishTargets.tiktok_feed),
      imageUrls: tiktokImageUrls,
      caption: fullCaption,
      logs,
    }),
  ]);

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
    storyImageUrls,
    publishTargets,
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
          const errMsg = err instanceof Error ? err.message : String(err);
          await appendAuditLog({
            company_id: item.company.id,
            action: "CRON_POST_ERROR",
            details_json: {
              topic_id: item.topic.id,
              topic_title: item.topic.title,
              slot: targetSlot,
              dow: currentBr.dow,
              error: errMsg,
            },
          }).catch(() => {});
          results.push({
            company: item.company.name,
            topic: item.topic.title,
            ok: false,
            error: errMsg,
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
          body.aiPhotoMode === "EDITORIAL_MOCKUP" ||
          body.aiPhotoMode === "AI_FULL_CREATIVE" ||
          body.aiPhotoMode === "RAW_ART" ||
          body.aiPhotoMode === "NONE"
          ? body.aiPhotoMode
          : undefined,
      aiPhotoPrompt:
        typeof body.aiPhotoPrompt === "string"
          ? body.aiPhotoPrompt
          : undefined,
      preferredImageAI:
        body.preferredImageAI === "GEMINI" ||
          body.preferredImageAI === "OPENAI" ||
          body.preferredImageAI === "OPENAI_MINI"
          ? body.preferredImageAI
          : null,
      allowImageFallback: Boolean(body.allowImageFallback),
      publishToStories:
        typeof body.publishToStories === "boolean"
          ? body.publishToStories
          : undefined,
      publishTargets:
        body.publishTargets && typeof body.publishTargets === "object"
          ? (body.publishTargets as Partial<PublishTargets>)
          : null,
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
      existingImageUrls: Array.isArray(body.existingImageUrls)
        ? body.existingImageUrls.filter(
          (u): u is string => typeof u === "string" && u.trim().length > 0
        )
        : null,
      existingStoryImageUrls: Array.isArray(body.existingStoryImageUrls)
        ? body.existingStoryImageUrls.filter(
          (u): u is string => typeof u === "string" && u.trim().length > 0
        )
        : null,
      previewOnly: Boolean(body.previewOnly),
      saveAsDraft: Boolean(body.saveAsDraft),
      forcePublish: true,
      draftPostId:
        typeof body.draftPostId === "string" && body.draftPostId.trim()
          ? body.draftPostId.trim()
          : null,
      userId: session?.userId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof AICreditError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "AI_CREDIT_EXHAUSTED",
          failedProvider: error.failedProvider,
          alternativeProvider: error.alternativeProvider,
          logs: [error.message],
        },
        { status: 402 }
      );
    }
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

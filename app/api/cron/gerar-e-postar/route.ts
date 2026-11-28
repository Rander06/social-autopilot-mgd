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
  const pipelineStartedAt = Date.now();
  const logs: string[] = [];
  const log = (m: string) => logs.push(`[${new Date().toISOString()}] ${m}`);

  const quota = await checkCompanyQuotaAndStatus(params.companyId);
  if (!quota.allowed) {
    throw new Error(quota.reason || "Empresa bloqueada ou cota atingida.");
  }

  const topic = params.topic || null;
  const shouldPickQueuedPhoto =
    !params.manualPhotoUrl?.trim() &&
    !params.manualPhotoBase64 &&
    !params.editedContent?.original_photo_url &&
    Boolean(topic);

  const [brand, secrets, prefetchedPhoto, prefetchedHeadlines] = await Promise.all([
    getBrandSettings(params.companyId),
    getCompanySecrets(params.companyId),
    shouldPickQueuedPhoto && topic
      ? pickNextTopicPhoto(params.companyId, topic.id)
      : Promise.resolve(null),
    !params.editedContent && topic
      ? getLastTopicHeadlines(params.companyId, topic.id, 10)
      : Promise.resolve([] as string[]),
  ]);
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

  const approvalMode =
    !params.forcePublish && topic?.approval_mode === "DRAFT"
      ? "DRAFT"
      : "AUTO";

  const needsMetaTarget =
    publishTargets.ig_feed ||
    publishTargets.ig_stories ||
    publishTargets.fb_feed ||
    publishTargets.fb_stories;

  if (
    !params.previewOnly &&
    !params.saveAsDraft &&
    approvalMode === "AUTO" &&
    needsMetaTarget &&
    !secrets.meta_access_token?.trim()
  ) {
    throw new Error(
      "META_ACCESS_TOKEN não configurado nas Integrações desta empresa."
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
  } else if (!originalPhotoUrl && prefetchedPhoto) {
    queuedPhoto = prefetchedPhoto;
    originalPhotoUrl = prefetchedPhoto.original_url;
    log(
      `Fila de fotos sem repetição selecionou foto ${prefetchedPhoto.id} (usada ${prefetchedPhoto.times_used}x).`
    );
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
    previousHeadlines = prefetchedHeadlines;
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
    /#[0-9a-f]{6}|\b(?:fundo\s+(?:escuro|claro|preto|branco|azul|verde|roxo|bege|creme|terracota|gradiente|degrad[êe])|paleta\s+de\s+cores|estilo\s+(?:editorial|minimalista|glassmorphism|revista|noturno)|composi[çc][ãa]o\s+em\s+2\s+colunas)\b/i.test(
      text
    );
  const cleanedVisualPrompt = cleanedMainPrompt || cleanedPhotoPrompt;

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
        id: "CINEMATIC_FULL_BLEED_HERO",
        description:
          "Fotografia publicitária ultrarrealista 100% full-bleed do produto, serviço ou ambiente real do anúncio (câmera DSLR 35mm, iluminação natural ou de estúdio cinematográfica, texturas reais e profundidade autêntica — jamais ilustração ou cartão cinza/branco cobrindo a foto). Título principal forte no topo em branco com palavra-chave em destaque vibrante e faixa translúcida elegante com o preço em dourado; metade inferior com degradê escuro atmosférico suave sobre a própria foto exibindo os 4 diferenciais em grade 2x2 com ícones modernos nítidos, selo de destaque acima e botão CTA em destaque centralizado (55% de largura) mantendo o canto inferior esquerdo livre.",
      },
      {
        id: "GOLDEN_HOUR_GLASS_OVERLAY",
        description:
          "Fotografia editorial ultrarrealista 100% full-bleed adaptada ao segmento (luz quente natural ou iluminação premium de estúdio destacando o produto ou serviço principal, sem molduras ou caixas opacas tampando a cena). Título forte no topo e faixa de valor dourada de alto contraste; metade inferior com degradê escuro suave e 4 faixas translúcidas sutis em vidro fosco bem espaçadas com ícones modernos refinados à esquerda de cada diferencial, selo de destaque e botão CTA centralizado (55% de largura) com canto inferior esquerdo livre.",
      },
      {
        id: "PREMIUM_SHOWCASE_EDITORIAL",
        description:
          "Fotografia comercial ultrarrealista de alto padrão preenchendo 100% da arte (enquadramento hero do produto físico em destaque ou do ambiente/serviço com mockup limpo SOMENTE quando o anúncio for sobre site, aplicativo ou sistema). Título de agência impactante e faixa de preço dourada no topo sobre área limpa da foto; metade inferior escurecida em degradê suave exibindo os 4 diferenciais com ícones limpos, selo de destaque e botão CTA centralizado (55% de largura) com canto inferior esquerdo livre.",
      },
      {
        id: "HIGH_CONTRAST_AGENCY_FLYER",
        description:
          "Fotografia publicitária panorâmica ultrarrealista full-bleed em iluminação vibrante de revista (qualidade fotográfica real fiel ao produto ou serviço anunciado, jamais desenho ou bloco cinza chapado). Topo limpo com tipografia publicitária grande em branco e cor de destaque + faixa translúcida com o valor em dourado; base com vinheta escura cinematográfica integrando os 4 diferenciais em 2 linhas espaçosas com ícones modernos nítidos, linha de selo/condição e botão CTA centralizado (55% de largura) com canto inferior esquerdo livre.",
      },
    ];

    const layoutIndex =
      (previousHeadlines.length +
        Math.floor(Math.random() * CREATIVE_LAYOUT_DIRECTIONS.length)) %
      CREATIVE_LAYOUT_DIRECTIONS.length;
    const chosenLayout = CREATIVE_LAYOUT_DIRECTIONS[layoutIndex];
    log(`Direção de arte selecionada: ${chosenLayout.id}`);

    const userHasCustomLayout = hasVisualDirectives(cleanedVisualPrompt);
    const userWantsNoText =
      /\bsem\s+(?:textos?|escrita|palavras|legendas?\s+na\s+imagem)\b/i.test(
        cleanedVisualPrompt
      );
    const userWantsNoLogo =
      /\bsem\s+(?:logos?|logotipos?|logomarcas?|assinaturas?)\b/i.test(
        cleanedVisualPrompt
      );
    const hasDetailedPhotoScene =
      /\b(?:imagem\s+de\s+refer[êe]ncia|fidelidade|[âa]ngulo\s+(?:baixo|alto|aberto|fechado)|enquadramento|lente\s+\d+mm|full-?frame|bokeh|desfoque|fotografia\s+(?:publicit[áa]ria|editorial|de\s+est[úu]dio|ultra-?realista)|ilumina[çc][ãa]o\s+natural|piso\s+de|cal[çc]ada|cen[áa]rio\s+de)\b/i.test(
        cleanedVisualPrompt
      );
    const layoutDirectiveBlock = userHasCustomLayout
      ? `Estilo visual: respeite as instruções do briefing mantendo composição limpa (${chosenLayout.id}).`
      : `Estilo visual (${chosenLayout.id}): ${chosenLayout.description}`;

    const buildVisualSubjectCue = (
      rawTopicTitle: string,
      rawPrompt: string,
      temaVisual: string
    ): string => {
      const cleanTopic = cleanCreativePrompt(rawTopicTitle);
      const hasSpecificTopic =
        Boolean(cleanTopic) &&
        !/^(?:campanha especial|post especial|novo assunto)$/i.test(cleanTopic);

      const filteredLines = (rawPrompt || "")
        .split(/\r?\n/)
        .map((line) =>
          line
            .replace(/\([^)]*(?:n[íi]tido|arte|legenda|mensalidade)[^)]*\)/gi, "")
            .replace(/^(?:[-•*]\s*)?(?:objetivo\s+do\s+an[úu]ncio|t[íi]tulo\s+no\s+topo(?:\s+da\s+arte)?|valor\s+do(?:\s+\w+)*|principais\s+diferenciais|destaque\s+os\s+principais(?:\s+\w+)*|reforce\s+sempre(?:\s+\w+)*)\s*:?\s*/i, "")
            .trim()
        )
        .filter(
          (line) =>
            line.length > 2 &&
            !/^(?:n[ãa]o\s+use|nunca\s+(?:cite|fale)|regra\s+de\s+texto)/i.test(line)
        );

      const rawSnippet = cleanCreativePrompt(filteredLines.join(" "));
      const clippedSnippet =
        rawSnippet.length > 160
          ? rawSnippet.slice(0, 160).replace(/\s+\S*$/, "").trim()
          : rawSnippet;

      const parts: string[] = [];
      if (hasSpecificTopic) parts.push(cleanTopic);
      if (temaVisual && !cleanTopic.toLowerCase().includes(temaVisual.toLowerCase())) {
        parts.push(temaVisual);
      }
      if (
        clippedSnippet &&
        clippedSnippet.toLowerCase() !== cleanTopic.toLowerCase()
      ) {
        parts.push(clippedSnippet);
      }

      return parts.join(" — ") || cleanTopic || temaVisual || "Produto ou serviço em destaque";
    };

    const visualSubjectCue = buildVisualSubjectCue(
      topicTitle,
      cleanedVisualPrompt || promptInstructions,
      content.tema_visual
    );

    const structuredBenefits = (content.beneficios || [])
      .map((b) =>
        b
          .replace(/^[-•*]\s*/, "")
          .trim()
          .split(/\s+/)
          .slice(0, 8)
          .join(" ")
      )
      .filter(Boolean)
      .slice(0, 4);

    let aiResults: Array<string | null> = [];
    try {
      if (slidesCount === 1) {
        const sceneContextBlock =
          userHasCustomLayout || hasDetailedPhotoScene
            ? basePrompt
            : `Cenário fotográfico ultrarrealista para a empresa "${quota.company.name}" sobre: ${visualSubjectCue}. Mostre fielmente o produto, serviço ou ambiente real descrito acima (ex.: foto real de estúdio/lifestyle do produto quando for item físico, ou do ambiente/serviço quando for negócio local/digital), sem inventar cenários fora do contexto.`;

        const benefitsLinesBlock =
          structuredBenefits.length > 0
            ? `\n- Diferenciais com ícones modernos (renderize exatamente estes itens curtos):\n${structuredBenefits
                .map((b) => `  • "${b}"`)
                .join("\n")}`
            : "";

        const singleStructuredPrompt = userWantsNoText
          ? `${basePrompt}\n\nREGRA ABSOLUTA: Siga 100% fielmente a cena fotográfica e o produto de referência descritos acima, em composição 100% full-bleed. NÃO escreva nenhum texto, título, preço, botão ou ícone sobre a imagem.`
          : `${sceneContextBlock}

${layoutDirectiveBlock}

Textos exatos para renderizar na arte:
- Título principal no topo: "${content.headline_arte}"${
              offerPrice
                ? `\n- Faixa de valor logo abaixo do título: "Por apenas ${offerPrice}"`
                : ""
            }${benefitsLinesBlock}${
              content.destaque_selo
                ? `\n- Linha de destaque acima do botão: "${content.destaque_selo}"`
                : ""
            }
- Botão CTA centralizado (55% de largura, deixando canto inferior esquerdo livre para a logo): "${brand.cta_default}"
Escreva na imagem APENAS esses textos em português do Brasil com ortografia e acentos perfeitos; nunca imprima instruções internas de briefing.`;

        const singleUrl = await generateFullCreativeWithAI({
          companyId: params.companyId,
          promptText: singleStructuredPrompt,
          aspectRatio,
          preferredImageAI: effectiveImageAI,
          allowFallback: shouldAllowFallback,
          referencePhotoUrl: photoToRender,
          brandLogoUrl: userWantsNoLogo ? null : brand.logo_url,
          brandLogoDarkUrl: userWantsNoLogo ? null : brand.logo_dark_url,
          keys: {
            gemini: secrets.gemini_api_key,
            openai: secrets.openai_api_key,
          },
          r2Config: secrets.r2_config,
          maxWaitMs: Math.max(20_000, 45_000 - (Date.now() - pipelineStartedAt)),
          logs,
        });
        aiResults = [singleUrl];
      } else {
        const remainingAiBudgetMs = Math.max(
          18_000,
          44_000 - (Date.now() - pipelineStartedAt)
        );
        const paletteSummary = `Paleta da marca consistente em TODOS os slides: cor primária ${brand.primary_color} e destaque ${brand.accent_color} com alto contraste sobre fotografia/cenário publicitário moderno.`;
        const carouselVisualDna = `Tema visual e produto/serviço da empresa "${quota.company.name}": ${visualSubjectCue}.

${layoutDirectiveBlock}
${paletteSummary}

IMPORTANTE: Crie arte publicitária visual rica estilo agência mostrando fielmente o produto, serviço ou ambiente real descrito acima (ex.: foto real de estúdio/lifestyle para produto físico, ou ambiente/serviço real para negócio local/digital — PROIBIDO fundo chapado vazio só com texto ou cenário fora do contexto). Escreva NA IMAGEM EXCLUSIVAMENTE os textos entre aspas listados abaixo, respeitando cada acento em PT-BR.`;
        const footerSigRule =
          brand.logo_url || brand.logo_dark_url
            ? `deixe o canto inferior esquerdo livre para a logomarca oficial PNG`
            : `assinatura tipográfica limpa "${brand.footer_name}"`;

        aiResults = await Promise.all(
          Array.from({ length: slidesCount }, (_, idx) => {
            const isFirstSlide = idx === 0;
            const isLastSlide = idx === slidesCount - 1;
            const sl = content.slides[idx] || {
              badge: isFirstSlide
                ? content.tema_visual
                : isLastSlide
                ? "OFERTA"
                : `PASSO ${idx + 1}`,
              title: content.headline_arte,
              body: content.subtitulo_arte,
              highlight: offerPrice || content.destaque_selo,
            };
            const slideBody = (sl.body || content.subtitulo_arte)
              .split(/\s+/)
              .slice(0, 14)
              .join(" ");
            const offerHighlight =
              offerPrice || sl.highlight || content.destaque_selo;

            let slidePrompt: string;
            if (isFirstSlide) {
              slidePrompt = `${carouselVisualDna}

DIRETRIZ DE CARROSSEL CONTÍNUO (SLIDE 1/${slidesCount} — CAPA):
- Tag Superior: "${sl.badge || content.tema_visual}"
- Título Principal: "${sl.title || content.headline_arte}"
- Subtítulo Curto: "${slideBody}"
- Indicador no Canto Inferior Direito: "Arraste → 1/${slidesCount}"`;
            } else if (isLastSlide) {
              slidePrompt = `${carouselVisualDna}

DIRETRIZ DE CARROSSEL CONTÍNUO (SLIDE ${idx + 1}/${slidesCount} — FECHAMENTO):
- Mantenha EXATAMENTE a mesma identidade visual, fotografia/cenário, tipografia e estilo gráfico da capa (sem bordas brancas externas).
- Tag Superior: "${sl.badge || "OFERTA"}"
- Título Grande: "${sl.title}"
- Texto Nítido: "${slideBody}"
- Destaque em pílula/selo: "${offerHighlight}"
- Botão CTA: "${brand.cta_default}" e ${footerSigRule}.
- Canto inferior direito: "${idx + 1}/${slidesCount}" (sem seta).`;
            } else {
              slidePrompt = `${carouselVisualDna}

DIRETRIZ DE CARROSSEL CONTÍNUO (SLIDE ${idx + 1}/${slidesCount} — CONTINUAÇÃO):
- Mantenha EXATAMENTE a mesma identidade visual, fotografia/cenário, tipografia e estilo gráfico da capa (sem bordas brancas externas).
- Tag Superior: "${sl.badge}"
- Título Grande: "${sl.title}"
- Texto Explicativo Nítido: "${slideBody}"
- Indicador no Canto Inferior Direito: "Arraste → ${idx + 1}/${slidesCount}"`;
            }

            return generateFullCreativeWithAI({
              companyId: params.companyId,
              promptText: slidePrompt,
              aspectRatio,
              preferredImageAI: effectiveImageAI,
              allowFallback: shouldAllowFallback,
              referencePhotoUrl: photoToRender,
              brandLogoUrl: userWantsNoLogo ? null : brand.logo_url,
              brandLogoDarkUrl: userWantsNoLogo ? null : brand.logo_dark_url,
              keys: {
                gemini: secrets.gemini_api_key,
                openai: secrets.openai_api_key,
              },
              r2Config: secrets.r2_config,
              maxWaitMs: remainingAiBudgetMs,
              isCarouselSlide: true,
              logs,
            });
          })
        );
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

  const tikTokTokenPromise =
    !params.previewOnly && approvalMode !== "DRAFT"
      ? refreshTikTokTokenIfNeeded(params.companyId)
      : Promise.resolve(null);

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

  const formatDetectedModel = (raw: string): string => {
    const trimmed = raw.trim();
    if (/^gemini-/i.test(trimmed)) return `GEMINI (${trimmed})`;
    if (/^OpenAI\s+/i.test(trimmed)) {
      return `OPENAI (${trimmed.replace(/^OpenAI\s+/i, "").trim()})`;
    }
    return trimmed;
  };
  const detectedImageProviders = Array.from(
    new Set(
      logs
        .map((l) => l.match(/Criativo 100% IA \(([^)]+)\) concluído:/i)?.[1])
        .filter((v): v is string => Boolean(v))
        .map(formatDetectedModel)
    )
  );
  const imageProviderUsed =
    detectedImageProviders.length > 0
      ? detectedImageProviders.join(", ")
      : effectiveImageAI;
  content.image_provider_used = imageProviderUsed;

  if (params.previewOnly) {
    let activeDraftId = params.draftPostId || null;

    if (activeDraftId) {
      const updated = await updatePostRecord(activeDraftId, {
        headline: content.headline_arte,
        content_json: content,
        image_urls_json: imageUrls,
        story_image_urls_json: storyImageUrls,
        publish_targets: publishTargets,
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
        story_image_urls_json: storyImageUrls,
        publish_targets: publishTargets,
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
      imageProviderUsed,
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
      story_image_urls_json: storyImageUrls,
      publish_targets: publishTargets,
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
      providerUsed,
      imageProviderUsed,
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
  const freshTikTokToken = await tikTokTokenPromise;
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
    story_image_urls_json: storyImageUrls,
    publish_targets: publishTargets,
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
    providerUsed,
    imageProviderUsed,
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

      if (dueList.length > 0) {
        await appendAuditLog({
          company_id: dueList[0].company.id,
          action: "CRON_SLOT_DISPATCHED",
          details_json: {
            slot: targetSlot,
            dow: currentBr.dow,
            count: dueList.length,
            topics: dueList.map((d) => ({
              company_id: d.company.id,
              topic_id: d.topic.id,
              title: d.topic.title,
            })),
          },
        }).catch(() => {});
      }

      const results = await Promise.all(
        dueList.map(async (item) => {
          try {
            const r = await runPostPipeline({
              companyId: item.company.id,
              topic: item.topic,
            });
            return {
              company: item.company.name,
              topic: item.topic.title,
              ok: true,
              result: r,
            };
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
            return {
              company: item.company.name,
              topic: item.topic.title,
              ok: false,
              error: errMsg,
            };
          }
        })
      );

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

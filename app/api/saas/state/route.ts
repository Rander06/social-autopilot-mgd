import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import {
  inspectMetaTokenValidity,
  publishToMetaChannels,
  publishToTikTok,
  testR2Connection,
  uploadBufferToR2,
} from "@/lib/ai-engine";
import {
  getSessionFromRequest,
  SESSION_COOKIE,
  SessionPayload,
  signSession,
} from "@/lib/crypto";
import {
  addTopicPhoto,
  appendAuditLog,
  authenticateLogin,
  checkCompanyQuotaAndStatus,
  createOrUpdateCompanyByAdmin,
  deleteTopic,
  deleteTopicPhoto,
  getCompanySecrets,
  getCompanyWorkspace,
  getDatabaseMode,
  getSuperAdminSnapshot,
  incrementCompanyPostUsage,
  listPostsHistory,
  recordGeneratedPost,
  registerNewAccount,
  resetPasswordWithRecoveryAccessToken,
  resetUserPasswordByAdminOrSecret,
  saveBrandSettings,
  saveCompanyIntegrations,
  sendSupabasePasswordRecoveryEmail,
  deletePostRecord,
  updatePlanByAdmin,
  updatePostRecord,
  upsertTopic,
} from "@/lib/store";
import {
  AIPhotoMode,
  AspectRatio,
  GeneratedContentPayload,
  PostFormat,
  UserAccount,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function buildAuthenticatedResponse(
  user: Omit<UserAccount, "password_hash">
) {
  const activeCompanyId = user.company_id || "comp-mgd";
  const sessionPayload: SessionPayload = {
    userId: user.id,
    companyId: user.company_id,
    role: user.role,
    email: user.email,
    name: user.name,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };

  const workspace = await getCompanyWorkspace(activeCompanyId);
  const adminSnapshot =
    user.role === "SUPER_ADMIN" ? await getSuperAdminSnapshot() : null;

  const res = NextResponse.json({
    authenticated: true,
    database_mode: getDatabaseMode(),
    user,
    workspace,
    adminSnapshot,
  });

  res.cookies.set(SESSION_COOKIE, signSession(sessionPayload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return res;
}

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { authenticated: false, database_mode: getDatabaseMode() },
      { status: 200 }
    );
  }

  const requestedCompanyId =
    request.nextUrl.searchParams.get("companyId")?.trim() || null;

  const activeCompanyId =
    session.role === "SUPER_ADMIN" && requestedCompanyId
      ? requestedCompanyId
      : session.companyId || "comp-mgd";

  const workspace = await getCompanyWorkspace(activeCompanyId);
  const adminSnapshot =
    session.role === "SUPER_ADMIN" ? await getSuperAdminSnapshot() : null;

  return NextResponse.json({
    authenticated: true,
    database_mode: getDatabaseMode(),
    user: {
      id: session.userId,
      company_id: session.companyId,
      role: session.role,
      email: session.email,
      name: session.name,
    },
    workspace,
    adminSnapshot,
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const action = String(body.action || "");

  if (action === "login") {
    const authResult = await authenticateLogin({
      email: typeof body.email === "string" ? body.email : undefined,
      password: typeof body.password === "string" ? body.password : undefined,
      cronSecret:
        typeof body.cronSecret === "string" ? body.cronSecret : undefined,
    });

    if (!authResult) {
      return NextResponse.json(
        { error: "E-mail, senha ou CRON_SECRET inválido." },
        { status: 401 }
      );
    }

    return buildAuthenticatedResponse(authResult.user);
  }

  if (action === "register") {
    try {
      const reg = await registerNewAccount({
        companyName:
          typeof body.companyName === "string" ? body.companyName : undefined,
        name: String(body.name || ""),
        whatsapp:
          typeof body.whatsapp === "string" ? body.whatsapp : undefined,
        email: String(body.email || ""),
        password: String(body.password || ""),
        adminSecret:
          typeof body.adminSecret === "string" ? body.adminSecret : undefined,
      });
      return buildAuthenticatedResponse(reg.user);
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error ? err.message : "Erro ao cadastrar conta.",
        },
        { status: 400 }
      );
    }
  }

  if (action === "forgot_password") {
    try {
      const result = await sendSupabasePasswordRecoveryEmail(
        String(body.email || ""),
        typeof body.redirectTo === "string" ? body.redirectTo : undefined
      );
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Erro ao solicitar recuperação de senha.",
        },
        { status: 400 }
      );
    }
  }

  if (action === "reset_password") {
    try {
      const recoveryAccessToken =
        typeof body.recoveryAccessToken === "string"
          ? body.recoveryAccessToken.trim()
          : "";
      const newPassword = String(body.newPassword || "");

      if (recoveryAccessToken) {
        const res = await resetPasswordWithRecoveryAccessToken(
          recoveryAccessToken,
          newPassword
        );
        return NextResponse.json({
          ok: true,
          email: res.email,
          message:
            "Senha atualizada no Supabase Authentication! Já pode entrar.",
        });
      }

      const cronSecretInput =
        typeof body.cronSecret === "string" ? body.cronSecret.trim() : "";
      const envCronSecret = process.env.CRON_SECRET?.trim();
      if (!envCronSecret || cronSecretInput !== envCronSecret) {
        return NextResponse.json(
          {
            error:
              "Informe um link válido de recuperação do e-mail ou o CRON_SECRET correto.",
          },
          { status: 401 }
        );
      }

      const res = await resetUserPasswordByAdminOrSecret({
        email: String(body.email || ""),
        newPassword,
      });

      return NextResponse.json({
        ok: true,
        email: res.email,
        message: `Senha de ${res.email} atualizada no Supabase Authentication e no banco!`,
      });
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Erro ao redefinir a senha.",
        },
        { status: 400 }
      );
    }
  }

  if (action === "logout") {
    const res = NextResponse.json({ authenticated: false });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const requestedCompanyId =
    typeof body.companyId === "string" ? body.companyId.trim() : "";
  const targetCompanyId =
    session.role === "SUPER_ADMIN" && requestedCompanyId
      ? requestedCompanyId
      : session.companyId || "comp-mgd";

  try {
    if (action === "switch_company") {
      if (session.role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
      }
      await appendAuditLog({
        company_id: targetCompanyId,
        user_id: session.userId,
        action: "ADMIN_IMPERSONATE_COMPANY",
        details_json: { targetCompanyId },
      });
      const workspace = await getCompanyWorkspace(targetCompanyId);
      return NextResponse.json({ workspace });
    }

    if (action === "save_brand") {
      const brand = await saveBrandSettings(
        targetCompanyId,
        (body.brand || {}) as Record<string, string>,
        session.userId
      );
      return NextResponse.json({ brand });
    }

    if (action === "save_integrations") {
      const integInput = (body.integrations || {}) as Record<string, unknown>;
      let metaExpiresAt: string | null | undefined = undefined;
      if (
        typeof integInput.meta_access_token === "string" &&
        integInput.meta_access_token.trim()
      ) {
        const inspection = await inspectMetaTokenValidity(
          integInput.meta_access_token.trim()
        );
        metaExpiresAt = inspection.expires_at;
      }

      const integrations = await saveCompanyIntegrations(
        targetCompanyId,
        {
          preferred_text_ai: integInput.preferred_text_ai as
            | "GEMINI"
            | "OPENAI"
            | "CLAUDE"
            | undefined,
          preferred_image_ai: integInput.preferred_image_ai as
            | "GEMINI"
            | "OPENAI"
            | "OPENAI_MINI"
            | undefined,
          gemini_api_key:
            typeof integInput.gemini_api_key === "string"
              ? integInput.gemini_api_key
              : undefined,
          openai_api_key:
            typeof integInput.openai_api_key === "string"
              ? integInput.openai_api_key
              : undefined,
          anthropic_api_key:
            typeof integInput.anthropic_api_key === "string"
              ? integInput.anthropic_api_key
              : undefined,
          meta_access_token:
            typeof integInput.meta_access_token === "string"
              ? integInput.meta_access_token
              : undefined,
          meta_token_expires_at: metaExpiresAt,
          ig_user_id:
            typeof integInput.ig_user_id === "string"
              ? integInput.ig_user_id
              : undefined,
          fb_page_id:
            typeof integInput.fb_page_id === "string"
              ? integInput.fb_page_id
              : undefined,
          r2_account_id:
            typeof integInput.r2_account_id === "string"
              ? integInput.r2_account_id
              : undefined,
          r2_access_key_id:
            typeof integInput.r2_access_key_id === "string"
              ? integInput.r2_access_key_id
              : undefined,
          r2_secret_access_key:
            typeof integInput.r2_secret_access_key === "string"
              ? integInput.r2_secret_access_key
              : undefined,
          r2_bucket_name:
            typeof integInput.r2_bucket_name === "string"
              ? integInput.r2_bucket_name
              : undefined,
          r2_public_url:
            typeof integInput.r2_public_url === "string"
              ? integInput.r2_public_url
              : undefined,
          tiktok_access_token:
            typeof integInput.tiktok_access_token === "string"
              ? integInput.tiktok_access_token
              : undefined,
          tiktok_open_id:
            typeof integInput.tiktok_open_id === "string"
              ? integInput.tiktok_open_id
              : undefined,
          tiktok_enabled:
            typeof integInput.tiktok_enabled === "boolean"
              ? integInput.tiktok_enabled
              : undefined,
          allow_image_ai_fallback:
            typeof integInput.allow_image_ai_fallback === "boolean"
              ? integInput.allow_image_ai_fallback
              : undefined,
        },
        session.userId
      );

      return NextResponse.json({ integrations });
    }

    if (action === "test_integrations") {
      const secrets = await getCompanySecrets(targetCompanyId);
      const report: Record<string, unknown> = {};

      if (secrets.meta_access_token) {
        report.meta = await inspectMetaTokenValidity(secrets.meta_access_token);
      } else {
        report.meta = { valid: false, warning: "Token Meta não configurado." };
      }

      if (secrets.gemini_api_key) {
        try {
          const ai = new GoogleGenAI({ apiKey: secrets.gemini_api_key });
          await ai.models.generateContent({
            model: "gemini-3.5-flash-lite",
            contents: "OK",
          });
          report.gemini = { valid: true, message: "Chave Gemini ativa." };
        } catch (err) {
          report.gemini = {
            valid: false,
            message: err instanceof Error ? err.message : "Erro na chave Gemini",
          };
        }
      }

      if (secrets.openai_api_key) {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${secrets.openai_api_key}` },
        });
        report.openai = {
          valid: res.ok,
          message: res.ok
            ? "Chave OpenAI ativa."
            : `Erro HTTP ${res.status} na OpenAI.`,
        };
      }

      if (secrets.anthropic_api_key) {
        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": secrets.anthropic_api_key,
            "anthropic-version": "2023-06-01",
          },
        });
        report.claude = {
          valid: res.ok,
          message: res.ok
            ? "Chave Anthropic Claude ativa."
            : `Erro HTTP ${res.status} no Claude.`,
        };
      }

      report.cloudflare_r2 = await testR2Connection(secrets.r2_config);

      return NextResponse.json({ report });
    }

    if (action === "upsert_topic") {
      const topicPayload = (body.topic || {}) as Record<string, unknown>;
      const topic = await upsertTopic(
        targetCompanyId,
        {
          id:
            typeof topicPayload.id === "string" ? topicPayload.id : undefined,
          title: String(topicPayload.title || "Novo Assunto"),
          niche_template: String(topicPayload.niche_template || "custom"),
          prompt_instructions: String(topicPayload.prompt_instructions || ""),
          offer_price:
            typeof topicPayload.offer_price === "string"
              ? topicPayload.offer_price
              : null,
          benefits_json: Array.isArray(topicPayload.benefits_json)
            ? (topicPayload.benefits_json as string[])
            : [],
          post_format:
            topicPayload.post_format === "CAROUSEL" ? "CAROUSEL" : "SINGLE",
          slides_count: Number(topicPayload.slides_count || 1),
          aspect_ratio: (topicPayload.aspect_ratio as "1:1" | "4:5" | "9:16") || "1:1",
          approval_mode:
            topicPayload.approval_mode === "DRAFT" ? "DRAFT" : "AUTO",
          ai_photo_mode:
            (topicPayload.ai_photo_mode as AIPhotoMode) || "NONE",
          ai_photo_prompt:
            typeof topicPayload.ai_photo_prompt === "string"
              ? topicPayload.ai_photo_prompt
              : null,
          preferred_image_ai:
            topicPayload.preferred_image_ai === "GEMINI" ||
            topicPayload.preferred_image_ai === "OPENAI" ||
            topicPayload.preferred_image_ai === "OPENAI_MINI"
              ? topicPayload.preferred_image_ai
              : null,
          publish_to_stories: Boolean(topicPayload.publish_to_stories),
          schedule_days: Array.isArray(topicPayload.schedule_days)
            ? (topicPayload.schedule_days as number[])
            : [1, 3, 5],
          schedule_times: Array.isArray(topicPayload.schedule_times)
            ? (topicPayload.schedule_times as string[])
            : undefined,
          schedule_time: String(topicPayload.schedule_time || "10:00"),
          is_active:
            typeof topicPayload.is_active === "boolean"
              ? topicPayload.is_active
              : true,
        },
        session.userId
      );
      return NextResponse.json({ topic });
    }

    if (action === "delete_topic") {
      await deleteTopic(
        targetCompanyId,
        String(body.topicId || ""),
        session.userId
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "upload_topic_photo") {
      const topicId = String(body.topicId || "");
      const aiPromptUsed =
        typeof body.aiPromptUsed === "string" ? body.aiPromptUsed : null;
      let originalUrl =
        typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";

      if (!originalUrl && typeof body.fileBase64 === "string") {
        const base64Clean = body.fileBase64.replace(
          /^data:[^;]+;base64,/,
          ""
        );
        const contentType =
          typeof body.contentType === "string"
            ? body.contentType
            : "image/jpeg";
        const ext = contentType.includes("png") ? "png" : "jpg";
        const buffer = Buffer.from(base64Clean, "base64");
        const secrets = await getCompanySecrets(targetCompanyId);
        originalUrl = await uploadBufferToR2(
          buffer,
          `companies/${targetCompanyId}/originals/${Date.now()}.${ext}`,
          contentType,
          secrets.r2_config
        );
      }

      if (!originalUrl || !topicId) {
        return NextResponse.json(
          { error: "Informe topicId e uma imagem válida." },
          { status: 400 }
        );
      }

      const photo = await addTopicPhoto({
        company_id: targetCompanyId,
        topic_id: topicId,
        original_url: originalUrl,
        ai_prompt_used: aiPromptUsed,
        user_id: session.userId,
      });

      return NextResponse.json({ photo });
    }

    if (action === "delete_topic_photo") {
      await deleteTopicPhoto(targetCompanyId, String(body.photoId || ""));
      return NextResponse.json({ ok: true });
    }

    if (action === "approve_draft_post") {
      const postId = String(body.postId || "");
      const posts = await listPostsHistory(targetCompanyId, 50);
      const draft = posts.find((p) => p.id === postId);
      if (!draft) {
        return NextResponse.json(
          { error: "Rascunho não encontrado." },
          { status: 404 }
        );
      }
      if (draft.status === "PUBLISHED") {
        return NextResponse.json(
          { error: "Este rascunho já foi publicado anteriormente." },
          { status: 400 }
        );
      }

      const quota = await checkCompanyQuotaAndStatus(targetCompanyId);
      if (!quota.allowed) {
        return NextResponse.json({ error: quota.reason }, { status: 403 });
      }

      const finalContent: GeneratedContentPayload =
        body.editedContent && typeof body.editedContent === "object"
          ? (body.editedContent as GeneratedContentPayload)
          : draft.content_json;

      const bodyImageUrls = Array.isArray(body.imageUrls)
        ? body.imageUrls.filter(
            (u): u is string => typeof u === "string" && u.trim().length > 0
          )
        : [];
      const finalImageUrls =
        bodyImageUrls.length > 0 ? bodyImageUrls : draft.image_urls_json;

      const secrets = await getCompanySecrets(targetCompanyId);
      const logs = [...(draft.logs_json || [])];
      const fullCaption = `${finalContent.legenda.trim()}\n\n${(finalContent.hashtags || "").trim()}`.trim();

      const { instagramPostId, facebookPostId } = await publishToMetaChannels({
        igUserId: secrets.ig_user_id,
        fbPageId: secrets.fb_page_id,
        metaAccessToken: secrets.meta_access_token,
        imageUrls: finalImageUrls,
        caption: fullCaption,
        logs,
      });

      const tiktokPostId = await publishToTikTok({
        tiktokAccessToken: secrets.tiktok_access_token,
        enabled: secrets.tiktok_enabled,
        imageUrls: finalImageUrls,
        caption: fullCaption,
        logs,
      });

      const updated = await updatePostRecord(draft.id, {
        status: "PUBLISHED",
        headline: finalContent.headline_arte || draft.headline,
        content_json: finalContent,
        image_urls_json: finalImageUrls,
        ig_post_id: instagramPostId,
        fb_post_id: facebookPostId,
        tiktok_post_id: tiktokPostId,
        logs_json: logs,
      });

      await incrementCompanyPostUsage(targetCompanyId, draft.topic_id);

      await appendAuditLog({
        company_id: targetCompanyId,
        user_id: session.userId,
        action: "DRAFT_APPROVED_AND_PUBLISHED",
        details_json: { post_id: draft.id, ig_post_id: instagramPostId },
      });

      return NextResponse.json({ post: updated });
    }

    if (action === "update_draft_post") {
      const postId = String(body.postId || "").trim();
      const posts = await listPostsHistory(targetCompanyId, 50);
      const existingDraft = postId
        ? posts.find((p) => p.id === postId && p.status === "PENDING_APPROVAL")
        : undefined;

      const bodyImageUrls = Array.isArray(body.imageUrls)
        ? body.imageUrls.filter(
            (u): u is string => typeof u === "string" && u.trim().length > 0
          )
        : [];

      if (existingDraft) {
        const editedContent =
          body.editedContent && typeof body.editedContent === "object"
            ? (body.editedContent as GeneratedContentPayload)
            : existingDraft.content_json;

        const finalImageUrls =
          bodyImageUrls.length > 0 ? bodyImageUrls : existingDraft.image_urls_json;

        const updated = await updatePostRecord(existingDraft.id, {
          headline: editedContent.headline_arte || existingDraft.headline,
          content_json: editedContent,
          image_urls_json: finalImageUrls,
        });

        await appendAuditLog({
          company_id: targetCompanyId,
          user_id: session.userId,
          action: "DRAFT_UPDATED",
          details_json: {
            post_id: existingDraft.id,
            headline: editedContent.headline_arte,
          },
        });

        return NextResponse.json({ post: updated || existingDraft });
      }

      if (!body.editedContent || typeof body.editedContent !== "object") {
        return NextResponse.json(
          { error: "Conteúdo do rascunho não informado." },
          { status: 400 }
        );
      }

      const editedContent = body.editedContent as GeneratedContentPayload;
      const format: PostFormat =
        body.format === "CAROUSEL" ? "CAROUSEL" : "SINGLE";
      const aspectRatio: AspectRatio =
        body.aspectRatio === "4:5" || body.aspectRatio === "9:16"
          ? body.aspectRatio
          : "1:1";
      const slidesCount =
        typeof body.slidesCount === "number"
          ? body.slidesCount
          : Math.max(1, bodyImageUrls.length);

      const savedDraft = await recordGeneratedPost({
        company_id: targetCompanyId,
        topic_id:
          typeof body.topicId === "string" && body.topicId.trim()
            ? body.topicId.trim()
            : null,
        topic_title:
          typeof body.topicTitle === "string" ? body.topicTitle : undefined,
        ai_provider_used:
          typeof body.providerUsed === "string" ? body.providerUsed : "MANUAL_EDIT",
        format,
        aspect_ratio: aspectRatio,
        slides_count: slidesCount,
        headline: editedContent.headline_arte || "Rascunho Editado",
        content_json: editedContent,
        image_urls_json: bodyImageUrls,
        ig_post_id: null,
        fb_post_id: null,
        tiktok_post_id: null,
        status: "PENDING_APPROVAL",
        logs_json: [],
      });

      await appendAuditLog({
        company_id: targetCompanyId,
        user_id: session.userId,
        action: "POST_DRAFT_CREATED",
        details_json: {
          post_id: savedDraft.id,
          headline: savedDraft.headline,
        },
      });

      return NextResponse.json({ post: savedDraft });
    }

    if (action === "delete_draft_post") {
      const postId = String(body.postId || "");
      if (!postId) {
        return NextResponse.json(
          { error: "ID do rascunho não informado." },
          { status: 400 }
        );
      }
      await deletePostRecord(targetCompanyId, postId, session.userId);
      return NextResponse.json({ ok: true });
    }

    if (action === "admin_save_company") {
      if (session.role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
      }
      const c = (body.company || {}) as Record<string, unknown>;
      const saved = await createOrUpdateCompanyByAdmin({
        id: typeof c.id === "string" ? c.id : undefined,
        name: String(c.name || "Nova Empresa"),
        plan_id: String(c.plan_id || "plan-pro"),
        status:
          (c.status as "ACTIVE" | "TRIAL" | "PAST_DUE" | "BLOCKED") ||
          "ACTIVE",
        expires_at:
          typeof c.expires_at === "string" && c.expires_at
            ? c.expires_at
            : new Date(Date.now() + 30 * 86400_000).toISOString(),
        owner_name: typeof c.owner_name === "string" ? c.owner_name : "",
        owner_whatsapp:
          typeof c.owner_whatsapp === "string" ? c.owner_whatsapp : "",
        admin_email: typeof c.admin_email === "string" ? c.admin_email : "",
        admin_password:
          typeof c.admin_password === "string" ? c.admin_password : "",
        reset_usage: Boolean(c.reset_usage),
      });
      const adminSnapshot = await getSuperAdminSnapshot();
      return NextResponse.json({ company: saved, adminSnapshot });
    }

    if (action === "admin_save_plan") {
      if (session.role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
      }
      const p = (body.plan || {}) as Record<string, unknown>;
      const plan = await updatePlanByAdmin({
        id: String(p.id),
        name: String(p.name),
        price_brl: Number(p.price_brl || 0),
        max_posts_month: Number(p.max_posts_month || 12),
        allow_carousel: Boolean(p.allow_carousel),
        allow_ai_photo: Boolean(p.allow_ai_photo),
        allow_multi_ai: Boolean(p.allow_multi_ai),
      });
      const adminSnapshot = await getSuperAdminSnapshot();
      return NextResponse.json({ plan, adminSnapshot });
    }

    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erro interno no servidor SaaS.",
      },
      { status: 500 }
    );
  }
}

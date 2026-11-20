"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AI_PHOTO_PROMPT_EXAMPLES,
  LUMINOUS_THEME_PRESETS,
  NICHE_TOPIC_TEMPLATES,
  SCHEDULE_TIME_SLOTS,
  WEEKDAY_LABELS,
} from "@/lib/presets";
import {
  AIProvider,
  AIPhotoMode,
  ApprovalMode,
  AspectRatio,
  AuditLogItem,
  BrandSettings,
  Company,
  CompanyIntegrationsPublic,
  CompanyStatus,
  GeneratedContentPayload,
  ImageAIProvider,
  Plan,
  PostFormat,
  PostHistoryItem,
  Topic,
  TopicPhoto,
  UserRole,
} from "@/lib/types";

interface SessionUser {
  id: string;
  company_id: string | null;
  role: UserRole;
  email: string;
  name: string;
}

interface WorkspaceData {
  database_mode: "supabase" | "memory";
  company: Company;
  plan: Plan;
  brand: BrandSettings;
  integrations: CompanyIntegrationsPublic;
  topics: Topic[];
  photos: TopicPhoto[];
  posts: PostHistoryItem[];
  audits: AuditLogItem[];
}

interface AdminCompanyRow extends Company {
  plan_name: string;
  plan_price: number;
  plan_limit: number;
  topics_count: number;
  integrations: CompanyIntegrationsPublic;
}

interface AdminSnapshot {
  database_mode: "supabase" | "memory";
  metrics: {
    total_companies: number;
    active_companies: number;
    trial_companies: number;
    blocked_or_due: number;
    mrr_brl: number;
    total_posts_month: number;
  };
  plans: Plan[];
  companies: AdminCompanyRow[];
  users: Array<{
    id: string;
    company_id: string | null;
    name: string;
    email: string;
    role: UserRole;
  }>;
  posts: PostHistoryItem[];
  audits: AuditLogItem[];
}

interface StudioPreviewState {
  companyId: string;
  draftPostId?: string | null;
  topicId: string | null;
  topicTitle: string;
  providerUsed: string;
  format: PostFormat;
  aspectRatio: AspectRatio;
  slidesCount: number;
  imageUrl: string;
  imageUrls: string[];
  post: GeneratedContentPayload;
  logs: string[];
}

type ClientTab =
  | "dashboard"
  | "topics"
  | "studio"
  | "brand"
  | "integrations"
  | "history";

type AdminTab = "overview" | "companies" | "plans" | "audit";

function fileToBase64(file: File): Promise<{ base64: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        base64: String(reader.result || ""),
        contentType: file.type || "image/jpeg",
      });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function daysUntil(isoDate?: string | null): number | null {
  if (!isoDate) return null;
  return Math.ceil(
    (new Date(isoDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
}

export default function SaasAppPage() {
  const [bootLoading, setBootLoading] = useState(true);
  const [databaseMode, setDatabaseMode] = useState<"supabase" | "memory">(
    "memory"
  );
  const [user, setUser] = useState<SessionUser | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [adminSnapshot, setAdminSnapshot] = useState<AdminSnapshot | null>(
    null
  );

  // Auth screen states (Entrar / Criar Conta / Recuperar Senha)
  const [authScreen, setAuthScreen] = useState<"login" | "register" | "recovery">(
    "login"
  );
  const [loginMode, setLoginMode] = useState<"credentials" | "cron">(
    "credentials"
  );
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [authFeedback, setAuthFeedback] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Register states
  const [regCompanyName, setRegCompanyName] = useState("");
  const [regName, setRegName] = useState("");
  const [regWhatsapp, setRegWhatsapp] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regAdminSecret, setRegAdminSecret] = useState("");

  // Recovery states
  const [recoveryMethod, setRecoveryMethod] = useState<"email" | "reset">(
    "email"
  );
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryAccessToken, setRecoveryAccessToken] = useState("");
  const [recoveryCronSecret, setRecoveryCronSecret] = useState("");
  const [recoveryNewPassword, setRecoveryNewPassword] = useState("");

  // Navigation
  const [viewScope, setViewScope] = useState<"client" | "admin">("client");
  const [clientTab, setClientTab] = useState<ClientTab>("dashboard");
  const [adminTab, setAdminTab] = useState<AdminTab>("overview");
  const [globalNotice, setGlobalNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Brand form
  const [brandForm, setBrandForm] = useState<BrandSettings | null>(null);
  const [savingBrand, setSavingBrand] = useState(false);

  // Integrations form
  const [integTextAi, setIntegTextAi] = useState<AIProvider>("GEMINI");
  const [integImageAi, setIntegImageAi] = useState<ImageAIProvider>("GEMINI");
  const [integGeminiKey, setIntegGeminiKey] = useState("");
  const [integOpenAiKey, setIntegOpenAiKey] = useState("");
  const [integAnthropicKey, setIntegAnthropicKey] = useState("");
  const [integMetaToken, setIntegMetaToken] = useState("");
  const [integIgUserId, setIntegIgUserId] = useState("");
  const [integFbPageId, setIntegFbPageId] = useState("");
  const [integR2AccountId, setIntegR2AccountId] = useState("");
  const [integR2Bucket, setIntegR2Bucket] = useState("");
  const [integR2PublicUrl, setIntegR2PublicUrl] = useState("");
  const [integR2AccessKey, setIntegR2AccessKey] = useState("");
  const [integR2SecretKey, setIntegR2SecretKey] = useState("");
  const [integTiktokEnabled, setIntegTiktokEnabled] = useState(false);
  const [integTiktokOpenId, setIntegTiktokOpenId] = useState("");
  const [integTiktokToken, setIntegTiktokToken] = useState("");
  const [savingInteg, setSavingInteg] = useState(false);
  const [testingInteg, setTestingInteg] = useState(false);
  const [integTestReport, setIntegTestReport] = useState<Record<
    string,
    unknown
  > | null>(null);

  // Topic Editor
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicTemplateId, setTopicTemplateId] = useState("custom");
  const [topicPrompt, setTopicPrompt] = useState("");
  const [topicPrice, setTopicPrice] = useState("");
  const [topicBenefitsText, setTopicBenefitsText] = useState("");
  const [topicFormat, setTopicFormat] = useState<PostFormat>("SINGLE");
  const [topicSlides, setTopicSlides] = useState(3);
  const [topicRatio, setTopicRatio] = useState<AspectRatio>("1:1");
  const [topicApproval, setTopicApproval] = useState<ApprovalMode>("AUTO");
  const [topicPhotoMode, setTopicPhotoMode] = useState<AIPhotoMode>("NONE");
  const [topicPhotoPrompt, setTopicPhotoPrompt] = useState("");
  const [topicDays, setTopicDays] = useState<number[]>([1, 3, 5]);
  const [topicTime, setTopicTime] = useState("10:00");
  const [topicActive, setTopicActive] = useState(true);
  const [savingTopic, setSavingTopic] = useState(false);
  const [uploadingPhotoTopicId, setUploadingPhotoTopicId] = useState<
    string | null
  >(null);

  // Studio Manual
  const [studioTopicId, setStudioTopicId] = useState<string>("__free__");
  const [studioTitle, setStudioTitle] = useState("");
  const [studioPrompt, setStudioPrompt] = useState("");
  const [studioPrice, setStudioPrice] = useState("");
  const [studioFormat, setStudioFormat] = useState<PostFormat>("SINGLE");
  const [studioSlides, setStudioSlides] = useState(3);
  const [studioRatio, setStudioRatio] = useState<AspectRatio>("1:1");
  const [studioPhotoMode, setStudioPhotoMode] = useState<AIPhotoMode>("NONE");
  const [studioPhotoPrompt, setStudioPhotoPrompt] = useState(
    AI_PHOTO_PROMPT_EXAMPLES[0].prompt
  );
  const [studioPhotoBase64, setStudioPhotoBase64] = useState<string | null>(
    null
  );
  const [studioPhotoType, setStudioPhotoType] = useState<string>("image/jpeg");
  const [studioAction, setStudioAction] = useState<
    | "idle"
    | "generating_preview"
    | "updating_art"
    | "saving_draft"
    | "publishing"
  >("idle");
  const [studioPreview, setStudioPreview] =
    useState<StudioPreviewState | null>(null);
  const [studioPublishLogs, setStudioPublishLogs] = useState<string[]>([]);
  const [approvingPostId, setApprovingPostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  // Admin: New / Edit Company
  const [admCompId, setAdmCompId] = useState<string | undefined>(undefined);
  const [admCompName, setAdmCompName] = useState("");
  const [admCompOwner, setAdmCompOwner] = useState("");
  const [admCompWhatsapp, setAdmCompWhatsapp] = useState("");
  const [admCompEmail, setAdmCompEmail] = useState("");
  const [admCompPassword, setAdmCompPassword] = useState("");
  const [admCompPlanId, setAdmCompPlanId] = useState("plan-pro");
  const [admCompStatus, setAdmCompStatus] = useState<CompanyStatus>("ACTIVE");
  const [admCompExpires, setAdmCompExpires] = useState(
    new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
  );
  const [savingAdminComp, setSavingAdminComp] = useState(false);

  const syncWorkspaceForms = useCallback((ws: WorkspaceData | null) => {
    if (!ws) return;
    setBrandForm(ws.brand);
    setIntegTextAi(ws.integrations.preferred_text_ai);
    setIntegImageAi(ws.integrations.preferred_image_ai);
    setIntegIgUserId(ws.integrations.ig_user_id || "");
    setIntegFbPageId(ws.integrations.fb_page_id || "");
    setIntegR2AccountId(ws.integrations.r2_account_id || "");
    setIntegR2Bucket(ws.integrations.r2_bucket_name || "");
    setIntegR2PublicUrl(ws.integrations.r2_public_url || "");
    setIntegR2AccessKey("");
    setIntegR2SecretKey("");
    setIntegTiktokEnabled(ws.integrations.tiktok_enabled);
    setIntegTiktokOpenId(ws.integrations.tiktok_open_id || "");
    setIntegGeminiKey("");
    setIntegOpenAiKey("");
    setIntegAnthropicKey("");
    setIntegMetaToken("");
    setIntegTiktokToken("");

    if (ws.topics.length > 0) {
      const first = ws.topics[0];
      setStudioTopicId(first.id);
      setStudioTitle(first.title);
      setStudioPrompt(first.prompt_instructions);
      setStudioPrice(first.offer_price || "");
      setStudioFormat(first.post_format);
      setStudioSlides(first.slides_count);
      setStudioRatio(first.aspect_ratio);
      setStudioPhotoMode(first.ai_photo_mode);
      setStudioPhotoPrompt(
        first.ai_photo_prompt || AI_PHOTO_PROMPT_EXAMPLES[0].prompt
      );
    }
  }, []);

  const loadState = useCallback(
    async (companyId?: string) => {
      try {
        const qs = companyId
          ? `?companyId=${encodeURIComponent(companyId)}`
          : "";
        const res = await fetch(`/api/saas/state${qs}`, { cache: "no-store" });
        const data = await res.json();
        setDatabaseMode(data.database_mode || "memory");
        if (data.authenticated) {
          setUser(data.user);
          setWorkspace(data.workspace);
          setAdminSnapshot(data.adminSnapshot || null);
          syncWorkspaceForms(data.workspace);
        } else {
          setUser(null);
          setWorkspace(null);
          setAdminSnapshot(null);
        }
      } catch {
        setGlobalNotice({
          type: "error",
          text: "Erro ao carregar dados do servidor.",
        });
      } finally {
        setBootLoading(false);
      }
    },
    [syncWorkspaceForms]
  );

  useEffect(() => {
    void loadState();
    if (typeof window !== "undefined" && window.location.hash) {
      const hashParams = new URLSearchParams(
        window.location.hash.replace(/^#/, "")
      );
      const token = hashParams.get("access_token");
      const type = hashParams.get("type");
      if (token && type === "recovery") {
        setRecoveryAccessToken(token);
        setAuthScreen("recovery");
        setRecoveryMethod("reset");
        setAuthFeedback(
          "Link de recuperação validado! Digite abaixo a sua nova senha."
        );
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, [loadState]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setAuthFeedback(null);
    setAuthSubmitting(true);
    try {
      const payload =
        loginMode === "cron"
          ? { action: "login", cronSecret: loginPassword }
          : { action: "login", email: loginEmail, password: loginPassword };

      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Falha ao autenticar.");
        return;
      }
      setDatabaseMode(data.database_mode || "memory");
      setUser(data.user);
      setWorkspace(data.workspace);
      setAdminSnapshot(data.adminSnapshot || null);
      syncWorkspaceForms(data.workspace);
      setLoginPassword("");
    } catch {
      setLoginError("Erro de conexão com o servidor.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setAuthFeedback(null);
    setAuthSubmitting(true);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          companyName: regCompanyName,
          name: regName,
          whatsapp: regWhatsapp,
          email: regEmail,
          password: regPassword,
          adminSecret: regAdminSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Não foi possível criar sua conta.");
        return;
      }
      setDatabaseMode(data.database_mode || "memory");
      setUser(data.user);
      setWorkspace(data.workspace);
      setAdminSnapshot(data.adminSnapshot || null);
      syncWorkspaceForms(data.workspace);
    } catch {
      setLoginError("Erro de conexão ao cadastrar conta.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setAuthFeedback(null);
    setAuthSubmitting(true);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "forgot_password",
          email: recoveryEmail,
          redirectTo:
            typeof window !== "undefined" ? window.location.origin : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Erro ao enviar e-mail de recuperação.");
        return;
      }
      setAuthFeedback(
        data.message || "Link de recuperação enviado para seu e-mail."
      );
    } catch {
      setLoginError("Erro de conexão com o servidor.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setAuthFeedback(null);
    setAuthSubmitting(true);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset_password",
          email: recoveryEmail,
          recoveryAccessToken,
          cronSecret: recoveryCronSecret,
          newPassword: recoveryNewPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Erro ao redefinir senha.");
        return;
      }
      setAuthFeedback(
        data.message || "Senha redefinida com sucesso! Já pode entrar."
      );
      if (data.email) setLoginEmail(data.email);
      setRecoveryAccessToken("");
      setRecoveryCronSecret("");
      setRecoveryNewPassword("");
      setAuthScreen("login");
      setLoginMode("credentials");
    } catch {
      setLoginError("Erro de conexão ao redefinir senha.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/saas/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setUser(null);
    setWorkspace(null);
    setAdminSnapshot(null);
    setStudioPreview(null);
  }

  async function handleSwitchCompany(companyId: string) {
    setGlobalNotice(null);
    const res = await fetch("/api/saas/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "switch_company", companyId }),
    });
    const data = await res.json();
    if (res.ok && data.workspace) {
      setWorkspace(data.workspace);
      syncWorkspaceForms(data.workspace);
      setViewScope("client");
      setClientTab("dashboard");
      setStudioPreview(null);
      setGlobalNotice({
        type: "success",
        text: `Visualizando painel da empresa "${data.workspace.company.name}".`,
      });
    }
  }

  async function handleSaveBrand(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !brandForm) return;
    setSavingBrand(true);
    setGlobalNotice(null);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_brand",
          companyId: workspace.company.id,
          brand: brandForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWorkspace({ ...workspace, brand: data.brand });
      setGlobalNotice({
        type: "success",
        text: "Identidade visual salva com sucesso!",
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao salvar marca.",
      });
    } finally {
      setSavingBrand(false);
    }
  }

  async function handleSaveIntegrations(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setSavingInteg(true);
    setGlobalNotice(null);
    try {
      const payload: Record<string, unknown> = {
        preferred_text_ai: integTextAi,
        preferred_image_ai: integImageAi,
        ig_user_id: integIgUserId,
        fb_page_id: integFbPageId,
        r2_account_id: integR2AccountId,
        r2_bucket_name: integR2Bucket,
        r2_public_url: integR2PublicUrl,
        tiktok_enabled: integTiktokEnabled,
        tiktok_open_id: integTiktokOpenId,
      };
      if (integGeminiKey.trim()) payload.gemini_api_key = integGeminiKey.trim();
      if (integOpenAiKey.trim()) payload.openai_api_key = integOpenAiKey.trim();
      if (integAnthropicKey.trim())
        payload.anthropic_api_key = integAnthropicKey.trim();
      if (integMetaToken.trim())
        payload.meta_access_token = integMetaToken.trim();
      if (integR2AccessKey.trim())
        payload.r2_access_key_id = integR2AccessKey.trim();
      if (integR2SecretKey.trim())
        payload.r2_secret_access_key = integR2SecretKey.trim();
      if (integTiktokToken.trim())
        payload.tiktok_access_token = integTiktokToken.trim();

      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_integrations",
          companyId: workspace.company.id,
          integrations: payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWorkspace({ ...workspace, integrations: data.integrations });
      setIntegGeminiKey("");
      setIntegOpenAiKey("");
      setIntegAnthropicKey("");
      setIntegMetaToken("");
      setIntegR2AccessKey("");
      setIntegR2SecretKey("");
      setIntegTiktokToken("");
      setGlobalNotice({
        type: "success",
        text: "Chaves criptografadas com AES-256 e salvas com sucesso!",
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao salvar integrações.",
      });
    } finally {
      setSavingInteg(false);
    }
  }

  async function handleTestIntegrations() {
    if (!workspace) return;
    setTestingInteg(true);
    setIntegTestReport(null);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_integrations",
          companyId: workspace.company.id,
        }),
      });
      const data = await res.json();
      setIntegTestReport(data.report || {});
    } finally {
      setTestingInteg(false);
    }
  }

  function startNewTopic() {
    setEditingTopicId(null);
    setTopicTitle("");
    setTopicTemplateId("custom");
    setTopicPrompt("");
    setTopicPrice("");
    setTopicBenefitsText("");
    setTopicFormat("SINGLE");
    setTopicSlides(3);
    setTopicRatio("1:1");
    setTopicApproval("AUTO");
    setTopicPhotoMode("NONE");
    setTopicPhotoPrompt(AI_PHOTO_PROMPT_EXAMPLES[0].prompt);
    setTopicDays([1, 3, 5]);
    setTopicTime("10:00");
    setTopicActive(true);
  }

  function loadTopicIntoEditor(t: Topic) {
    setEditingTopicId(t.id);
    setTopicTitle(t.title);
    setTopicTemplateId(t.niche_template || "custom");
    setTopicPrompt(t.prompt_instructions);
    setTopicPrice(t.offer_price || "");
    setTopicBenefitsText((t.benefits_json || []).join("\n"));
    setTopicFormat(t.post_format);
    setTopicSlides(t.slides_count || 3);
    setTopicRatio(t.aspect_ratio || "1:1");
    setTopicApproval(t.approval_mode || "AUTO");
    setTopicPhotoMode(t.ai_photo_mode || "NONE");
    setTopicPhotoPrompt(
      t.ai_photo_prompt || AI_PHOTO_PROMPT_EXAMPLES[0].prompt
    );
    setTopicDays(t.schedule_days || [1, 3, 5]);
    setTopicTime(t.schedule_time || "10:00");
    setTopicActive(t.is_active);
  }

  function applyNicheTemplate(templateId: string) {
    setTopicTemplateId(templateId);
    const found = NICHE_TOPIC_TEMPLATES.find((tpl) => tpl.id === templateId);
    if (!found) return;
    setTopicTitle(found.title);
    setTopicPrice(found.offer_price);
    setTopicBenefitsText(found.benefits.join("\n"));
    setTopicPrompt(found.prompt_instructions);
    setTopicPhotoPrompt(found.ai_photo_prompt);
  }

  async function handleSaveTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setSavingTopic(true);
    setGlobalNotice(null);
    try {
      const benefits = topicBenefitsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_topic",
          companyId: workspace.company.id,
          topic: {
            id: editingTopicId || undefined,
            title: topicTitle,
            niche_template: topicTemplateId,
            prompt_instructions: topicPrompt,
            offer_price: topicPrice,
            benefits_json: benefits,
            post_format: topicFormat,
            slides_count: topicFormat === "CAROUSEL" ? topicSlides : 1,
            aspect_ratio: topicRatio,
            approval_mode: topicApproval,
            ai_photo_mode: topicPhotoMode,
            ai_photo_prompt: topicPhotoPrompt,
            schedule_days: topicDays,
            schedule_time: topicTime,
            is_active: topicActive,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadState(workspace.company.id);
      setGlobalNotice({
        type: "success",
        text: `Assunto "${data.topic.title}" salvo na agenda!`,
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao salvar assunto.",
      });
    } finally {
      setSavingTopic(false);
    }
  }

  async function handleDeleteTopic(topicId: string) {
    if (!workspace) return;
    const res = await fetch("/api/saas/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete_topic",
        companyId: workspace.company.id,
        topicId,
      }),
    });
    if (res.ok) {
      await loadState(workspace.company.id);
      if (editingTopicId === topicId) startNewTopic();
    }
  }

  async function handleUploadTopicPhoto(topicId: string, file: File) {
    if (!workspace) return;
    setUploadingPhotoTopicId(topicId);
    try {
      const { base64, contentType } = await fileToBase64(file);
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upload_topic_photo",
          companyId: workspace.company.id,
          topicId,
          fileBase64: base64,
          contentType,
          aiPromptUsed: topicPhotoPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadState(workspace.company.id);
      setGlobalNotice({
        type: "success",
        text: "Foto adicionada à fila de rodízio do produto no Cloudflare R2!",
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao enviar foto.",
      });
    } finally {
      setUploadingPhotoTopicId(null);
    }
  }

  async function handleDeleteTopicPhoto(photoId: string) {
    if (!workspace) return;
    await fetch("/api/saas/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete_topic_photo",
        companyId: workspace.company.id,
        photoId,
      }),
    });
    await loadState(workspace.company.id);
  }

  function handleSelectStudioTopic(topicId: string) {
    setStudioTopicId(topicId);
    setStudioPreview(null);
    if (topicId === "__free__") {
      setStudioTitle("");
      setStudioPrompt("");
      setStudioPrice("");
      return;
    }
    const found = workspace?.topics.find((t) => t.id === topicId);
    if (!found) return;
    setStudioTitle(found.title);
    setStudioPrompt(found.prompt_instructions);
    setStudioPrice(found.offer_price || "");
    setStudioFormat(found.post_format);
    setStudioSlides(found.slides_count);
    setStudioRatio(found.aspect_ratio);
    setStudioPhotoMode(found.ai_photo_mode);
    setStudioPhotoPrompt(
      found.ai_photo_prompt || AI_PHOTO_PROMPT_EXAMPLES[0].prompt
    );
  }

  async function handleRunStudio(options: {
    previewOnly: boolean;
    useEditedContent?: boolean;
    saveAsDraft?: boolean;
  }) {
    if (!workspace) return;
    const actionKind = !options.previewOnly
      ? "publishing"
      : options.useEditedContent
      ? "updating_art"
      : "generating_preview";
    setStudioAction(actionKind);
    setGlobalNotice(null);
    setStudioPublishLogs([]);

    try {
      const payload: Record<string, unknown> = {
        companyId: workspace.company.id,
        topicId: studioTopicId !== "__free__" ? studioTopicId : undefined,
        customTitle: studioTitle || "Post Especial",
        customPrompt: studioPrompt,
        offerPrice: studioPrice,
        format: studioFormat,
        slidesCount: studioFormat === "CAROUSEL" ? studioSlides : 1,
        aspectRatio: studioRatio,
        aiPhotoMode: studioPhotoMode,
        aiPhotoPrompt: studioPhotoPrompt,
        manualPhotoBase64: studioPhotoBase64,
        manualPhotoContentType: studioPhotoType,
        previewOnly: options.previewOnly,
        saveAsDraft: Boolean(options.saveAsDraft),
      };

      if (options.useEditedContent && studioPreview) {
        payload.editedContent = {
          ...studioPreview.post,
          beneficios: (studioPreview.post.beneficios || [])
            .map((b) => b.trim())
            .filter(Boolean),
        };
        if (studioPreview.draftPostId) {
          payload.draftPostId = studioPreview.draftPostId;
        }
      }

      const res = await fetch("/api/cron/gerar-e-postar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (Array.isArray(data.logs)) setStudioPublishLogs(data.logs);
      if (!res.ok) throw new Error(data.error || "Erro ao processar post.");

      if (options.previewOnly) {
        setStudioPreview(data as StudioPreviewState);
        if (data.draftPostId) {
          await loadState(workspace.company.id);
        }
        setGlobalNotice({
          type: "success",
          text:
            options.useEditedContent && data.draftPostId
              ? "Arte atualizada e salva como rascunho (sem publicar ainda)!"
              : "Prévia gerada! Revise ou edite qualquer texto abaixo antes de salvar ou publicar.",
        });
      } else {
        setStudioPreview(data as StudioPreviewState);
        await loadState(workspace.company.id);
        setGlobalNotice({
          type: "success",
          text: "Post publicado com sucesso no Instagram e Página do Facebook!",
        });
      }
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro no Estúdio.",
      });
    } finally {
      setStudioAction("idle");
    }
  }

  function handleOpenDraftInStudio(post: PostHistoryItem) {
    const matchedTopic = post.topic_id
      ? workspace?.topics.find((t) => t.id === post.topic_id)
      : undefined;

    setStudioTopicId(matchedTopic ? matchedTopic.id : "__free__");
    setStudioTitle(matchedTopic?.title || post.headline || "");
    setStudioPrompt(matchedTopic?.prompt_instructions || "");
    setStudioPrice(matchedTopic?.offer_price || "");
    setStudioFormat(post.format);
    setStudioSlides(post.slides_count || post.image_urls_json.length || 3);
    setStudioRatio(post.aspect_ratio || "1:1");
    setStudioPhotoMode(matchedTopic?.ai_photo_mode || "NONE");
    setStudioPhotoPrompt(
      matchedTopic?.ai_photo_prompt || AI_PHOTO_PROMPT_EXAMPLES[0].prompt
    );
    setStudioPhotoBase64(null);

    const isPendingDraft = post.status === "PENDING_APPROVAL";
    setStudioPreview({
      companyId: post.company_id,
      draftPostId: isPendingDraft ? post.id : null,
      topicId: post.topic_id || null,
      topicTitle: matchedTopic?.title || post.topic_title || post.headline,
      providerUsed: post.ai_provider_used || "IA",
      format: post.format,
      aspectRatio: post.aspect_ratio,
      slidesCount: post.slides_count || post.image_urls_json.length || 1,
      imageUrl: post.image_urls_json[0] || "",
      imageUrls: post.image_urls_json || [],
      post: {
        ...post.content_json,
        beneficios: post.content_json?.beneficios || [],
        slides: post.content_json?.slides || [],
        hashtags: post.content_json?.hashtags || "",
      },
      logs: post.logs_json || [],
    });
    setStudioPublishLogs(post.logs_json || []);
    setClientTab("studio");
    setGlobalNotice({
      type: "success",
      text: isPendingDraft
        ? "Rascunho aberto no Estúdio! Edite os textos/legenda, regenere a arte se quiser e clique em Aprovar e Publicar Agora."
        : "Post carregado no Estúdio para visualização ou reaproveitamento como novo post.",
    });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleSaveDraftTextOnly() {
    if (!workspace || !studioPreview) return;
    setStudioAction("saving_draft");
    setGlobalNotice(null);
    try {
      const cleanPost = {
        ...studioPreview.post,
        beneficios: (studioPreview.post.beneficios || [])
          .map((b) => b.trim())
          .filter(Boolean),
      };
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_draft_post",
          companyId: workspace.company.id,
          postId: studioPreview.draftPostId || undefined,
          topicId: studioPreview.topicId,
          topicTitle: studioPreview.topicTitle,
          providerUsed: studioPreview.providerUsed,
          format: studioPreview.format,
          aspectRatio: studioPreview.aspectRatio,
          slidesCount: studioPreview.slidesCount,
          editedContent: cleanPost,
          imageUrls: studioPreview.imageUrls,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.post?.id) {
        setStudioPreview({
          ...studioPreview,
          draftPostId: data.post.id,
          post: cleanPost,
        });
      }
      await loadState(workspace.company.id);
      setGlobalNotice({
        type: "success",
        text: "Textos e legenda salvos no rascunho com sucesso (sem publicar ainda)!",
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao salvar rascunho.",
      });
    } finally {
      setStudioAction("idle");
    }
  }

  async function handleDeleteDraft(postId: string) {
    if (!workspace) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Deseja realmente excluir este rascunho?")
    ) {
      return;
    }
    setDeletingPostId(postId);
    setGlobalNotice(null);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_draft_post",
          companyId: workspace.company.id,
          postId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (studioPreview?.draftPostId === postId) {
        setStudioPreview(null);
      }
      await loadState(workspace.company.id);
      setGlobalNotice({
        type: "success",
        text: "Rascunho excluído com sucesso.",
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao excluir rascunho.",
      });
    } finally {
      setDeletingPostId(null);
    }
  }

  async function handleApproveDraft(
    postId: string,
    customPreview?: StudioPreviewState
  ) {
    if (!workspace) return;
    setApprovingPostId(postId);
    if (customPreview) setStudioAction("publishing");
    setGlobalNotice(null);
    try {
      const cleanEdited = customPreview
        ? {
            ...customPreview.post,
            beneficios: (customPreview.post.beneficios || [])
              .map((b) => b.trim())
              .filter(Boolean),
          }
        : undefined;
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_draft_post",
          companyId: workspace.company.id,
          postId,
          editedContent: cleanEdited,
          imageUrls: customPreview?.imageUrls,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (Array.isArray(data.post?.logs_json)) {
        setStudioPublishLogs(data.post.logs_json);
      }
      if (studioPreview?.draftPostId === postId) {
        setStudioPreview(null);
      }
      await loadState(workspace.company.id);
      setGlobalNotice({
        type: "success",
        text: "Rascunho aprovado e publicado no Instagram e Facebook!",
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao publicar rascunho.",
      });
    } finally {
      setApprovingPostId(null);
      setStudioAction("idle");
    }
  }

  async function handleAdminSaveCompany(e: React.FormEvent) {
    e.preventDefault();
    setSavingAdminComp(true);
    setGlobalNotice(null);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "admin_save_company",
          company: {
            id: admCompId,
            name: admCompName,
            owner_name: admCompOwner,
            owner_whatsapp: admCompWhatsapp,
            admin_email: admCompEmail,
            admin_password: admCompPassword,
            plan_id: admCompPlanId,
            status: admCompStatus,
            expires_at: new Date(`${admCompExpires}T23:59:59Z`).toISOString(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAdminSnapshot(data.adminSnapshot);
      setAdmCompId(undefined);
      setAdmCompName("");
      setAdmCompOwner("");
      setAdmCompWhatsapp("");
      setAdmCompEmail("");
      setAdmCompPassword("");
      setGlobalNotice({
        type: "success",
        text: `Empresa "${data.company.name}" salva no SaaS!`,
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao salvar empresa.",
      });
    } finally {
      setSavingAdminComp(false);
    }
  }

  async function handleAdminQuickToggleBlock(c: AdminCompanyRow) {
    const nextStatus: CompanyStatus =
      c.status === "BLOCKED" ? "ACTIVE" : "BLOCKED";
    const res = await fetch("/api/saas/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "admin_save_company",
        company: {
          id: c.id,
          name: c.name,
          plan_id: c.plan_id,
          status: nextStatus,
          expires_at: c.expires_at,
        },
      }),
    });
    const data = await res.json();
    if (res.ok && data.adminSnapshot) setAdminSnapshot(data.adminSnapshot);
  }

  async function handleAdminSavePlan(p: Plan) {
    const res = await fetch("/api/saas/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "admin_save_plan", plan: p }),
    });
    const data = await res.json();
    if (res.ok && data.adminSnapshot) {
      setAdminSnapshot(data.adminSnapshot);
      setGlobalNotice({
        type: "success",
        text: `Plano "${p.name}" atualizado!`,
      });
    }
  }

  if (bootLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-indigo-100 bg-white/90 px-6 py-4 shadow-lg shadow-indigo-500/10">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <span className="text-sm font-semibold text-slate-700">
            Carregando Social Autopilot SaaS...
          </span>
        </div>
      </div>
    );
  }

  // ==================== TELA DE LOGIN / CADASTRO / RECUPERAÇÃO ====================
  if (!user || !workspace) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-3xl border border-white/80 bg-white/90 p-8 shadow-2xl shadow-indigo-500/10 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-500 text-lg font-extrabold text-white shadow-lg shadow-indigo-500/30">
              SA
            </div>
            <div>
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                Multi-IA &amp; Multi-Empresas
              </span>
              <h1 className="text-xl font-extrabold text-slate-900">
                Social Autopilot SaaS
              </h1>
            </div>
          </div>

          {/* Navegação Principal da Tela de Acesso */}
          <div className="mt-5 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1">
            {(
              [
                ["login", "Entrar"],
                ["register", "Criar Conta"],
                ["recovery", "Recuperar Senha"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setAuthScreen(key);
                  setLoginError(null);
                  setAuthFeedback(null);
                }}
                className={`rounded-lg py-2 text-xs font-bold transition ${
                  authScreen === key
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {authFeedback && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
              {authFeedback}
            </div>
          )}

          {loginError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
              {loginError}
            </div>
          )}

          {/* TELA 1: ENTRAR */}
          {authScreen === "login" && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-indigo-50/70 p-1">
                <button
                  type="button"
                  onClick={() => setLoginMode("credentials")}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition ${
                    loginMode === "credentials"
                      ? "bg-white text-indigo-700 shadow-xs"
                      : "text-slate-600"
                  }`}
                >
                  E-mail e Senha
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMode("cron")}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition ${
                    loginMode === "cron"
                      ? "bg-white text-indigo-700 shadow-xs"
                      : "text-slate-600"
                  }`}
                >
                  Token CRON_SECRET
                </button>
              </div>

              <form onSubmit={handleLogin} className="mt-4 space-y-4">
                {loginMode === "credentials" && (
                  <div>
                    <label
                      htmlFor="login-email"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-600"
                    >
                      E-mail
                    </label>
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="Digite seu e-mail..."
                      required
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-600"
                    >
                      {loginMode === "cron" ? "Token CRON_SECRET" : "Senha"}
                    </label>
                    {loginMode === "credentials" && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthScreen("recovery");
                          setRecoveryEmail(loginEmail);
                          setLoginError(null);
                        }}
                        className="text-[11px] font-bold text-indigo-600 hover:underline"
                      >
                        Esqueci minha senha
                      </button>
                    )}
                  </div>
                  <div className="relative mt-1.5">
                    <input
                      id="login-password"
                      name="password"
                      type={showAuthPassword ? "text" : "password"}
                      autoComplete={
                        loginMode === "cron" ? "off" : "current-password"
                      }
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      placeholder={
                        loginMode === "cron"
                          ? "Cole seu CRON_SECRET..."
                          : "Digite sua senha..."
                      }
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 pr-20 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAuthPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 hover:text-slate-800"
                    >
                      {showAuthPassword ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:opacity-95 disabled:opacity-60"
                >
                  {authSubmitting ? "Autenticando..." : "Entrar no Painel"}
                </button>
              </form>
            </>
          )}

          {/* TELA 2: CRIAR CONTA (SINCRONIZADA COM SUPABASE AUTH) */}
          {authScreen === "register" && (
            <form onSubmit={handleRegister} className="mt-4 space-y-3">
              <p className="text-xs text-slate-600">
                Cadastre sua empresa no <strong>Supabase Authentication</strong>{" "}
                com 14 dias de teste grátis no plano Pro IA.
              </p>
              <input
                type="text"
                value={regCompanyName}
                onChange={(e) => setRegCompanyName(e.target.value)}
                placeholder="Nome da Empresa (ex: Loja Vitrine)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Seu Nome"
                  className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
                />
                <input
                  type="text"
                  value={regWhatsapp}
                  onChange={(e) => setRegWhatsapp(e.target.value)}
                  placeholder="WhatsApp (DDD)"
                  className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>
              <input
                type="email"
                required
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="Seu melhor e-mail"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
              />
              <input
                type="password"
                required
                minLength={6}
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Crie uma senha (mín. 6 caracteres)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
              />
              <input
                type="password"
                value={regAdminSecret}
                onChange={(e) => setRegAdminSecret(e.target.value)}
                placeholder="Código Super Admin (opcional — só p/ agência)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs outline-none focus:border-indigo-500 focus:bg-white"
              />
              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:opacity-95 disabled:opacity-60"
              >
                {authSubmitting ? "Criando conta..." : "Cadastrar e Entrar"}
              </button>
            </form>
          )}

          {/* TELA 3: RECUPERAR SENHA (E-MAIL SUPABASE OU REDEFINIÇÃO IMEDIATA) */}
          {authScreen === "recovery" && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-indigo-50/70 p-1">
                <button
                  type="button"
                  onClick={() => setRecoveryMethod("email")}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition ${
                    recoveryMethod === "email"
                      ? "bg-white text-indigo-700 shadow-xs"
                      : "text-slate-600"
                  }`}
                >
                  Enviar Link p/ E-mail
                </button>
                <button
                  type="button"
                  onClick={() => setRecoveryMethod("reset")}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition ${
                    recoveryMethod === "reset"
                      ? "bg-white text-indigo-700 shadow-xs"
                      : "text-slate-600"
                  }`}
                >
                  Definir Nova Senha
                </button>
              </div>

              {recoveryMethod === "email" ? (
                <form onSubmit={handleForgotPassword} className="space-y-3">
                  <p className="text-xs text-slate-600">
                    O <strong>Supabase Authentication</strong> enviará um link
                    seguro para você redefinir sua senha.
                  </p>
                  <input
                    type="email"
                    required
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    placeholder="E-mail da conta"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:bg-white"
                  />
                  <button
                    type="submit"
                    disabled={authSubmitting}
                    className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 py-3 text-sm font-bold text-white shadow-md"
                  >
                    {authSubmitting
                      ? "Enviando..."
                      : "Enviar E-mail de Recuperação"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-3">
                  {!recoveryAccessToken ? (
                    <>
                      <p className="text-xs text-slate-600">
                        Se você é o administrador e ainda não configurou SMTP no
                        Supabase, redefina usando seu <code>CRON_SECRET</code>:
                      </p>
                      <input
                        type="email"
                        required
                        value={recoveryEmail}
                        onChange={(e) => setRecoveryEmail(e.target.value)}
                        placeholder="E-mail da conta"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
                      />
                      <input
                        type="password"
                        required
                        value={recoveryCronSecret}
                        onChange={(e) => setRecoveryCronSecret(e.target.value)}
                        placeholder="Cole o CRON_SECRET para autorizar"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
                      />
                    </>
                  ) : (
                    <p className="text-xs font-semibold text-emerald-700">
                      Token de recuperação do e-mail ativo! Escolha sua nova
                      senha abaixo:
                    </p>
                  )}

                  <input
                    type="password"
                    required
                    minLength={6}
                    value={recoveryNewPassword}
                    onChange={(e) => setRecoveryNewPassword(e.target.value)}
                    placeholder="Nova senha (mín. 6 caracteres)"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
                  />
                  <button
                    type="submit"
                    disabled={authSubmitting}
                    className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-md hover:bg-emerald-700"
                  >
                    {authSubmitting ? "Salvando..." : "Salvar Nova Senha"}
                  </button>
                </form>
              )}
            </div>
          )}

          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-[11px] text-slate-500">
            <span>Meu Gestor Digital</span>
            <span>
              Banco:{" "}
              <strong className="text-slate-700">
                {databaseMode === "supabase"
                  ? "Supabase Auth + DB"
                  : "Modo Demonstração Local"}
              </strong>
            </span>
          </div>
        </div>
      </main>
    );
  }

  const pendingDrafts = workspace.posts.filter(
    (p) => p.status === "PENDING_APPROVAL"
  );
  const metaDaysLeft = daysUntil(workspace.integrations.meta_token_expires_at);
  const planDaysLeft = daysUntil(workspace.company.expires_at);

  // ==================== INTERFACE LOGADA LUMINOSA ====================
  return (
    <div className="min-h-screen pb-16">
      {/* Barra Superior Glass */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-500 text-sm font-extrabold text-white shadow-md shadow-indigo-500/25">
              SA
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-slate-900">
                  Social Autopilot SaaS
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    databaseMode === "supabase"
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                  }`}
                >
                  {databaseMode === "supabase"
                    ? "Supabase Ativo"
                    : "Memória (Falta Supabase)"}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Empresa ativa:{" "}
                <strong className="text-indigo-700">
                  {workspace.company.name}
                </strong>{" "}
                • Plano {workspace.plan.name}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {user.role === "SUPER_ADMIN" && adminSnapshot && (
              <>
                <select
                  value={workspace.company.id}
                  onChange={(e) => handleSwitchCompany(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
                  title="Trocar empresa ativa (Impersonate)"
                >
                  {adminSnapshot.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      Empresa: {c.name} ({c.status})
                    </option>
                  ))}
                </select>

                <div className="flex rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setViewScope("client")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      viewScope === "client"
                        ? "bg-white text-indigo-700 shadow-sm"
                        : "text-slate-600"
                    }`}
                  >
                    Painel da Empresa
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewScope("admin")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      viewScope === "admin"
                        ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm"
                        : "text-slate-600"
                    }`}
                  >
                    Super Admin
                  </button>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 pt-6 md:px-8">
        {databaseMode === "memory" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-xs text-amber-900 shadow-sm">
            <strong>Modo Demonstração:</strong> As variáveis{" "}
            <code>SUPABASE_URL</code> e <code>SUPABASE_SERVICE_ROLE_KEY</code>{" "}
            ainda não foram configuradas no ambiente. Você já pode testar todas
            as telas; assim que rodar o arquivo{" "}
            <code>supabase/schema.sql</code> no Supabase e adicionar essas duas
            variáveis, todos os dados ficam persistidos permanentemente no seu
            banco gratuito!
          </div>
        )}

        {globalNotice && (
          <div
            className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm ${
              globalNotice.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            <span>{globalNotice.text}</span>
            <button
              type="button"
              onClick={() => setGlobalNotice(null)}
              className="ml-4 text-xs underline opacity-75"
            >
              Fechar
            </button>
          </div>
        )}

        {/* ==================== VISÃO SUPER ADMIN ==================== */}
        {viewScope === "admin" && user.role === "SUPER_ADMIN" && adminSnapshot && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["overview", "Dashboard Executivo SaaS"],
                  ["companies", "Empresas Clientes"],
                  ["plans", "Planos & Limites"],
                  ["audit", "Auditoria & Logs Globais"],
                ] as Array<[AdminTab, string]>
              ).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setAdminTab(tabKey)}
                  className={`rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                    adminTab === tabKey
                      ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {adminTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      MRR Estimado (Ativas)
                    </p>
                    <p className="mt-2 text-3xl font-extrabold text-emerald-600">
                      R$ {adminSnapshot.metrics.mrr_brl.toFixed(2)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {adminSnapshot.metrics.active_companies} empresas pagantes
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Total de Empresas
                    </p>
                    <p className="mt-2 text-3xl font-extrabold text-indigo-600">
                      {adminSnapshot.metrics.total_companies}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {adminSnapshot.metrics.trial_companies} em Trial •{" "}
                      {adminSnapshot.metrics.blocked_or_due} bloqueadas/vencidas
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Posts Publicados (Mês)
                    </p>
                    <p className="mt-2 text-3xl font-extrabold text-cyan-600">
                      {adminSnapshot.metrics.total_posts_month}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Mídias 100% no Cloudflare R2
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Infraestrutura Free
                    </p>
                    <p className="mt-2 text-xl font-extrabold text-slate-900">
                      {databaseMode === "supabase"
                        ? "Supabase + R2 OK"
                        : "Aguardando Supabase"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Auditoria com retenção de 90 dias
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                  <h2 className="text-base font-extrabold text-slate-900">
                    Saúde Rápida das Empresas
                  </h2>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="pb-2">Empresa</th>
                          <th className="pb-2">Plano</th>
                          <th className="pb-2">Uso Mês</th>
                          <th className="pb-2">Vencimento</th>
                          <th className="pb-2">Status</th>
                          <th className="pb-2 text-right">Acesso</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {adminSnapshot.companies.map((c) => (
                          <tr key={c.id}>
                            <td className="py-3 font-bold text-slate-900">
                              {c.name}
                            </td>
                            <td className="py-3">{c.plan_name}</td>
                            <td className="py-3">
                              {c.posts_used_month}/{c.plan_limit}
                            </td>
                            <td className="py-3">
                              {new Date(c.expires_at).toLocaleDateString(
                                "pt-BR"
                              )}
                            </td>
                            <td className="py-3">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  c.status === "ACTIVE"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : c.status === "TRIAL"
                                    ? "bg-cyan-50 text-cyan-700"
                                    : "bg-rose-50 text-rose-700"
                                }`}
                              >
                                {c.status}
                              </span>
                            </td>
                            <td className="py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleSwitchCompany(c.id)}
                                className="rounded-lg bg-indigo-50 px-3 py-1 font-bold text-indigo-700 hover:bg-indigo-100"
                              >
                                Entrar no Painel
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {adminTab === "companies" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <form
                  onSubmit={handleAdminSaveCompany}
                  className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-4"
                >
                  <h2 className="text-base font-extrabold text-slate-900">
                    {admCompId ? "Editar Empresa" : "Cadastrar Nova Empresa"}
                  </h2>
                  <input
                    placeholder="Nome da Empresa (ex: Loja Bella)"
                    value={admCompName}
                    onChange={(e) => setAdmCompName(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  />
                  <input
                    placeholder="Nome do Responsável"
                    value={admCompOwner}
                    onChange={(e) => setAdmCompOwner(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  />
                  <input
                    placeholder="WhatsApp (com DDD)"
                    value={admCompWhatsapp}
                    onChange={(e) => setAdmCompWhatsapp(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={admCompPlanId}
                      onChange={(e) => setAdmCompPlanId(e.target.value)}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold outline-none focus:border-indigo-500"
                    >
                      {adminSnapshot.plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (R${p.price_brl})
                        </option>
                      ))}
                    </select>
                    <select
                      value={admCompStatus}
                      onChange={(e) =>
                        setAdmCompStatus(e.target.value as CompanyStatus)
                      }
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold outline-none focus:border-indigo-500"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="TRIAL">TRIAL</option>
                      <option value="PAST_DUE">PAST_DUE</option>
                      <option value="BLOCKED">BLOCKED</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Data de Vencimento
                    </label>
                    <input
                      type="date"
                      value={admCompExpires}
                      onChange={(e) => setAdmCompExpires(e.target.value)}
                      required
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <p className="mb-2 text-xs font-bold text-indigo-700">
                      Login da Empresa (Opcional ao editar)
                    </p>
                    <input
                      type="email"
                      placeholder="E-mail de acesso do cliente"
                      value={admCompEmail}
                      onChange={(e) => setAdmCompEmail(e.target.value)}
                      className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                    <input
                      type="password"
                      placeholder="Senha de acesso"
                      value={admCompPassword}
                      onChange={(e) => setAdmCompPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingAdminComp}
                    className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-xs font-bold text-white shadow-md"
                  >
                    {savingAdminComp
                      ? "Salvando..."
                      : admCompId
                      ? "Atualizar Empresa"
                      : "Criar Empresa & Login"}
                  </button>
                </form>

                <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-8">
                  <h2 className="text-base font-extrabold text-slate-900">
                    Empresas Cadastradas ({adminSnapshot.companies.length})
                  </h2>
                  <div className="space-y-3">
                    {adminSnapshot.companies.map((c) => (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold text-slate-900">
                              {c.name}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                c.status === "ACTIVE"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : c.status === "TRIAL"
                                  ? "bg-cyan-100 text-cyan-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {c.status}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">
                            Plano: <strong>{c.plan_name}</strong> • Uso:{" "}
                            {c.posts_used_month}/{c.plan_limit} posts • Vence em{" "}
                            {new Date(c.expires_at).toLocaleDateString("pt-BR")}{" "}
                            • Assuntos: {c.topics_count}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleSwitchCompany(c.id)}
                            className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                          >
                            Acessar como Cliente
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAdmCompId(c.id);
                              setAdmCompName(c.name);
                              setAdmCompOwner(c.owner_name || "");
                              setAdmCompWhatsapp(c.owner_whatsapp || "");
                              setAdmCompPlanId(c.plan_id);
                              setAdmCompStatus(c.status);
                              setAdmCompExpires(c.expires_at.slice(0, 10));
                            }}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdminQuickToggleBlock(c)}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700"
                          >
                            {c.status === "BLOCKED"
                              ? "Desbloquear"
                              : "Bloquear"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {adminTab === "plans" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {adminSnapshot.plans.map((p) => (
                  <div
                    key={p.id}
                    className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                  >
                    <h3 className="text-lg font-extrabold text-slate-900">
                      {p.name}
                    </h3>
                    <p className="text-2xl font-extrabold text-indigo-600">
                      R$ {Number(p.price_brl).toFixed(2)}/mês
                    </p>
                    <ul className="space-y-1 text-xs text-slate-600">
                      <li>Limite: {p.max_posts_month} posts/mês</li>
                      <li>
                        Carrosséis: {p.allow_carousel ? "Liberado" : "Bloqueado"}
                      </li>
                      <li>
                        Foto com IA:{" "}
                        {p.allow_ai_photo ? "Liberado" : "Bloqueado"}
                      </li>
                      <li>
                        Multi-IA (Claude/GPT/Gemini):{" "}
                        {p.allow_multi_ai ? "Liberado" : "Bloqueado"}
                      </li>
                    </ul>
                    <button
                      type="button"
                      onClick={() => {
                        const newLimit = prompt(
                          `Novo limite mensal para ${p.name}:`,
                          String(p.max_posts_month)
                        );
                        if (newLimit && !Number.isNaN(Number(newLimit))) {
                          void handleAdminSavePlan({
                            ...p,
                            max_posts_month: Number(newLimit),
                          });
                        }
                      }}
                      className="w-full rounded-xl border border-indigo-200 bg-indigo-50 py-2 text-xs font-bold text-indigo-700"
                    >
                      Ajustar Limite Mensal
                    </button>
                  </div>
                ))}
              </div>
            )}

            {adminTab === "audit" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-extrabold text-slate-900">
                  Auditoria Global (Últimos Eventos)
                </h2>
                <div className="mt-4 space-y-2">
                  {adminSnapshot.audits.map((a) => (
                    <div
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-xs"
                    >
                      <div>
                        <span className="rounded bg-indigo-100 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-800">
                          {a.action}
                        </span>{" "}
                        <span className="ml-2 text-slate-600">
                          {JSON.stringify(a.details_json)}
                        </span>
                      </div>
                      <span className="text-slate-400">
                        {new Date(a.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== VISÃO EMPRESA CLIENTE ==================== */}
        {viewScope === "client" && (
          <div className="space-y-6">
            {/* Abas Cliente */}
            <nav className="flex flex-wrap gap-2">
              {(
                [
                  ["dashboard", "Dashboard da Empresa"],
                  ["topics", "Meus Assuntos & Produtos"],
                  ["studio", "Estúdio Manual (Preview)"],
                  ["brand", "Identidade Visual"],
                  ["integrations", "Integrações (Multi-IA & Redes)"],
                  ["history", "Histórico de Posts"],
                ] as Array<[ClientTab, string]>
              ).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setClientTab(tabKey)}
                  className={`rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                    clientTab === tabKey
                      ? "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 text-white shadow-md shadow-indigo-500/20"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {label}
                  {tabKey === "dashboard" && pendingDrafts.length > 0 && (
                    <span className="ml-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] text-slate-900">
                      {pendingDrafts.length}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            {/* ---------- ABA 1: DASHBOARD DA EMPRESA ---------- */}
            {clientTab === "dashboard" && (
              <div className="space-y-6">
                {metaDaysLeft !== null && metaDaysLeft <= 7 && (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                    Alerta de Validade Meta: seu token expira em{" "}
                    {metaDaysLeft} dia(s). Vá em{" "}
                    <button
                      type="button"
                      onClick={() => setClientTab("integrations")}
                      className="underline"
                    >
                      Integrações
                    </button>{" "}
                    para atualizar com um Token Permanente.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Uso do Plano ({workspace.plan.name})
                    </p>
                    <p className="mt-2 text-2xl font-extrabold text-indigo-600">
                      {workspace.company.posts_used_month} /{" "}
                      {workspace.plan.max_posts_month} posts
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Vence em{" "}
                      {new Date(workspace.company.expires_at).toLocaleDateString(
                        "pt-BR"
                      )}{" "}
                      ({planDaysLeft ?? 0} dias)
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      IA Conectada ({workspace.integrations.preferred_text_ai})
                    </p>
                    <p className="mt-2 text-lg font-extrabold text-slate-900">
                      {workspace.integrations.has_gemini_key ||
                      workspace.integrations.has_openai_key ||
                      workspace.integrations.has_anthropic_key ? (
                        <span className="text-emerald-600">Chave Ativa</span>
                      ) : (
                        <span className="text-rose-600">Configurar Chave</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Gemini:{" "}
                      {workspace.integrations.has_gemini_key ? "OK" : "—"} •
                      GPT: {workspace.integrations.has_openai_key ? "OK" : "—"}{" "}
                      • Claude:{" "}
                      {workspace.integrations.has_anthropic_key ? "OK" : "—"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Instagram &amp; Facebook
                    </p>
                    <p className="mt-2 text-lg font-extrabold">
                      {workspace.integrations.has_meta_token &&
                      workspace.integrations.ig_user_id ? (
                        <span className="text-emerald-600">Conectado</span>
                      ) : (
                        <span className="text-amber-600">Pendente</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      R2:{" "}
                      {workspace.integrations.has_r2_access_key &&
                      workspace.integrations.r2_bucket_name
                        ? "Próprio"
                        : workspace.integrations.using_global_r2_fallback
                        ? "Padrão"
                        : "Pendente"}{" "}
                      • TikTok:{" "}
                      {workspace.integrations.tiktok_enabled
                        ? "Ativado"
                        : "Pronto p/ conectar"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Assuntos Ativos
                    </p>
                    <p className="mt-2 text-2xl font-extrabold text-cyan-600">
                      {workspace.topics.filter((t) => t.is_active).length} temas
                    </p>
                    <button
                      type="button"
                      onClick={() => setClientTab("studio")}
                      className="mt-1 text-xs font-bold text-indigo-600 hover:underline"
                    >
                      Abrir Estúdio Manual →
                    </button>
                  </div>
                </div>

                {/* Rascunhos Aguardando Aprovação */}
                {pendingDrafts.length > 0 && (
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-base font-extrabold text-indigo-950">
                        Rascunhos Aguardando Sua Aprovação ({pendingDrafts.length})
                      </h2>
                      <span className="text-xs font-semibold text-indigo-700">
                        Clique na imagem ou em &quot;Visualizar &amp; Editar&quot; para abrir, ampliar e ajustar textos antes de publicar
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      {pendingDrafts.map((d) => (
                        <div
                          key={d.id}
                          className="flex flex-col gap-3 rounded-2xl border border-white bg-white p-4 shadow-sm transition hover:border-indigo-300"
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => handleOpenDraftInStudio(d)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleOpenDraftInStudio(d);
                              }
                            }}
                            className="flex cursor-pointer gap-4 text-left group"
                            title="Clique para visualizar todas as artes e editar textos no Estúdio"
                          >
                            {d.image_urls_json[0] && (
                              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={d.image_urls_json[0]}
                                  alt={d.headline}
                                  className="h-full w-full object-cover transition group-hover:scale-105"
                                />
                                <span className="absolute bottom-1 right-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                  {d.image_urls_json.length > 1
                                    ? `${d.image_urls_json.length} slides`
                                    : "Ampliar"}
                                </span>
                              </div>
                            )}
                            <div className="flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                  {d.format === "CAROUSEL"
                                    ? `Carrossel (${d.slides_count}x)`
                                    : "Imagem Única"}{" "}
                                  • {d.aspect_ratio}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-400">
                                  {new Date(d.created_at).toLocaleString("pt-BR")}
                                </span>
                              </div>
                              <p className="text-sm font-extrabold text-slate-900 group-hover:text-indigo-700">
                                {d.headline}
                              </p>
                              <p className="line-clamp-2 text-xs text-slate-600">
                                {d.content_json.legenda}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                            <button
                              type="button"
                              onClick={() => handleOpenDraftInStudio(d)}
                              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                            >
                              Visualizar &amp; Editar
                            </button>
                            <button
                              type="button"
                              disabled={approvingPostId === d.id}
                              onClick={() => handleApproveDraft(d.id)}
                              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {approvingPostId === d.id
                                ? "Publicando..."
                                : "Aprovar e Publicar Agora"}
                            </button>
                            <button
                              type="button"
                              disabled={deletingPostId === d.id}
                              onClick={() => handleDeleteDraft(d.id)}
                              className="ml-auto rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                            >
                              {deletingPostId === d.id ? "..." : "Excluir"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grade Semanal */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-extrabold text-slate-900">
                      Grade Semanal de Postagens Automáticas
                    </h2>
                    <button
                      type="button"
                      onClick={() => setClientTab("topics")}
                      className="text-xs font-bold text-indigo-600 hover:underline"
                    >
                      Editar Assuntos &amp; Horários →
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
                    {WEEKDAY_LABELS.map((day) => {
                      const dayTopics = workspace.topics.filter(
                        (t) =>
                          t.is_active && t.schedule_days.includes(day.value)
                      );
                      return (
                        <div
                          key={day.value}
                          className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                        >
                          <p className="text-xs font-extrabold uppercase text-slate-700">
                            {day.full}
                          </p>
                          <div className="mt-2 space-y-1.5">
                            {dayTopics.length === 0 ? (
                              <p className="text-[11px] text-slate-400">
                                Sem agendamento
                              </p>
                            ) : (
                              dayTopics.map((t) => (
                                <div
                                  key={`${day.value}-${t.id}`}
                                  className="rounded-lg border border-indigo-100 bg-white p-2 text-[11px] shadow-xs"
                                >
                                  <span className="font-bold text-indigo-700">
                                    {t.schedule_time}
                                  </span>{" "}
                                  <span className="font-semibold text-slate-800">
                                    {t.title}
                                  </span>
                                  <p className="mt-0.5 text-[10px] text-slate-500">
                                    {t.post_format === "CAROUSEL"
                                      ? `Carrossel ${t.slides_count}x`
                                      : "Imagem"}{" "}
                                    • {t.aspect_ratio}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ---------- ABA 2: MEUS ASSUNTOS & PRODUTOS ---------- */}
            {clientTab === "topics" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Lista de assuntos */}
                <div className="space-y-3 lg:col-span-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-extrabold text-slate-900">
                      Assuntos &amp; Produtos ({workspace.topics.length})
                    </h2>
                    <button
                      type="button"
                      onClick={startNewTopic}
                      className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white"
                    >
                      + Novo Assunto
                    </button>
                  </div>

                  {workspace.topics.map((t) => {
                    const topicPhotos = workspace.photos.filter(
                      (p) => p.topic_id === t.id
                    );
                    return (
                      <div
                        key={t.id}
                        className={`rounded-2xl border p-4 transition ${
                          editingTopicId === t.id
                            ? "border-indigo-500 bg-indigo-50/40 shadow-sm"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-extrabold text-slate-900">
                                {t.title}
                              </h3>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  t.is_active
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-slate-200 text-slate-600"
                                }`}
                              >
                                {t.is_active ? "Ativo" : "Pausado"}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600">
                              Dias:{" "}
                              {t.schedule_days
                                .map(
                                  (d) =>
                                    WEEKDAY_LABELS.find((w) => w.value === d)
                                      ?.short
                                )
                                .join(", ")}{" "}
                              às <strong>{t.schedule_time}</strong> •{" "}
                              {t.post_format === "CAROUSEL"
                                ? `Carrossel (${t.slides_count} slides)`
                                : "Imagem Única"}{" "}
                              • {t.aspect_ratio}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              Modo:{" "}
                              {t.approval_mode === "DRAFT"
                                ? "Aprovação Manual"
                                : "100% Automático"}{" "}
                              • Fotos na fila: {topicPhotos.length}
                            </p>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => loadTopicIntoEditor(t)}
                              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-indigo-100 hover:text-indigo-700"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTopic(t.id)}
                              className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700"
                            >
                              Excluir
                            </button>
                          </div>
                        </div>

                        {/* Upload rápido de foto do produto para esse assunto */}
                        <div className="mt-3 border-t border-slate-100 pt-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-slate-600">
                              Fotos do Produto (Fila sem Repetição):
                            </span>
                            <label className="cursor-pointer rounded-lg bg-cyan-50 px-2.5 py-1 text-[11px] font-bold text-cyan-800 hover:bg-cyan-100">
                              {uploadingPhotoTopicId === t.id
                                ? "Enviando ao R2..."
                                : "+ Subir Foto Original"}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void handleUploadTopicPhoto(t.id, f);
                                }}
                              />
                            </label>
                          </div>
                          {topicPhotos.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {topicPhotos.map((ph) => (
                                <div
                                  key={ph.id}
                                  className="relative h-14 w-14 overflow-hidden rounded-lg border border-slate-200"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={ph.enhanced_url || ph.original_url}
                                    alt="Produto"
                                    className="h-full w-full object-cover"
                                  />
                                  <span className="absolute bottom-0 left-0 bg-slate-900/75 px-1 text-[9px] text-white">
                                    {ph.times_used}x
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteTopicPhoto(ph.id)
                                    }
                                    className="absolute right-0 top-0 bg-rose-600 px-1 text-[9px] font-bold text-white"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Editor de Assunto */}
                <form
                  onSubmit={handleSaveTopic}
                  className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-7"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-extrabold text-slate-900">
                      {editingTopicId
                        ? "Editar Assunto / Produto"
                        : "Criar Novo Assunto / Produto"}
                    </h2>
                    <select
                      value={topicTemplateId}
                      onChange={(e) => applyNicheTemplate(e.target.value)}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-800 outline-none"
                    >
                      <option value="custom">
                        Carregar Exemplo de Prompt...
                      </option>
                      {NICHE_TOPIC_TEMPLATES.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        Nome do Assunto / Produto
                      </label>
                      <input
                        value={topicTitle}
                        onChange={(e) => setTopicTitle(e.target.value)}
                        required
                        placeholder="Ex: Calçados Femininos ou Tráfego Pago"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        Preço / Condição na Arte (Opcional)
                      </label>
                      <input
                        value={topicPrice}
                        onChange={(e) => setTopicPrice(e.target.value)}
                        placeholder="Ex: 12x de R$149,90 ou A partir de R$99"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Prompt / Briefing para a IA
                    </label>
                    <textarea
                      rows={3}
                      value={topicPrompt}
                      onChange={(e) => setTopicPrompt(e.target.value)}
                      required
                      placeholder="Descreva o produto/serviço, público-alvo, dores e oferta..."
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Benefícios / Diferenciais (1 por linha)
                    </label>
                    <textarea
                      rows={3}
                      value={topicBenefitsText}
                      onChange={(e) => setTopicBenefitsText(e.target.value)}
                      placeholder="Entrega rápida&#10;Garantia de 30 dias&#10;Atendimento no WhatsApp"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Dias da Semana e Horário */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                      Dia e Hora Exclusivos Deste Assunto (Horário de Brasília)
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {WEEKDAY_LABELS.map((d) => {
                        const checked = topicDays.includes(d.value);
                        return (
                          <button
                            key={d.value}
                            type="button"
                            onClick={() =>
                              setTopicDays((prev) =>
                                checked
                                  ? prev.filter((x) => x !== d.value)
                                  : [...prev, d.value].sort()
                              )
                            }
                            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                              checked
                                ? "bg-indigo-600 text-white"
                                : "border border-slate-200 bg-white text-slate-600"
                            }`}
                          >
                            {d.short}
                          </button>
                        );
                      })}
                      <select
                        value={topicTime}
                        onChange={(e) => setTopicTime(e.target.value)}
                        className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800"
                      >
                        {SCHEDULE_TIME_SLOTS.map((slot) => (
                          <option key={slot} value={slot}>
                            {slot}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Formato, Proporção e Modo */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        Formato
                      </label>
                      <select
                        value={topicFormat}
                        onChange={(e) =>
                          setTopicFormat(e.target.value as PostFormat)
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-bold"
                      >
                        <option value="SINGLE">Imagem Única</option>
                        <option value="CAROUSEL">Carrossel</option>
                      </select>
                    </div>

                    {topicFormat === "CAROUSEL" && (
                      <div>
                        <label className="block text-xs font-bold text-slate-600">
                          Qtd. Slides (2-8)
                        </label>
                        <input
                          type="number"
                          min={2}
                          max={8}
                          value={topicSlides}
                          onChange={(e) =>
                            setTopicSlides(Number(e.target.value))
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-bold"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        Proporção
                      </label>
                      <select
                        value={topicRatio}
                        onChange={(e) =>
                          setTopicRatio(e.target.value as AspectRatio)
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-bold"
                      >
                        <option value="1:1">1080×1080 (1:1)</option>
                        <option value="4:5">1080×1350 (4:5 Feed)</option>
                        <option value="9:16">1080×1920 (9:16 Stories/TikTok)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        Automação
                      </label>
                      <select
                        value={topicApproval}
                        onChange={(e) =>
                          setTopicApproval(e.target.value as ApprovalMode)
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-bold"
                      >
                        <option value="AUTO">100% Automático</option>
                        <option value="DRAFT">Aprovar Antes (Rascunho)</option>
                      </select>
                    </div>
                  </div>

                  {/* Ambientação da Foto do Produto com IA + Chips Clicáveis */}
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-extrabold uppercase tracking-wider text-cyan-900">
                        Foto Original do Produto &amp; Melhoria com IA
                      </label>
                      <select
                        value={topicPhotoMode}
                        onChange={(e) =>
                          setTopicPhotoMode(e.target.value as AIPhotoMode)
                        }
                        className="rounded-lg border border-cyan-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800"
                      >
                        <option value="NONE">Sem foto de produto</option>
                        <option value="ORIGINAL_FRAME">
                          Foto original com layout da marca
                        </option>
                        <option value="ENHANCE">
                          IA melhora/ambienta a foto original
                        </option>
                      </select>
                    </div>

                    {topicPhotoMode !== "NONE" && (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          {AI_PHOTO_PROMPT_EXAMPLES.map((ex) => (
                            <button
                              key={ex.label}
                              type="button"
                              onClick={() => setTopicPhotoPrompt(ex.prompt)}
                              className="rounded-full border border-cyan-300 bg-white px-3 py-1 text-[11px] font-bold text-cyan-800 hover:bg-cyan-100"
                            >
                              {ex.label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          rows={2}
                          value={topicPhotoPrompt}
                          onChange={(e) => setTopicPhotoPrompt(e.target.value)}
                          placeholder='Ex: "Colocar o produto na mão de uma pessoa em ambiente moderno e iluminado"'
                          className="w-full rounded-xl border border-cyan-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500"
                        />
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={topicActive}
                        onChange={(e) => setTopicActive(e.target.checked)}
                      />
                      Assunto ativo no agendador automático
                    </label>
                    <button
                      type="submit"
                      disabled={savingTopic}
                      className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-xs font-bold text-white shadow-md"
                    >
                      {savingTopic ? "Salvando..." : "Salvar Assunto"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ---------- ABA 3: ESTÚDIO MANUAL & PREVIEW EDITÁVEL ---------- */}
            {clientTab === "studio" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-5">
                  <h2 className="text-base font-extrabold text-slate-900">
                    Estúdio de Criação Manual
                  </h2>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Basear em Assunto Cadastrado ou Prompt Livre
                    </label>
                    <select
                      value={studioTopicId}
                      onChange={(e) => handleSelectStudioTopic(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold outline-none focus:border-indigo-500"
                    >
                      <option value="__free__">
                        Prompt Livre Avulso (Escrever agora)
                      </option>
                      {workspace.topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <input
                    value={studioTitle}
                    onChange={(e) => setStudioTitle(e.target.value)}
                    placeholder="Título do assunto (ex: Calçados Lançamento)"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  />

                  <textarea
                    rows={3}
                    value={studioPrompt}
                    onChange={(e) => setStudioPrompt(e.target.value)}
                    placeholder="Cole seu prompt para a IA gerar a arte e legenda..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={studioPrice}
                      onChange={(e) => setStudioPrice(e.target.value)}
                      placeholder="Preço (ex: 12x R$149,90)"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                    />
                    <select
                      value={studioRatio}
                      onChange={(e) =>
                        setStudioRatio(e.target.value as AspectRatio)
                      }
                      className="rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-bold"
                    >
                      <option value="1:1">1080×1080 (1:1)</option>
                      <option value="4:5">1080×1350 (4:5 Feed)</option>
                      <option value="9:16">1080×1920 (9:16 Vertical)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={studioFormat}
                      onChange={(e) =>
                        setStudioFormat(e.target.value as PostFormat)
                      }
                      className="rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-bold"
                    >
                      <option value="SINGLE">Imagem Única</option>
                      <option value="CAROUSEL">Carrossel</option>
                    </select>
                    {studioFormat === "CAROUSEL" && (
                      <input
                        type="number"
                        min={2}
                        max={8}
                        value={studioSlides}
                        onChange={(e) =>
                          setStudioSlides(Number(e.target.value))
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
                      />
                    )}
                  </div>

                  {/* Foto do produto na hora */}
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">
                        Foto Original do Produto (Opcional)
                      </span>
                      <label className="cursor-pointer rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                        Selecionar Imagem
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const { base64, contentType } = await fileToBase64(
                              f
                            );
                            setStudioPhotoBase64(base64);
                            setStudioPhotoType(contentType);
                            if (studioPhotoMode === "NONE") {
                              setStudioPhotoMode("ENHANCE");
                            }
                          }}
                        />
                      </label>
                    </div>
                    {studioPhotoBase64 && (
                      <p className="text-[11px] font-semibold text-emerald-700">
                        Foto carregada pronta para envio!
                      </p>
                    )}

                    <select
                      value={studioPhotoMode}
                      onChange={(e) =>
                        setStudioPhotoMode(e.target.value as AIPhotoMode)
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold"
                    >
                      <option value="NONE">
                        Usar fila automática / Sem foto manual
                      </option>
                      <option value="ORIGINAL_FRAME">
                        Usar foto original com moldura da marca
                      </option>
                      <option value="ENHANCE">
                        IA melhora e ambienta a foto do produto
                      </option>
                    </select>

                    {studioPhotoMode === "ENHANCE" && (
                      <>
                        <div className="flex flex-wrap gap-1">
                          {AI_PHOTO_PROMPT_EXAMPLES.map((ex) => (
                            <button
                              key={ex.label}
                              type="button"
                              onClick={() => setStudioPhotoPrompt(ex.prompt)}
                              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-indigo-50"
                            >
                              {ex.label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          rows={2}
                          value={studioPhotoPrompt}
                          onChange={(e) => setStudioPhotoPrompt(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                        />
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={studioAction !== "idle" || Boolean(approvingPostId)}
                      onClick={() => handleRunStudio({ previewOnly: true })}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 py-3 text-xs font-extrabold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                    >
                      {studioAction === "generating_preview"
                        ? "Gerando Prévia..."
                        : "1. Gerar Nova Prévia (IA)"}
                    </button>
                    <button
                      type="button"
                      disabled={studioAction !== "idle" || Boolean(approvingPostId)}
                      onClick={() =>
                        studioPreview?.draftPostId
                          ? handleApproveDraft(
                              studioPreview.draftPostId,
                              studioPreview
                            )
                          : handleRunStudio({
                              previewOnly: false,
                              useEditedContent: Boolean(studioPreview),
                            })
                      }
                      className="rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 py-3 text-xs font-extrabold text-white shadow-md disabled:opacity-60"
                    >
                      {studioAction === "publishing" || Boolean(approvingPostId)
                        ? "Publicando..."
                        : studioPreview?.draftPostId
                        ? "2. Aprovar Rascunho e Publicar"
                        : "2. Publicar Agora"}
                    </button>
                  </div>
                </div>

                {/* Preview Editável + Logs */}
                <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-7">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-extrabold text-slate-900">
                      Pré-visualização &amp; Edição Antes de Postar
                    </h2>
                    {studioPreview?.draftPostId && (
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-extrabold text-amber-800">
                          Editando Rascunho Pendente
                        </span>
                        <button
                          type="button"
                          onClick={() => setStudioPreview(null)}
                          className="text-xs font-bold text-slate-500 underline hover:text-slate-800"
                        >
                          Sair do Rascunho
                        </button>
                      </div>
                    )}
                  </div>

                  {!studioPreview ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center text-xs text-slate-500">
                      Clique em <strong>&quot;1. Gerar Nova Prévia (IA)&quot;</strong>{" "}
                      para visualizar as artes geradas no Cloudflare R2, ou abra
                      um <strong>Rascunho Pendente</strong> no Dashboard para
                      visualizar, editar e aprovar.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {studioPreview.imageUrls.map((url, idx) => (
                          <a
                            key={`${url}-${idx}`}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                            title="Clique para abrir imagem em tamanho original"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`Arte ${idx + 1}`}
                              className="w-full object-cover"
                            />
                            <span className="absolute bottom-2 right-2 rounded-lg bg-slate-900/80 px-2 py-1 text-[10px] font-bold text-white opacity-90 group-hover:opacity-100">
                              Slide {idx + 1} • Abrir em HD ↗
                            </span>
                          </a>
                        ))}
                      </div>

                      {studioPreview.post.original_photo_url &&
                        studioPreview.post.enhanced_photo_url && (
                          <div className="grid grid-cols-2 gap-3 rounded-xl border border-cyan-200 bg-cyan-50/50 p-3">
                            <div>
                              <p className="mb-1 text-[11px] font-bold text-slate-600">
                                Foto Original
                              </p>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={studioPreview.post.original_photo_url}
                                alt="Original"
                                className="h-32 w-full rounded-lg object-cover"
                              />
                            </div>
                            <div>
                              <p className="mb-1 text-[11px] font-bold text-emerald-700">
                                Foto Ambientada pela IA
                              </p>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={studioPreview.post.enhanced_photo_url}
                                alt="Melhorada IA"
                                className="h-32 w-full rounded-lg object-cover"
                              />
                            </div>
                          </div>
                        )}

                      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-extrabold text-indigo-700">
                          Editar Textos Gerados ({studioPreview.providerUsed})
                        </p>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600">
                              Badge Superior (Tema Visual)
                            </label>
                            <input
                              value={studioPreview.post.tema_visual}
                              onChange={(e) =>
                                setStudioPreview({
                                  ...studioPreview,
                                  post: {
                                    ...studioPreview.post,
                                    tema_visual: e.target.value,
                                  },
                                })
                              }
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600">
                              Selo de Destaque
                            </label>
                            <input
                              value={studioPreview.post.destaque_selo}
                              onChange={(e) =>
                                setStudioPreview({
                                  ...studioPreview,
                                  post: {
                                    ...studioPreview.post,
                                    destaque_selo: e.target.value,
                                  },
                                })
                              }
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">
                            {studioPreview.format === "CAROUSEL"
                              ? "Headline da Capa (Slide 1 do Carrossel)"
                              : "Headline Principal da Arte"}
                          </label>
                          <input
                            value={studioPreview.post.headline_arte}
                            onChange={(e) =>
                              setStudioPreview({
                                ...studioPreview,
                                post: {
                                  ...studioPreview.post,
                                  headline_arte: e.target.value,
                                },
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">
                            {studioPreview.format === "CAROUSEL"
                              ? "Subtítulo da Capa (Slide 1)"
                              : "Subtítulo da Arte"}
                          </label>
                          <input
                            value={studioPreview.post.subtitulo_arte}
                            onChange={(e) =>
                              setStudioPreview({
                                ...studioPreview,
                                post: {
                                  ...studioPreview.post,
                                  subtitulo_arte: e.target.value,
                                },
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">
                            {studioPreview.format === "CAROUSEL"
                              ? "Caixa de Destaque / Dor vs Solução (Capa Slide 1)"
                              : "Dor vs Solução"}
                          </label>
                          <input
                            value={studioPreview.post.dor_vs_solucao}
                            onChange={(e) =>
                              setStudioPreview({
                                ...studioPreview,
                                post: {
                                  ...studioPreview.post,
                                  dor_vs_solucao: e.target.value,
                                },
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">
                            Tópicos / Benefícios na Arte (1 por linha — aparece no último slide)
                          </label>
                          <textarea
                            rows={3}
                            value={(studioPreview.post.beneficios || []).join("\n")}
                            onChange={(e) =>
                              setStudioPreview({
                                ...studioPreview,
                                post: {
                                  ...studioPreview.post,
                                  beneficios: e.target.value.split("\n"),
                                },
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                          />
                        </div>

                        {studioPreview.format === "CAROUSEL" &&
                          Array.isArray(studioPreview.post.slides) &&
                          studioPreview.post.slides.some((_, idx) => idx >= 1) && (
                            <div className="space-y-2 rounded-xl border border-indigo-100 bg-white p-3">
                              <p className="text-[11px] font-extrabold text-indigo-800">
                                Textos dos Slides Seguintes (Slide 2 em diante)
                              </p>
                              {studioPreview.post.slides.map((sl, sIdx) => {
                                if (sIdx === 0) return null;
                                return (
                                  <div
                                    key={sIdx}
                                    className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5"
                                  >
                                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600">
                                      Slide {sIdx + 1}
                                    </p>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                      <input
                                        value={sl.badge}
                                        placeholder={`Tag Slide ${sIdx + 1}`}
                                        onChange={(e) => {
                                          const nextSlides = [
                                            ...studioPreview.post.slides,
                                          ];
                                          nextSlides[sIdx] = {
                                            ...sl,
                                            badge: e.target.value,
                                          };
                                          setStudioPreview({
                                            ...studioPreview,
                                            post: {
                                              ...studioPreview.post,
                                              slides: nextSlides,
                                            },
                                          });
                                        }}
                                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold"
                                      />
                                      <input
                                        value={sl.highlight || ""}
                                        placeholder={`Selo Destaque Slide ${sIdx + 1} (opcional)`}
                                        onChange={(e) => {
                                          const nextSlides = [
                                            ...studioPreview.post.slides,
                                          ];
                                          nextSlides[sIdx] = {
                                            ...sl,
                                            highlight: e.target.value,
                                          };
                                          setStudioPreview({
                                            ...studioPreview,
                                            post: {
                                              ...studioPreview.post,
                                              slides: nextSlides,
                                            },
                                          });
                                        }}
                                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold"
                                      />
                                    </div>
                                    <input
                                      value={sl.title}
                                      placeholder={`Título Slide ${sIdx + 1}`}
                                      onChange={(e) => {
                                        const nextSlides = [
                                          ...studioPreview.post.slides,
                                        ];
                                        nextSlides[sIdx] = {
                                          ...sl,
                                          title: e.target.value,
                                        };
                                        setStudioPreview({
                                          ...studioPreview,
                                          post: {
                                            ...studioPreview.post,
                                            slides: nextSlides,
                                          },
                                        });
                                      }}
                                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold"
                                    />
                                    <textarea
                                      rows={2}
                                      value={sl.body}
                                      placeholder={`Texto Slide ${sIdx + 1}`}
                                      onChange={(e) => {
                                        const nextSlides = [
                                          ...studioPreview.post.slides,
                                        ];
                                        nextSlides[sIdx] = {
                                          ...sl,
                                          body: e.target.value,
                                        };
                                        setStudioPreview({
                                          ...studioPreview,
                                          post: {
                                            ...studioPreview.post,
                                            slides: nextSlides,
                                          },
                                        });
                                      }}
                                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px]"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">
                            Legenda do Post (Instagram &amp; Facebook)
                          </label>
                          <textarea
                            rows={4}
                            value={studioPreview.post.legenda}
                            onChange={(e) =>
                              setStudioPreview({
                                ...studioPreview,
                                post: {
                                  ...studioPreview.post,
                                  legenda: e.target.value,
                                },
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">
                            Hashtags
                          </label>
                          <input
                            value={studioPreview.post.hashtags || ""}
                            onChange={(e) =>
                              setStudioPreview({
                                ...studioPreview,
                                post: {
                                  ...studioPreview.post,
                                  hashtags: e.target.value,
                                },
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                          />
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            disabled={studioAction !== "idle" || Boolean(approvingPostId)}
                            onClick={() =>
                              handleRunStudio({
                                previewOnly: true,
                                useEditedContent: true,
                                saveAsDraft: true,
                              })
                            }
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                          >
                            {studioAction === "updating_art"
                              ? "Atualizando Arte..."
                              : "1. Atualizar Arte & Salvar Rascunho"}
                          </button>

                          <button
                            type="button"
                            disabled={studioAction !== "idle" || Boolean(approvingPostId)}
                            onClick={handleSaveDraftTextOnly}
                            className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                          >
                            {studioAction === "saving_draft"
                              ? "Salvando Rascunho..."
                              : "2. Salvar Só Textos no Rascunho"}
                          </button>

                          <button
                            type="button"
                            disabled={studioAction !== "idle" || Boolean(approvingPostId)}
                            onClick={() =>
                              studioPreview.draftPostId
                                ? handleApproveDraft(
                                    studioPreview.draftPostId,
                                    studioPreview
                                  )
                                : handleRunStudio({
                                    previewOnly: false,
                                    useEditedContent: true,
                                  })
                            }
                            className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {studioAction === "publishing" || Boolean(approvingPostId)
                              ? "Publicando..."
                              : "3. Aprovar e Publicar Agora"}
                          </button>

                          {studioPreview.draftPostId && (
                            <button
                              type="button"
                              disabled={
                                deletingPostId === studioPreview.draftPostId ||
                                studioAction !== "idle"
                              }
                              onClick={() =>
                                handleDeleteDraft(studioPreview.draftPostId!)
                              }
                              className="ml-auto rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
                            >
                              Excluir Rascunho
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {studioPublishLogs.length > 0 && (
                    <div className="rounded-xl bg-slate-900 p-4 font-mono text-[11px] text-slate-200">
                      <p className="mb-1.5 font-bold text-cyan-400">
                        LOGS DE EXECUÇÃO &amp; META API
                      </p>
                      {studioPublishLogs.map((l, i) => (
                        <p key={i} className="leading-relaxed">
                          {l}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ---------- ABA 4: IDENTIDADE VISUAL (BRAND KIT LUMINOSO) ---------- */}
            {clientTab === "brand" && brandForm && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <form
                  onSubmit={handleSaveBrand}
                  className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-7"
                >
                  <h2 className="text-base font-extrabold text-slate-900">
                    Temas Luminosos &amp; Cores da Marca
                  </h2>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {LUMINOUS_THEME_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          setBrandForm({
                            ...brandForm,
                            theme_preset: preset.id,
                            primary_color: preset.primary_color,
                            secondary_color: preset.secondary_color,
                            accent_color: preset.accent_color,
                            bg_color: preset.bg_color,
                            text_color: preset.text_color,
                          })
                        }
                        className={`rounded-xl border p-3 text-left transition ${
                          brandForm.theme_preset === preset.id
                            ? "border-indigo-500 bg-indigo-50/50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-slate-900">
                            {preset.name}
                          </span>
                          <div className="flex gap-1">
                            {[
                              preset.primary_color,
                              preset.secondary_color,
                              preset.accent_color,
                            ].map((hex) => (
                              <span
                                key={hex}
                                className="h-3.5 w-3.5 rounded-full border border-white shadow-xs"
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </div>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {preset.description}
                        </p>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {(
                      [
                        ["primary_color", "Primária"],
                        ["secondary_color", "Secundária"],
                        ["accent_color", "Selo/Sucesso"],
                        ["bg_color", "Fundo"],
                        ["text_color", "Texto"],
                      ] as Array<[keyof BrandSettings, string]>
                    ).map(([field, label]) => (
                      <div key={field}>
                        <label className="block text-[11px] font-bold text-slate-600">
                          {label}
                        </label>
                        <input
                          type="color"
                          value={String(brandForm[field] || "#4F46E5")}
                          onChange={(e) =>
                            setBrandForm({
                              ...brandForm,
                              theme_preset: "personalizado",
                              [field]: e.target.value,
                            })
                          }
                          className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-slate-200"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        Assinatura no Rodapé
                      </label>
                      <input
                        value={brandForm.footer_name}
                        onChange={(e) =>
                          setBrandForm({
                            ...brandForm,
                            footer_name: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        CTA Padrão do Botão
                      </label>
                      <input
                        value={brandForm.cta_default}
                        onChange={(e) =>
                          setBrandForm({
                            ...brandForm,
                            cta_default: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <input
                    value={brandForm.subtitle_default}
                    onChange={(e) =>
                      setBrandForm({
                        ...brandForm,
                        subtitle_default: e.target.value,
                      })
                    }
                    placeholder="Subtítulo no rodapé (ex: Enviamos para todo o Brasil)"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />

                  <button
                    type="submit"
                    disabled={savingBrand}
                    className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-xs font-bold text-white shadow-md"
                  >
                    {savingBrand ? "Salvando..." : "Salvar Identidade Visual"}
                  </button>
                </form>

                {/* Preview ao vivo da identidade */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-5">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Prévia ao Vivo das Cores Luminosas
                  </p>
                  <div
                    className="mt-4 flex aspect-square flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 p-5 shadow-inner"
                    style={{
                      backgroundColor: brandForm.bg_color,
                      color: brandForm.text_color,
                    }}
                  >
                    <div
                      className="rounded-2xl p-5 text-white"
                      style={{
                        backgroundImage: `linear-gradient(135deg, ${brandForm.primary_color} 0%, ${brandForm.secondary_color} 100%)`,
                      }}
                    >
                      <span
                        className="inline-block rounded-full px-3 py-1 text-[10px] font-extrabold uppercase"
                        style={{ backgroundColor: brandForm.accent_color }}
                      >
                        OFERTA EM DESTAQUE
                      </span>
                      <p className="mt-3 text-xl font-extrabold leading-tight">
                        Sua Headline Publicitária Aparece Aqui
                      </p>
                      <p className="mt-1 text-xs opacity-90">
                        Design moderno e luminoso gerado sob medida.
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200/70 bg-white p-4 text-xs shadow-xs">
                      <p className="font-bold">Diferenciais da sua empresa</p>
                      <p className="mt-1 text-slate-500">
                        Cards luminosos com ícones nítidos e foto do produto.
                      </p>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
                      <div>
                        <p className="text-xs font-extrabold">
                          {brandForm.footer_name}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {brandForm.subtitle_default}
                        </p>
                      </div>
                      <span
                        className="rounded-lg px-3 py-1.5 text-[10px] font-extrabold text-white"
                        style={{
                          backgroundImage: `linear-gradient(135deg, ${brandForm.primary_color} 0%, ${brandForm.secondary_color} 100%)`,
                        }}
                      >
                        {brandForm.cta_default}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---------- ABA 5: INTEGRAÇÕES (MULTI-IA + META + TIKTOK) ---------- */}
            {clientTab === "integrations" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <form
                  onSubmit={handleSaveIntegrations}
                  className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-7"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-extrabold text-slate-900">
                      Chaves Próprias da Empresa (Criptografia AES-256)
                    </h2>
                    <button
                      type="button"
                      disabled={testingInteg}
                      onClick={handleTestIntegrations}
                      className="rounded-xl border border-cyan-200 bg-cyan-50 px-3.5 py-2 text-xs font-bold text-cyan-800 hover:bg-cyan-100"
                    >
                      {testingInteg ? "Testando..." : "Testar Conexões"}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        IA Principal de Texto / Copy
                      </label>
                      <select
                        value={integTextAi}
                        onChange={(e) =>
                          setIntegTextAi(e.target.value as AIProvider)
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold"
                      >
                        <option value="GEMINI">Google Gemini</option>
                        <option value="CLAUDE">Anthropic Claude</option>
                        <option value="OPENAI">OpenAI (ChatGPT)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        IA para Melhorar Fotos de Produtos
                      </label>
                      <select
                        value={integImageAi}
                        onChange={(e) =>
                          setIntegImageAi(e.target.value as ImageAIProvider)
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold"
                      >
                        <option value="GEMINI">Google Gemini Image</option>
                        <option value="OPENAI">OpenAI (gpt-image-1)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-indigo-700">
                      Provedores de Inteligência Artificial (BYOK)
                    </p>
                    <div>
                      <label className="block text-xs font-bold text-slate-700">
                        GEMINI_API_KEY{" "}
                        {workspace.integrations.has_gemini_key && (
                          <span className="ml-1 font-mono text-emerald-700">
                            (Salva: {workspace.integrations.gemini_key_mask})
                          </span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={integGeminiKey}
                        onChange={(e) => setIntegGeminiKey(e.target.value)}
                        placeholder="Cole para cadastrar ou substituir..."
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700">
                        OPENAI_API_KEY (ChatGPT / gpt-image-1){" "}
                        {workspace.integrations.has_openai_key && (
                          <span className="ml-1 font-mono text-emerald-700">
                            (Salva: {workspace.integrations.openai_key_mask})
                          </span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={integOpenAiKey}
                        onChange={(e) => setIntegOpenAiKey(e.target.value)}
                        placeholder="sk-..."
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700">
                        ANTHROPIC_API_KEY (Claude){" "}
                        {workspace.integrations.has_anthropic_key && (
                          <span className="ml-1 font-mono text-emerald-700">
                            (Salva: {workspace.integrations.anthropic_key_mask})
                          </span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={integAnthropicKey}
                        onChange={(e) => setIntegAnthropicKey(e.target.value)}
                        placeholder="sk-ant-..."
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-indigo-700">
                      Meta Graph API (Instagram Business &amp; Página Facebook)
                    </p>
                    <div>
                      <label className="block text-xs font-bold text-slate-700">
                        META_ACCESS_TOKEN{" "}
                        {workspace.integrations.has_meta_token && (
                          <span className="ml-1 font-mono text-emerald-700">
                            (Salvo: {workspace.integrations.meta_token_mask})
                          </span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={integMetaToken}
                        onChange={(e) => setIntegMetaToken(e.target.value)}
                        placeholder="EAA..."
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={integIgUserId}
                        onChange={(e) => setIntegIgUserId(e.target.value)}
                        placeholder="IG_USER_ID"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                      <input
                        value={integFbPageId}
                        onChange={(e) => setIntegFbPageId(e.target.value)}
                        placeholder="FB_PAGE_ID"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  {/* Cloudflare R2 Storage */}
                  <div className="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-extrabold uppercase tracking-wider text-cyan-900">
                        Cloudflare R2 Storage (Hospedagem de Mídias)
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          workspace.integrations.has_r2_access_key &&
                          workspace.integrations.r2_bucket_name
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {workspace.integrations.has_r2_access_key &&
                        workspace.integrations.r2_bucket_name
                          ? "R2 Próprio Conectado"
                          : workspace.integrations.using_global_r2_fallback
                          ? "Usando R2 Padrão do Servidor"
                          : "Não Configurado"}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={integR2AccountId}
                        onChange={(e) => setIntegR2AccountId(e.target.value)}
                        placeholder="R2_ACCOUNT_ID"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                      <input
                        value={integR2Bucket}
                        onChange={(e) => setIntegR2Bucket(e.target.value)}
                        placeholder="R2_BUCKET_NAME (ex: minha-loja-media)"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                    <input
                      value={integR2PublicUrl}
                      onChange={(e) => setIntegR2PublicUrl(e.target.value)}
                      placeholder="R2_PUBLIC_URL (ex: https://pub-xxxx.r2.dev)"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700">
                          R2_ACCESS_KEY_ID{" "}
                          {workspace.integrations.has_r2_access_key && (
                            <span className="font-mono text-emerald-700">
                              ({workspace.integrations.r2_access_key_mask})
                            </span>
                          )}
                        </label>
                        <input
                          type="password"
                          value={integR2AccessKey}
                          onChange={(e) => setIntegR2AccessKey(e.target.value)}
                          placeholder="Cole p/ salvar ou substituir..."
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700">
                          R2_SECRET_ACCESS_KEY{" "}
                          {workspace.integrations.has_r2_secret_key && (
                            <span className="font-mono text-emerald-700">
                              ({workspace.integrations.r2_secret_key_mask})
                            </span>
                          )}
                        </label>
                        <input
                          type="password"
                          value={integR2SecretKey}
                          onChange={(e) => setIntegR2SecretKey(e.target.value)}
                          placeholder="Cole p/ salvar ou substituir..."
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Se o cliente deixar em branco, o sistema usa automaticamente
                      o bucket padrão da agência.
                    </p>
                  </div>

                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                        TikTok Photo &amp; Content API v2 (Estrutura Pronta)
                      </span>
                      <label className="flex items-center gap-1.5 text-xs font-bold">
                        <input
                          type="checkbox"
                          checked={integTiktokEnabled}
                          onChange={(e) =>
                            setIntegTiktokEnabled(e.target.checked)
                          }
                        />
                        Ativar
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={integTiktokOpenId}
                        onChange={(e) => setIntegTiktokOpenId(e.target.value)}
                        placeholder="TikTok Open ID"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                      <input
                        type="password"
                        value={integTiktokToken}
                        onChange={(e) => setIntegTiktokToken(e.target.value)}
                        placeholder="TikTok Access Token"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={savingInteg}
                    className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-xs font-bold text-white shadow-md"
                  >
                    {savingInteg
                      ? "Criptografando e Salvando..."
                      : "Salvar Credenciais com Criptografia AES-256"}
                  </button>

                  {integTestReport && (
                    <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-[11px] text-emerald-300">
                      {JSON.stringify(integTestReport, null, 2)}
                    </pre>
                  )}
                </form>

                {/* Tutorial Guiado para o Cliente */}
                <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-5">
                  <h2 className="text-base font-extrabold text-slate-900">
                    Tutorial Rápido Para Clientes
                  </h2>
                  <div className="space-y-3 text-xs text-slate-600">
                    <div className="rounded-xl bg-slate-50 p-3.5">
                      <p className="font-extrabold text-indigo-700">
                        1. Google Gemini (Gratuito para Textos)
                      </p>
                      <p className="mt-1">
                        Acesse <code>aistudio.google.com</code> → clique em{" "}
                        <strong>Get API key</strong> → crie uma chave e cole no
                        campo <code>GEMINI_API_KEY</code>. Para edição avançada
                        de fotos na IA, ative o faturamento no projeto Google.
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3.5">
                      <p className="font-extrabold text-indigo-700">
                        2. OpenAI (ChatGPT) ou Anthropic (Claude)
                      </p>
                      <p className="mt-1">
                        Para copywriting com Claude, gere sua chave em{" "}
                        <code>console.anthropic.com</code>. Para ambientação
                        avançada de produtos (<code>gpt-image-1</code>), gere em{" "}
                        <code>platform.openai.com</code>.
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3.5">
                      <p className="font-extrabold text-indigo-700">
                        3. Instagram Business &amp; Facebook Page
                      </p>
                      <p className="mt-1">
                        Garanta que o Instagram está como{" "}
                        <strong>Conta Profissional</strong> vinculada à Página do
                        Facebook. No Business Manager → Usuários do Sistema →
                        gere um token permanente com{" "}
                        <code>
                          instagram_basic, instagram_content_publish,
                          pages_show_list, pages_read_engagement,
                          pages_manage_posts
                        </code>
                        .
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3.5">
                      <p className="font-extrabold text-indigo-700">
                        4. Cloudflare R2 Storage (10 GB Grátis)
                      </p>
                      <p className="mt-1">
                        Acesse <code>dash.cloudflare.com</code> →{" "}
                        <strong>R2 Object Storage</strong> → crie um bucket,
                        ative o acesso público (<strong>Public r2.dev URL</strong>
                        ) em Settings e clique em{" "}
                        <strong>Manage R2 API Tokens</strong> →{" "}
                        <em>Create API token</em> (Object Read &amp; Write) para
                        copiar o <code>Access Key ID</code> e{" "}
                        <code>Secret Access Key</code>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---------- ABA 6: HISTÓRICO DE PUBLICAÇÕES ---------- */}
            {clientTab === "history" && (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <h2 className="text-base font-extrabold text-slate-900">
                  Histórico de Publicações ({workspace.posts.length})
                </h2>
                {workspace.posts.length === 0 ? (
                  <p className="mt-4 text-xs text-slate-500">
                    Nenhum post gerado ainda para esta empresa.
                  </p>
                ) : (
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {workspace.posts.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                      >
                        <div className="flex gap-4">
                          {p.image_urls_json[0] && (
                            <button
                              type="button"
                              onClick={() => handleOpenDraftInStudio(p)}
                              className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-slate-200"
                              title="Clique para visualizar e editar no Estúdio"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={p.image_urls_json[0]}
                                alt={p.headline}
                                className="h-full w-full object-cover transition hover:scale-105"
                              />
                              {p.image_urls_json.length > 1 && (
                                <span className="absolute bottom-1 right-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                  {p.image_urls_json.length} slides
                                </span>
                              )}
                            </button>
                          )}
                          <div className="flex-1 space-y-1 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  p.status === "PENDING_APPROVAL"
                                    ? "bg-amber-100 text-amber-800"
                                    : p.status === "ERROR"
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-emerald-100 text-emerald-700"
                                }`}
                              >
                                {p.status === "PENDING_APPROVAL"
                                  ? "RASCUNHO PENDENTE"
                                  : p.status}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {new Date(p.created_at).toLocaleString("pt-BR")}
                              </span>
                            </div>
                            <p className="text-sm font-extrabold text-slate-900">
                              {p.headline}
                            </p>
                            <p className="text-[11px] text-slate-600">
                              IA: {p.ai_provider_used} • {p.format} ({p.slides_count}x{" "}
                              {p.aspect_ratio})
                            </p>
                            <p className="font-mono text-[10px] text-indigo-700">
                              IG: {p.ig_post_id || "—"} | FB:{" "}
                              {p.fb_post_id || "—"}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-2.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDraftInStudio(p)}
                            className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50"
                          >
                            {p.status === "PENDING_APPROVAL"
                              ? "Visualizar & Editar Rascunho"
                              : "Visualizar / Reabrir no Estúdio"}
                          </button>
                          {p.status === "PENDING_APPROVAL" && (
                            <>
                              <button
                                type="button"
                                disabled={approvingPostId === p.id}
                                onClick={() => handleApproveDraft(p.id)}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                              >
                                {approvingPostId === p.id
                                  ? "Publicando..."
                                  : "Aprovar e Publicar"}
                              </button>
                              <button
                                type="button"
                                disabled={deletingPostId === p.id}
                                onClick={() => handleDeleteDraft(p.id)}
                                className="ml-auto rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                              >
                                Excluir
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

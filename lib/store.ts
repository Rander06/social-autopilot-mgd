import {
  decryptSecret,
  encryptSecret,
  generateId,
  hashPassword,
  maskSecret,
  verifyPassword,
} from "./crypto";
import { LUMINOUS_THEME_PRESETS, NICHE_TOPIC_TEMPLATES } from "./presets";
import {
  AdAccountConfig,
  AdCampaignAdRecord,
  AdCampaignRecord,
  AdCampaignStatus,
  AdChannel,
  AdDecisionVerdict,
  AdInsightsSnapshot,
  AdProvider,
  AdsAIProviderPreference,
  AuditLogItem,
  BrandSettings,
  Company,
  CompanyIntegrations,
  CompanyIntegrationsPublic,
  CompanyStatus,
  ImprovementTip,
  ImprovementTipStatus,
  Plan,
  PostHistoryItem,
  PublishTargets,
  Topic,
  TopicPhoto,
  UserAccount,
} from "./types";

interface InMemoryDatabase {
  plans: Plan[];
  companies: Company[];
  users: UserAccount[];
  brands: BrandSettings[];
  integrations: CompanyIntegrations[];
  topics: Topic[];
  photos: TopicPhoto[];
  posts: PostHistoryItem[];
  audits: AuditLogItem[];
  tips: ImprovementTip[];
  ad_accounts: AdAccountConfig[];
  ad_campaigns: AdCampaignRecord[];
  ad_campaign_ads: AdCampaignAdRecord[];
  seededSupabase: boolean;
}

const DEFAULT_PLANS: Plan[] = [
  {
    id: "plan-starter",
    name: "Starter",
    price_brl: 147,
    max_posts_month: 12,
    allow_carousel: false,
    allow_ai_photo: false,
    allow_multi_ai: false,
  },
  {
    id: "plan-pro",
    name: "Pro IA",
    price_brl: 297,
    max_posts_month: 30,
    allow_carousel: true,
    allow_ai_photo: true,
    allow_multi_ai: true,
  },
  {
    id: "plan-agency",
    name: "Agência Ilimitado",
    price_brl: 597,
    max_posts_month: 999,
    allow_carousel: true,
    allow_ai_photo: true,
    allow_multi_ai: true,
  },
];

function createInitialSeedData(): InMemoryDatabase {
  const nowIso = new Date().toISOString();
  const nextYearIso = new Date(
    Date.now() + 365 * 24 * 60 * 60 * 1000
  ).toISOString();
  const trialIso = new Date(
    Date.now() + 14 * 24 * 60 * 60 * 1000
  ).toISOString();

  const adminPass = process.env.CRON_SECRET?.trim() || "mgd123456";
  const techPreset = LUMINOUS_THEME_PRESETS[0];
  const modaPreset = LUMINOUS_THEME_PRESETS[1];

  const tplChacara = NICHE_TOPIC_TEMPLATES[0];
  const tplSites = NICHE_TOPIC_TEMPLATES[1];
  const tplTrafego = NICHE_TOPIC_TEMPLATES[2];
  const tplRedes = NICHE_TOPIC_TEMPLATES[3];
  const tplCalcados = NICHE_TOPIC_TEMPLATES[4];
  const tplIntimas = NICHE_TOPIC_TEMPLATES[5];
  const tplJeans = NICHE_TOPIC_TEMPLATES[6];

  const companies: Company[] = [
    {
      id: "comp-mgd",
      name: "Meu Gestor Digital",
      slug: "meu-gestor-digital",
      plan_id: "plan-agency",
      status: "ACTIVE",
      expires_at: nextYearIso,
      posts_used_month: 1,
      owner_name: "Rander (Agência MGD)",
      owner_whatsapp: "",
      created_at: nowIso,
    },
    {
      id: "comp-fashion-demo",
      name: "Loja Vitrine Fashion (Exemplo)",
      slug: "loja-vitrine-fashion",
      plan_id: "plan-pro",
      status: "TRIAL",
      expires_at: trialIso,
      posts_used_month: 0,
      owner_name: "Cliente Exemplo Moda",
      owner_whatsapp: "",
      created_at: nowIso,
    },
  ];

  const users: UserAccount[] = [
    {
      id: "usr-super-admin",
      company_id: "comp-mgd",
      name: "Rander (Super Admin)",
      email: "admin@meugestordigital.com.br",
      password_hash: hashPassword(adminPass),
      role: "SUPER_ADMIN",
      last_login_at: nowIso,
      created_at: nowIso,
    },
    {
      id: "usr-fashion-demo",
      company_id: "comp-fashion-demo",
      name: "Gestora Loja Fashion",
      email: "contato@lojafashion.exemplo",
      password_hash: hashPassword("fashion123"),
      role: "COMPANY_ADMIN",
      last_login_at: null,
      created_at: nowIso,
    },
  ];

  const brands: BrandSettings[] = [
    {
      company_id: "comp-mgd",
      theme_preset: techPreset.id,
      footer_name: "Meu Gestor Digital",
      subtitle_default: "Sites, Tráfego Pago & Automação com IA",
      cta_default: 'COMENTE "EU QUERO"',
      logo_url: null,
      primary_color: techPreset.primary_color,
      secondary_color: techPreset.secondary_color,
      accent_color: techPreset.accent_color,
      bg_color: techPreset.bg_color,
      text_color: techPreset.text_color,
    },
    {
      company_id: "comp-fashion-demo",
      theme_preset: modaPreset.id,
      footer_name: "Vitrine Fashion Store",
      subtitle_default: "Moda Feminina, Calçados & Jeans • Enviamos p/ todo Brasil",
      cta_default: "CHAME NO WHATSAPP",
      logo_url: null,
      primary_color: modaPreset.primary_color,
      secondary_color: modaPreset.secondary_color,
      accent_color: modaPreset.accent_color,
      bg_color: modaPreset.bg_color,
      text_color: modaPreset.text_color,
    },
  ];

  const integrations: CompanyIntegrations[] = [
    {
      company_id: "comp-mgd",
      preferred_text_ai: "GEMINI",
      preferred_image_ai: "GEMINI",
      gemini_key_enc: encryptSecret(process.env.GEMINI_API_KEY),
      openai_key_enc: encryptSecret(process.env.OPENAI_API_KEY),
      anthropic_key_enc: encryptSecret(process.env.ANTHROPIC_API_KEY),
      meta_token_enc: encryptSecret(process.env.META_ACCESS_TOKEN),
      meta_token_expires_at: null,
      ig_user_id: process.env.IG_USER_ID?.trim() || null,
      fb_page_id: process.env.FB_PAGE_ID?.trim() || null,
      r2_account_id: process.env.R2_ACCOUNT_ID?.trim() || null,
      r2_access_key_id_enc: encryptSecret(process.env.R2_ACCESS_KEY_ID),
      r2_secret_access_key_enc: encryptSecret(process.env.R2_SECRET_ACCESS_KEY),
      r2_bucket_name: process.env.R2_BUCKET_NAME?.trim() || null,
      r2_public_url: process.env.R2_PUBLIC_URL?.trim() || null,
      tiktok_token_enc: null,
      tiktok_open_id: null,
      tiktok_enabled: false,
    },
    {
      company_id: "comp-fashion-demo",
      preferred_text_ai: "OPENAI",
      preferred_image_ai: "OPENAI",
      gemini_key_enc: null,
      openai_key_enc: null,
      anthropic_key_enc: null,
      meta_token_enc: null,
      meta_token_expires_at: null,
      ig_user_id: null,
      fb_page_id: null,
      r2_account_id: null,
      r2_access_key_id_enc: null,
      r2_secret_access_key_enc: null,
      r2_bucket_name: null,
      r2_public_url: null,
      tiktok_token_enc: null,
      tiktok_open_id: null,
      tiktok_enabled: false,
    },
  ];

  const topics: Topic[] = [
    {
      id: "top-mgd-chacaras",
      company_id: "comp-mgd",
      title: tplChacara.title,
      niche_template: tplChacara.id,
      prompt_instructions: tplChacara.prompt_instructions,
      offer_price: tplChacara.offer_price,
      benefits_json: tplChacara.benefits,
      post_format: "CAROUSEL",
      slides_count: 3,
      aspect_ratio: "1:1",
      approval_mode: "AUTO",
      ai_photo_mode: "ORIGINAL_FRAME",
      ai_photo_prompt: tplChacara.ai_photo_prompt,
      schedule_days: [1, 3, 5],
      schedule_time: "10:00",
      is_active: true,
      last_posted_at: null,
      created_at: nowIso,
    },
    {
      id: "top-mgd-sites",
      company_id: "comp-mgd",
      title: tplSites.title,
      niche_template: tplSites.id,
      prompt_instructions: tplSites.prompt_instructions,
      offer_price: tplSites.offer_price,
      benefits_json: tplSites.benefits,
      post_format: "SINGLE",
      slides_count: 1,
      aspect_ratio: "4:5",
      approval_mode: "AUTO",
      ai_photo_mode: "NONE",
      ai_photo_prompt: tplSites.ai_photo_prompt,
      schedule_days: [2],
      schedule_time: "14:00",
      is_active: true,
      last_posted_at: null,
      created_at: nowIso,
    },
    {
      id: "top-mgd-trafego",
      company_id: "comp-mgd",
      title: tplTrafego.title,
      niche_template: tplTrafego.id,
      prompt_instructions: tplTrafego.prompt_instructions,
      offer_price: tplTrafego.offer_price,
      benefits_json: tplTrafego.benefits,
      post_format: "CAROUSEL",
      slides_count: 3,
      aspect_ratio: "1:1",
      approval_mode: "AUTO",
      ai_photo_mode: "NONE",
      ai_photo_prompt: tplTrafego.ai_photo_prompt,
      schedule_days: [4],
      schedule_time: "18:00",
      is_active: true,
      last_posted_at: null,
      created_at: nowIso,
    },
    {
      id: "top-mgd-redes",
      company_id: "comp-mgd",
      title: tplRedes.title,
      niche_template: tplRedes.id,
      prompt_instructions: tplRedes.prompt_instructions,
      offer_price: tplRedes.offer_price,
      benefits_json: tplRedes.benefits,
      post_format: "SINGLE",
      slides_count: 1,
      aspect_ratio: "1:1",
      approval_mode: "DRAFT",
      ai_photo_mode: "NONE",
      ai_photo_prompt: tplRedes.ai_photo_prompt,
      schedule_days: [6],
      schedule_time: "10:00",
      is_active: true,
      last_posted_at: null,
      created_at: nowIso,
    },
    {
      id: "top-demo-calcados",
      company_id: "comp-fashion-demo",
      title: tplCalcados.title,
      niche_template: tplCalcados.id,
      prompt_instructions: tplCalcados.prompt_instructions,
      offer_price: tplCalcados.offer_price,
      benefits_json: tplCalcados.benefits,
      post_format: "SINGLE",
      slides_count: 1,
      aspect_ratio: "4:5",
      approval_mode: "AUTO",
      ai_photo_mode: "ENHANCE",
      ai_photo_prompt: tplCalcados.ai_photo_prompt,
      schedule_days: [1, 4],
      schedule_time: "18:30",
      is_active: true,
      last_posted_at: null,
      created_at: nowIso,
    },
    {
      id: "top-demo-intimas",
      company_id: "comp-fashion-demo",
      title: tplIntimas.title,
      niche_template: tplIntimas.id,
      prompt_instructions: tplIntimas.prompt_instructions,
      offer_price: tplIntimas.offer_price,
      benefits_json: tplIntimas.benefits,
      post_format: "CAROUSEL",
      slides_count: 2,
      aspect_ratio: "4:5",
      approval_mode: "DRAFT",
      ai_photo_mode: "ENHANCE",
      ai_photo_prompt: tplIntimas.ai_photo_prompt,
      schedule_days: [3],
      schedule_time: "20:00",
      is_active: true,
      last_posted_at: null,
      created_at: nowIso,
    },
    {
      id: "top-demo-jeans",
      company_id: "comp-fashion-demo",
      title: tplJeans.title,
      niche_template: tplJeans.id,
      prompt_instructions: tplJeans.prompt_instructions,
      offer_price: tplJeans.offer_price,
      benefits_json: tplJeans.benefits,
      post_format: "SINGLE",
      slides_count: 1,
      aspect_ratio: "1:1",
      approval_mode: "AUTO",
      ai_photo_mode: "ENHANCE",
      ai_photo_prompt: tplJeans.ai_photo_prompt,
      schedule_days: [5],
      schedule_time: "12:00",
      is_active: true,
      last_posted_at: null,
      created_at: nowIso,
    },
  ];

  const audits: AuditLogItem[] = [
    {
      id: "aud-init-1",
      company_id: "comp-mgd",
      company_name: "Meu Gestor Digital",
      user_id: "usr-super-admin",
      user_email: "admin@meugestordigital.com.br",
      action: "SAAS_BOOTSTRAP",
      details_json: {
        message:
          "Sistema inicializado com Meu Gestor Digital e Loja Vitrine Fashion (Exemplo).",
      },
      created_at: nowIso,
    },
  ];

  return {
    plans: DEFAULT_PLANS,
    companies,
    users,
    brands,
    integrations,
    topics,
    photos: [],
    posts: [],
    audits,
    tips: [],
    ad_accounts: [],
    ad_campaigns: [],
    ad_campaign_ads: [],
    seededSupabase: false,
  };
}

const globalForStore = globalThis as unknown as {
  __mgdSaasMemoryDb?: InMemoryDatabase;
};

function getMemDb(): InMemoryDatabase {
  if (!globalForStore.__mgdSaasMemoryDb) {
    globalForStore.__mgdSaasMemoryDb = createInitialSeedData();
  }
  return globalForStore.__mgdSaasMemoryDb;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}

export function getDatabaseMode(): "supabase" | "memory" {
  return isSupabaseConfigured() ? "supabase" : "memory";
}

function getSupabaseKeys() {
  const baseUrl = process.env.SUPABASE_URL!.trim().replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  const anonKey =
    process.env.SUPABASE_ANON_KEY?.trim() || serviceKey;
  return { baseUrl, serviceKey, anonKey };
}

async function sbAuthRequest<T>(
  pathWithQuery: string,
  options: {
    method?: string;
    body?: unknown;
    bearerToken?: string;
    useAnonKey?: boolean;
  } = {}
): Promise<{ ok: boolean; status: number; data: T }> {
  const { baseUrl, serviceKey, anonKey } = getSupabaseKeys();
  const apiKey = options.useAnonKey ? anonKey : serviceKey;
  const bearer = options.bearerToken || apiKey;

  const res = await fetch(`${baseUrl}/auth/v1/${pathWithQuery}`, {
    method: options.method || "GET",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  let data = {} as T;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = { message: text } as unknown as T;
    }
  }
  return { ok: res.ok, status: res.status, data };
}

export class EmailNotConfirmedError extends Error {
  readonly code = "EMAIL_NOT_CONFIRMED";
  readonly email: string;
  constructor(email: string) {
    super(
      "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada (ou pasta de spam) e clique no link de confirmação."
    );
    this.name = "EmailNotConfirmedError";
    this.email = email;
  }
}

export async function findSupabaseAuthUserByEmail(email: string): Promise<{
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
} | null> {
  if (!isSupabaseConfigured()) return null;
  const cleanEmail = email.trim().toLowerCase();
  const res = await sbAuthRequest<{
    users?: Array<{
      id: string;
      email?: string;
      email_confirmed_at?: string | null;
      confirmed_at?: string | null;
      user_metadata?: Record<string, unknown>;
    }>;
  }>(`admin/users?page=1&per_page=50&filter=${encodeURIComponent(cleanEmail)}`);

  if (!res.ok || !Array.isArray(res.data?.users)) return null;
  return (
    res.data.users.find((u) => u.email?.toLowerCase() === cleanEmail) || null
  );
}

export async function ensureSupabaseAuthUser(params: {
  email: string;
  password: string;
  name: string;
  role: string;
  company_id: string | null;
}) {
  if (!isSupabaseConfigured()) return null;
  const cleanEmail = params.email.trim().toLowerCase();
  const existing = await findSupabaseAuthUserByEmail(cleanEmail);
  if (existing) return existing;

  const created = await sbAuthRequest<{
    id: string;
    email?: string;
    msg?: string;
    message?: string;
  }>("admin/users", {
    method: "POST",
    body: {
      email: cleanEmail,
      password: params.password,
      email_confirm: true,
      user_metadata: {
        name: params.name,
        role: params.role,
        company_id: params.company_id,
      },
    },
  });

  if (!created.ok) {
    console.warn("[supabase-auth] Não foi possível criar usuário em auth.users:", created.data);
    return null;
  }
  return created.data;
}

async function signupSupabaseAuthUserWithEmailConfirmation(params: {
  email: string;
  password: string;
  name: string;
  role: string;
  redirectTo?: string;
}): Promise<{ id?: string; alreadyConfirmed: boolean }> {
  const cleanEmail = params.email.trim().toLowerCase();
  const query = params.redirectTo
    ? `?redirect_to=${encodeURIComponent(params.redirectTo)}`
    : "";

  const res = await sbAuthRequest<{
    id?: string;
    access_token?: string;
    email_confirmed_at?: string | null;
    user?: {
      id?: string;
      email_confirmed_at?: string | null;
      confirmed_at?: string | null;
    };
    msg?: string;
    message?: string;
    error_description?: string;
  }>(`signup${query}`, {
    method: "POST",
    useAnonKey: true,
    body: {
      email: cleanEmail,
      password: params.password,
      data: {
        name: params.name,
        role: params.role,
      },
    },
  });

  if (!res.ok) {
    throw new Error(
      res.data?.msg ||
        res.data?.error_description ||
        res.data?.message ||
        `Erro ao cadastrar usuário no Supabase Authentication (HTTP ${res.status}).`
    );
  }

  const alreadyConfirmed = Boolean(
    res.data?.access_token ||
      res.data?.user?.email_confirmed_at ||
      res.data?.user?.confirmed_at ||
      res.data?.email_confirmed_at
  );

  return {
    id: res.data?.user?.id || res.data?.id,
    alreadyConfirmed,
  };
}

export async function resendSupabaseSignupConfirmation(
  email: string,
  redirectTo?: string
): Promise<{ sent: boolean; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Informe o e-mail para reenviar o link de confirmação.");
  }
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não configurado neste ambiente.");
  }

  const query = redirectTo
    ? `?redirect_to=${encodeURIComponent(redirectTo)}`
    : "";
  const res = await sbAuthRequest<{
    msg?: string;
    message?: string;
    error_description?: string;
  }>(`resend${query}`, {
    method: "POST",
    useAnonKey: true,
    body: {
      type: "signup",
      email: cleanEmail,
    },
  });

  if (!res.ok) {
    throw new Error(
      res.data?.msg ||
        res.data?.error_description ||
        res.data?.message ||
        `Erro ao reenviar confirmação no Supabase (HTTP ${res.status}).`
    );
  }

  await appendAuditLog({
    action: "EMAIL_CONFIRMATION_RESENT",
    details_json: { email: cleanEmail },
  });

  return {
    sent: true,
    message:
      "Reenviamos o link de confirmação para o seu e-mail. Verifique a caixa de entrada e a pasta de spam.",
  };
}

async function verifyPasswordWithSupabaseAuth(
  email: string,
  password: string
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const res = await sbAuthRequest<{ access_token?: string }>(
    "token?grant_type=password",
    {
      method: "POST",
      useAnonKey: true,
      body: { email: email.trim().toLowerCase(), password },
    }
  );
  return res.ok && Boolean(res.data?.access_token);
}

export async function sendSupabasePasswordRecoveryEmail(
  email: string,
  redirectTo?: string
): Promise<{ sent: boolean; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Informe o e-mail para enviar o link de recuperação.");
  }
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase não configurado neste ambiente. Use a redefinição rápida com CRON_SECRET."
    );
  }

  const query = redirectTo
    ? `?redirect_to=${encodeURIComponent(redirectTo)}`
    : "";
  const res = await sbAuthRequest<{ msg?: string; message?: string; error_description?: string }>(
    `recover${query}`,
    {
      method: "POST",
      useAnonKey: true,
      body: { email: cleanEmail },
    }
  );

  if (!res.ok) {
    throw new Error(
      res.data?.msg ||
        res.data?.message ||
        res.data?.error_description ||
        `Erro ao solicitar recuperação no Supabase (HTTP ${res.status}).`
    );
  }

  await appendAuditLog({
    action: "PASSWORD_RECOVERY_REQUESTED",
    details_json: { email: cleanEmail },
  });

  return {
    sent: true,
    message:
      "Se o e-mail estiver cadastrado no Authentication do Supabase, enviamos um link de redefinição de senha para sua caixa de entrada (e spam).",
  };
}

export async function resetPasswordWithRecoveryAccessToken(
  accessToken: string,
  newPassword: string
): Promise<{ email: string }> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não está configurado.");
  }
  if (newPassword.trim().length < 6) {
    throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
  }

  const userRes = await sbAuthRequest<{ id?: string; email?: string; message?: string }>(
    "user",
    {
      method: "GET",
      useAnonKey: true,
      bearerToken: accessToken.trim(),
    }
  );

  if (!userRes.ok || !userRes.data?.email) {
    throw new Error(
      "Link de recuperação inválido ou expirado. Solicite um novo link."
    );
  }

  const updateRes = await sbAuthRequest<{ email?: string; msg?: string; message?: string }>(
    "user",
    {
      method: "PUT",
      useAnonKey: true,
      bearerToken: accessToken.trim(),
      body: { password: newPassword.trim() },
    }
  );

  if (!updateRes.ok) {
    throw new Error(
      updateRes.data?.msg ||
        updateRes.data?.message ||
        "Não foi possível atualizar a senha pelo token de recuperação."
    );
  }

  const cleanEmail = userRes.data.email.toLowerCase();
  const newHash = hashPassword(newPassword.trim());
  await sbRequest(`users?email=eq.${encodeURIComponent(cleanEmail)}`, {
    method: "PATCH",
    body: JSON.stringify({ password_hash: newHash }),
  });

  await appendAuditLog({
    action: "PASSWORD_RESET_VIA_EMAIL_LINK",
    details_json: { email: cleanEmail },
  });

  return { email: cleanEmail };
}

export async function resetUserPasswordByAdminOrSecret(params: {
  email: string;
  newPassword: string;
}): Promise<{ email: string }> {
  const cleanEmail = params.email.trim().toLowerCase();
  const pwd = params.newPassword.trim();
  if (!cleanEmail || pwd.length < 6) {
    throw new Error(
      "Informe um e-mail válido e uma nova senha com pelo menos 6 caracteres."
    );
  }

  const users = await listUsersInternal();
  const localUser = users.find((u) => u.email.toLowerCase() === cleanEmail);
  if (!localUser) {
    throw new Error(`Nenhuma conta encontrada com o e-mail "${cleanEmail}".`);
  }

  const newHash = hashPassword(pwd);

  if (isSupabaseConfigured()) {
    const authUser = await ensureSupabaseAuthUser({
      email: cleanEmail,
      password: pwd,
      name: localUser.name,
      role: localUser.role,
      company_id: localUser.company_id,
    });

    if (authUser?.id) {
      const upd = await sbAuthRequest<{ msg?: string; message?: string }>(
        `admin/users/${authUser.id}`,
        {
          method: "PUT",
          body: { password: pwd, email_confirm: true },
        }
      );
      if (!upd.ok) {
        throw new Error(
          upd.data?.msg ||
            upd.data?.message ||
            "Erro ao atualizar senha no Supabase Authentication."
        );
      }
    }

    await sbRequest(`users?email=eq.${encodeURIComponent(cleanEmail)}`, {
      method: "PATCH",
      body: JSON.stringify({ password_hash: newHash }),
    });
  } else {
    localUser.password_hash = newHash;
  }

  await appendAuditLog({
    company_id: localUser.company_id,
    user_id: localUser.id,
    action: "PASSWORD_RESET_BY_CRON_SECRET",
    details_json: { email: cleanEmail },
  });

  return { email: cleanEmail };
}

export async function registerNewAccount(input: {
  companyName?: string;
  name: string;
  whatsapp?: string;
  email: string;
  password: string;
  adminSecret?: string;
  redirectTo?: string;
}): Promise<{
  user: Omit<UserAccount, "password_hash">;
  mode: "supabase" | "memory";
  requiresEmailConfirmation: boolean;
}> {
  await ensureSeededInSupabase();
  const cleanEmail = input.email.trim().toLowerCase();
  const pwd = input.password.trim();
  const fullName = input.name.trim();

  if (!fullName || !cleanEmail || pwd.length < 6) {
    throw new Error(
      "Preencha nome, e-mail válido e senha com no mínimo 6 caracteres."
    );
  }

  const users = await listUsersInternal();
  if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
    throw new Error(
      "Este e-mail já está cadastrado. Faça login ou clique em Esqueci minha senha."
    );
  }

  const envCron = process.env.CRON_SECRET?.trim();
  const suppliedAdminSecret = input.adminSecret?.trim() || "";
  if (suppliedAdminSecret && suppliedAdminSecret !== envCron) {
    throw new Error(
      "Código Super Admin inválido. Deixe o campo vazio para criar conta de Empresa Cliente."
    );
  }

  const isSuperAdminSignup = Boolean(
    suppliedAdminSecret && envCron && suppliedAdminSecret === envCron
  );
  const role = isSuperAdminSignup ? "SUPER_ADMIN" : "COMPANY_ADMIN";

  let requiresEmailConfirmation = false;
  let signupUserId: string | undefined;

  if (isSupabaseConfigured() && !isSuperAdminSignup) {
    const signupRes = await signupSupabaseAuthUserWithEmailConfirmation({
      email: cleanEmail,
      password: pwd,
      name: fullName,
      role,
      redirectTo: input.redirectTo,
    });
    signupUserId = signupRes.id;
    requiresEmailConfirmation = !signupRes.alreadyConfirmed;
  }

  let targetCompanyId = "comp-mgd";
  if (!isSuperAdminSignup || input.companyName?.trim()) {
    const trialExpires = new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000
    ).toISOString();
    const company = await createOrUpdateCompanyByAdmin({
      name: input.companyName?.trim() || `Empresa de ${fullName}`,
      plan_id: isSuperAdminSignup ? "plan-agency" : "plan-pro",
      status: isSuperAdminSignup ? "ACTIVE" : "TRIAL",
      expires_at: trialExpires,
      owner_name: fullName,
      owner_whatsapp: input.whatsapp?.trim() || "",
    });
    targetCompanyId = company.id;
  }

  const newUser: UserAccount = {
    id: generateId("usr"),
    company_id: targetCompanyId,
    name: fullName,
    email: cleanEmail,
    password_hash: hashPassword(pwd),
    role,
    last_login_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    if (isSuperAdminSignup) {
      await ensureSupabaseAuthUser({
        email: cleanEmail,
        password: pwd,
        name: fullName,
        role,
        company_id: targetCompanyId,
      });
    } else if (signupUserId) {
      await sbAuthRequest(`admin/users/${signupUserId}`, {
        method: "PUT",
        body: {
          user_metadata: {
            name: fullName,
            role,
            company_id: targetCompanyId,
          },
        },
      }).catch(() => {});
    }
    await sbRequest("users?on_conflict=email", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(newUser),
    });
  } else {
    getMemDb().users.push(newUser);
  }

  await appendAuditLog({
    company_id: targetCompanyId,
    user_id: newUser.id,
    action: "USER_REGISTERED",
    details_json: {
      email: cleanEmail,
      role,
      requires_email_confirmation: requiresEmailConfirmation,
    },
  });

  const { password_hash: _ignored, ...safeUser } = newUser;
  void _ignored;
  return {
    user: safeUser,
    mode: getDatabaseMode(),
    requiresEmailConfirmation,
  };
}

async function sbRequest<T>(
  pathWithQuery: string,
  init: RequestInit = {}
): Promise<T> {
  const baseUrl = process.env.SUPABASE_URL!.trim().replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();

  const headers: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${baseUrl}/rest/v1/${pathWithQuery}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(
      `Supabase REST falhou (${res.status} em ${pathWithQuery}): ${bodyText}`
    );
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function ensureSeededInSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const mem = getMemDb();
  if (mem.seededSupabase) return;

  try {
    const existing = await sbRequest<Array<{ id: string }>>(
      "companies?select=id&limit=1"
    );
    if (existing.length > 0) {
      mem.seededSupabase = true;
      return;
    }

    await sbRequest("plans?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify(mem.plans),
    });
    await sbRequest("companies?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify(mem.companies),
    });
    await sbRequest("users?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify(mem.users),
    });
    await sbRequest("brand_settings?on_conflict=company_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify(mem.brands),
    });
    await sbRequest("integrations?on_conflict=company_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify(mem.integrations),
    });
    await sbRequest("topics?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify(mem.topics),
    });

    const adminPass = process.env.CRON_SECRET?.trim() || "mgd123456";
    await ensureSupabaseAuthUser({
      email: "admin@meugestordigital.com.br",
      password: adminPass,
      name: "Rander (Super Admin)",
      role: "SUPER_ADMIN",
      company_id: "comp-mgd",
    });
    await ensureSupabaseAuthUser({
      email: "contato@lojafashion.exemplo",
      password: "fashion123",
      name: "Gestora Loja Fashion",
      role: "COMPANY_ADMIN",
      company_id: "comp-fashion-demo",
    });

    mem.seededSupabase = true;
  } catch (err) {
    console.warn(
      "[store] Falha ao semear Supabase (verifique se schema.sql já foi executado):",
      err instanceof Error ? err.message : err
    );
  }
}

function unpackIntegrationsRow(raw: CompanyIntegrations): CompanyIntegrations {
  const result: CompanyIntegrations = { ...raw };
  const decryptedTk = decryptSecret(raw.tiktok_token_enc);
  if (decryptedTk && decryptedTk.startsWith('{"__packed":true')) {
    try {
      const packed = JSON.parse(decryptedTk) as {
        __packed?: boolean;
        tiktok_token?: string | null;
        tiktok_refresh_token?: string | null;
        tiktok_expires_at?: string | null;
        allow_image_ai_fallback?: boolean;
        r2?: {
          account_id?: string | null;
          access_key_id?: string | null;
          secret_access_key?: string | null;
          bucket_name?: string | null;
          public_url?: string | null;
        };
      };
      result.tiktok_token_enc = packed.tiktok_token
        ? encryptSecret(packed.tiktok_token)
        : null;
      result.tiktok_refresh_token_enc = packed.tiktok_refresh_token
        ? encryptSecret(packed.tiktok_refresh_token)
        : null;
      result.tiktok_expires_at = packed.tiktok_expires_at || null;
      if (packed.r2) {
        result.r2_account_id = result.r2_account_id || packed.r2.account_id || null;
        result.r2_access_key_id_enc =
          result.r2_access_key_id_enc ||
          (packed.r2.access_key_id
            ? encryptSecret(packed.r2.access_key_id)
            : null);
        result.r2_secret_access_key_enc =
          result.r2_secret_access_key_enc ||
          (packed.r2.secret_access_key
            ? encryptSecret(packed.r2.secret_access_key)
            : null);
        result.r2_bucket_name =
          result.r2_bucket_name || packed.r2.bucket_name || null;
        result.r2_public_url =
          result.r2_public_url || packed.r2.public_url || null;
      }
      if (typeof packed.allow_image_ai_fallback === "boolean") {
        result.allow_image_ai_fallback = packed.allow_image_ai_fallback;
      }
    } catch {
      // Ignora JSON inválido
    }
  }
  return result;
}

export function toPublicIntegrations(
  rawInteg: CompanyIntegrations
): CompanyIntegrationsPublic {
  const integ = unpackIntegrationsRow(rawInteg);
  const hasCustomR2 = Boolean(
    integ.r2_account_id?.trim() &&
      decryptSecret(integ.r2_access_key_id_enc) &&
      decryptSecret(integ.r2_secret_access_key_enc) &&
      integ.r2_bucket_name?.trim() &&
      integ.r2_public_url?.trim()
  );
  const hasGlobalR2 = Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET_NAME?.trim() &&
      process.env.R2_PUBLIC_URL?.trim()
  );

  return {
    company_id: integ.company_id,
    preferred_text_ai: integ.preferred_text_ai,
    preferred_image_ai: integ.preferred_image_ai,
    has_gemini_key: Boolean(decryptSecret(integ.gemini_key_enc)),
    gemini_key_mask: maskSecret(integ.gemini_key_enc),
    has_openai_key: Boolean(decryptSecret(integ.openai_key_enc)),
    openai_key_mask: maskSecret(integ.openai_key_enc),
    has_anthropic_key: Boolean(decryptSecret(integ.anthropic_key_enc)),
    anthropic_key_mask: maskSecret(integ.anthropic_key_enc),
    has_meta_token: Boolean(decryptSecret(integ.meta_token_enc)),
    meta_token_mask: maskSecret(integ.meta_token_enc),
    meta_token_expires_at: integ.meta_token_expires_at || null,
    ig_user_id: integ.ig_user_id || "",
    fb_page_id: integ.fb_page_id || "",
    r2_account_id: integ.r2_account_id || "",
    has_r2_access_key: Boolean(decryptSecret(integ.r2_access_key_id_enc)),
    r2_access_key_mask: maskSecret(integ.r2_access_key_id_enc),
    has_r2_secret_key: Boolean(decryptSecret(integ.r2_secret_access_key_enc)),
    r2_secret_key_mask: maskSecret(integ.r2_secret_access_key_enc),
    r2_bucket_name: integ.r2_bucket_name || "",
    r2_public_url: integ.r2_public_url || "",
    using_global_r2_fallback: !hasCustomR2 && hasGlobalR2,
    has_tiktok_token: Boolean(decryptSecret(integ.tiktok_token_enc)),
    tiktok_open_id: integ.tiktok_open_id || "",
    tiktok_enabled: Boolean(decryptSecret(integ.tiktok_token_enc)),
    allow_image_ai_fallback: Boolean(integ.allow_image_ai_fallback),
  };
}

export async function appendAuditLog(params: {
  company_id?: string | null;
  user_id?: string | null;
  action: string;
  details_json?: Record<string, unknown>;
}): Promise<void> {
  const item: AuditLogItem = {
    id: generateId("aud"),
    company_id: params.company_id ?? null,
    user_id: params.user_id ?? null,
    action: params.action,
    details_json: params.details_json ?? {},
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    try {
      await sbRequest("audit_logs", {
        method: "POST",
        body: JSON.stringify(item),
      });
      return;
    } catch {
      // Fallback para memória se falhar
    }
  }

  const mem = getMemDb();
  mem.audits.unshift(item);
  if (mem.audits.length > 200) mem.audits.length = 200;
}

export async function authenticateLogin(params: {
  email?: string;
  password?: string;
  cronSecret?: string;
}): Promise<{ user: Omit<UserAccount, "password_hash">; mode: "supabase" | "memory" } | null> {
  await ensureSeededInSupabase();
  const envCronSecret = process.env.CRON_SECRET?.trim();

  // Suporte direto ao CRON_SECRET ou campo senha com CRON_SECRET para Super Admin
  const rawSecret = params.cronSecret?.trim() || params.password?.trim() || "";
  if (
    envCronSecret &&
    rawSecret === envCronSecret &&
    (!params.email?.trim() ||
      params.email.trim().toLowerCase() === "admin@meugestordigital.com.br")
  ) {
    const users = await listUsersInternal();
    const superAdmin =
      users.find((u) => u.role === "SUPER_ADMIN") || getMemDb().users[0];
    const { password_hash: _ignored, ...safeUser } = superAdmin;
    void _ignored;
    await appendAuditLog({
      company_id: safeUser.company_id,
      user_id: safeUser.id,
      action: "USER_LOGIN_CRON_SECRET",
      details_json: { email: safeUser.email },
    });
    return { user: safeUser, mode: getDatabaseMode() };
  }

  const email = params.email?.trim().toLowerCase();
  const password = params.password?.trim() || "";
  if (!email || !password) return null;

  const users = await listUsersInternal();
  const found = users.find((u) => u.email.toLowerCase() === email);

  if (!found) return null;

  let authenticatedViaSupabaseAuth = false;
  if (isSupabaseConfigured()) {
    const sbUser = await findSupabaseAuthUserByEmail(email);
    if (sbUser && !sbUser.email_confirmed_at && !sbUser.confirmed_at) {
      throw new EmailNotConfirmedError(email);
    }
    authenticatedViaSupabaseAuth = await verifyPasswordWithSupabaseAuth(
      email,
      password
    );
  }

  const validLocalHash = verifyPassword(password, found.password_hash);
  if (!authenticatedViaSupabaseAuth && !validLocalHash) return null;

  if (authenticatedViaSupabaseAuth && !validLocalHash && isSupabaseConfigured()) {
    // Sincroniza hash local quando a senha foi alterada diretamente no Supabase Auth
    await sbRequest(`users?email=eq.${encodeURIComponent(email)}`, {
      method: "PATCH",
      body: JSON.stringify({ password_hash: hashPassword(password) }),
    }).catch(() => {});
  } else if (!authenticatedViaSupabaseAuth && validLocalHash && isSupabaseConfigured()) {
    // Garante que usuários antigos passem a existir no Authentication -> Users do Supabase
    await ensureSupabaseAuthUser({
      email: found.email,
      password,
      name: found.name,
      role: found.role,
      company_id: found.company_id,
    });
  }

  const { password_hash: _ignored, ...safeUser } = found;
  void _ignored;
  await appendAuditLog({
    company_id: safeUser.company_id,
    user_id: safeUser.id,
    action: "USER_LOGIN",
    details_json: { email: safeUser.email, role: safeUser.role },
  });
  return { user: safeUser, mode: getDatabaseMode() };
}

async function listUsersInternal(): Promise<UserAccount[]> {
  if (isSupabaseConfigured()) {
    try {
      return await sbRequest<UserAccount[]>("users?select=*&order=created_at.asc");
    } catch {
      return getMemDb().users;
    }
  }
  return getMemDb().users;
}

export async function listPlans(): Promise<Plan[]> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      return await sbRequest<Plan[]>("plans?select=*&order=price_brl.asc");
    } catch {
      return getMemDb().plans;
    }
  }
  return getMemDb().plans;
}

export async function listCompanies(): Promise<Company[]> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      return await sbRequest<Company[]>(
        "companies?select=*&order=created_at.asc"
      );
    } catch {
      return getMemDb().companies;
    }
  }
  return getMemDb().companies;
}

export async function getCompanyById(companyId: string): Promise<Company | null> {
  const companies = await listCompanies();
  return companies.find((c) => c.id === companyId) || null;
}

const DARK_LOGO_MARKER = "||dark:";

function unpackBrandRow(b: BrandSettings): BrandSettings {
  const raw = b.logo_url || "";
  if (raw.includes(DARK_LOGO_MARKER)) {
    const [lightPart, darkPart] = raw.split(DARK_LOGO_MARKER);
    return {
      ...b,
      logo_url: lightPart.trim() || null,
      logo_dark_url: darkPart?.trim() || null,
    };
  }
  return {
    ...b,
    logo_url: raw.trim() || null,
    logo_dark_url: b.logo_dark_url || null,
  };
}

function packBrandLogoField(
  lightUrl?: string | null,
  darkUrl?: string | null
): string | null {
  const l = (lightUrl || "").trim();
  const d = (darkUrl || "").trim();
  if (!l && !d) return null;
  if (d) return `${l}${DARK_LOGO_MARKER}${d}`;
  return l;
}

export async function getBrandSettings(
  companyId: string
): Promise<BrandSettings> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      const rows = await sbRequest<BrandSettings[]>(
        `brand_settings?company_id=eq.${encodeURIComponent(companyId)}&limit=1`
      );
      if (rows[0]) return unpackBrandRow(rows[0]);
    } catch {
      // Fallback
    }
  }
  const found = getMemDb().brands.find((b) => b.company_id === companyId);
  if (found) return unpackBrandRow(found);

  const preset = LUMINOUS_THEME_PRESETS[0];
  return {
    company_id: companyId,
    theme_preset: preset.id,
    footer_name: "Sua Empresa",
    subtitle_default: "",
    cta_default: 'COMENTE "EU QUERO"',
    logo_url: null,
    logo_dark_url: null,
    primary_color: preset.primary_color,
    secondary_color: preset.secondary_color,
    accent_color: preset.accent_color,
    bg_color: preset.bg_color,
    text_color: preset.text_color,
  };
}

export async function getCompanyIntegrations(
  companyId: string
): Promise<CompanyIntegrations> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      const rows = await sbRequest<CompanyIntegrations[]>(
        `integrations?company_id=eq.${encodeURIComponent(companyId)}&limit=1`
      );
      if (rows[0]) return unpackIntegrationsRow(rows[0]);
    } catch {
      // Fallback
    }
  }
  const found = getMemDb().integrations.find((i) => i.company_id === companyId);
  if (found) return unpackIntegrationsRow(found);

  return {
    company_id: companyId,
    preferred_text_ai: "GEMINI",
    preferred_image_ai: "GEMINI",
    gemini_key_enc: null,
    openai_key_enc: null,
    anthropic_key_enc: null,
    meta_token_enc: null,
    meta_token_expires_at: null,
    ig_user_id: null,
    fb_page_id: null,
    r2_account_id: null,
    r2_access_key_id_enc: null,
    r2_secret_access_key_enc: null,
    r2_bucket_name: null,
    r2_public_url: null,
    tiktok_token_enc: null,
    tiktok_open_id: null,
    tiktok_enabled: false,
  };
}

export async function getCompanySecrets(companyId: string) {
  const integ = await getCompanyIntegrations(companyId);
  return {
    preferred_text_ai: integ.preferred_text_ai,
    preferred_image_ai: integ.preferred_image_ai,
    gemini_api_key:
      decryptSecret(integ.gemini_key_enc) ||
      process.env.GEMINI_API_KEY?.trim() ||
      null,
    openai_api_key:
      decryptSecret(integ.openai_key_enc) ||
      process.env.OPENAI_API_KEY?.trim() ||
      null,
    anthropic_api_key:
      decryptSecret(integ.anthropic_key_enc) ||
      process.env.ANTHROPIC_API_KEY?.trim() ||
      null,
    meta_access_token: decryptSecret(integ.meta_token_enc),
    meta_token_expires_at: integ.meta_token_expires_at || null,
    ig_user_id: integ.ig_user_id?.trim() || null,
    fb_page_id: integ.fb_page_id?.trim() || null,
    r2_config: {
      accountId: integ.r2_account_id?.trim() || null,
      accessKeyId: decryptSecret(integ.r2_access_key_id_enc),
      secretAccessKey: decryptSecret(integ.r2_secret_access_key_enc),
      bucketName: integ.r2_bucket_name?.trim() || null,
      publicUrl: integ.r2_public_url?.trim() || null,
    },
    tiktok_access_token: decryptSecret(integ.tiktok_token_enc),
    tiktok_refresh_token: decryptSecret(integ.tiktok_refresh_token_enc),
    tiktok_expires_at: integ.tiktok_expires_at || null,
    tiktok_open_id: integ.tiktok_open_id?.trim() || null,
    tiktok_enabled: Boolean(decryptSecret(integ.tiktok_token_enc)),
    allow_image_ai_fallback: Boolean(integ.allow_image_ai_fallback),
  };
}

export async function refreshTikTokTokenIfNeeded(
  companyId: string
): Promise<string | null> {
  const secrets = await getCompanySecrets(companyId);
  if (!secrets.tiktok_enabled || !secrets.tiktok_access_token) {
    return null;
  }
  const expiresMs = secrets.tiktok_expires_at
    ? new Date(secrets.tiktok_expires_at).getTime()
    : 0;
  const needsRefresh =
    Boolean(secrets.tiktok_refresh_token) &&
    (!expiresMs || Date.now() >= expiresMs - 10 * 60_000);

  if (!needsRefresh) {
    return secrets.tiktok_access_token;
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
  if (!clientKey || !clientSecret || !secrets.tiktok_refresh_token) {
    return secrets.tiktok_access_token;
  }

  try {
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: secrets.tiktok_refresh_token,
    });
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(12_000),
    });
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      open_id?: string;
    };
    if (res.ok && data.access_token) {
      const expiresAt = new Date(
        Date.now() + Number(data.expires_in || 86400) * 1000
      ).toISOString();
      await saveCompanyIntegrations(companyId, {
        tiktok_access_token: data.access_token,
        tiktok_refresh_token:
          data.refresh_token || secrets.tiktok_refresh_token,
        tiktok_expires_at: expiresAt,
        tiktok_open_id: data.open_id || secrets.tiktok_open_id || undefined,
        tiktok_enabled: true,
      });
      return data.access_token;
    }
  } catch {
    // Mantém token atual se o refresh falhar momentaneamente
  }
  return secrets.tiktok_access_token;
}

export function parseScheduleTimes(
  scheduleTime?: string | null,
  scheduleTimes?: string[] | null
): string[] {
  const raw = Array.isArray(scheduleTimes) && scheduleTimes.length > 0
    ? scheduleTimes
    : String(scheduleTime || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  const valid = Array.from(
    new Set(
      raw
        .map((s) => s.trim())
        .filter((s) => /^\d{2}:\d{2}$/.test(s))
    )
  ).sort();
  return valid.length > 0 ? valid : ["10:00"];
}

export function normalizePublishTargets(
  raw?: Partial<PublishTargets> | null,
  legacyStories?: boolean
): PublishTargets {
  if (raw && typeof raw === "object") {
    const next: PublishTargets = {
      ig_feed: raw.ig_feed ?? true,
      ig_stories: raw.ig_stories ?? Boolean(legacyStories),
      fb_feed: raw.fb_feed ?? true,
      fb_stories: raw.fb_stories ?? Boolean(legacyStories),
      tiktok_feed: raw.tiktok_feed ?? true,
    };
    if (
      !next.ig_feed &&
      !next.ig_stories &&
      !next.fb_feed &&
      !next.fb_stories &&
      !next.tiktok_feed
    ) {
      next.ig_feed = true;
    }
    return next;
  }
  return {
    ig_feed: true,
    ig_stories: Boolean(legacyStories),
    fb_feed: true,
    fb_stories: Boolean(legacyStories),
    tiktok_feed: true,
  };
}

function serializePublishTargets(t: PublishTargets): string {
  const keys: Array<keyof PublishTargets> = [
    "ig_feed",
    "ig_stories",
    "fb_feed",
    "fb_stories",
    "tiktok_feed",
  ];
  return keys.filter((k) => t[k]).join(",");
}

function parseSerializedTargets(raw: string): PublishTargets {
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return normalizePublishTargets({
    ig_feed: set.has("ig_feed"),
    ig_stories: set.has("ig_stories"),
    fb_feed: set.has("fb_feed"),
    fb_stories: set.has("fb_stories"),
    tiktok_feed: set.has("tiktok_feed"),
  });
}

function unpackTopicRow(t: Topic): Topic {
  let cleanNiche = t.niche_template || "custom";
  let mode = t.ai_photo_mode;
  let imgPref = t.preferred_image_ai ?? null;
  let publishToStories = Boolean(t.publish_to_stories);
  let parsedTargets: PublishTargets | null = t.publish_targets
    ? normalizePublishTargets(t.publish_targets, publishToStories)
    : null;

  const targetsMarker = "__targets:";
  const tIdx = cleanNiche.indexOf(targetsMarker);
  if (tIdx >= 0) {
    const rawTargets = cleanNiche.slice(tIdx + targetsMarker.length).split("__")[0];
    cleanNiche =
      (cleanNiche.slice(0, tIdx) +
        cleanNiche.slice(tIdx + targetsMarker.length + rawTargets.length)) ||
      "custom";
    parsedTargets = parseSerializedTargets(rawTargets);
  }

  const storiesMarker = "__stories:1";
  if (cleanNiche.includes(storiesMarker)) {
    publishToStories = true;
    cleanNiche = cleanNiche.replace(storiesMarker, "") || "custom";
  }

  const imgMarker = "__img:";
  const imgIdx = cleanNiche.indexOf(imgMarker);
  if (imgIdx >= 0) {
    const rawImg = cleanNiche.slice(imgIdx + imgMarker.length).split("__")[0];
    cleanNiche = cleanNiche.slice(0, imgIdx) || "custom";
    if (rawImg === "GEMINI" || rawImg === "OPENAI" || rawImg === "OPENAI_MINI") {
      imgPref = imgPref || rawImg;
    }
  }

  const marker = "__mode:";
  const idx = cleanNiche.indexOf(marker);
  if (idx >= 0) {
    mode = (cleanNiche.slice(idx + marker.length) as Topic["ai_photo_mode"]) || mode;
    cleanNiche = cleanNiche.slice(0, idx) || "custom";
  }

  const finalTargets =
    parsedTargets || normalizePublishTargets(null, publishToStories);
  const hasStories = finalTargets.ig_stories || finalTargets.fb_stories;
  const hasFeed = finalTargets.ig_feed || finalTargets.fb_feed;
  const derivedRatio = !hasFeed && (hasStories || finalTargets.tiktok_feed)
    ? "9:16"
    : "1:1";

  const schedule_times = parseScheduleTimes(t.schedule_time, t.schedule_times);
  return {
    ...t,
    niche_template: cleanNiche,
    ai_photo_mode: mode,
    preferred_image_ai: imgPref,
    publish_to_stories: hasStories,
    publish_targets: finalTargets,
    aspect_ratio: derivedRatio,
    schedule_times,
    schedule_time: schedule_times[0],
  };
}

export async function listTopicsByCompany(companyId: string): Promise<Topic[]> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      const rows = await sbRequest<Topic[]>(
        `topics?company_id=eq.${encodeURIComponent(companyId)}&order=created_at.asc`
      );
      return rows.map(unpackTopicRow);
    } catch {
      // Fallback
    }
  }
  return getMemDb().topics.filter((t) => t.company_id === companyId).map(unpackTopicRow);
}

export async function listPhotosByCompany(
  companyId: string
): Promise<TopicPhoto[]> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      return await sbRequest<TopicPhoto[]>(
        `topic_photos?company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc`
      );
    } catch {
      // Fallback
    }
  }
  return getMemDb().photos.filter((p) => p.company_id === companyId);
}

function unpackPostHistoryRow(p: PostHistoryItem): PostHistoryItem {
  const storyUrls =
    Array.isArray(p.story_image_urls_json) && p.story_image_urls_json.length > 0
      ? p.story_image_urls_json
      : Array.isArray(p.content_json?.story_image_urls)
      ? p.content_json.story_image_urls
      : [];
  const targets = p.publish_targets || p.content_json?.publish_targets;
  const organicMetrics =
    p.organic_metrics || p.content_json?.organic_metrics || null;
  return {
    ...p,
    story_image_urls_json: storyUrls,
    ...(targets ? { publish_targets: targets } : {}),
    ...(organicMetrics ? { organic_metrics: organicMetrics } : {}),
  };
}

export async function listPostsHistory(
  companyId?: string,
  limit = 250
): Promise<PostHistoryItem[]> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      const filter = companyId
        ? `company_id=eq.${encodeURIComponent(companyId)}&`
        : "";
      const rows = await sbRequest<PostHistoryItem[]>(
        `posts_history?${filter}order=created_at.desc&limit=${limit}`
      );
      return rows.map(unpackPostHistoryRow);
    } catch {
      // Fallback
    }
  }
  const all = getMemDb().posts;
  const filtered = companyId
    ? all.filter((p) => p.company_id === companyId)
    : all;
  return filtered.slice(0, limit).map(unpackPostHistoryRow);
}

export async function listAuditLogs(
  companyId?: string,
  limit = 60
): Promise<AuditLogItem[]> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      const filter = companyId
        ? `company_id=eq.${encodeURIComponent(companyId)}&`
        : "";
      return await sbRequest<AuditLogItem[]>(
        `audit_logs?${filter}order=created_at.desc&limit=${limit}`
      );
    } catch {
      // Fallback
    }
  }
  const all = getMemDb().audits;
  const filtered = companyId
    ? all.filter((a) => a.company_id === companyId)
    : all;
  return filtered.slice(0, limit);
}

export async function getCompanyWorkspace(companyId: string) {
  const [
    company,
    plans,
    brand,
    integrations,
    topics,
    photos,
    posts,
    audits,
    tips,
  ] = await Promise.all([
    getCompanyById(companyId),
    listPlans(),
    getBrandSettings(companyId),
    getCompanyIntegrations(companyId),
    listTopicsByCompany(companyId),
    listPhotosByCompany(companyId),
    listPostsHistory(companyId, 250),
    listAuditLogs(companyId, 30),
    listImprovementTips(companyId, 100),
  ]);

  if (!company) return null;
  const plan = plans.find((p) => p.id === company.plan_id) || plans[0];

  return {
    database_mode: getDatabaseMode(),
    company,
    plan,
    brand,
    integrations: toPublicIntegrations(integrations),
    topics,
    photos,
    posts,
    audits,
    tips,
  };
}

export async function getSuperAdminSnapshot() {
  const [plans, companies, users, posts, audits, tips] = await Promise.all([
    listPlans(),
    listCompanies(),
    listUsersInternal(),
    listPostsHistory(undefined, 50),
    listAuditLogs(undefined, 80),
    listImprovementTips(undefined, 200),
  ]);

  const enrichedCompanies = await Promise.all(
    companies.map(async (c) => {
      const integ = await getCompanyIntegrations(c.id);
      const topics = await listTopicsByCompany(c.id);
      const plan = plans.find((p) => p.id === c.plan_id) || plans[0];
      return {
        ...c,
        plan_name: plan?.name || c.plan_id,
        plan_price: plan?.price_brl || 0,
        plan_limit: plan?.max_posts_month || 12,
        topics_count: topics.length,
        integrations: toPublicIntegrations(integ),
      };
    })
  );

  const safeUsers = users.map(({ password_hash: _p, ...u }) => {
    void _p;
    return u;
  });

  const activeMrr = enrichedCompanies
    .filter((c) => c.status === "ACTIVE")
    .reduce((sum, c) => sum + Number(c.plan_price || 0), 0);

  return {
    database_mode: getDatabaseMode(),
    metrics: {
      total_companies: companies.length,
      active_companies: companies.filter((c) => c.status === "ACTIVE").length,
      trial_companies: companies.filter((c) => c.status === "TRIAL").length,
      blocked_or_due: companies.filter(
        (c) => c.status === "BLOCKED" || c.status === "PAST_DUE"
      ).length,
      mrr_brl: activeMrr,
      total_posts_month: companies.reduce(
        (sum, c) => sum + (c.posts_used_month || 0),
        0
      ),
    },
    plans,
    companies: enrichedCompanies,
    users: safeUsers,
    posts,
    audits,
    tips,
  };
}

export async function saveBrandSettings(
  companyId: string,
  payload: Partial<BrandSettings>,
  userId?: string
): Promise<BrandSettings> {
  const current = await getBrandSettings(companyId);
  const next: BrandSettings = {
    ...current,
    ...payload,
    company_id: companyId,
  };

  if (isSupabaseConfigured()) {
    const dbRow: Record<string, unknown> = {
      ...next,
      logo_url: packBrandLogoField(next.logo_url, next.logo_dark_url),
      updated_at: new Date().toISOString(),
    };
    delete dbRow.logo_dark_url;
    await sbRequest("brand_settings?on_conflict=company_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(dbRow),
    });
  } else {
    const mem = getMemDb();
    const idx = mem.brands.findIndex((b) => b.company_id === companyId);
    if (idx >= 0) mem.brands[idx] = next;
    else mem.brands.push(next);
  }

  await appendAuditLog({
    company_id: companyId,
    user_id: userId,
    action: "BRAND_UPDATED",
    details_json: { theme_preset: next.theme_preset, footer_name: next.footer_name },
  });

  return next;
}

export async function saveCompanyIntegrations(
  companyId: string,
  input: {
    preferred_text_ai?: "GEMINI" | "OPENAI" | "CLAUDE";
    preferred_image_ai?: "GEMINI" | "OPENAI" | "OPENAI_MINI";
    gemini_api_key?: string;
    openai_api_key?: string;
    anthropic_api_key?: string;
    meta_access_token?: string;
    meta_token_expires_at?: string | null;
    ig_user_id?: string;
    fb_page_id?: string;
    r2_account_id?: string;
    r2_access_key_id?: string;
    r2_secret_access_key?: string;
    r2_bucket_name?: string;
    r2_public_url?: string;
    tiktok_access_token?: string;
    tiktok_refresh_token?: string;
    tiktok_expires_at?: string | null;
    tiktok_open_id?: string;
    tiktok_enabled?: boolean;
    allow_image_ai_fallback?: boolean;
  },
  userId?: string
): Promise<CompanyIntegrationsPublic> {
  const current = await getCompanyIntegrations(companyId);

  const next: CompanyIntegrations = {
    ...current,
    company_id: companyId,
    preferred_text_ai: input.preferred_text_ai || current.preferred_text_ai,
    preferred_image_ai: input.preferred_image_ai || current.preferred_image_ai,
    allow_image_ai_fallback:
      input.allow_image_ai_fallback !== undefined
        ? Boolean(input.allow_image_ai_fallback)
        : Boolean(current.allow_image_ai_fallback),
    gemini_key_enc:
      input.gemini_api_key !== undefined
        ? input.gemini_api_key.trim()
          ? encryptSecret(input.gemini_api_key.trim())
          : null
        : current.gemini_key_enc,
    openai_key_enc:
      input.openai_api_key !== undefined
        ? input.openai_api_key.trim()
          ? encryptSecret(input.openai_api_key.trim())
          : null
        : current.openai_key_enc,
    anthropic_key_enc:
      input.anthropic_api_key !== undefined
        ? input.anthropic_api_key.trim()
          ? encryptSecret(input.anthropic_api_key.trim())
          : null
        : current.anthropic_key_enc,
    meta_token_enc:
      input.meta_access_token !== undefined
        ? encryptSecret(input.meta_access_token)
        : current.meta_token_enc,
    meta_token_expires_at:
      input.meta_token_expires_at !== undefined
        ? input.meta_token_expires_at
        : current.meta_token_expires_at,
    ig_user_id:
      input.ig_user_id !== undefined
        ? input.ig_user_id.trim() || null
        : current.ig_user_id,
    fb_page_id:
      input.fb_page_id !== undefined
        ? input.fb_page_id.trim() || null
        : current.fb_page_id,
    r2_account_id:
      input.r2_account_id !== undefined
        ? input.r2_account_id.trim() || null
        : current.r2_account_id ?? null,
    r2_access_key_id_enc:
      input.r2_access_key_id !== undefined
        ? encryptSecret(input.r2_access_key_id)
        : current.r2_access_key_id_enc ?? null,
    r2_secret_access_key_enc:
      input.r2_secret_access_key !== undefined
        ? encryptSecret(input.r2_secret_access_key)
        : current.r2_secret_access_key_enc ?? null,
    r2_bucket_name:
      input.r2_bucket_name !== undefined
        ? input.r2_bucket_name.trim() || null
        : current.r2_bucket_name ?? null,
    r2_public_url:
      input.r2_public_url !== undefined
        ? input.r2_public_url.trim().replace(/\/+$/, "") || null
        : current.r2_public_url ?? null,
    tiktok_token_enc:
      input.tiktok_access_token !== undefined
        ? encryptSecret(input.tiktok_access_token)
        : current.tiktok_token_enc,
    tiktok_refresh_token_enc:
      input.tiktok_refresh_token !== undefined
        ? encryptSecret(input.tiktok_refresh_token)
        : current.tiktok_refresh_token_enc ?? null,
    tiktok_expires_at:
      input.tiktok_expires_at !== undefined
        ? input.tiktok_expires_at
        : current.tiktok_expires_at ?? null,
    tiktok_open_id:
      input.tiktok_open_id !== undefined
        ? input.tiktok_open_id.trim() || null
        : current.tiktok_open_id,
    tiktok_enabled:
      input.tiktok_enabled !== undefined
        ? input.tiktok_enabled
        : current.tiktok_enabled,
  };

  const rawTk = decryptSecret(next.tiktok_token_enc);
  next.tiktok_enabled = Boolean(rawTk);
  const rawRefresh = decryptSecret(next.tiktok_refresh_token_enc);
  if (rawRefresh || next.tiktok_expires_at) {
    next.tiktok_token_enc = encryptSecret(
      JSON.stringify({
        __packed: true,
        tiktok_token: rawTk,
        tiktok_refresh_token: rawRefresh,
        tiktok_expires_at: next.tiktok_expires_at || null,
        allow_image_ai_fallback: Boolean(next.allow_image_ai_fallback),
      })
    );
  }

  if (isSupabaseConfigured()) {
    const nowIso = new Date().toISOString();
    const dbRow: Record<string, unknown> = { ...next, updated_at: nowIso };
    delete dbRow.tiktok_refresh_token_enc;
    delete dbRow.tiktok_expires_at;
    try {
      await sbRequest("integrations?on_conflict=company_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(dbRow),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("PGRST204")) {
        // Fallback compatível quando a tabela integrations no Supabase ainda não recebeu ALTER TABLE com colunas r2_*
        const packedPayload = JSON.stringify({
          __packed: true,
          tiktok_token: rawTk,
          tiktok_refresh_token: rawRefresh,
          tiktok_expires_at: next.tiktok_expires_at || null,
          allow_image_ai_fallback: Boolean(next.allow_image_ai_fallback),
          r2: {
            account_id: next.r2_account_id,
            access_key_id: decryptSecret(next.r2_access_key_id_enc),
            secret_access_key: decryptSecret(next.r2_secret_access_key_enc),
            bucket_name: next.r2_bucket_name,
            public_url: next.r2_public_url,
          },
        });
        const legacyRow = {
          company_id: next.company_id,
          preferred_text_ai: next.preferred_text_ai,
          preferred_image_ai: next.preferred_image_ai,
          gemini_key_enc: next.gemini_key_enc,
          openai_key_enc: next.openai_key_enc,
          anthropic_key_enc: next.anthropic_key_enc,
          meta_token_enc: next.meta_token_enc,
          meta_token_expires_at: next.meta_token_expires_at,
          ig_user_id: next.ig_user_id,
          fb_page_id: next.fb_page_id,
          tiktok_token_enc: encryptSecret(packedPayload),
          tiktok_open_id: next.tiktok_open_id,
          tiktok_enabled: next.tiktok_enabled,
          updated_at: nowIso,
        };
        await sbRequest("integrations?on_conflict=company_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify(legacyRow),
        });
      } else {
        throw err;
      }
    }
  } else {
    const mem = getMemDb();
    const idx = mem.integrations.findIndex((i) => i.company_id === companyId);
    if (idx >= 0) mem.integrations[idx] = next;
    else mem.integrations.push(next);
  }

  await appendAuditLog({
    company_id: companyId,
    user_id: userId,
    action: "INTEGRATIONS_UPDATED",
    details_json: {
      preferred_text_ai: next.preferred_text_ai,
      preferred_image_ai: next.preferred_image_ai,
      tiktok_enabled: next.tiktok_enabled,
    },
  });

  return toPublicIntegrations(next);
}

export async function upsertTopic(
  companyId: string,
  input: Partial<Topic> & { title: string; prompt_instructions: string },
  userId?: string
): Promise<Topic> {
  const existingTopics = await listTopicsByCompany(companyId);
  const existing = input.id
    ? existingTopics.find((t) => t.id === input.id)
    : undefined;

  const parsedTimes = parseScheduleTimes(
    input.schedule_time ?? existing?.schedule_time,
    input.schedule_times ?? existing?.schedule_times
  );
  const serializedTime = parsedTimes.join(",");
  const preferredImageAI =
    input.preferred_image_ai !== undefined
      ? input.preferred_image_ai
      : existing?.preferred_image_ai ?? null;
  const publishTargets = normalizePublishTargets(
    input.publish_targets ?? existing?.publish_targets,
    input.publish_to_stories ?? existing?.publish_to_stories
  );
  const publishToStories =
    publishTargets.ig_stories || publishTargets.fb_stories;
  const hasFeed = publishTargets.ig_feed || publishTargets.fb_feed;
  const derivedRatio =
    !hasFeed && (publishToStories || publishTargets.tiktok_feed)
      ? "9:16"
      : "1:1";

  const topic: Topic = {
    id: existing?.id || generateId("top"),
    company_id: companyId,
    title: input.title.trim(),
    niche_template: input.niche_template || existing?.niche_template || "custom",
    prompt_instructions: input.prompt_instructions.trim(),
    offer_price:
      input.offer_price !== undefined
        ? input.offer_price
        : existing?.offer_price || null,
    benefits_json:
      input.benefits_json ?? existing?.benefits_json ?? [],
    post_format: input.post_format || existing?.post_format || "SINGLE",
    slides_count: Math.min(
      8,
      Math.max(1, Number(input.slides_count ?? existing?.slides_count ?? 1))
    ),
    aspect_ratio: derivedRatio,
    approval_mode: input.approval_mode || existing?.approval_mode || "AUTO",
    ai_photo_mode: input.ai_photo_mode || existing?.ai_photo_mode || "NONE",
    ai_photo_prompt:
      input.ai_photo_prompt !== undefined
        ? input.ai_photo_prompt
        : existing?.ai_photo_prompt || null,
    preferred_image_ai: preferredImageAI,
    publish_to_stories: publishToStories,
    publish_targets: publishTargets,
    schedule_days:
      input.schedule_days ?? existing?.schedule_days ?? [1, 3, 5],
    schedule_time: serializedTime,
    schedule_times: parsedTimes,
    is_active: input.is_active ?? existing?.is_active ?? true,
    last_posted_at: existing?.last_posted_at || null,
    created_at: existing?.created_at || new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    const packedNiche = `${topic.niche_template || "custom"}__targets:${serializePublishTargets(
      publishTargets
    )}`;
    const dbTopic: Record<string, unknown> = {
      ...topic,
      niche_template: packedNiche,
    };
    delete dbTopic.schedule_times;
    delete dbTopic.publish_targets;
    delete dbTopic.publish_to_stories;
    try {
      await sbRequest("topics?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(dbTopic),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("23514") ||
        msg.includes("PGRST204") ||
        msg.includes("ai_photo_mode") ||
        msg.includes("preferred_image_ai") ||
        msg.includes("publish_to_stories")
      ) {
        const legacyNiche = `${topic.niche_template || "custom"}__targets:${serializePublishTargets(
          publishTargets
        )}__mode:${topic.ai_photo_mode}${
          topic.preferred_image_ai ? `__img:${topic.preferred_image_ai}` : ""
        }`;
        const legacyTopic: Record<string, unknown> = {
          ...dbTopic,
          niche_template: legacyNiche,
          ai_photo_mode: "ORIGINAL_FRAME" as const,
        };
        delete legacyTopic.preferred_image_ai;
        delete legacyTopic.publish_to_stories;
        await sbRequest("topics?on_conflict=id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify(legacyTopic),
        });
      } else {
        throw err;
      }
    }
  } else {
    const mem = getMemDb();
    const idx = mem.topics.findIndex((t) => t.id === topic.id);
    if (idx >= 0) mem.topics[idx] = topic;
    else mem.topics.push(topic);
  }

  await appendAuditLog({
    company_id: companyId,
    user_id: userId,
    action: existing ? "TOPIC_UPDATED" : "TOPIC_CREATED",
    details_json: {
      topic_id: topic.id,
      title: topic.title,
      schedule_days: topic.schedule_days,
      schedule_time: topic.schedule_time,
    },
  });

  return topic;
}

export async function deleteTopic(
  companyId: string,
  topicId: string,
  userId?: string
): Promise<void> {
  if (isSupabaseConfigured()) {
    await sbRequest(
      `topics?id=eq.${encodeURIComponent(topicId)}&company_id=eq.${encodeURIComponent(companyId)}`,
      { method: "DELETE" }
    );
  } else {
    const mem = getMemDb();
    mem.topics = mem.topics.filter(
      (t) => !(t.id === topicId && t.company_id === companyId)
    );
    mem.photos = mem.photos.filter((p) => p.topic_id !== topicId);
  }

  await appendAuditLog({
    company_id: companyId,
    user_id: userId,
    action: "TOPIC_DELETED",
    details_json: { topic_id: topicId },
  });
}

export async function addTopicPhoto(params: {
  company_id: string;
  topic_id: string;
  original_url: string;
  ai_prompt_used?: string | null;
  user_id?: string;
}): Promise<TopicPhoto> {
  const photo: TopicPhoto = {
    id: generateId("pho"),
    topic_id: params.topic_id,
    company_id: params.company_id,
    original_url: params.original_url,
    enhanced_url: null,
    ai_prompt_used: params.ai_prompt_used || null,
    times_used: 0,
    last_used_at: null,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    await sbRequest("topic_photos", {
      method: "POST",
      body: JSON.stringify(photo),
    });
  } else {
    getMemDb().photos.unshift(photo);
  }

  await appendAuditLog({
    company_id: params.company_id,
    user_id: params.user_id,
    action: "TOPIC_PHOTO_UPLOADED",
    details_json: { topic_id: params.topic_id, photo_id: photo.id },
  });

  return photo;
}

export async function deleteTopicPhoto(
  companyId: string,
  photoId: string
): Promise<void> {
  if (isSupabaseConfigured()) {
    await sbRequest(
      `topic_photos?id=eq.${encodeURIComponent(photoId)}&company_id=eq.${encodeURIComponent(companyId)}`,
      { method: "DELETE" }
    );
  } else {
    const mem = getMemDb();
    mem.photos = mem.photos.filter(
      (p) => !(p.id === photoId && p.company_id === companyId)
    );
  }
}

export async function pickNextTopicPhoto(
  companyId: string,
  topicId: string
): Promise<TopicPhoto | null> {
  const all = await listPhotosByCompany(companyId);
  const candidates = all.filter((p) => p.topic_id === topicId);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.times_used !== b.times_used) return a.times_used - b.times_used;
    const aTime = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
    const bTime = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
    return aTime - bTime;
  });

  return candidates[0];
}

export async function markTopicPhotoUsed(
  photo: TopicPhoto,
  enhancedUrl: string | null,
  aiPromptUsed?: string | null
): Promise<void> {
  const nowIso = new Date().toISOString();
  const patch = {
    times_used: photo.times_used + 1,
    last_used_at: nowIso,
    enhanced_url: enhancedUrl || photo.enhanced_url || null,
    ai_prompt_used: aiPromptUsed || photo.ai_prompt_used || null,
  };

  if (isSupabaseConfigured()) {
    await sbRequest(`topic_photos?id=eq.${encodeURIComponent(photo.id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  } else {
    const found = getMemDb().photos.find((p) => p.id === photo.id);
    if (found) Object.assign(found, patch);
  }
}

export async function getLastTopicHeadlines(
  companyId: string,
  topicId?: string | null,
  limit = 10
): Promise<string[]> {
  const cleanTopicId = topicId?.trim();
  if (!cleanTopicId) return [];
  const posts = await listPostsHistory(companyId, 60);
  return posts
    .filter((p) => p.topic_id === cleanTopicId && p.headline)
    .slice(0, limit)
    .map((p) => p.headline);
}

export async function recordGeneratedPost(
  item: Omit<PostHistoryItem, "id" | "created_at">
): Promise<PostHistoryItem> {
  const enrichedContent = {
    ...item.content_json,
    ...(item.story_image_urls_json && item.story_image_urls_json.length > 0
      ? { story_image_urls: item.story_image_urls_json }
      : {}),
    ...(item.publish_targets ? { publish_targets: item.publish_targets } : {}),
  };

  const entry: PostHistoryItem = {
    ...item,
    content_json: enrichedContent,
    id: generateId("pst"),
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    const dbRow = {
      id: entry.id,
      company_id: entry.company_id,
      topic_id: entry.topic_id ?? null,
      ai_provider_used: entry.ai_provider_used ?? null,
      format: entry.format,
      aspect_ratio: entry.aspect_ratio,
      slides_count: entry.slides_count,
      headline: entry.headline,
      content_json: enrichedContent,
      image_urls_json: entry.image_urls_json,
      ig_post_id: entry.ig_post_id ?? null,
      fb_post_id: entry.fb_post_id ?? null,
      tiktok_post_id: entry.tiktok_post_id ?? null,
      status: entry.status,
      logs_json: entry.logs_json,
      created_at: entry.created_at,
    };

    await sbRequest("posts_history", {
      method: "POST",
      body: JSON.stringify(dbRow),
    });
  } else {
    getMemDb().posts.unshift(entry);
  }

  if (entry.status === "PUBLISHED") {
    await incrementCompanyPostUsage(entry.company_id, entry.topic_id);
  }

  return unpackPostHistoryRow(entry);
}

export async function updatePostRecord(
  postId: string,
  patch: Partial<PostHistoryItem>
): Promise<PostHistoryItem | null> {
  if (isSupabaseConfigured()) {
    const {
      topic_title: _ignoredTitle,
      story_image_urls_json: storyUrls,
      publish_targets: publishTargets,
      organic_metrics: organicMetrics,
      ...restPatch
    } = patch;
    void _ignoredTitle;

    const dbPatch: Record<string, unknown> = { ...restPatch };
    if (patch.content_json) {
      dbPatch.content_json = {
        ...patch.content_json,
        ...(storyUrls && storyUrls.length > 0
          ? { story_image_urls: storyUrls }
          : {}),
        ...(publishTargets ? { publish_targets: publishTargets } : {}),
        ...(organicMetrics !== undefined
          ? { organic_metrics: organicMetrics }
          : {}),
      };
    }

    const updated = await sbRequest<PostHistoryItem[]>(
      `posts_history?id=eq.${encodeURIComponent(postId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(dbPatch),
      }
    );
    return updated[0] ? unpackPostHistoryRow(updated[0]) : null;
  }

  const found = getMemDb().posts.find((p) => p.id === postId);
  if (!found) return null;
  Object.assign(found, patch);
  if (
    patch.content_json ||
    patch.story_image_urls_json ||
    patch.publish_targets ||
    patch.organic_metrics !== undefined
  ) {
    found.content_json = {
      ...found.content_json,
      ...(found.story_image_urls_json && found.story_image_urls_json.length > 0
        ? { story_image_urls: found.story_image_urls_json }
        : {}),
      ...(found.publish_targets
        ? { publish_targets: found.publish_targets }
        : {}),
      ...(patch.organic_metrics !== undefined
        ? { organic_metrics: patch.organic_metrics }
        : {}),
    };
  }
  return unpackPostHistoryRow(found);
}

export async function deletePostRecord(
  companyId: string,
  postId: string,
  userId?: string
): Promise<void> {
  if (isSupabaseConfigured()) {
    await sbRequest(
      `posts_history?id=eq.${encodeURIComponent(postId)}&company_id=eq.${encodeURIComponent(companyId)}`,
      { method: "DELETE" }
    );
  } else {
    const mem = getMemDb();
    mem.posts = mem.posts.filter(
      (p) => !(p.id === postId && p.company_id === companyId)
    );
  }

  await appendAuditLog({
    company_id: companyId,
    user_id: userId,
    action: "POST_DELETED",
    details_json: { post_id: postId },
  });
}

export async function incrementCompanyPostUsage(
  companyId: string,
  topicId?: string | null
): Promise<void> {
  const nowIso = new Date().toISOString();
  const company = await getCompanyById(companyId);
  if (company) {
    const newCount = (company.posts_used_month || 0) + 1;
    if (isSupabaseConfigured()) {
      await sbRequest(`companies?id=eq.${encodeURIComponent(companyId)}`, {
        method: "PATCH",
        body: JSON.stringify({ posts_used_month: newCount }),
      });
    } else {
      company.posts_used_month = newCount;
    }
  }

  if (topicId) {
    if (isSupabaseConfigured()) {
      await sbRequest(`topics?id=eq.${encodeURIComponent(topicId)}`, {
        method: "PATCH",
        body: JSON.stringify({ last_posted_at: nowIso }),
      });
    } else {
      const topic = getMemDb().topics.find((t) => t.id === topicId);
      if (topic) topic.last_posted_at = nowIso;
    }
  }
}

export async function checkCompanyQuotaAndStatus(companyId: string): Promise<{
  allowed: boolean;
  reason?: string;
  company: Company;
  plan: Plan;
}> {
  const company = await getCompanyById(companyId);
  const plans = await listPlans();
  if (!company) {
    throw new Error(`Empresa não encontrada: ${companyId}`);
  }
  const plan = plans.find((p) => p.id === company.plan_id) || plans[0];

  if (company.status === "BLOCKED" || company.status === "PAST_DUE") {
    return {
      allowed: false,
      reason: `Assinatura da empresa "${company.name}" está ${company.status}. Renove ou desbloqueie no Super Admin.`,
      company,
      plan,
    };
  }

  if (new Date(company.expires_at).getTime() < Date.now()) {
    return {
      allowed: false,
      reason: `Assinatura da empresa "${company.name}" expirou em ${new Date(
        company.expires_at
      ).toLocaleDateString("pt-BR")}.`,
      company,
      plan,
    };
  }

  if ((company.posts_used_month || 0) >= plan.max_posts_month) {
    return {
      allowed: false,
      reason: `Limite mensal do plano ${plan.name} atingido (${company.posts_used_month}/${plan.max_posts_month} posts).`,
      company,
      plan,
    };
  }

  return { allowed: true, company, plan };
}

export async function createOrUpdateCompanyByAdmin(input: {
  id?: string;
  name: string;
  plan_id: string;
  status: CompanyStatus;
  expires_at: string;
  owner_name?: string;
  owner_whatsapp?: string;
  admin_email?: string;
  admin_password?: string;
  reset_usage?: boolean;
}) {
  const existing = input.id ? await getCompanyById(input.id) : null;
  const nowIso = new Date().toISOString();
  const slug = input.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const company: Company = {
    id: existing?.id || generateId("comp"),
    name: input.name.trim(),
    slug: existing?.slug || `${slug}-${Date.now().toString().slice(-4)}`,
    plan_id: input.plan_id,
    status: input.status,
    expires_at: input.expires_at,
    posts_used_month: input.reset_usage ? 0 : existing?.posts_used_month ?? 0,
    owner_name: input.owner_name ?? existing?.owner_name ?? "",
    owner_whatsapp: input.owner_whatsapp ?? existing?.owner_whatsapp ?? "",
    created_at: existing?.created_at || nowIso,
  };

  if (isSupabaseConfigured()) {
    await sbRequest("companies?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(company),
    });
  } else {
    const mem = getMemDb();
    const idx = mem.companies.findIndex((c) => c.id === company.id);
    if (idx >= 0) mem.companies[idx] = company;
    else mem.companies.push(company);
  }

  if (!existing) {
    const preset = LUMINOUS_THEME_PRESETS[0];
    await saveBrandSettings(company.id, {
      theme_preset: preset.id,
      footer_name: company.name,
      subtitle_default: "Atendimento e Qualidade Garantida",
      cta_default: 'COMENTE "EU QUERO"',
      primary_color: preset.primary_color,
      secondary_color: preset.secondary_color,
      accent_color: preset.accent_color,
      bg_color: preset.bg_color,
      text_color: preset.text_color,
    });
    await saveCompanyIntegrations(company.id, {
      preferred_text_ai: "GEMINI",
      preferred_image_ai: "GEMINI",
    });
  }

  if (input.admin_email?.trim() && input.admin_password?.trim()) {
    const user: UserAccount = {
      id: generateId("usr"),
      company_id: company.id,
      name: input.owner_name?.trim() || company.name,
      email: input.admin_email.trim().toLowerCase(),
      password_hash: hashPassword(input.admin_password.trim()),
      role: "COMPANY_ADMIN",
      last_login_at: null,
      created_at: nowIso,
    };
    if (isSupabaseConfigured()) {
      await ensureSupabaseAuthUser({
        email: user.email,
        password: input.admin_password.trim(),
        name: user.name,
        role: user.role,
        company_id: user.company_id,
      });
      await sbRequest("users?on_conflict=email", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(user),
      });
    } else {
      getMemDb().users.push(user);
    }
  }

  await appendAuditLog({
    company_id: company.id,
    action: existing ? "ADMIN_COMPANY_UPDATED" : "ADMIN_COMPANY_CREATED",
    details_json: {
      name: company.name,
      plan_id: company.plan_id,
      status: company.status,
      expires_at: company.expires_at,
    },
  });

  return company;
}

export async function updatePlanByAdmin(plan: Plan): Promise<Plan> {
  if (isSupabaseConfigured()) {
    await sbRequest("plans?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(plan),
    });
  } else {
    const mem = getMemDb();
    const idx = mem.plans.findIndex((p) => p.id === plan.id);
    if (idx >= 0) mem.plans[idx] = plan;
    else mem.plans.push(plan);
  }

  await appendAuditLog({
    action: "ADMIN_PLAN_UPDATED",
    details_json: { plan_id: plan.id, name: plan.name, price_brl: plan.price_brl },
  });

  return plan;
}

export async function findDueScheduledTopics(
  slotHHmm: string,
  weekday: number
): Promise<Array<{ company: Company; topic: Topic }>> {
  const companies = await listCompanies();
  const due: Array<{ company: Company; topic: Topic }> = [];

  for (const company of companies) {
    if (company.status !== "ACTIVE" && company.status !== "TRIAL") continue;
    if (new Date(company.expires_at).getTime() < Date.now()) continue;

    const topics = await listTopicsByCompany(company.id);
    for (const topic of topics) {
      if (!topic.is_active) continue;
      const times = parseScheduleTimes(topic.schedule_time, topic.schedule_times);
      if (
        topic.schedule_days.includes(weekday) &&
        times.includes(slotHHmm)
      ) {
        due.push({ company, topic });
      }
    }
  }
  return due;
}

export async function pickNextTopicForCompany(
  companyId: string
): Promise<Topic | null> {
  const topics = (await listTopicsByCompany(companyId)).filter(
    (t) => t.is_active
  );
  if (topics.length === 0) return null;

  topics.sort((a, b) => {
    const aTime = a.last_posted_at ? new Date(a.last_posted_at).getTime() : 0;
    const bTime = b.last_posted_at ? new Date(b.last_posted_at).getTime() : 0;
    return aTime - bTime;
  });

  return topics[0];
}

export async function listImprovementTips(
  companyId?: string,
  limit = 150
): Promise<ImprovementTip[]> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      const filter = companyId
        ? `company_id=eq.${encodeURIComponent(companyId)}&`
        : "";
      return await sbRequest<ImprovementTip[]>(
        `improvement_tips?${filter}order=created_at.desc&limit=${limit}`
      );
    } catch {
      // Fallback para memória caso a tabela ainda não tenha sido criada no Supabase
    }
  }
  const all = [...getMemDb().tips].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const filtered = companyId
    ? all.filter((t) => t.company_id === companyId)
    : all;
  return filtered.slice(0, limit);
}

export async function createImprovementTip(input: {
  company_id: string;
  company_name: string;
  user_id?: string | null;
  user_name: string;
  user_email: string;
  message: string;
}): Promise<ImprovementTip> {
  const tip: ImprovementTip = {
    id: generateId("tip"),
    company_id: input.company_id,
    company_name: input.company_name,
    user_id: input.user_id || null,
    user_name: input.user_name,
    user_email: input.user_email,
    message: input.message.trim(),
    status: "OPEN",
    admin_reply: null,
    completed_at: null,
    client_seen_at: null,
    created_at: new Date().toISOString(),
  };

  let persistedInSupabase = false;
  if (isSupabaseConfigured()) {
    try {
      await sbRequest("improvement_tips", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(tip),
      });
      persistedInSupabase = true;
    } catch {
      // Fallback em memória caso a tabela ainda não exista no Supabase
    }
  }

  if (!persistedInSupabase) {
    getMemDb().tips.unshift(tip);
  }

  await appendAuditLog({
    company_id: tip.company_id,
    user_id: tip.user_id,
    action: "IMPROVEMENT_TIP_SUBMITTED",
    details_json: {
      tip_id: tip.id,
      company_name: tip.company_name,
      user_email: tip.user_email,
    },
  });

  return tip;
}

export async function updateImprovementTipStatus(input: {
  tipId: string;
  status: ImprovementTipStatus;
  adminReply?: string | null;
  adminUserId?: string;
}): Promise<ImprovementTip | null> {
  const nowIso = new Date().toISOString();
  const patchPayload =
    input.status === "COMPLETED"
      ? {
          status: "COMPLETED" as ImprovementTipStatus,
          completed_at: nowIso,
          client_seen_at: null,
          admin_reply: input.adminReply?.trim() || null,
        }
      : {
          status: "OPEN" as ImprovementTipStatus,
          completed_at: null,
          client_seen_at: null,
          admin_reply: null,
        };

  let updated: ImprovementTip | null = null;

  if (isSupabaseConfigured()) {
    try {
      const rows = await sbRequest<ImprovementTip[]>(
        `improvement_tips?id=eq.${encodeURIComponent(input.tipId)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(patchPayload),
        }
      );
      if (rows?.[0]) updated = rows[0];
    } catch {
      // Fallback para memória
    }
  }

  if (!updated) {
    const idx = getMemDb().tips.findIndex((t) => t.id === input.tipId);
    if (idx >= 0) {
      getMemDb().tips[idx] = { ...getMemDb().tips[idx], ...patchPayload };
      updated = getMemDb().tips[idx];
    }
  }

  if (updated) {
    await appendAuditLog({
      company_id: updated.company_id,
      user_id: input.adminUserId || null,
      action:
        input.status === "COMPLETED"
          ? "IMPROVEMENT_TIP_COMPLETED"
          : "IMPROVEMENT_TIP_REOPENED",
      details_json: {
        tip_id: updated.id,
        company_name: updated.company_name,
      },
    });
  }

  return updated;
}

export async function markCompanyCompletedTipsSeen(
  companyId: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  let updatedSupabase = false;

  if (isSupabaseConfigured()) {
    try {
      await sbRequest(
        `improvement_tips?company_id=eq.${encodeURIComponent(
          companyId
        )}&status=eq.COMPLETED&client_seen_at=is.null`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ client_seen_at: nowIso }),
        }
      );
      updatedSupabase = true;
    } catch {
      // Fallback em memória
    }
  }

  if (!updatedSupabase) {
    for (const tip of getMemDb().tips) {
      if (
        tip.company_id === companyId &&
        tip.status === "COMPLETED" &&
        !tip.client_seen_at
      ) {
        tip.client_seen_at = nowIso;
      }
    }
  }
}

function normalizeAdsAIProvider(raw?: unknown): AdsAIProviderPreference {
  const upper = String(raw || "").trim().toUpperCase();
  if (upper === "GEMINI" || upper === "OPENAI" || upper === "CLAUDE") {
    return upper;
  }
  return "AUTO";
}

function normalizeAdAccountRow(row: AdAccountConfig): AdAccountConfig {
  return {
    ...row,
    account_status:
      row.account_status !== null && row.account_status !== undefined
        ? Number(row.account_status)
        : null,
    preferred_ai_provider: normalizeAdsAIProvider(row.preferred_ai_provider),
    cpa_maximo: Number(row.cpa_maximo ?? 35),
    roas_minimo: Number(row.roas_minimo ?? 2),
    amostra_minima_cliques: Number(row.amostra_minima_cliques ?? 50),
    is_default: Boolean(row.is_default),
    auto_pause_enabled: Boolean(row.auto_pause_enabled),
  };
}

function normalizeAdCampaignRow(row: AdCampaignRecord): AdCampaignRecord {
  const targetingObj =
    row.targeting_json && typeof row.targeting_json === "object"
      ? row.targeting_json
      : {};
  return {
    ...row,
    ai_provider_preference: normalizeAdsAIProvider(
      row.ai_provider_preference ??
        (targetingObj as Record<string, unknown>)._ai_provider_preference
    ),
    daily_budget_cents: Number(row.daily_budget_cents ?? 2000),
    duration_days:
      row.duration_days !== null && row.duration_days !== undefined
        ? Number(row.duration_days)
        : null,
    targeting_json: targetingObj,
    last_insights_json:
      row.last_insights_json && typeof row.last_insights_json === "object"
        ? row.last_insights_json
        : {},
  };
}

function normalizeMetaAdAccountId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^act_/i.test(trimmed) ? `act_${trimmed.slice(4)}` : trimmed;
}

export async function listAdAccountsByCompany(
  companyId: string,
  provider?: AdProvider
): Promise<AdAccountConfig[]> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      const providerFilter = provider
        ? `&provider=eq.${encodeURIComponent(provider)}`
        : "";
      const rows = await sbRequest<AdAccountConfig[]>(
        `ad_accounts?company_id=eq.${encodeURIComponent(
          companyId
        )}${providerFilter}&order=is_default.desc,updated_at.desc`
      );
      return rows.map(normalizeAdAccountRow);
    } catch {
      // Fallback para memória caso a tabela ainda não tenha sido criada no Supabase
    }
  }
  return getMemDb()
    .ad_accounts.filter(
      (a) => a.company_id === companyId && (!provider || a.provider === provider)
    )
    .sort((a, b) => Number(b.is_default) - Number(a.is_default))
    .map(normalizeAdAccountRow);
}

export async function getDefaultAdAccount(
  companyId: string,
  provider: AdProvider = "META"
): Promise<AdAccountConfig | null> {
  const accounts = await listAdAccountsByCompany(companyId, provider);
  return accounts.find((a) => a.is_default) || accounts[0] || null;
}

export async function upsertAdAccountConfig(input: {
  company_id: string;
  provider?: AdProvider;
  ad_account_id: string;
  account_name?: string;
  currency?: string;
  account_status?: number | null;
  is_default?: boolean;
  preferred_ai_provider?: AdsAIProviderPreference;
  cpa_maximo?: number;
  roas_minimo?: number;
  amostra_minima_cliques?: number;
  link_destino_padrao?: string | null;
  localizacao_base?: string;
  auto_pause_enabled?: boolean;
  user_id?: string | null;
}): Promise<AdAccountConfig> {
  const provider: AdProvider = input.provider || "META";
  const normalizedAdAccountId = normalizeMetaAdAccountId(input.ad_account_id);
  const nowIso = new Date().toISOString();

  const existingList = await listAdAccountsByCompany(input.company_id, provider);
  const existing = existingList.find(
    (a) => a.ad_account_id === normalizedAdAccountId
  );
  const isDefault =
    existingList.length === 0
      ? true
      : input.is_default !== undefined
        ? Boolean(input.is_default)
        : Boolean(existing?.is_default);

  const entry: AdAccountConfig = {
    id: existing?.id || generateId("adacc"),
    company_id: input.company_id,
    provider,
    ad_account_id: normalizedAdAccountId,
    account_name:
      input.account_name?.trim() || existing?.account_name || normalizedAdAccountId,
    currency: (input.currency || existing?.currency || "BRL").toUpperCase(),
    account_status:
      input.account_status !== undefined
        ? input.account_status
        : (existing?.account_status ?? null),
    is_default: isDefault,
    preferred_ai_provider:
      input.preferred_ai_provider !== undefined
        ? normalizeAdsAIProvider(input.preferred_ai_provider)
        : normalizeAdsAIProvider(existing?.preferred_ai_provider),
    cpa_maximo: Number(input.cpa_maximo ?? existing?.cpa_maximo ?? 35),
    roas_minimo: Number(input.roas_minimo ?? existing?.roas_minimo ?? 2),
    amostra_minima_cliques: Number(
      input.amostra_minima_cliques ?? existing?.amostra_minima_cliques ?? 50
    ),
    link_destino_padrao:
      input.link_destino_padrao !== undefined
        ? input.link_destino_padrao?.trim() || null
        : (existing?.link_destino_padrao ?? null),
    localizacao_base:
      input.localizacao_base?.trim() || existing?.localizacao_base || "Brasil",
    auto_pause_enabled:
      input.auto_pause_enabled !== undefined
        ? input.auto_pause_enabled
        : (existing?.auto_pause_enabled ?? false),
    created_at: existing?.created_at || nowIso,
    updated_at: nowIso,
  };

  let persistedInSupabase = false;
  if (isSupabaseConfigured()) {
    try {
      if (isDefault) {
        await sbRequest(
          `ad_accounts?company_id=eq.${encodeURIComponent(
            input.company_id
          )}&provider=eq.${encodeURIComponent(provider)}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ is_default: false }),
          }
        );
      }

      const patchPayload = {
        account_name: entry.account_name,
        currency: entry.currency,
        account_status: entry.account_status,
        is_default: entry.is_default,
        preferred_ai_provider: entry.preferred_ai_provider,
        cpa_maximo: entry.cpa_maximo,
        roas_minimo: entry.roas_minimo,
        amostra_minima_cliques: entry.amostra_minima_cliques,
        link_destino_padrao: entry.link_destino_padrao,
        localizacao_base: entry.localizacao_base,
        auto_pause_enabled: entry.auto_pause_enabled,
        updated_at: entry.updated_at,
      };

      try {
        if (existing) {
          await sbRequest(`ad_accounts?id=eq.${encodeURIComponent(entry.id)}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(patchPayload),
          });
        } else {
          await sbRequest("ad_accounts", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(entry),
          });
        }
        persistedInSupabase = true;
      } catch {
        // Fallback seguro se a coluna preferred_ai_provider ainda não tiver sido adicionada via migration
        const { preferred_ai_provider: _omitPatch, ...legacyPatch } = patchPayload;
        const { preferred_ai_provider: _omitEntry, ...legacyEntry } = entry;
        void _omitPatch;
        void _omitEntry;
        if (existing) {
          await sbRequest(`ad_accounts?id=eq.${encodeURIComponent(entry.id)}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(legacyPatch),
          });
        } else {
          await sbRequest("ad_accounts", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(legacyEntry),
          });
        }
        persistedInSupabase = true;
      }
    } catch {
      // Fallback para memória caso a tabela ainda não exista no Supabase
    }
  }

  if (!persistedInSupabase) {
    const mem = getMemDb();
    if (isDefault) {
      for (const acc of mem.ad_accounts) {
        if (acc.company_id === input.company_id && acc.provider === provider) {
          acc.is_default = false;
        }
      }
    }
    const idx = mem.ad_accounts.findIndex(
      (a) =>
        a.company_id === input.company_id &&
        a.provider === provider &&
        a.ad_account_id === normalizedAdAccountId
    );
    if (idx >= 0) {
      mem.ad_accounts[idx] = entry;
    } else {
      mem.ad_accounts.unshift(entry);
    }
  }

  await appendAuditLog({
    company_id: input.company_id,
    user_id: input.user_id || null,
    action: "AD_ACCOUNT_CONFIG_SAVED",
    details_json: {
      provider,
      ad_account_id: normalizedAdAccountId,
      is_default: isDefault,
      preferred_ai_provider: entry.preferred_ai_provider,
      cpa_maximo: entry.cpa_maximo,
      roas_minimo: entry.roas_minimo,
    },
  });

  return normalizeAdAccountRow(entry);
}

export async function setDefaultAdAccount(
  companyId: string,
  accountRowId: string,
  userId?: string | null
): Promise<AdAccountConfig | null> {
  const accounts = await listAdAccountsByCompany(companyId);
  const target = accounts.find((a) => a.id === accountRowId);
  if (!target) return null;

  const nowIso = new Date().toISOString();
  if (isSupabaseConfigured()) {
    try {
      await sbRequest(
        `ad_accounts?company_id=eq.${encodeURIComponent(
          companyId
        )}&provider=eq.${encodeURIComponent(target.provider)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ is_default: false }),
        }
      );
      await sbRequest(
        `ad_accounts?id=eq.${encodeURIComponent(
          target.id
        )}&company_id=eq.${encodeURIComponent(companyId)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ is_default: true, updated_at: nowIso }),
        }
      );
    } catch {
      // fallback memória
    }
  }

  for (const acc of getMemDb().ad_accounts) {
    if (acc.company_id === companyId && acc.provider === target.provider) {
      acc.is_default = acc.id === target.id;
      if (acc.id === target.id) acc.updated_at = nowIso;
    }
  }

  await appendAuditLog({
    company_id: companyId,
    user_id: userId || null,
    action: "AD_ACCOUNT_DEFAULT_CHANGED",
    details_json: {
      ad_account_row_id: target.id,
      ad_account_id: target.ad_account_id,
    },
  });

  return normalizeAdAccountRow({ ...target, is_default: true, updated_at: nowIso });
}

export async function deleteAdAccountConfig(
  companyId: string,
  accountRowId: string,
  userId?: string | null
): Promise<boolean> {
  const accounts = await listAdAccountsByCompany(companyId);
  const target = accounts.find((a) => a.id === accountRowId);
  if (!target) return false;

  let deleted = false;
  if (isSupabaseConfigured()) {
    try {
      await sbRequest(
        `ad_accounts?id=eq.${encodeURIComponent(
          accountRowId
        )}&company_id=eq.${encodeURIComponent(companyId)}`,
        { method: "DELETE" }
      );
      deleted = true;
    } catch {
      // fallback memória
    }
  }

  const mem = getMemDb();
  const before = mem.ad_accounts.length;
  mem.ad_accounts = mem.ad_accounts.filter(
    (a) => !(a.id === accountRowId && a.company_id === companyId)
  );
  const removed = deleted || mem.ad_accounts.length < before;

  if (removed && target.is_default) {
    const remaining = await listAdAccountsByCompany(companyId, target.provider);
    if (remaining[0]) {
      await setDefaultAdAccount(companyId, remaining[0].id, userId);
    }
  }

  if (removed) {
    await appendAuditLog({
      company_id: companyId,
      user_id: userId || null,
      action: "AD_ACCOUNT_DELETED",
      details_json: {
        ad_account_row_id: target.id,
        ad_account_id: target.ad_account_id,
      },
    });
  }

  return removed;
}

export async function listAdCampaignsByCompany(
  companyId: string,
  limit = 100
): Promise<AdCampaignRecord[]> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      const rows = await sbRequest<AdCampaignRecord[]>(
        `ad_campaigns?company_id=eq.${encodeURIComponent(
          companyId
        )}&order=created_at.desc&limit=${limit}`
      );
      return rows.map(normalizeAdCampaignRow);
    } catch {
      // Fallback para memória
    }
  }
  return getMemDb()
    .ad_campaigns.filter((c) => c.company_id === companyId)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, limit)
    .map(normalizeAdCampaignRow);
}

export async function listActiveAdCampaignsForMonitoring(
  provider: AdProvider = "META"
): Promise<AdCampaignRecord[]> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      const rows = await sbRequest<AdCampaignRecord[]>(
        `ad_campaigns?provider=eq.${encodeURIComponent(
          provider
        )}&status=eq.ACTIVE&order=updated_at.asc&limit=200`
      );
      return rows.map(normalizeAdCampaignRow);
    } catch {
      // Fallback para memória
    }
  }
  return getMemDb()
    .ad_campaigns.filter(
      (c) => c.provider === provider && c.status === "ACTIVE"
    )
    .map(normalizeAdCampaignRow);
}

export async function getAdCampaignById(
  campaignId: string,
  companyId?: string
): Promise<AdCampaignRecord | null> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      const companyFilter = companyId
        ? `&company_id=eq.${encodeURIComponent(companyId)}`
        : "";
      const rows = await sbRequest<AdCampaignRecord[]>(
        `ad_campaigns?id=eq.${encodeURIComponent(campaignId)}${companyFilter}&limit=1`
      );
      return rows[0] ? normalizeAdCampaignRow(rows[0]) : null;
    } catch {
      // Fallback para memória
    }
  }
  const found = getMemDb().ad_campaigns.find(
    (c) => c.id === campaignId && (!companyId || c.company_id === companyId)
  );
  return found ? normalizeAdCampaignRow(found) : null;
}

export async function createAdCampaignRecord(input: {
  company_id: string;
  post_id?: string | null;
  provider?: AdProvider;
  channel: AdChannel;
  ad_account_id: string;
  ai_provider_preference?: AdsAIProviderPreference;
  name: string;
  user_prompt?: string;
  objective: string;
  optimization_goal: string;
  destination_type?: string | null;
  daily_budget_cents: number;
  currency?: string;
  duration_days?: number | null;
  targeting_json?: Record<string, unknown>;
  source_story_id?: string | null;
  meta_campaign_id?: string | null;
  meta_adset_id?: string | null;
  meta_creative_id?: string | null;
  meta_ad_id?: string | null;
  status?: AdCampaignStatus;
  error_message?: string | null;
  created_by_user_id?: string | null;
}): Promise<AdCampaignRecord> {
  const nowIso = new Date().toISOString();
  const aiPref = normalizeAdsAIProvider(input.ai_provider_preference);
  const entry: AdCampaignRecord = {
    id: generateId("adcmp"),
    company_id: input.company_id,
    post_id: input.post_id || null,
    provider: input.provider || "META",
    channel: input.channel,
    ad_account_id: normalizeMetaAdAccountId(input.ad_account_id),
    ai_provider_preference: aiPref,
    name: input.name,
    user_prompt: input.user_prompt || "",
    objective: input.objective,
    optimization_goal: input.optimization_goal,
    destination_type: input.destination_type || null,
    daily_budget_cents: Number(input.daily_budget_cents),
    currency: (input.currency || "BRL").toUpperCase(),
    duration_days:
      input.duration_days !== undefined ? input.duration_days : null,
    targeting_json: {
      ...(input.targeting_json || {}),
      _ai_provider_preference: aiPref,
    },
    source_story_id: input.source_story_id || null,
    meta_campaign_id: input.meta_campaign_id || null,
    meta_adset_id: input.meta_adset_id || null,
    meta_creative_id: input.meta_creative_id || null,
    meta_ad_id: input.meta_ad_id || null,
    status: input.status || "PAUSED",
    last_verdict: null,
    last_verdict_reason: null,
    last_insights_json: {},
    last_insights_at: null,
    error_message: input.error_message || null,
    created_by_user_id: input.created_by_user_id || null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  let persistedInSupabase = false;
  if (isSupabaseConfigured()) {
    try {
      try {
        await sbRequest("ad_campaigns", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(entry),
        });
        persistedInSupabase = true;
      } catch {
        const { ai_provider_preference: _omitAi, ...legacyEntry } = entry;
        void _omitAi;
        await sbRequest("ad_campaigns", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(legacyEntry),
        });
        persistedInSupabase = true;
      }
    } catch {
      // Fallback para memória
    }
  }

  if (!persistedInSupabase) {
    getMemDb().ad_campaigns.unshift(entry);
  }

  await appendAuditLog({
    company_id: entry.company_id,
    user_id: entry.created_by_user_id || null,
    action: "AD_CAMPAIGN_CREATED",
    details_json: {
      ad_campaign_id: entry.id,
      post_id: entry.post_id,
      channel: entry.channel,
      objective: entry.objective,
      daily_budget_cents: entry.daily_budget_cents,
      status: entry.status,
      meta_campaign_id: entry.meta_campaign_id,
    },
  });

  return normalizeAdCampaignRow(entry);
}

export async function updateAdCampaignRecord(
  campaignId: string,
  patch: Partial<{
    name: string;
    daily_budget_cents: number;
    targeting_json: Record<string, unknown>;
    status: AdCampaignStatus;
    meta_campaign_id: string | null;
    meta_adset_id: string | null;
    meta_creative_id: string | null;
    meta_ad_id: string | null;
    last_verdict: AdDecisionVerdict | null;
    last_verdict_reason: string | null;
    last_insights_json: AdInsightsSnapshot;
    last_insights_at: string | null;
    error_message: string | null;
  }>
): Promise<AdCampaignRecord | null> {
  const payload = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    try {
      const rows = await sbRequest<AdCampaignRecord[]>(
        `ad_campaigns?id=eq.${encodeURIComponent(campaignId)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(payload),
        }
      );
      if (rows?.[0]) return normalizeAdCampaignRow(rows[0]);
    } catch {
      // Fallback para memória
    }
  }

  const mem = getMemDb();
  const idx = mem.ad_campaigns.findIndex((c) => c.id === campaignId);
  if (idx >= 0) {
    mem.ad_campaigns[idx] = { ...mem.ad_campaigns[idx], ...payload };
    return normalizeAdCampaignRow(mem.ad_campaigns[idx]);
  }
  return null;
}

export async function deleteAdCampaignRecord(
  campaignId: string,
  companyId: string
): Promise<boolean> {
  let deleted = false;
  if (isSupabaseConfigured()) {
    try {
      await sbRequest(
        `ad_campaigns?id=eq.${encodeURIComponent(
          campaignId
        )}&company_id=eq.${encodeURIComponent(companyId)}`,
        { method: "DELETE" }
      );
      deleted = true;
    } catch {
      // fallback para memória
    }
  }

  const mem = getMemDb();
  const before = mem.ad_campaigns.length;
  mem.ad_campaigns = mem.ad_campaigns.filter(
    (c) => !(c.id === campaignId && c.company_id === companyId)
  );
  mem.ad_campaign_ads = mem.ad_campaign_ads.filter(
    (a) => !(a.campaign_id === campaignId && a.company_id === companyId)
  );
  return deleted || mem.ad_campaigns.length < before;
}

function normalizeAdCampaignAdRow(row: AdCampaignAdRecord): AdCampaignAdRecord {
  return {
    ...row,
    headline: row.headline || "",
    primary_text: row.primary_text || "",
    last_insights_json:
      row.last_insights_json && typeof row.last_insights_json === "object"
        ? row.last_insights_json
        : {},
  };
}

export async function listAdCampaignAdsByCompany(
  companyId: string,
  campaignId?: string
): Promise<AdCampaignAdRecord[]> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      const cmpFilter = campaignId
        ? `&campaign_id=eq.${encodeURIComponent(campaignId)}`
        : "";
      const rows = await sbRequest<AdCampaignAdRecord[]>(
        `ad_campaign_ads?company_id=eq.${encodeURIComponent(
          companyId
        )}${cmpFilter}&order=created_at.asc&limit=500`
      );
      return rows.map(normalizeAdCampaignAdRow);
    } catch {
      // Fallback para memória caso a tabela ad_campaign_ads ainda não exista no Supabase
    }
  }
  return getMemDb()
    .ad_campaign_ads.filter(
      (a) =>
        a.company_id === companyId &&
        (!campaignId || a.campaign_id === campaignId)
    )
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    .map(normalizeAdCampaignAdRow);
}

export async function getAdCampaignAdById(
  adId: string,
  companyId?: string
): Promise<AdCampaignAdRecord | null> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      const companyFilter = companyId
        ? `&company_id=eq.${encodeURIComponent(companyId)}`
        : "";
      const rows = await sbRequest<AdCampaignAdRecord[]>(
        `ad_campaign_ads?id=eq.${encodeURIComponent(adId)}${companyFilter}&limit=1`
      );
      return rows[0] ? normalizeAdCampaignAdRow(rows[0]) : null;
    } catch {
      // Fallback para memória
    }
  }
  const found = getMemDb().ad_campaign_ads.find(
    (a) => a.id === adId && (!companyId || a.company_id === companyId)
  );
  return found ? normalizeAdCampaignAdRow(found) : null;
}

export async function createAdCampaignAdRecord(input: {
  campaign_id: string;
  company_id: string;
  post_id?: string | null;
  ad_name: string;
  headline?: string;
  primary_text?: string;
  image_url?: string | null;
  story_image_url?: string | null;
  source_story_id?: string | null;
  meta_creative_id?: string | null;
  meta_ad_id?: string | null;
  status?: AdCampaignStatus;
  error_message?: string | null;
}): Promise<AdCampaignAdRecord> {
  const nowIso = new Date().toISOString();
  const entry: AdCampaignAdRecord = {
    id: generateId("adad"),
    campaign_id: input.campaign_id,
    company_id: input.company_id,
    post_id: input.post_id || null,
    ad_name: input.ad_name,
    headline: input.headline || "",
    primary_text: input.primary_text || "",
    image_url: input.image_url || null,
    story_image_url: input.story_image_url || null,
    source_story_id: input.source_story_id || null,
    meta_creative_id: input.meta_creative_id || null,
    meta_ad_id: input.meta_ad_id || null,
    status: input.status || "PAUSED",
    last_verdict: null,
    last_verdict_reason: null,
    last_insights_json: {},
    last_insights_at: null,
    error_message: input.error_message || null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  let persistedInSupabase = false;
  if (isSupabaseConfigured()) {
    try {
      await sbRequest("ad_campaign_ads", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(entry),
      });
      persistedInSupabase = true;
    } catch {
      // Fallback para memória
    }
  }

  if (!persistedInSupabase) {
    getMemDb().ad_campaign_ads.push(entry);
  }

  return normalizeAdCampaignAdRow(entry);
}

export async function updateAdCampaignAdRecord(
  adId: string,
  patch: Partial<{
    ad_name: string;
    headline: string;
    primary_text: string;
    status: AdCampaignStatus;
    meta_creative_id: string | null;
    meta_ad_id: string | null;
    last_verdict: AdDecisionVerdict | null;
    last_verdict_reason: string | null;
    last_insights_json: AdInsightsSnapshot;
    last_insights_at: string | null;
    error_message: string | null;
  }>
): Promise<AdCampaignAdRecord | null> {
  const payload = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    try {
      const rows = await sbRequest<AdCampaignAdRecord[]>(
        `ad_campaign_ads?id=eq.${encodeURIComponent(adId)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(payload),
        }
      );
      if (rows?.[0]) return normalizeAdCampaignAdRow(rows[0]);
    } catch {
      // Fallback para memória
    }
  }

  const mem = getMemDb();
  const idx = mem.ad_campaign_ads.findIndex((a) => a.id === adId);
  if (idx >= 0) {
    mem.ad_campaign_ads[idx] = { ...mem.ad_campaign_ads[idx], ...payload };
    return normalizeAdCampaignAdRow(mem.ad_campaign_ads[idx]);
  }
  return null;
}

export async function deleteAdCampaignAdRecord(
  adId: string,
  companyId: string
): Promise<boolean> {
  let deleted = false;
  if (isSupabaseConfigured()) {
    try {
      await sbRequest(
        `ad_campaign_ads?id=eq.${encodeURIComponent(
          adId
        )}&company_id=eq.${encodeURIComponent(companyId)}`,
        { method: "DELETE" }
      );
      deleted = true;
    } catch {
      // fallback memória
    }
  }

  const mem = getMemDb();
  const before = mem.ad_campaign_ads.length;
  mem.ad_campaign_ads = mem.ad_campaign_ads.filter(
    (a) => !(a.id === adId && a.company_id === companyId)
  );
  return deleted || mem.ad_campaign_ads.length < before;
}

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
  AuditLogItem,
  BrandSettings,
  Company,
  CompanyIntegrations,
  CompanyIntegrationsPublic,
  CompanyStatus,
  Plan,
  PostHistoryItem,
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

export async function findSupabaseAuthUserByEmail(email: string): Promise<{
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
} | null> {
  if (!isSupabaseConfigured()) return null;
  const cleanEmail = email.trim().toLowerCase();
  const res = await sbAuthRequest<{
    users?: Array<{
      id: string;
      email?: string;
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
}): Promise<{ user: Omit<UserAccount, "password_hash">; mode: "supabase" | "memory" }> {
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

  const role = isSuperAdminSignup ? "SUPER_ADMIN" : "COMPANY_ADMIN";
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
    await ensureSupabaseAuthUser({
      email: cleanEmail,
      password: pwd,
      name: fullName,
      role,
      company_id: targetCompanyId,
    });
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
    details_json: { email: cleanEmail, role },
  });

  const { password_hash: _ignored, ...safeUser } = newUser;
  void _ignored;
  return { user: safeUser, mode: getDatabaseMode() };
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
    tiktok_enabled: Boolean(integ.tiktok_enabled),
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

  let authenticatedViaSupabaseAuth = false;
  if (isSupabaseConfigured()) {
    authenticatedViaSupabaseAuth = await verifyPasswordWithSupabaseAuth(
      email,
      password
    );
  }

  if (!found) return null;

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

export async function getBrandSettings(
  companyId: string
): Promise<BrandSettings> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      const rows = await sbRequest<BrandSettings[]>(
        `brand_settings?company_id=eq.${encodeURIComponent(companyId)}&limit=1`
      );
      if (rows[0]) return rows[0];
    } catch {
      // Fallback
    }
  }
  const found = getMemDb().brands.find((b) => b.company_id === companyId);
  if (found) return found;

  const preset = LUMINOUS_THEME_PRESETS[0];
  return {
    company_id: companyId,
    theme_preset: preset.id,
    footer_name: "Sua Empresa",
    subtitle_default: "",
    cta_default: 'COMENTE "EU QUERO"',
    logo_url: null,
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
    tiktok_enabled: Boolean(integ.tiktok_enabled),
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

function unpackTopicRow(t: Topic): Topic {
  let cleanNiche = t.niche_template || "custom";
  let mode = t.ai_photo_mode;
  let imgPref = t.preferred_image_ai ?? null;
  let publishToStories = Boolean(t.publish_to_stories);

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

  const schedule_times = parseScheduleTimes(t.schedule_time, t.schedule_times);
  return {
    ...t,
    niche_template: cleanNiche,
    ai_photo_mode: mode,
    preferred_image_ai: imgPref,
    publish_to_stories: publishToStories,
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

export async function listPostsHistory(
  companyId?: string,
  limit = 40
): Promise<PostHistoryItem[]> {
  await ensureSeededInSupabase();
  if (isSupabaseConfigured()) {
    try {
      const filter = companyId
        ? `company_id=eq.${encodeURIComponent(companyId)}&`
        : "";
      return await sbRequest<PostHistoryItem[]>(
        `posts_history?${filter}order=created_at.desc&limit=${limit}`
      );
    } catch {
      // Fallback
    }
  }
  const all = getMemDb().posts;
  const filtered = companyId
    ? all.filter((p) => p.company_id === companyId)
    : all;
  return filtered.slice(0, limit);
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
  const [company, plans, brand, integrations, topics, photos, posts, audits] =
    await Promise.all([
      getCompanyById(companyId),
      listPlans(),
      getBrandSettings(companyId),
      getCompanyIntegrations(companyId),
      listTopicsByCompany(companyId),
      listPhotosByCompany(companyId),
      listPostsHistory(companyId, 30),
      listAuditLogs(companyId, 30),
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
  };
}

export async function getSuperAdminSnapshot() {
  const [plans, companies, users, posts, audits] = await Promise.all([
    listPlans(),
    listCompanies(),
    listUsersInternal(),
    listPostsHistory(undefined, 50),
    listAuditLogs(undefined, 80),
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
    await sbRequest("brand_settings?on_conflict=company_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ ...next, updated_at: new Date().toISOString() }),
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
        ? encryptSecret(input.gemini_api_key)
        : current.gemini_key_enc,
    openai_key_enc:
      input.openai_api_key !== undefined
        ? encryptSecret(input.openai_api_key)
        : current.openai_key_enc,
    anthropic_key_enc:
      input.anthropic_api_key !== undefined
        ? encryptSecret(input.anthropic_api_key)
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
  const publishToStories =
    input.publish_to_stories !== undefined
      ? Boolean(input.publish_to_stories)
      : Boolean(existing?.publish_to_stories);

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
    aspect_ratio: input.aspect_ratio || existing?.aspect_ratio || "1:1",
    approval_mode: input.approval_mode || existing?.approval_mode || "AUTO",
    ai_photo_mode: input.ai_photo_mode || existing?.ai_photo_mode || "NONE",
    ai_photo_prompt:
      input.ai_photo_prompt !== undefined
        ? input.ai_photo_prompt
        : existing?.ai_photo_prompt || null,
    preferred_image_ai: preferredImageAI,
    publish_to_stories: publishToStories,
    schedule_days:
      input.schedule_days ?? existing?.schedule_days ?? [1, 3, 5],
    schedule_time: serializedTime,
    schedule_times: parsedTimes,
    is_active: input.is_active ?? existing?.is_active ?? true,
    last_posted_at: existing?.last_posted_at || null,
    created_at: existing?.created_at || new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    const dbTopic: Record<string, unknown> = { ...topic };
    delete dbTopic.schedule_times;
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
        const legacyNiche = `${topic.niche_template || "custom"}__mode:${topic.ai_photo_mode}${
          topic.preferred_image_ai ? `__img:${topic.preferred_image_ai}` : ""
        }${topic.publish_to_stories ? "__stories:1" : ""}`;
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
  const posts = await listPostsHistory(companyId, 30);
  return posts
    .filter((p) => (!topicId || p.topic_id === topicId) && p.headline)
    .slice(0, limit)
    .map((p) => p.headline);
}

export async function recordGeneratedPost(
  item: Omit<PostHistoryItem, "id" | "created_at">
): Promise<PostHistoryItem> {
  const entry: PostHistoryItem = {
    ...item,
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
      content_json: entry.content_json,
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

  return entry;
}

export async function updatePostRecord(
  postId: string,
  patch: Partial<PostHistoryItem>
): Promise<PostHistoryItem | null> {
  if (isSupabaseConfigured()) {
    const { topic_title: _ignoredTitle, ...dbPatch } = patch;
    void _ignoredTitle;
    const updated = await sbRequest<PostHistoryItem[]>(
      `posts_history?id=eq.${encodeURIComponent(postId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(dbPatch),
      }
    );
    return updated[0] || null;
  }

  const found = getMemDb().posts.find((p) => p.id === postId);
  if (!found) return null;
  Object.assign(found, patch);
  return found;
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

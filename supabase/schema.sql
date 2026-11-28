-- ============================================================================
-- Social PilotFlow SaaS (Multi-Empresas & Multi-IA) - Schema Supabase Free
-- ============================================================================
-- Execute este script no SQL Editor do seu projeto Supabase.
-- Todas as imagens (originais, melhoradas por IA e artes finais) ficam no
-- Cloudflare R2; o Postgres armazena apenas metadados, textos e links HTTPS.

create extension if not exists "pgcrypto";

-- 1. PLANOS COMERCIAIS
create table if not exists public.plans (
  id text primary key,
  name text not null,
  price_brl numeric(10, 2) not null default 0,
  max_posts_month integer not null default 12,
  allow_carousel boolean not null default true,
  allow_ai_photo boolean not null default true,
  allow_multi_ai boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. EMPRESAS CLIENTES (MULTI-TENANT)
create table if not exists public.companies (
  id text primary key,
  name text not null,
  slug text unique not null,
  plan_id text not null references public.plans(id),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'TRIAL', 'PAST_DUE', 'BLOCKED')),
  expires_at timestamptz not null,
  posts_used_month integer not null default 0,
  owner_name text,
  owner_whatsapp text,
  created_at timestamptz not null default now()
);

-- 3. USUÁRIOS E AUTENTICAÇÃO
create table if not exists public.users (
  id text primary key,
  company_id text references public.companies(id) on delete cascade,
  name text not null,
  email text unique not null,
  password_hash text not null,
  role text not null default 'COMPANY_ADMIN' check (role in ('SUPER_ADMIN', 'COMPANY_ADMIN')),
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

-- 4. IDENTIDADE VISUAL (BRAND KIT LUMINOSO)
create table if not exists public.brand_settings (
  company_id text primary key references public.companies(id) on delete cascade,
  theme_preset text not null default 'luminoso-tech',
  footer_name text not null,
  subtitle_default text not null default '',
  cta_default text not null default 'COMENTE "EU QUERO"',
  logo_url text,
  primary_color text not null default '#4F46E5',
  secondary_color text not null default '#06B6D4',
  accent_color text not null default '#10B981',
  bg_color text not null default '#F8FAFC',
  text_color text not null default '#0F172A',
  updated_at timestamptz not null default now()
);

-- 5. INTEGRAÇÕES CRIPTOGRAFADAS (AES-256-GCM) POR EMPRESA
create table if not exists public.integrations (
  company_id text primary key references public.companies(id) on delete cascade,
  preferred_text_ai text not null default 'GEMINI' check (preferred_text_ai in ('GEMINI', 'OPENAI', 'CLAUDE')),
  preferred_image_ai text not null default 'GEMINI' check (preferred_image_ai in ('GEMINI', 'OPENAI', 'OPENAI_MINI')),
  gemini_key_enc text,
  openai_key_enc text,
  anthropic_key_enc text,
  meta_token_enc text,
  meta_token_expires_at timestamptz,
  ig_user_id text,
  fb_page_id text,
  r2_account_id text,
  r2_access_key_id_enc text,
  r2_secret_access_key_enc text,
  r2_bucket_name text,
  r2_public_url text,
  tiktok_token_enc text,
  tiktok_open_id text,
  tiktok_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 6. ASSUNTOS, SERVIÇOS E PRODUTOS COM DIA E HORA EXCLUSIVOS
create table if not exists public.topics (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  title text not null,
  niche_template text not null default 'servicos',
  prompt_instructions text not null,
  offer_price text,
  benefits_json jsonb not null default '[]'::jsonb,
  post_format text not null default 'SINGLE' check (post_format in ('SINGLE', 'CAROUSEL')),
  slides_count integer not null default 3 check (slides_count between 1 and 8),
  aspect_ratio text not null default '1:1' check (aspect_ratio in ('1:1', '4:5', '9:16')),
  approval_mode text not null default 'AUTO' check (approval_mode in ('AUTO', 'DRAFT')),
  ai_photo_mode text not null default 'NONE' check (ai_photo_mode in ('NONE', 'ENHANCE', 'ORIGINAL_FRAME', 'EDITORIAL_MOCKUP', 'AI_FULL_CREATIVE', 'RAW_ART')),
  ai_photo_prompt text,
  preferred_image_ai text check (preferred_image_ai in ('GEMINI', 'OPENAI', 'OPENAI_MINI')),
  publish_to_stories boolean not null default false,
  schedule_days integer[] not null default '{1,3,5}',
  schedule_time text not null default '10:00',
  is_active boolean not null default true,
  last_posted_at timestamptz,
  created_at timestamptz not null default now()
);

-- 7. FILA DE FOTOS DOS PRODUTOS (RODÍZIO SEM REPETIÇÃO)
create table if not exists public.topic_photos (
  id text primary key,
  topic_id text not null references public.topics(id) on delete cascade,
  company_id text not null references public.companies(id) on delete cascade,
  original_url text not null,
  enhanced_url text,
  ai_prompt_used text,
  times_used integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- 8. HISTÓRICO DE POSTS & MEMÓRIA ANTI-REPETIÇÃO
create table if not exists public.posts_history (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  topic_id text references public.topics(id) on delete set null,
  topic_title text,
  ai_provider_used text,
  format text not null default 'SINGLE',
  aspect_ratio text not null default '1:1',
  slides_count integer not null default 1,
  headline text not null,
  content_json jsonb not null default '{}'::jsonb,
  image_urls_json jsonb not null default '[]'::jsonb,
  ig_post_id text,
  fb_post_id text,
  tiktok_post_id text,
  status text not null default 'PUBLISHED' check (status in ('PENDING_APPROVAL', 'PUBLISHED', 'ERROR')),
  logs_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 9. AUDITORIA GLOBAL (RETENÇÃO DE 90 DIAS PARA PLANO FREE)
create table if not exists public.audit_logs (
  id text primary key,
  company_id text references public.companies(id) on delete set null,
  user_id text references public.users(id) on delete set null,
  action text not null,
  details_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 10. CAIXA DE DICAS E MELHORIAS DOS CLIENTES
create table if not exists public.improvement_tips (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  company_name text not null,
  user_id text references public.users(id) on delete set null,
  user_name text not null,
  user_email text not null,
  message text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'COMPLETED')),
  admin_reply text,
  completed_at timestamptz,
  client_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- 11. CONTAS DE ANÚNCIO & PERFIL DE DECISÃO POR EMPRESA (TRÁFEGO PAGO)
create table if not exists public.ad_accounts (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  provider text not null default 'META' check (provider in ('META', 'TIKTOK')),
  ad_account_id text not null,
  account_name text not null default '',
  currency text not null default 'BRL',
  account_status integer,
  is_default boolean not null default true,
  preferred_ai_provider text not null default 'AUTO' check (preferred_ai_provider in ('AUTO', 'GEMINI', 'OPENAI', 'CLAUDE')),
  cpa_maximo numeric(10, 2) not null default 35.00,
  roas_minimo numeric(10, 2) not null default 2.00,
  amostra_minima_cliques integer not null default 50,
  link_destino_padrao text,
  localizacao_base text not null default 'Brasil',
  auto_pause_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, provider, ad_account_id)
);

-- 12. CAMPANHAS DE TRÁFEGO PAGO VINCULADAS AOS POSTS ORGÂNICOS
create table if not exists public.ad_campaigns (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  post_id text references public.posts_history(id) on delete set null,
  provider text not null default 'META' check (provider in ('META', 'TIKTOK')),
  channel text not null default 'INSTAGRAM' check (channel in ('INSTAGRAM', 'FACEBOOK', 'TIKTOK')),
  ad_account_id text not null,
  ai_provider_preference text not null default 'AUTO' check (ai_provider_preference in ('AUTO', 'GEMINI', 'OPENAI', 'CLAUDE')),
  name text not null,
  user_prompt text not null default '',
  objective text not null default 'OUTCOME_TRAFFIC',
  optimization_goal text not null default 'LINK_CLICKS',
  destination_type text,
  daily_budget_cents integer not null default 2000,
  currency text not null default 'BRL',
  duration_days integer,
  targeting_json jsonb not null default '{}'::jsonb,
  source_story_id text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_creative_id text,
  meta_ad_id text,
  status text not null default 'PAUSED' check (status in ('DRAFT', 'PAUSED', 'ACTIVE', 'ARCHIVED', 'ERROR')),
  last_verdict text check (last_verdict in ('ESCALAR', 'MANTER', 'PAUSAR')),
  last_verdict_reason text,
  last_insights_json jsonb not null default '{}'::jsonb,
  last_insights_at timestamptz,
  error_message text,
  created_by_user_id text references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 13. ANÚNCIOS / CRIATIVOS POR CAMPANHA (ESTRUTURA 1-1-N)
create table if not exists public.ad_campaign_ads (
  id text primary key,
  campaign_id text not null references public.ad_campaigns(id) on delete cascade,
  company_id text not null references public.companies(id) on delete cascade,
  post_id text references public.posts_history(id) on delete set null,
  ad_name text not null,
  headline text not null default '',
  primary_text text not null default '',
  image_url text,
  story_image_url text,
  source_story_id text,
  meta_creative_id text,
  meta_ad_id text,
  status text not null default 'PAUSED' check (status in ('DRAFT', 'PAUSED', 'ACTIVE', 'ARCHIVED', 'ERROR')),
  last_verdict text check (last_verdict in ('ESCALAR', 'MANTER', 'PAUSAR')),
  last_verdict_reason text,
  last_insights_json jsonb not null default '{}'::jsonb,
  last_insights_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ÍNDICES DE PERFORMANCE
create index if not exists idx_topics_company_active on public.topics(company_id, is_active);
create index if not exists idx_topics_schedule_time on public.topics(schedule_time) where is_active = true;
create index if not exists idx_topic_photos_queue on public.topic_photos(topic_id, times_used, last_used_at);
create index if not exists idx_posts_history_company on public.posts_history(company_id, created_at desc);
create index if not exists idx_posts_history_topic on public.posts_history(topic_id, created_at desc);
create index if not exists idx_audit_logs_created on public.audit_logs(created_at desc);
create index if not exists idx_improvement_tips_created on public.improvement_tips(created_at desc);
create index if not exists idx_improvement_tips_company on public.improvement_tips(company_id, created_at desc);
create index if not exists idx_ad_accounts_company on public.ad_accounts(company_id, provider, is_default desc);
create index if not exists idx_ad_campaigns_company on public.ad_campaigns(company_id, created_at desc);
create index if not exists idx_ad_campaigns_post on public.ad_campaigns(post_id);
create index if not exists idx_ad_campaigns_monitoring on public.ad_campaigns(provider, status);
create index if not exists idx_ad_campaign_ads_campaign on public.ad_campaign_ads(campaign_id, created_at asc);
create index if not exists idx_ad_campaign_ads_company on public.ad_campaign_ads(company_id, status);
create index if not exists idx_ad_campaign_ads_meta_ad on public.ad_campaign_ads(meta_ad_id);

-- SEED INICIAL DOS PLANOS
insert into public.plans (id, name, price_brl, max_posts_month, allow_carousel, allow_ai_photo, allow_multi_ai)
values
  ('plan-starter', 'Starter', 147.00, 12, false, false, false),
  ('plan-pro', 'Pro IA', 297.00, 30, true, true, true),
  ('plan-agency', 'Agência Ilimitado', 597.00, 999, true, true, true)
on conflict (id) do nothing;

-- LIMPEZA AUTOMÁTICA DE LOGS > 90 DIAS (MANTÉM O BANCO ABAIXO DE 500 MB)
create or replace function public.cleanup_old_audit_logs()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.audit_logs
  where created_at < now() - interval '90 days';
end;
$$;

-- PERMISSÕES EXPLÍCITAS PARA A SERVICE_ROLE DA API REST
grant usage on schema public to service_role, anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;

-- ============================================================================
-- AGENDADOR INTELIGENTE NO SUPABASE (OPCIONAL - PLANO FREE)
-- ============================================================================
-- Só chama a Vercel via HTTP quando existe pelo menos 1 assunto ativo
-- agendado para o dia da semana e janela de 30 minutos em Brasília (UTC-3).
--
-- Passo 1: Ative as extensões pg_cron e pg_net no menu Database -> Extensions.
-- Passo 2: Substitua SEU_CRON_SECRET pelo valor da variável CRON_SECRET e rode:
--
-- create or replace function public.dispatch_scheduled_posts()
-- returns void
-- language plpgsql
-- security definer
-- as $$
-- declare
--   br_now timestamp := timezone('America/Sao_Paulo', now()) + interval '5 minutes';
--   br_dow integer := extract(dow from br_now)::integer;
--   br_slot text := to_char(date_trunc('hour', br_now) +
--     case when extract(minute from br_now) >= 30 then interval '30 minutes' else interval '0 minutes' end,
--     'HH24:MI');
--   has_due integer;
-- begin
--   select count(*) into has_due
--   from public.topics t
--   join public.companies c on c.id = t.company_id
--   where t.is_active = true
--     and c.status in ('ACTIVE', 'TRIAL')
--     and c.expires_at > now()
--     and br_dow = any(t.schedule_days)
--     and br_slot = any(string_to_array(replace(t.schedule_time, ' ', ''), ','));
--
--   if has_due > 0 then
--     perform net.http_get(
--       url := 'https://social.pilotflow.com.br/api/cron/gerar-e-postar?source=supabase_cron&slot=' || br_slot,
--       headers := jsonb_build_object('Authorization', 'Bearer SEU_CRON_SECRET'),
--       timeout_milliseconds := 60000
--     );
--   end if;
-- end;
-- $$;
--
-- select cron.schedule(
--   'mgd-social-autopilot-30m',
--   '0,30 * * * *',
--   $$select public.dispatch_scheduled_posts();$$
-- );
--
-- select cron.schedule(
--   'mgd-audit-cleanup-daily',
--   '0 4 * * *',
--   $$select public.cleanup_old_audit_logs();$$
-- );

-- ============================================================================
-- Social Autopilot SaaS (Multi-Empresas & Multi-IA) - Schema Supabase Free
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
  preferred_image_ai text not null default 'GEMINI' check (preferred_image_ai in ('GEMINI', 'OPENAI')),
  gemini_key_enc text,
  openai_key_enc text,
  anthropic_key_enc text,
  meta_token_enc text,
  meta_token_expires_at timestamptz,
  ig_user_id text,
  fb_page_id text,
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
  ai_photo_mode text not null default 'NONE' check (ai_photo_mode in ('NONE', 'ENHANCE', 'ORIGINAL_FRAME')),
  ai_photo_prompt text,
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

-- ÍNDICES DE PERFORMANCE
create index if not exists idx_topics_company_active on public.topics(company_id, is_active);
create index if not exists idx_topics_schedule_time on public.topics(schedule_time) where is_active = true;
create index if not exists idx_topic_photos_queue on public.topic_photos(topic_id, times_used, last_used_at);
create index if not exists idx_posts_history_company on public.posts_history(company_id, created_at desc);
create index if not exists idx_posts_history_topic on public.posts_history(topic_id, created_at desc);
create index if not exists idx_audit_logs_created on public.audit_logs(created_at desc);

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
--   br_now timestamp := timezone('America/Sao_Paulo', now());
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
--     and t.schedule_time = br_slot;
--
--   if has_due > 0 then
--     perform net.http_get(
--       url := 'https://social.meugestordigital.com.br/api/cron/gerar-e-postar?source=supabase_cron&slot=' || br_slot,
--       headers := jsonb_build_object('Authorization', 'Bearer SEU_CRON_SECRET')
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

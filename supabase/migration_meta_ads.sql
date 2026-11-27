-- Migração: Módulo de Tráfego Pago Multi-Tenant (Meta Ads & TikTok Ads)
-- Execute no SQL Editor do seu projeto Supabase (Database -> SQL Editor -> New Query).

-- 11. CONTAS DE ANÚNCIO & PERFIL DE DECISÃO POR EMPRESA (COMPANY_ID)
create table if not exists public.ad_accounts (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  provider text not null default 'META' check (provider in ('META', 'TIKTOK')),
  ad_account_id text not null,
  account_name text not null default '',
  currency text not null default 'BRL',
  account_status integer,
  is_default boolean not null default true,
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

create index if not exists idx_ad_accounts_company
  on public.ad_accounts(company_id, provider, is_default desc);

create index if not exists idx_ad_campaigns_company
  on public.ad_campaigns(company_id, created_at desc);

create index if not exists idx_ad_campaigns_post
  on public.ad_campaigns(post_id);

create index if not exists idx_ad_campaigns_monitoring
  on public.ad_campaigns(provider, status);

grant all on table public.ad_accounts to service_role;
grant all on table public.ad_campaigns to service_role;

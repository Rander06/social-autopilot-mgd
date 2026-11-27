-- Migração: Suporte a Múltiplos Anúncios / Criativos por Campanha (Estrutura 1-1-N)
-- Execute no SQL Editor do seu projeto Supabase (Database -> SQL Editor -> New Query).

-- 13. ANÚNCIOS / CRIATIVOS POR CAMPANHA (1 CAMPANHA -> 1 CONJUNTO -> N ANÚNCIOS)
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

create index if not exists idx_ad_campaign_ads_campaign
  on public.ad_campaign_ads(campaign_id, created_at asc);

create index if not exists idx_ad_campaign_ads_company
  on public.ad_campaign_ads(company_id, status);

create index if not exists idx_ad_campaign_ads_meta_ad
  on public.ad_campaign_ads(meta_ad_id);

grant all on table public.ad_campaign_ads to service_role;

-- Backfill idempotente das campanhas já existentes que possuem meta_ad_id
insert into public.ad_campaign_ads (
  id,
  campaign_id,
  company_id,
  post_id,
  ad_name,
  headline,
  primary_text,
  image_url,
  source_story_id,
  meta_creative_id,
  meta_ad_id,
  status,
  last_verdict,
  last_verdict_reason,
  last_insights_json,
  last_insights_at,
  error_message,
  created_at,
  updated_at
)
select
  'adad_' || replace(c.id, 'adcmp_', ''),
  c.id,
  c.company_id,
  c.post_id,
  coalesce(nullif(p.headline, ''), c.name || ' — Ad'),
  coalesce(p.headline, ''),
  coalesce(p.content_json->>'legenda', ''),
  case
    when jsonb_typeof(p.image_urls_json) = 'array' and jsonb_array_length(p.image_urls_json) > 0
      then p.image_urls_json->>0
    else null
  end,
  c.source_story_id,
  c.meta_creative_id,
  c.meta_ad_id,
  c.status,
  c.last_verdict,
  c.last_verdict_reason,
  coalesce(c.last_insights_json, '{}'::jsonb),
  c.last_insights_at,
  c.error_message,
  c.created_at,
  c.updated_at
from public.ad_campaigns c
left join public.posts_history p on p.id = c.post_id
where c.meta_ad_id is not null
  and not exists (
    select 1 from public.ad_campaign_ads a where a.campaign_id = c.id
  )
on conflict (id) do nothing;

-- Migration: Adiciona vínculo opcional de Portfólio Empresarial (BM / Business Manager) nas contas de anúncios
-- Execute no SQL Editor do Supabase (idempotente)

alter table if exists public.ad_accounts
  add column if not exists business_id text,
  add column if not exists business_name text;

create index if not exists idx_ad_accounts_company_business
  on public.ad_accounts (company_id, business_id);

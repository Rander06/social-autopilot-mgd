-- Migração: Múltiplas Contas de Anúncios por Empresa & Escolha de IA por Conta/Campanha/Métricas
-- Execute no SQL Editor do seu projeto Supabase (Database -> SQL Editor -> New Query).

alter table public.ad_accounts
  add column if not exists preferred_ai_provider text not null default 'AUTO'
  check (preferred_ai_provider in ('AUTO', 'GEMINI', 'OPENAI', 'CLAUDE'));

alter table public.ad_campaigns
  add column if not exists ai_provider_preference text not null default 'AUTO'
  check (ai_provider_preference in ('AUTO', 'GEMINI', 'OPENAI', 'CLAUDE'));

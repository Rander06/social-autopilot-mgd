-- Migração: Caixa de Dicas e Melhorias dos Clientes (Suporte PilotFlow)
-- Execute no SQL Editor do Supabase (Database -> SQL Editor -> New Query).

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

create index if not exists idx_improvement_tips_created
  on public.improvement_tips(created_at desc);

create index if not exists idx_improvement_tips_company
  on public.improvement_tips(company_id, created_at desc);

grant all on table public.improvement_tips to service_role;

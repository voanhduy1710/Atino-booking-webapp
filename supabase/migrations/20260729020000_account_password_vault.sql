alter table public.supplier_accounts
  add column if not exists password_ciphertext text;

create table if not exists public.account_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  account_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists account_audit_events_account_created_idx
  on public.account_audit_events (account_id, created_at desc);

alter table public.account_audit_events enable row level security;
revoke all on table public.account_audit_events from public, anon, authenticated;
grant select, insert on table public.account_audit_events to service_role;

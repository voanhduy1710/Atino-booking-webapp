create table if not exists public.auth_sessions (
  jti uuid primary key,
  subject text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_sessions_active_idx
  on public.auth_sessions (jti, expires_at)
  where revoked_at is null;

alter table public.auth_sessions enable row level security;
revoke all on table public.auth_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.auth_sessions to service_role;

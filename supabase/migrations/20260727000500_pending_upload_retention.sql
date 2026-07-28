create table if not exists public.pending_uploads (
  path text primary key,
  owner_sub text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create index if not exists pending_uploads_expiry_idx
  on public.pending_uploads (expires_at);

alter table public.pending_uploads enable row level security;
revoke all on table public.pending_uploads from public, anon, authenticated;
grant select, insert, update, delete on table public.pending_uploads to service_role;

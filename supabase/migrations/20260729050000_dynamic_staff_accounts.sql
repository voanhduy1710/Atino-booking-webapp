-- Dynamic staff accounts and their role mapping. The bootstrap superadmin stays in AUTH_USERS.
create table if not exists public.staff_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  full_name text not null,
  password_hash text not null,
  password_ciphertext text,
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_accounts_username_length check (char_length(username) between 3 and 100),
  constraint staff_accounts_name_length check (char_length(full_name) between 1 and 200)
);

create table if not exists public.staff_account_roles (
  staff_account_id uuid primary key references public.staff_accounts(id) on delete cascade,
  role text not null check (role in ('admin', 'warehouse_reviewer', 'warehouse_receiver', 'manager')),
  created_at timestamptz not null default now()
);

alter table public.account_audit_events
  add column if not exists account_kind text not null default 'supplier'
  check (account_kind in ('supplier', 'staff'));

create index if not exists staff_accounts_status_idx on public.staff_accounts(status);
create index if not exists staff_account_roles_role_idx on public.staff_account_roles(role);

alter table public.staff_accounts enable row level security;
alter table public.staff_account_roles enable row level security;
revoke all on table public.staff_accounts from public, anon, authenticated;
revoke all on table public.staff_account_roles from public, anon, authenticated;
grant select, insert, update, delete on table public.staff_accounts to service_role;
grant select, insert, update, delete on table public.staff_account_roles to service_role;

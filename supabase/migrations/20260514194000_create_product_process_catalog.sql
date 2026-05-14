create table if not exists public.product_process_catalog (
  id uuid primary key default gen_random_uuid(),
  lark_record_id text not null unique,
  product_name text not null,
  order_code text not null,
  active boolean not null default true,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_process_catalog_lookup_idx
  on public.product_process_catalog (product_name, order_code);

alter table public.product_process_catalog enable row level security;

drop policy if exists product_process_catalog_select_active on public.product_process_catalog;
create policy product_process_catalog_select_active
  on public.product_process_catalog
  for select
  to public
  using (active = true);

begin;

-- Sensitive operational data is served by role-checked backend DTOs.
revoke all privileges on table public.bookings from anon, authenticated;
revoke all privileges on table public.booking_items from anon, authenticated;
revoke all privileges on table public.booking_item_photos from anon, authenticated;
revoke all privileges on table public.notifications from anon, authenticated;
revoke all privileges on table public.booking_amendments from anon, authenticated;
revoke all privileges on table public.discrepancy_log from anon, authenticated;
revoke all privileges on table public.supplier_accounts from anon, authenticated;

alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
alter table public.booking_item_photos enable row level security;
alter table public.notifications enable row level security;
alter table public.booking_amendments enable row level security;
alter table public.discrepancy_log enable row level security;
alter table public.supplier_accounts enable row level security;

-- Catalog lookup tables intentionally remain anonymously readable.
revoke insert, update, delete, truncate, references, trigger
  on table public.warehouses, public.suppliers, public.product_process_catalog
  from anon, authenticated;
grant select
  on table public.warehouses, public.suppliers, public.product_process_catalog
  to anon, authenticated;

commit;

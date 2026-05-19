alter table public.product_process_catalog
  add column if not exists warehouse_code text,
  add column if not exists mau text,
  add column if not exists order_date date,
  add column if not exists total_quantity integer not null default 0,
  add column if not exists size_s_28 integer not null default 0,
  add column if not exists size_m_29 integer not null default 0,
  add column if not exists size_l_30 integer not null default 0,
  add column if not exists size_xl_31 integer not null default 0,
  add column if not exists size_2xl_32 integer not null default 0,
  add column if not exists size_3xl_33 integer not null default 0;

create index if not exists product_process_catalog_supplier_pick_idx
  on public.product_process_catalog (product_name, order_code, warehouse_code, mau)
  where active = true;

alter table public.bookings
  add column if not exists nhanh_draft_bill_id text;

alter table public.booking_items
  add column if not exists warehouse_code text,
  add column if not exists mau text,
  add column if not exists total_quantity integer,
  add column if not exists size_s_28 integer not null default 0,
  add column if not exists size_m_29 integer not null default 0,
  add column if not exists size_l_30 integer not null default 0,
  add column if not exists size_xl_31 integer not null default 0,
  add column if not exists size_2xl_32 integer not null default 0,
  add column if not exists size_3xl_33 integer not null default 0,
  add column if not exists reviewed_at timestamp with time zone;

update public.booking_items
set total_quantity = coalesce(total_quantity, quantity_booked, 0)
where total_quantity is null;

alter table public.booking_items
  alter column total_quantity set default 0,
  alter column total_quantity set not null;

do $$
begin
  alter type public.booking_status add value if not exists 'partially_approved';
  alter type public.booking_status add value if not exists 'partially_rejected';
  alter type public.booking_status add value if not exists 'returned';
exception
  when undefined_object then null;
end $$;

do $$
begin
  alter type public.booking_item_status add value if not exists 'returned';
exception
  when undefined_object then null;
end $$;

do $$
begin
  alter type public.photo_type add value if not exists 'vat_invoice';
exception
  when undefined_object then null;
end $$;

create index if not exists booking_amendments_requested_by_idx
  on public.booking_amendments (requested_by);

create index if not exists bookings_warehouse_id_idx
  on public.bookings (warehouse_id);

create index if not exists notifications_booking_id_idx
  on public.notifications (booking_id);

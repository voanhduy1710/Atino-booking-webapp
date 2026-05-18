alter table public.product_process_catalog
  add column if not exists warehouse_code text,
  add column if not exists mau text,
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
  add column if not exists size_3xl_33 integer not null default 0;

update public.booking_items
set total_quantity = coalesce(total_quantity, quantity_booked)
where total_quantity is null;

alter table public.booking_items
  alter column total_quantity set default 0,
  alter column total_quantity set not null;

do $$
begin
  if exists (select 1 from pg_type where typname = 'booking_status') then
    alter type public.booking_status add value if not exists 'returned';
  end if;
  if exists (select 1 from pg_type where typname = 'booking_item_status') then
    alter type public.booking_item_status add value if not exists 'returned';
  end if;
  if exists (select 1 from pg_type where typname = 'photo_type') then
    alter type public.photo_type add value if not exists 'vat_invoice';
  end if;
end $$;

create or replace function recalculate_booking_status(p_booking_id uuid)
returns booking_status
language plpgsql
security definer
as $$
declare
  v_total integer;
  v_pending integer;
  v_confirmed integer;
  v_rejected integer;
  v_returned integer;
  v_current booking_status;
  v_next booking_status;
begin
  select status into v_current
  from bookings
  where id = p_booking_id;

  if v_current = 'cancelled' then
    return v_current;
  end if;

  select
    count(*)::integer,
    count(*) filter (where status = 'pending')::integer,
    count(*) filter (where status = 'confirmed')::integer,
    count(*) filter (where status = 'rejected')::integer,
    count(*) filter (where status = 'returned')::integer
  into v_total, v_pending, v_confirmed, v_rejected, v_returned
  from booking_items
  where booking_id = p_booking_id;

  if v_total = 0 or v_pending = v_total then
    v_next := 'pending';
  elsif v_returned = v_total then
    v_next := 'returned';
  elsif v_confirmed = v_total then
    v_next := 'confirmed';
  elsif v_rejected = v_total then
    v_next := 'rejected';
  elsif v_returned > 0 then
    v_next := 'returned';
  elsif v_confirmed > 0 then
    v_next := 'partially_approved';
  else
    v_next := 'partially_rejected';
  end if;

  update bookings
  set
    status = v_next,
    confirmed_at = case when v_next in ('confirmed', 'partially_approved') then coalesce(confirmed_at, now()) else confirmed_at end
  where id = p_booking_id;

  return v_next;
end;
$$;

create or replace function return_booking_item(p_item_id uuid, p_reason text, p_reviewer_username text)
returns void
language plpgsql
security definer
as $$
declare
  v_booking_id uuid;
begin
  update booking_items
  set
    status = 'returned',
    reject_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_item_id
    and status = 'pending'
  returning booking_id into v_booking_id;

  if v_booking_id is null then
    if exists (select 1 from booking_items where id = p_item_id) then
      raise exception 'booking item has already been reviewed';
    end if;
    raise exception 'booking item not found';
  end if;

  update bookings
  set confirmed_by = coalesce(nullif(p_reviewer_username, ''), confirmed_by)
  where id = v_booking_id;

  perform recalculate_booking_status(v_booking_id);
end;
$$;

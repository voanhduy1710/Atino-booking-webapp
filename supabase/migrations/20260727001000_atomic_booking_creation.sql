begin;

alter table public.bookings
  add column if not exists client_session_id text;

create unique index if not exists bookings_supplier_session_unique
  on public.bookings (supplier_account_id, client_session_id)
  where client_session_id is not null;

alter table public.booking_items
  add constraint booking_items_quantity_booked_nonnegative
    check (quantity_booked >= 0) not valid,
  add constraint booking_items_total_quantity_nonnegative
    check (total_quantity >= 0) not valid,
  add constraint booking_items_sizes_nonnegative
    check (
      size_s_28 >= 0 and size_m_29 >= 0 and size_l_30 >= 0
      and size_xl_31 >= 0 and size_2xl_32 >= 0 and size_3xl_33 >= 0
    ) not valid;

create or replace function public.create_booking_atomic(
  p_supplier_account_id uuid,
  p_warehouse_id uuid,
  p_delivery_date date,
  p_time_slot public.time_slot,
  p_ghi_chu text,
  p_delivery_note text,
  p_client_session_id text,
  p_items jsonb,
  p_staff_recipients text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account record;
  v_booking record;
  v_existing record;
  v_item jsonb;
  v_photo jsonb;
  v_item_id uuid;
  v_requested integer;
  v_used integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'booking requires at least one item';
  end if;

  select id, supplier_id, status
  into v_account
  from public.supplier_accounts
  where id = p_supplier_account_id
  for share;

  if v_account.id is null or v_account.status <> 'active' or v_account.supplier_id is null then
    raise exception 'supplier account is not active';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_supplier_account_id::text || ':' || p_client_session_id, 1)
  );

  select id, booking_code, booking_token, delivery_date
  into v_existing
  from public.bookings
  where supplier_account_id = p_supplier_account_id
    and client_session_id = p_client_session_id;

  if v_existing.id is not null then
    return jsonb_build_object(
      'id', v_existing.id,
      'booking_code', v_existing.booking_code,
      'booking_token', v_existing.booking_token,
      'delivery_date', v_existing.delivery_date,
      'idempotent_replay', true
    );
  end if;

  select coalesce(sum((item->>'total_quantity')::integer), 0)
  into v_requested
  from jsonb_array_elements(p_items) item;

  if v_requested <= 0 or v_requested > 20000 then
    raise exception 'invalid requested quantity';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_delivery_date::text, 0));

  select coalesce(sum(i.total_quantity), 0)::integer
  into v_used
  from public.bookings b
  join public.booking_items i on i.booking_id = b.id
  where b.delivery_date = p_delivery_date
    and b.status <> 'cancelled'
    and i.status in ('pending', 'confirmed');

  if v_used + v_requested > 20000 then
    raise exception 'daily booking capacity exceeded';
  end if;

  insert into public.bookings (
    supplier_account_id, supplier_id, warehouse_id, delivery_date,
    time_slot, ghi_chu, delivery_note, client_session_id
  )
  values (
    p_supplier_account_id, v_account.supplier_id, p_warehouse_id, p_delivery_date,
    p_time_slot, nullif(trim(coalesce(p_ghi_chu, '')), ''), p_delivery_note,
    p_client_session_id
  )
  returning id, booking_code, booking_token, delivery_date
  into v_booking;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.booking_items (
      booking_id, product_code, process_code, warehouse_code, mau,
      delivery_round, is_final_round, quantity_booked, total_quantity,
      size_s_28, size_m_29, size_l_30, size_xl_31, size_2xl_32,
      size_3xl_33, vat_invoice_url
    )
    values (
      v_booking.id,
      v_item->>'product_code',
      v_item->>'process_code',
      nullif(v_item->>'warehouse_code', ''),
      nullif(v_item->>'mau', ''),
      (v_item->>'delivery_round')::integer,
      coalesce((v_item->>'is_final_round')::boolean, false),
      (v_item->>'total_quantity')::integer,
      (v_item->>'total_quantity')::integer,
      coalesce((v_item->>'size_s_28')::integer, 0),
      coalesce((v_item->>'size_m_29')::integer, 0),
      coalesce((v_item->>'size_l_30')::integer, 0),
      coalesce((v_item->>'size_xl_31')::integer, 0),
      coalesce((v_item->>'size_2xl_32')::integer, 0),
      coalesce((v_item->>'size_3xl_33')::integer, 0),
      nullif(v_item->>'vat_invoice_url', '')
    )
    returning id into v_item_id;

    if jsonb_typeof(v_item->'photos') = 'array' then
      for v_photo in select value from jsonb_array_elements(v_item->'photos')
      loop
        insert into public.booking_item_photos (
          booking_item_id, storage_path, photo_type
        )
        values (
          v_item_id,
          v_photo->>'storage_path',
          (v_photo->>'photo_type')::public.photo_type
        );
      end loop;
    end if;
  end loop;

  insert into public.notifications (
    recipient_type, recipient_id, event_type, message, booking_id
  )
  select
    'staff',
    recipient,
    'booking_submitted',
    'Có booking mới: ' || v_booking.booking_code,
    v_booking.id
  from unnest(coalesce(p_staff_recipients, array[]::text[])) recipient
  where recipient <> '';

  delete from public.pending_uploads
  where path in (
    select photo->>'storage_path'
    from jsonb_array_elements(p_items) item
    cross join lateral jsonb_array_elements(coalesce(item->'photos', '[]'::jsonb)) photo
    union
    select item->>'vat_invoice_url'
    from jsonb_array_elements(p_items) item
    where nullif(item->>'vat_invoice_url', '') is not null
  );

  return jsonb_build_object(
    'id', v_booking.id,
    'booking_code', v_booking.booking_code,
    'booking_token', v_booking.booking_token,
    'delivery_date', v_booking.delivery_date,
    'idempotent_replay', false
  );
end;
$$;

revoke execute on function public.create_booking_atomic(
  uuid, uuid, date, public.time_slot, text, text, text, jsonb, text[]
) from public, anon, authenticated;

grant execute on function public.create_booking_atomic(
  uuid, uuid, date, public.time_slot, text, text, text, jsonb, text[]
) to service_role;

commit;

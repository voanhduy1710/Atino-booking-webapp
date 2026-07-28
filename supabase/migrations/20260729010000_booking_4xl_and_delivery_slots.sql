alter type public.time_slot add value if not exists '08-1130';
alter type public.time_slot add value if not exists '1330-17';

alter table public.booking_items
  add column if not exists size_4xl_34 integer not null default 0
  check (size_4xl_34 >= 0);

alter table public.product_process_catalog
  add column if not exists size_4xl_34 integer not null default 0
  check (size_4xl_34 >= 0);

create or replace function public.create_booking_atomic_v2(
  p_supplier_account_id uuid, p_warehouse_id uuid, p_delivery_date date,
  p_time_slot public.time_slot, p_ghi_chu text, p_delivery_note text,
  p_client_session_id text, p_items jsonb, p_staff_recipients text[]
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_booking jsonb;
begin
  v_booking := public.create_booking_atomic(p_supplier_account_id, p_warehouse_id, p_delivery_date,
    p_time_slot, p_ghi_chu, p_delivery_note, p_client_session_id, p_items, p_staff_recipients);
  if coalesce((v_booking->>'idempotent_replay')::boolean, false) then return v_booking; end if;
  update public.booking_items item
  set size_4xl_34 = coalesce((source.value->>'size_4xl_34')::integer, 0)
  from jsonb_array_elements(p_items) with ordinality source(value, ordinal)
  where item.booking_id = (v_booking->>'id')::uuid
    and item.product_code = source.value->>'product_code'
    and item.process_code = source.value->>'process_code'
    and coalesce(item.warehouse_code, '') = coalesce(source.value->>'warehouse_code', '')
    and coalesce(item.mau, '') = coalesce(source.value->>'mau', '')
    and item.delivery_round = (source.value->>'delivery_round')::integer
    and item.total_quantity = (source.value->>'total_quantity')::integer;
  return v_booking;
end;
$$;

revoke all on function public.create_booking_atomic_v2(uuid, uuid, date, public.time_slot, text, text, text, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.create_booking_atomic_v2(uuid, uuid, date, public.time_slot, text, text, text, jsonb, text[]) to service_role;

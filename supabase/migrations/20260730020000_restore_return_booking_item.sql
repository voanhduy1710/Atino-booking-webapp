create or replace function public.return_booking_item(
  p_item_id uuid,
  p_reason text,
  p_reviewer_username text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id uuid;
begin
  update public.booking_items
  set
    status = 'returned',
    reject_reason = nullif(trim(coalesce(p_reason, '')), ''),
    reviewed_at = now()
  where id = p_item_id
    and status = 'pending'
  returning booking_id into v_booking_id;

  if v_booking_id is null then
    if exists (select 1 from public.booking_items where id = p_item_id) then
      raise exception 'booking item has already been reviewed';
    end if;
    raise exception 'booking item not found';
  end if;

  update public.bookings
  set
    status = 'returned',
    confirmed_by = coalesce(confirmed_by, p_reviewer_username),
    confirmed_at = coalesce(confirmed_at, now())
  where id = v_booking_id
    and status not in ('cancelled', 'received');
end;
$$;

revoke all on function public.return_booking_item(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.return_booking_item(uuid, text, text)
  to service_role;

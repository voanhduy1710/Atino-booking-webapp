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
  v_current booking_status;
  v_next booking_status;
begin
  select status into v_current
  from bookings
  where id = p_booking_id;

  if v_current in ('received', 'cancelled') then
    return v_current;
  end if;

  select
    count(*)::integer,
    count(*) filter (where status = 'pending')::integer,
    count(*) filter (where status = 'confirmed')::integer,
    count(*) filter (where status = 'rejected')::integer
  into v_total, v_pending, v_confirmed, v_rejected
  from booking_items
  where booking_id = p_booking_id;

  if v_total = 0 or v_pending = v_total then
    v_next := 'pending';
  elsif v_confirmed = v_total then
    v_next := 'confirmed';
  elsif v_rejected = v_total then
    v_next := 'rejected';
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

create or replace function confirm_booking_item(p_item_id uuid, p_reviewer_username text)
returns void
language plpgsql
security definer
as $$
declare
  v_booking_id uuid;
begin
  update booking_items
  set
    status = 'confirmed',
    reject_reason = null
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

create or replace function reject_booking_item(p_item_id uuid, p_reason text, p_reviewer_username text)
returns void
language plpgsql
security definer
as $$
declare
  v_booking_id uuid;
begin
  if nullif(trim(p_reason), '') is null then
    raise exception 'reject reason is required';
  end if;

  update booking_items
  set
    status = 'rejected',
    reject_reason = nullif(trim(p_reason), '')
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

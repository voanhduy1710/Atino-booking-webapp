create or replace function public.get_booking_capacity(
  p_date_from date,
  p_date_to date
) returns table(delivery_date date, used_quantity bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with dates as (
    select generate_series(p_date_from, p_date_to, interval '1 day')::date as delivery_date
  )
  select
    dates.delivery_date,
    coalesce(sum(
      case
        when b.status::text <> 'cancelled'
         and bi.status::text in ('pending', 'confirmed')
        then coalesce(bi.total_quantity, bi.quantity_booked, 0)
        else 0
      end
    ), 0)::bigint as used_quantity
  from dates
  left join public.bookings b on b.delivery_date = dates.delivery_date
  left join public.booking_items bi on bi.booking_id = b.id
  group by dates.delivery_date
  order by dates.delivery_date;
$$;

revoke all on function public.get_booking_capacity(date, date) from public, anon, authenticated;
grant execute on function public.get_booking_capacity(date, date) to service_role;

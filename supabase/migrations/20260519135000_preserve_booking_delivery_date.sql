create or replace function public.set_booking_delivery_date()
returns trigger
language plpgsql
as $$
declare
  ict_time timestamp;
begin
  if new.delivery_date is not null then
    return new;
  end if;

  ict_time := new.submitted_at at time zone 'Asia/Ho_Chi_Minh';
  if extract(hour from ict_time) < 18 then
    new.delivery_date := (ict_time::date + 1);
  else
    new.delivery_date := (ict_time::date + 2);
  end if;
  return new;
end;
$$;

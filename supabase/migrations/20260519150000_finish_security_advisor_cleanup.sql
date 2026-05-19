-- Resolve remaining Supabase security advisor findings after RLS lockdown.

alter function public.set_booking_delivery_date() set search_path = public, pg_temp;
alter function public.generate_booking_code() set search_path = public, pg_temp;

alter view public.daily_capacity set (security_invoker = true);

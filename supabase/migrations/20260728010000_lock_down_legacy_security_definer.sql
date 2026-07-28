-- Backend routes use the service role; browser roles must not call privileged RPCs.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end
$$;

-- This legacy summary view is server-only; avoid definer privileges if it is queried.
do $$
begin
  if to_regclass('public.daily_capacity') is not null then
    execute 'alter view public.daily_capacity set (security_invoker = true)';
    execute 'revoke all on table public.daily_capacity from public, anon, authenticated';
    execute 'grant select on table public.daily_capacity to service_role';
  end if;
end
$$;

begin;

-- Account rows are preserved. Only recoverable credential material is removed.
revoke select on table public.supplier_accounts from anon, authenticated;

drop function if exists public.admin_reset_supplier_password(uuid, text, text);
drop function if exists public.register_supplier(text, text, text, text);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'supplier_accounts'
      and column_name = 'password'
  ) then
    update public.supplier_accounts set password = null where password is not null;
    alter table public.supplier_accounts drop column password;
  end if;
end
$$;

commit;

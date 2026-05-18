alter table public.product_process_catalog
  add column if not exists mau text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_process_catalog'
      and column_name = 'color'
  ) then
    update public.product_process_catalog
    set mau = coalesce(mau, color);
  end if;
end $$;

drop index if exists product_process_catalog_supplier_pick_idx;
create index if not exists product_process_catalog_supplier_pick_idx
  on public.product_process_catalog (product_name, order_code, warehouse_code, mau)
  where active = true;

alter table public.booking_items
  add column if not exists mau text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'booking_items'
      and column_name = 'color'
  ) then
    update public.booking_items
    set mau = coalesce(mau, color);
  end if;
end $$;

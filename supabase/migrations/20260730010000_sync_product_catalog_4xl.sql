create or replace function public.sync_product_catalog_atomic(
  p_rows jsonb,
  p_sync_started_at timestamptz
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'catalog payload must be an array';
  end if;

  create temporary table catalog_sync_stage (
    lark_record_id text primary key,
    product_name text not null,
    order_code text not null,
    warehouse_code text,
    mau text,
    order_date date,
    total_quantity integer not null,
    size_s_28 integer not null,
    size_m_29 integer not null,
    size_l_30 integer not null,
    size_xl_31 integer not null,
    size_2xl_32 integer not null,
    size_3xl_33 integer not null,
    size_4xl_34 integer not null
  ) on commit drop;

  insert into catalog_sync_stage
  select
    trim(lark_record_id),
    trim(product_name),
    trim(order_code),
    nullif(trim(warehouse_code), ''),
    nullif(trim(mau), ''),
    order_date,
    greatest(coalesce(total_quantity, 0), 0),
    greatest(coalesce(size_s_28, 0), 0),
    greatest(coalesce(size_m_29, 0), 0),
    greatest(coalesce(size_l_30, 0), 0),
    greatest(coalesce(size_xl_31, 0), 0),
    greatest(coalesce(size_2xl_32, 0), 0),
    greatest(coalesce(size_3xl_33, 0), 0),
    greatest(coalesce(size_4xl_34, 0), 0)
  from jsonb_to_recordset(p_rows) as row(
    lark_record_id text,
    product_name text,
    order_code text,
    warehouse_code text,
    mau text,
    order_date date,
    total_quantity integer,
    size_s_28 integer,
    size_m_29 integer,
    size_l_30 integer,
    size_xl_31 integer,
    size_2xl_32 integer,
    size_3xl_33 integer,
    size_4xl_34 integer
  )
  where nullif(trim(lark_record_id), '') is not null
    and nullif(trim(product_name), '') is not null
    and nullif(trim(order_code), '') is not null;

  select count(*) into v_count from catalog_sync_stage;
  if v_count = 0 then
    raise exception 'catalog sync contains no valid rows';
  end if;

  insert into public.product_process_catalog (
    lark_record_id, product_name, order_code, warehouse_code, mau, order_date,
    total_quantity, size_s_28, size_m_29, size_l_30, size_xl_31,
    size_2xl_32, size_3xl_33, size_4xl_34, active, last_synced_at, updated_at
  )
  select
    lark_record_id, product_name, order_code, warehouse_code, mau, order_date,
    total_quantity, size_s_28, size_m_29, size_l_30, size_xl_31,
    size_2xl_32, size_3xl_33, size_4xl_34, true,
    p_sync_started_at, p_sync_started_at
  from catalog_sync_stage
  on conflict (lark_record_id) do update set
    product_name = excluded.product_name,
    order_code = excluded.order_code,
    warehouse_code = excluded.warehouse_code,
    mau = excluded.mau,
    order_date = excluded.order_date,
    total_quantity = excluded.total_quantity,
    size_s_28 = excluded.size_s_28,
    size_m_29 = excluded.size_m_29,
    size_l_30 = excluded.size_l_30,
    size_xl_31 = excluded.size_xl_31,
    size_2xl_32 = excluded.size_2xl_32,
    size_3xl_33 = excluded.size_3xl_33,
    size_4xl_34 = excluded.size_4xl_34,
    active = true,
    last_synced_at = excluded.last_synced_at,
    updated_at = excluded.updated_at;

  update public.product_process_catalog
  set active = false, updated_at = p_sync_started_at
  where last_synced_at < p_sync_started_at or last_synced_at is null;

  return v_count;
end;
$$;

revoke all on function public.sync_product_catalog_atomic(jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.sync_product_catalog_atomic(jsonb, timestamptz)
  to service_role;

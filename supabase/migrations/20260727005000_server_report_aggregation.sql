create or replace function public.get_booking_report(
  p_date_from date default null,
  p_date_to date default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with item_stats as (
    select
      b.id,
      b.delivery_date,
      b.status::text as booking_status,
      coalesce(s.name, '—') as supplier_name,
      count(bi.id)::integer as total_items,
      count(bi.id) filter (where bi.status = 'pending')::integer as pending_items,
      count(bi.id) filter (where bi.status = 'confirmed')::integer as confirmed_items,
      count(bi.id) filter (where bi.status = 'rejected')::integer as rejected_items,
      count(bi.id) filter (where bi.status = 'returned')::integer as returned_items
    from public.bookings b
    left join public.suppliers s on s.id = b.supplier_id
    left join public.booking_items bi on bi.booking_id = b.id
    where (p_date_from is null or b.delivery_date >= p_date_from)
      and (p_date_to is null or b.delivery_date <= p_date_to)
    group by b.id, b.delivery_date, b.status, s.name
  ),
  effective as (
    select
      *,
      case
        when booking_status in ('cancelled', 'received') then booking_status
        when total_items = 0 or pending_items = total_items then 'pending'
        when returned_items > 0 then 'returned'
        when confirmed_items = total_items then 'confirmed'
        when rejected_items = total_items then 'rejected'
        when confirmed_items > 0 then 'partially_approved'
        else 'partially_rejected'
      end as effective_status
    from item_stats
  ),
  status_counts as (
    select effective_status, count(*)::integer as count
    from effective
    group by effective_status
  ),
  daily_base as (
    select
      delivery_date,
      count(*)::integer as total,
      sum(total_items)::integer as total_items,
      sum(confirmed_items)::integer as confirmed,
      sum(rejected_items)::integer as rejected,
      sum(pending_items)::integer as pending
    from effective
    group by delivery_date
  ),
  daily_status as (
    select delivery_date, effective_status, count(*)::integer as count
    from effective
    group by delivery_date, effective_status
  ),
  daily_status_json as (
    select delivery_date, jsonb_object_agg(effective_status, count) as statuses
    from daily_status
    group by delivery_date
  ),
  supplier_counts as (
    select supplier_name, count(*)::integer as count
    from effective
    group by supplier_name
    order by count desc, supplier_name
    limit 10
  )
  select jsonb_build_object(
    'total', (select count(*)::integer from effective),
    'total_items', coalesce((select sum(total_items)::integer from effective), 0),
    'by_status', coalesce(
      (select jsonb_object_agg(effective_status, count) from status_counts),
      '{}'::jsonb
    ),
    'daily', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'date', daily_base.delivery_date,
            'total', daily_base.total,
            'statuses', coalesce(daily_status_json.statuses, '{}'::jsonb),
            'total_items', daily_base.total_items,
            'confirmed', daily_base.confirmed,
            'rejected', daily_base.rejected,
            'pending', daily_base.pending
          )
          order by daily_base.delivery_date
        )
        from daily_base
        left join daily_status_json using (delivery_date)
      ),
      '[]'::jsonb
    ),
    'suppliers', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('name', supplier_name, 'count', count)
          order by count desc, supplier_name
        )
        from supplier_counts
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.get_booking_report(date, date) from public, anon, authenticated;
grant execute on function public.get_booking_report(date, date) to service_role;

create table if not exists public.app_schema_version (
  singleton boolean primary key default true check (singleton),
  version bigint not null,
  applied_at timestamptz not null default now()
);

insert into public.app_schema_version (singleton, version, applied_at)
values (true, 20260727005000, now())
on conflict (singleton) do update
set version = excluded.version, applied_at = excluded.applied_at;

alter table public.app_schema_version enable row level security;
revoke all on table public.app_schema_version from public, anon, authenticated;
grant select on table public.app_schema_version to service_role;

alter table public.product_process_catalog
  add column if not exists order_date date;


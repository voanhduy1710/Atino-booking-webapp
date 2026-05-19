-- Lock down browser-owned writes after moving workflow mutations behind backend routes.
-- Public SELECT policies are intentionally left in place for the current frontend read model.

drop policy if exists "amendments_insert_anon" on public.booking_amendments;
drop policy if exists "amendments_update_anon" on public.booking_amendments;
drop policy if exists "booking_amendments_insert_anon" on public.booking_amendments;
drop policy if exists "booking_amendments_update_anon" on public.booking_amendments;

drop policy if exists "booking_item_photos_insert_anon" on public.booking_item_photos;

drop policy if exists "booking_items_insert_anon" on public.booking_items;
drop policy if exists "booking_items_update_anon" on public.booking_items;

drop policy if exists "bookings_insert_anon" on public.bookings;
drop policy if exists "bookings_update_anon" on public.bookings;

drop policy if exists "discrepancy_log_insert_anon" on public.discrepancy_log;

drop policy if exists "notifications_insert_anon" on public.notifications;
drop policy if exists "notifications_update_anon" on public.notifications;

drop policy if exists "supplier_accounts_insert_anon" on public.supplier_accounts;
drop policy if exists "supplier_accounts_update_own" on public.supplier_accounts;

drop policy if exists "suppliers_delete_anon" on public.suppliers;
drop policy if exists "suppliers_insert_anon" on public.suppliers;
drop policy if exists "suppliers_update_anon" on public.suppliers;

drop policy if exists "warehouses_delete_anon" on public.warehouses;
drop policy if exists "warehouses_insert_anon" on public.warehouses;
drop policy if exists "warehouses_update_anon" on public.warehouses;

alter function public.admin_delete_booking(p_booking_id uuid) set search_path = public, pg_temp;
alter function public.admin_reset_supplier_password(p_account_id uuid, p_password_hash text, p_plaintext_password text) set search_path = public, pg_temp;
alter function public.approve_supplier_account(p_account_id uuid, p_supplier_id uuid) set search_path = public, pg_temp;
alter function public.confirm_booking_item(p_item_id uuid, p_reviewer_username text) set search_path = public, pg_temp;
alter function public.get_my_bookings(p_supplier_account_id uuid, p_status public.booking_status, p_limit integer, p_offset integer) set search_path = public, pg_temp;
alter function public.login_supplier(p_username text, p_password_hash text) set search_path = public, pg_temp;
alter function public.receive_booking(p_booking_token uuid, p_quantities jsonb, p_receiver_username text) set search_path = public, pg_temp;
alter function public.register_supplier(p_username text, p_password_hash text, p_full_name text) set search_path = public, pg_temp;
alter function public.register_supplier(p_username text, p_password_hash text, p_full_name text, p_password text) set search_path = public, pg_temp;
alter function public.reject_booking_item(p_item_id uuid, p_reason text, p_reviewer_username text) set search_path = public, pg_temp;
alter function public.reject_supplier_account(p_account_id uuid, p_reason text) set search_path = public, pg_temp;
alter function public.request_booking_amendment(p_booking_id uuid, p_supplier_account_id uuid, p_type text, p_note text) set search_path = public, pg_temp;
alter function public.request_booking_amendment(p_booking_id uuid, p_supplier_account_id uuid, p_type text, p_note text, p_proposed_changes jsonb) set search_path = public, pg_temp;
alter function public.resolve_booking_amendment(p_amendment_id uuid, p_reviewer_username text, p_decision text, p_note text) set search_path = public, pg_temp;
alter function public.revert_booking_item(p_item_id uuid, p_reviewer_username text) set search_path = public, pg_temp;
alter function public.transition_booking_status(p_booking_id uuid) set search_path = public, pg_temp;

revoke execute on function public.admin_delete_booking(p_booking_id uuid) from public, anon, authenticated;
revoke execute on function public.admin_reset_supplier_password(p_account_id uuid, p_password_hash text, p_plaintext_password text) from public, anon, authenticated;
revoke execute on function public.approve_supplier_account(p_account_id uuid, p_supplier_id uuid) from public, anon, authenticated;
revoke execute on function public.confirm_booking_item(p_item_id uuid, p_reviewer_username text) from public, anon, authenticated;
revoke execute on function public.get_my_bookings(p_supplier_account_id uuid, p_status public.booking_status, p_limit integer, p_offset integer) from public, anon, authenticated;
revoke execute on function public.login_supplier(p_username text, p_password_hash text) from public, anon, authenticated;
revoke execute on function public.receive_booking(p_booking_token uuid, p_quantities jsonb, p_receiver_username text) from public, anon, authenticated;
revoke execute on function public.register_supplier(p_username text, p_password_hash text, p_full_name text) from public, anon, authenticated;
revoke execute on function public.register_supplier(p_username text, p_password_hash text, p_full_name text, p_password text) from public, anon, authenticated;
revoke execute on function public.reject_booking_item(p_item_id uuid, p_reason text, p_reviewer_username text) from public, anon, authenticated;
revoke execute on function public.reject_supplier_account(p_account_id uuid, p_reason text) from public, anon, authenticated;
revoke execute on function public.request_booking_amendment(p_booking_id uuid, p_supplier_account_id uuid, p_type text, p_note text) from public, anon, authenticated;
revoke execute on function public.request_booking_amendment(p_booking_id uuid, p_supplier_account_id uuid, p_type text, p_note text, p_proposed_changes jsonb) from public, anon, authenticated;
revoke execute on function public.resolve_booking_amendment(p_amendment_id uuid, p_reviewer_username text, p_decision text, p_note text) from public, anon, authenticated;
revoke execute on function public.revert_booking_item(p_item_id uuid, p_reviewer_username text) from public, anon, authenticated;
revoke execute on function public.transition_booking_status(p_booking_id uuid) from public, anon, authenticated;

grant execute on function public.admin_delete_booking(p_booking_id uuid) to service_role;
grant execute on function public.admin_reset_supplier_password(p_account_id uuid, p_password_hash text, p_plaintext_password text) to service_role;
grant execute on function public.approve_supplier_account(p_account_id uuid, p_supplier_id uuid) to service_role;
grant execute on function public.confirm_booking_item(p_item_id uuid, p_reviewer_username text) to service_role;
grant execute on function public.get_my_bookings(p_supplier_account_id uuid, p_status public.booking_status, p_limit integer, p_offset integer) to service_role;
grant execute on function public.login_supplier(p_username text, p_password_hash text) to service_role;
grant execute on function public.receive_booking(p_booking_token uuid, p_quantities jsonb, p_receiver_username text) to service_role;
grant execute on function public.register_supplier(p_username text, p_password_hash text, p_full_name text) to service_role;
grant execute on function public.register_supplier(p_username text, p_password_hash text, p_full_name text, p_password text) to service_role;
grant execute on function public.reject_booking_item(p_item_id uuid, p_reason text, p_reviewer_username text) to service_role;
grant execute on function public.reject_supplier_account(p_account_id uuid, p_reason text) to service_role;
grant execute on function public.request_booking_amendment(p_booking_id uuid, p_supplier_account_id uuid, p_type text, p_note text) to service_role;
grant execute on function public.request_booking_amendment(p_booking_id uuid, p_supplier_account_id uuid, p_type text, p_note text, p_proposed_changes jsonb) to service_role;
grant execute on function public.resolve_booking_amendment(p_amendment_id uuid, p_reviewer_username text, p_decision text, p_note text) to service_role;
grant execute on function public.revert_booking_item(p_item_id uuid, p_reviewer_username text) to service_role;
grant execute on function public.transition_booking_status(p_booking_id uuid) to service_role;

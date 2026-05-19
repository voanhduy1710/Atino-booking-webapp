-- Keep one public read policy for current browser read model; remove duplicate policy.

drop policy if exists "amendments_select_all" on public.booking_amendments;

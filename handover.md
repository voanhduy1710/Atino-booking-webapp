# Handover - 2026-05-19

## 1. Session Summary
This session focused on `/booking/new` delivery-date capacity rules and `/product-process` ETL/catalog loading. Capacity counting and UI messaging were added, product-process startup sync was reworked, but the booking date picker is still broken: after selecting a later date, the booking flow still appears to fall back to the `N+1` date.

## 2. What Changed
- `server/routes/booking.ts` - added no-store cache headers, daily capacity endpoints, pending/confirmed-only capacity counting, 20,000 hard submit cap, and an attempted `>= 18,000` capacity-window extension loop. [MODIFIED]
- `src/features/booking/components/BookingForm.tsx` - added delivery capacity UI, capacity queries, disabled submit on over-capacity date, React Hook Form `Controller` for `delivery_date`, and attempted fixes for date reset/clamping. [MODIFIED]
- `src/shared/components/FilterDatePicker.tsx` - added optional `excludeDates` prop; currently not used by `BookingForm` because full/near-full dates must remain selectable. [MODIFIED]
- `server/routes/productProcess.ts` - added no-store cache headers, in-memory synced catalog fallback, and sync response `items` so refreshed Lark data can hydrate the frontend immediately. [MODIFIED]
- `src/app/AppStartupSync.tsx` - changed product-process sync to run after page load, dispatch sync start/end events, and populate React Query cache with returned `items`. [MODIFIED]
- `src/features/productProcess/ProductProcessPage.tsx` - removed page-open ETL blocking, added global sync event handling, manual refresh cache hydration, and table overlay state. [MODIFIED]
- `src/index.css` - added product-process sync overlay fade-in/fade-out animation styles. [MODIFIED]
- `server/index.ts` - already dirty in worktree; not intentionally changed for the capacity/date fix in this pass. [MODIFIED]
- `vite.config.ts` - already dirty in worktree; not intentionally changed for the capacity/date fix in this pass. [MODIFIED]
- `deploy_local.ps1` - already dirty in worktree; not intentionally changed for the capacity/date fix in this pass. [MODIFIED]
- `Z_prompt_typer.md` - already dirty in worktree; not intentionally changed for the capacity/date fix in this pass. [MODIFIED]
- `handover.md` - overwritten according to `docs/14. Handover_rule.md`. [MODIFIED]

## 3. What Is Currently Working
- `npm run typecheck` passed after the latest changes.
- `npm run lint` passed after the latest changes.
- `npm run build` passed after the latest changes.
- `/product-process` sync now returns enriched `items` from POST `/api/product-process/sync` and can hydrate the frontend cache without waiting for a follow-up GET.
- `/booking/new` capacity text renders on the same line as the allowed date window: `Tổng số lượng đã được đặt giao ngày này: ... / 20.000`.
- Backend capacity counting is intended to count only booking items with status `pending` or `confirmed`; rejected/cancelled items should not count.

## 4. What Is Broken / Known Issues
- Fixed: `/booking/new` delivery date should no longer fall back to `N+1`. Root cause was the Supabase Postgres `BEFORE INSERT` trigger `trg_set_booking_delivery_date`, which ran `set_booking_delivery_date()` and overwrote any inserted `delivery_date` with server-computed N+1/N+2.
- Applied Supabase migration `20260519135000_preserve_booking_delivery_date.sql`: `set_booking_delivery_date()` now preserves `NEW.delivery_date` when the API supplies it, and only falls back to N+1/N+2 when `delivery_date` is omitted.
- `server/routes/booking.ts` also normalizes the submitted date as strict `YYYY-MM-DD`, validates capacity without resolving to a replacement date, inserts the exact normalized requested date, and defensively corrects the row if an older database trigger overwrites it.
- Added debug script `debug/booking-date-stages.ts`; verified live with `npx tsx debug\booking-date-stages.ts --date=2026-05-21 --finalize`, which now shows input, capacity, finalize response, and persisted Supabase row all equal `2026-05-21`.
- Added regression coverage in `server/routes/booking.test.ts` for preserving `2026-05-21` and rejecting display-formatted/impossible dates before insert.
- No authenticated browser/API smoke test was completed because no debug auth token was available in this session.

## 5. What To Work On Next
1. Restart the backend before retesting; otherwise `/api/booking/finalize` will still run old logic.
2. Run an authenticated browser/API smoke test for selecting `N+2`/`N+3` and confirming the created booking keeps that exact date.
3. Retest the `>= 18,000` extension rule: if `N+1` is at 18,000+, the displayed max should extend from `N+3` to `N+4`, and continue looping for additional near-full days.

## 6. Key Context / Gotchas
- Project instructions require using code-review-graph before grep/read for code exploration.
- User explicitly wants full/near-full dates to remain selectable so suppliers can see the warning; do not exclude those dates from the picker.
- Hard submit cap is 20,000 per day. The `>= 18,000` threshold is only for extending the displayed allowed window, not for blocking selection by itself.
- `assertCapacityDate()` validates the selected date but does not return or compute a replacement date.
- `capacityWindow()` currently returns `unavailable_dates`, but `BookingForm` does not pass them to `FilterDatePicker`.
- Restart the backend after server route changes; otherwise `/api/booking/finalize/capacity-window` will still run old logic.
- Existing dirty files outside the main changes may be user/worktree changes; do not revert them without explicit permission.

## 7. Environment & How to Run
See docs/8. Development_Setup.md - no changes.

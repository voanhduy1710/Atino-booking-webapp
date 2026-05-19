# Code Review Implementation Plan

Date: 2026-05-19  
Repository: `C:\Atino-booking-webapp`  
Review inputs: code-review-graph, targeted source scan, Supabase MCP project inspection, live database metadata, advisors, and logs.

## Executive Summary

The project is in the middle of a migration from browser plus Supabase RPC/Edge Functions toward a backend-owned architecture. That direction is correct, but the migration is incomplete:

- The backend already owns upload, booking finalization, product-process sync, and Nhanh draft lookups.
- The browser still owns many privileged business mutations through direct Supabase RPC/table calls.
- Supabase Edge Functions are still deployed and duplicate backend behavior.
- The live Supabase schema does not match the local migrations/types or current code assumptions.
- RLS is permissive enough that the anon/public role can mutate core business tables.
- Large frontend modules mix rendering, data fetching, mutation logic, notifications, and workflow rules.
- Debug logs/scripts and stale documentation are making the project harder to reason about.

The safest path is not a broad rewrite. First stabilize the schema and auth boundary, then migrate one workflow family at a time behind backend routes, then lock down Supabase.

## Implementation Progress - 2026-05-19

Completed in this pass:

- Added `supabase/migrations/20260519143000_repair_backend_owned_schema.sql` and applied it to live Supabase project `deuuuibkqletkkbrsmxd`.
- Verified live Supabase schema now exposes the expected `booking_items`, `product_process_catalog`, `bookings`, and `booking_item_photos` fields through PostgREST.
- Updated `src/shared/types/database.ts` to match the repaired schema and enum surface used by the app.
- Added `server/lib/logger.ts` and moved noisy backend logs/errors through a redacting logger.
- Removed upload-flow browser debug logs from `src/features/booking/hooks/usePhotoUpload.ts`.
- Reworked `debug/test_gcs_upload.ps1` so it reads Supabase values from `.env`/environment instead of containing committed keys.
- Added the project audit harness:
  - `debug/audit-codebase.mjs`
  - `debug/audit-supabase-schema.mjs`
  - `debug/audit-backend-routes.mjs`
  - `debug/run-project-audit.mjs`
- Added package scripts:
  - `npm run debug:audit`
  - `npm run debug:audit:strict`
  - `npm run server:typecheck`

Verified:

- `npm run typecheck`
- `npm run test`
- `npm run debug:audit`

Still intentionally open:

- Frontend direct Supabase RPC workflow calls remain and are reported by `debug/audit-codebase.mjs`.
- Legacy Edge Function references remain only as migration/debug traces and are reported by `debug/audit-codebase.mjs`.
- RLS lockdown is not applied yet because browser workflow writes still need to be moved behind backend routes first.
- Authenticated backend booking-route debug checks require `DEBUG_AUTH_TOKEN`.

Completed in the follow-up pass:

- Moved remaining frontend workflow RPC calls behind backend routes:
  - `server/routes/auth.ts`
  - `server/routes/accounts.ts`
  - `server/routes/reviewer.ts`
  - `server/routes/receiver.ts`
  - `server/routes/amendments.ts`
- Moved remaining frontend table writes behind backend routes:
  - `server/routes/adminResources.ts`
  - `server/routes/notifications.ts`
- Added token-aware frontend API calls through `src/shared/lib/apiClient.ts`.
- Added `server/lib/httpAuth.ts` for backend bearer-token role gates.
- Applied `supabase/migrations/20260519144500_lock_down_browser_writes.sql`:
  - removed public write policies from core workflow/resource tables
  - revoked public/anon/authenticated execution for exposed workflow functions
  - granted workflow function execution to `service_role`
- Applied `supabase/migrations/20260519150000_finish_security_advisor_cleanup.sql`:
  - fixed trigger function search paths
  - switched `daily_capacity` to `security_invoker`
- Applied `supabase/migrations/20260519151000_dedupe_booking_amendment_select_policy.sql`.
- Replaced active Supabase Edge Functions `auth`, `finalize-booking`, and `gcs-upload` with `410 Gone` stubs pointing callers to backend APIs.
- Converted `debug/test_gcs_upload.ps1` to test `/api/upload/gcs`.
- Extended `debug/audit-codebase.mjs` to fail strict mode on frontend table writes.
- Removed remaining unconditional `console.*`/`debugger` audit findings.

Verified after follow-up:

- `npm run build`
- `npm run typecheck`
- `npm run server:typecheck`
- `npm run test`
- `npm run debug:audit:strict`
- Supabase security advisors: no findings.
- Live RLS check: no non-SELECT public policies remain on core workflow/resource tables.

Remaining lower-priority notes:

- Supabase performance advisor still reports unused indexes. These are informational and should be reviewed with real production query history before dropping indexes.
- Large/refactor candidates remain listed by `debug/audit-codebase.mjs`; no large component decomposition was attempted in this pass.

## Decision Principles

Use these rules while implementing the plan:

1. Backend owns all writes that change business state.
2. Browser may read public/reference data only when RLS is intentionally narrow.
3. Supabase service-role key exists only on the backend.
4. Database triggers/functions should handle database-native invariants only, not app workflows.
5. No direct browser `supabase.rpc(...)` for workflow actions after migration.
6. Keep migrations additive first; remove legacy RPCs/policies only after backend routes are deployed and verified.
7. Do not delete graph-reported dead code without import/runtime verification.

## Current Architecture Snapshot

### Frontend

Main app code lives under `src/features` and is the largest graph community. Several components are doing too much:

- `src/features/booking/components/BookingForm.tsx`
- `src/features/booking/components/PoRow.tsx`
- `src/features/warehouse/reviewer/index.tsx`
- `src/features/warehouse/reviewer/BookingDetailModal.tsx`
- `src/features/admin/ReportPage.tsx`
- `src/shared/components/filters/DateRangePickerPopup.tsx`

### Backend

Existing backend modules:

- `server/index.ts`
- `server/routes/upload.ts`
- `server/routes/booking.ts`
- `server/routes/productProcess.ts`
- `server/routes/nhanh.ts`
- `server/lib/supabase.ts`
- `server/lib/jwt.ts`
- `server/lib/gcs.ts`

Backend already replaces parts of the old Edge Function layer:

- `server/routes/upload.ts` replaces `gcs-upload`.
- `server/routes/booking.ts` replaces and extends `finalize-booking`.
- `server/routes/productProcess.ts` owns Lark sync.
- `server/routes/nhanh.ts` owns Nhanh draft-products lookup.

### Supabase

Live Edge Functions still deployed:

- `auth`
- `finalize-booking`
- `gcs-upload`

Live triggers on `public.bookings`:

- `trg_generate_booking_code`
- `trg_set_booking_delivery_date`

Live workflow RPCs/functions still present:

- `login_supplier`
- `register_supplier`
- `approve_supplier_account`
- `reject_supplier_account`
- `admin_reset_supplier_password`
- `admin_delete_booking`
- `confirm_booking_item`
- `reject_booking_item`
- `return_booking_item`
- `revert_booking_item`
- `receive_booking`
- `request_booking_amendment`
- `resolve_booking_amendment`
- `transition_booking_status`

## Priority Findings

### P0: Live Schema Drift Is Breaking Runtime Behavior

Evidence:

- Live logs repeatedly show missing columns:
  - `booking_items_1.total_quantity does not exist`
  - `booking_items_1.warehouse_code does not exist`
  - `product_process_catalog.warehouse_code does not exist`
- Local migrations/code expect enriched fields on `booking_items` and `product_process_catalog`.
- Local app types include statuses that live Supabase metadata did not show on the enum list.
- `src/shared/types/database.ts` is stale and marked as a placeholder.

Risk:

- Booking/product-process flows run with fallback branches and partial data.
- TypeScript definitions are unreliable.
- UI can reference columns/statuses that do not exist live.
- Future refactors may preserve compatibility hacks instead of fixing the database.

Action:

- Create one explicit repair migration that brings live schema to the desired current model.
- Apply it through Supabase migration tooling.
- Regenerate TypeScript types from live Supabase after migration.
- Remove schema fallback code only after the repair migration is live.

Schema repair checklist:

- `booking_items`
  - `warehouse_code text`
  - `mau text`
  - `total_quantity integer not null default 0`
  - `size_s_28 integer not null default 0`
  - `size_m_29 integer not null default 0`
  - `size_l_30 integer not null default 0`
  - `size_xl_31 integer not null default 0`
  - `size_2xl_32 integer not null default 0`
  - `size_3xl_33 integer not null default 0`
  - `reviewed_at timestamptz`
- `product_process_catalog`
  - `warehouse_code text`
  - `mau text`
  - `order_date date`
  - `total_quantity integer not null default 0`
  - size columns matching booking items
- `bookings`
  - `nhanh_draft_bill_id text`
- enums
  - `booking_status`: include every status used by code
  - `booking_item_status`: include `returned` if return flow remains
  - `photo_type`: include `vat_invoice`

Acceptance criteria:

- Supabase `list_tables(verbose=true)` shows all expected fields.
- `server/routes/booking.ts` no longer needs missing-column fallback queries.
- `server/routes/productProcess.ts` no longer needs legacy select/upsert fallbacks.
- API/Postgres logs stop showing missing-column 400s.
- `npm run typecheck` passes with regenerated types.

### P0: Browser Still Performs Privileged Mutations

Direct browser RPC call sites:

- `src/features/auth/services/auth.service.ts`
- `src/features/accounts/AccountManagement.tsx`
- `src/features/booking/components/BookingAmendmentSection.tsx`
- `src/features/warehouse/reviewer/BookingDetailModal.tsx`
- `src/features/warehouse/reviewer/AmendmentPanel.tsx`
- `src/features/warehouse/receiver/index.tsx`

Risk:

- Authorization is split across React, RLS, RPC definitions, and backend JWT logic.
- `SECURITY DEFINER` functions are exposed through the public API surface.
- Notifications can be forged by the browser.
- Staff auth uses frontend-visible staff credential material.
- Locking down RLS is impossible while browser mutations still depend on permissive policies/RPC grants.

Action:

- Move each workflow mutation behind backend routes.
- Frontend calls backend only via `getJson`, `postJson`, or a small typed API module.
- Backend verifies signed app token and role before mutation.
- Backend writes notifications as part of the workflow transaction/service.

Acceptance criteria:

- `rg -n "supabase\\.rpc|\\.rpc\\(" src` returns no business workflow mutations.
- Browser no longer imports Supabase for privileged writes.
- Supplier cannot call reviewer/admin endpoints.
- Reviewer cannot call admin-only endpoints.
- Admin can perform account and delete/reset operations through backend.

### P0: RLS Is Too Permissive

Evidence:

- Public policies allow insert/update/delete on multiple core tables.
- Several policy names say "own", but predicates are `true`.
- Duplicate amendment policies exist.
- Supabase advisor flags public permissive policies and exposed workflow functions.

Risk:

- Leaked anon key or browser bug can mutate production data.
- Any frontend route mistake becomes a database write vulnerability.
- Publicly executable workflow RPCs can bypass intended app roles.

Action:

- Do not start by dropping policies; first move browser writes behind backend.
- Then add an RLS lockdown migration.
- Retain only intentionally public reads.
- Revoke public/authenticated execution from legacy workflow functions.

Acceptance criteria:

- Supabase security advisor no longer reports public permissive write policies.
- Anonymous Supabase client cannot insert/update/delete core business rows.
- Legacy RPC endpoints cannot be called by anon/authenticated roles unless explicitly retained.

### P1: Edge Functions Duplicate Backend Behavior

Evidence:

- `gcs-upload` still deployed even though frontend uses `/api/upload/gcs`.
- `finalize-booking` still deployed even though frontend uses `/api/booking/finalize`.
- `auth` still deployed and overlaps with frontend/backend auth direction.
- Edge Functions are deployed with `verify_jwt=false`.

Risk:

- Old and new runtimes drift.
- Debug scripts or stale clients may hit older business logic.
- Security posture is inconsistent across Edge Functions and backend.

Action:

- Inventory traffic to `/functions/v1/auth`, `/functions/v1/finalize-booking`, and `/functions/v1/gcs-upload`.
- Update docs/scripts to backend URLs.
- Once no active traffic remains, either delete functions or redeploy stubs returning `410 Gone`.
- Keep source snapshots only in docs/archive if needed for migration history.

Acceptance criteria:

- `rg -n "functions/v1|finalize-booking|gcs-upload" .` finds no active app references.
- Supabase Edge Function logs show no expected production traffic.
- Backend logs show upload/finalize/auth traffic.

### P1: Auth Model Has Multiple Sources of Truth

Evidence:

- `src/features/auth/services/auth.service.ts` validates staff users client-side.
- `server/lib/jwt.ts` verifies JWTs for backend routes.
- Supabase Edge `auth` has another staff/supplier implementation.
- Frontend session tokens are base64 JSON in some flows, not backend-signed JWTs.

Risk:

- Client-side staff auth can be tampered with.
- Role checks are inconsistent.
- Backend authorization assumptions depend on token source.

Action:

- Add backend-owned auth:
  - `server/routes/auth.ts`
  - `server/services/authService.ts`
  - `server/middleware/auth.ts`
- Backend issues signed JWTs with `JWT_SECRET`.
- Frontend stores only backend-issued JWT.
- Remove staff password hashes from `VITE_STAFF_USERS`.

Acceptance criteria:

- Tampered token is rejected.
- Expired token is rejected.
- Staff login never depends on frontend env.
- `RequireRole` reads trusted decoded session data from backend-issued token.

### P1: Backend Logging Needs a Real Logger

Evidence:

- `server/index.ts`, `server/routes/booking.ts`, and `server/routes/upload.ts` use raw `console.log/error`.
- Frontend upload hook logs file paths, sizes, and upload URLs.
- Vite proxy timing logs are useful but should remain dev-only.

Risk:

- Production logs expose file paths, supplier/account identifiers, and internal state.
- No log levels or consistent request metadata.
- Debug noise makes real incidents harder to diagnose.

Action:

- Add `server/lib/logger.ts`.
- Use `LOG_LEVEL` to gate debug/info.
- Redact file paths, tokens, service keys, and account IDs in production.
- Remove frontend upload console logs.
- Keep request ID, method, path, status, and duration.

Acceptance criteria:

- `rg -n "console\\.|debugger" src server vite.config.ts` only finds approved dev-only logs or logger internals.
- Production startup logs do not reveal secret presence beyond a single health/config warning.
- Error responses do not expose stack traces in production.

### P2: Large Components Should Be Split Along Workflow Boundaries

Hotspots:

- `BookingForm` is 452 lines.
- `BookingDetailModal` has 99 graph connections.
- `ReviewerPage` has 81 graph connections.
- `ReportPage` is 575 lines.
- `DateRangePickerPopup` is 432 lines.
- `PoRow` is 322 lines.

Risk:

- Business rules are duplicated and hard to test.
- UI refactors can accidentally change workflow behavior.
- Network calls and mutations are buried in components.

Action:

- Extract pure helpers first, then hooks, then presentational components.
- Keep behavior stable while reducing component size.
- Avoid doing this before backend routes are in place for mutation-heavy components.

Acceptance criteria:

- Major components have clear responsibilities.
- Extracted pure helpers have unit tests.
- Mutation hooks call backend API modules, not Supabase RPCs.

### P2: Dead Code, Debug Artifacts, and Stale Docs Need Cleanup

Evidence:

- `debug/` contains ad-hoc scripts.
- Root `project_tester.py` and `debug/project_tester.py` overlap.
- `debug/test_gcs_upload.ps1` contains a hardcoded anon key.
- Some architecture docs reference old ledger/dashboard concepts not present in the current app.
- Graph found 48 dead-code candidates, with expected false positives around nested React callbacks.

Risk:

- New agents/developers follow stale docs.
- Hardcoded keys create security and rotation burden.
- Dead code inflates search results and cognitive load.

Action:

- Move useful debug tools to `tools/debug`.
- Delete or archive stale scripts/docs after owner confirmation.
- Remove hardcoded keys from scripts and read from `.env`.
- Verify every graph dead-code candidate with import search before deletion.

Acceptance criteria:

- No hardcoded Supabase keys in tracked scripts.
- Stale docs are archived or deleted.
- `npm run typecheck` and `npm run test` pass after deletions.

## Target Backend Shape

### New Backend Modules

Add:

- `server/middleware/auth.ts`
- `server/lib/logger.ts`
- `server/services/authService.ts`
- `server/services/accountService.ts`
- `server/services/bookingWorkflowService.ts`
- `server/services/amendmentService.ts`
- `server/services/notificationService.ts`
- `server/routes/auth.ts`
- `server/routes/accounts.ts`
- `server/routes/reviewer.ts`
- `server/routes/receiver.ts`
- `server/routes/amendments.ts`

Keep:

- `server/routes/upload.ts`
- `server/routes/booking.ts`
- `server/routes/productProcess.ts`
- `server/routes/nhanh.ts`

Later cleanup:

- Split `server/routes/booking.ts` into route and service pieces after schema drift is fixed.
- Split product-process Lark parsing from route handler into a service.

### Endpoint Map

Auth:

- `POST /api/auth/login`
- `POST /api/auth/register-supplier`
- `GET /api/auth/me`

Accounts:

- `POST /api/accounts/:id/approve`
- `POST /api/accounts/:id/reject`
- `POST /api/accounts/:id/reset-password`
- `DELETE /api/accounts/:id`

Reviewer:

- `POST /api/reviewer/items/:id/confirm`
- `POST /api/reviewer/items/:id/reject`
- `POST /api/reviewer/items/:id/return`
- `POST /api/reviewer/items/:id/revert`
- `DELETE /api/reviewer/bookings/:id`

Receiver:

- `GET /api/receiver/bookings/:token`
- `POST /api/receiver/bookings/:token/receive`

Amendments:

- `POST /api/amendments`
- `POST /api/amendments/:id/resolve`

Notifications:

- Prefer internal service calls only.
- Add read/update endpoints only if frontend notification queries are also moved off direct Supabase.

## Database Responsibility Split

Keep in database:

- Primary keys/default UUIDs.
- Unique constraints.
- Foreign keys.
- Check constraints.
- Updated-at triggers if added later.
- Optional booking code generation if it must be collision-proof at insert time.

Move to backend:

- Staff login.
- Supplier registration/login.
- Account approval/rejection/reset.
- Booking item confirm/reject/return/revert.
- Booking receive flow.
- Amendment request/resolve flow.
- Notification creation.
- Admin deletes.
- Product-process sync.
- GCS upload.

Evaluate:

- `trg_generate_booking_code`: can stay temporarily because uniqueness is DB-native, but backend should have tests proving insert gets a code.
- `trg_set_booking_delivery_date`: remove once backend is the sole creator of bookings and always sends validated `delivery_date`; keep a database check constraint instead if needed.

## Implementation Roadmap

### Phase 0: Safety Baseline

Goal: make current state observable and stop schema confusion.

Tasks:

- Add a schema audit script or endpoint that checks required tables, columns, enums, triggers, and policies.
- Add `server/lib/logger.ts` and replace highest-noise server logs.
- Remove frontend upload console logs.
- Document current Edge Function traffic before retirement.

Tests:

- `npm run typecheck`
- `npm run test`

Done when:

- There is a repeatable command/check for schema drift.
- Production logs are less noisy without losing request IDs.

### Phase 1: Schema Repair

Goal: align live Supabase with current code.

Tasks:

- Write repair migration for missing columns/enums.
- Apply migration to Supabase.
- Regenerate `src/shared/types/database.ts`.
- Update domain/database types to agree.
- Remove legacy fallback branches after verification.

Tests:

- Supabase SQL smoke checks for required columns.
- `npm run typecheck`
- `npm run test`
- Manual booking creation and product sync smoke tests.

Done when:

- No missing-column errors appear in Supabase logs.
- Types match live schema.

### Phase 2: Backend Auth

Goal: establish one trusted identity model.

Tasks:

- Add auth route/service.
- Backend signs JWTs.
- Add Express `requireAuth` and `requireRole`.
- Replace frontend staff/supplier auth implementation with backend calls.
- Remove frontend staff credential env usage.

Tests:

- Valid staff login.
- Valid supplier login.
- Pending/rejected supplier behavior.
- Tampered/expired token rejection.
- Role-gated endpoint rejection.

Done when:

- Frontend never validates staff credentials locally.
- Backend routes use shared auth middleware.

### Phase 3: Move Workflow Mutations

Goal: eliminate browser RPC mutations.

Recommended order:

1. Account actions.
2. Reviewer item actions.
3. Receiver flow.
4. Amendments.
5. Admin delete/reset flows if not already covered.
6. Notifications.

Tasks:

- Implement backend services and routes.
- Replace frontend mutations with backend API calls.
- Move notification writes into backend services.
- Keep old RPCs in place during rollout, but stop calling them from frontend.

Tests:

- Route-level tests for each mutation.
- Role failure tests.
- Status-transition tests.
- Notification creation tests.

Done when:

- `rg -n "supabase\\.rpc|\\.rpc\\(" src` returns no workflow calls.
- UI workflows still work manually.

### Phase 4: Lock Down Supabase

Goal: reduce Supabase to storage/read/database primitives behind backend-owned writes.

Tasks:

- Drop duplicate amendment policies.
- Drop public insert/update/delete policies on core tables.
- Add narrow read policies only where still needed.
- Revoke public/authenticated `EXECUTE` on legacy workflow functions.
- Decide whether each legacy function is deleted, private-only, or retained for DB-native invariant.

Tests:

- Anonymous Supabase client cannot mutate core tables.
- Backend service-role routes still work.
- Supabase security advisor improves.

Done when:

- Public RLS write surface is closed.
- Legacy workflow RPCs are not externally callable.

### Phase 5: Retire Edge Functions

Goal: remove duplicated runtime paths.

Tasks:

- Confirm no active app/debug/doc references to `/functions/v1`.
- Redeploy stubs returning `410 Gone` or delete functions.
- Remove Edge Function deployment assumptions from docs/scripts.

Tests:

- Backend upload/finalize/auth still work.
- Edge Function logs show no expected traffic.

Done when:

- Edge Functions are no longer part of normal app behavior.

### Phase 6: Refactor Frontend Hotspots

Goal: make the UI easier to maintain after backend boundaries are clean.

Tasks:

- Split `BookingForm`.
- Split `BookingDetailModal`.
- Split `ReviewerPage`.
- Split `ReportPage`.
- Split `DateRangePickerPopup` helpers.
- Move API calls into typed API modules/hooks.

Tests:

- Component smoke tests for key screens.
- Unit tests for extracted helpers.
- Existing backend tests remain green.

Done when:

- Each hotspot has clear responsibilities and smaller modules.

### Phase 7: Dead Code and Documentation Cleanup

Goal: reduce noise.

Tasks:

- Verify graph dead-code candidates with import search.
- Remove or archive obsolete debug scripts.
- Remove hardcoded keys.
- Archive stale architecture docs that refer to non-current modules.
- Update README/deployment docs with backend-first architecture.

Tests:

- `npm run typecheck`
- `npm run lint`
- `npm run test`

Done when:

- Search results are clean and docs point to current architecture.

## Concrete Work Items

### Schema

- [ ] Write schema audit script/check.
- [ ] Repair `booking_items` missing enriched fields.
- [ ] Repair `product_process_catalog` missing enriched fields.
- [ ] Repair booking/item/photo enum drift.
- [ ] Add indexes for unindexed foreign keys flagged by Supabase advisor.
- [ ] Regenerate Supabase TypeScript types.
- [ ] Remove schema fallback code from backend after live repair.

### Backend Boundary

- [ ] Add logger.
- [ ] Add auth middleware.
- [ ] Add backend auth route.
- [ ] Add accounts route/service.
- [ ] Add reviewer route/service.
- [ ] Add receiver route/service.
- [ ] Add amendments route/service.
- [ ] Add notification service.
- [ ] Move frontend mutations to backend API calls.
- [ ] Add route tests for success and forbidden cases.

### Supabase Lockdown

- [ ] Inventory every public policy.
- [ ] Drop duplicate amendment policies.
- [ ] Drop public mutation policies after backend migration.
- [ ] Revoke exposed workflow RPC execution.
- [ ] Decide trigger/function retention policy.
- [ ] Retire or stub Edge Functions.
- [ ] Rerun Supabase security and performance advisors.

### Refactoring

- [ ] Split `BookingForm`.
- [ ] Split `PoRow` attachment/upload concerns.
- [ ] Split `BookingDetailModal`.
- [ ] Split `ReviewerPage`.
- [ ] Split `ReportPage`.
- [ ] Extract/test `DateRangePickerPopup` helpers.
- [ ] Remove verified dead shared utilities/components.

### Logs and Debug

- [ ] Remove frontend upload logs.
- [ ] Replace server `console.*` with logger.
- [ ] Gate Vite proxy timing logs to dev only.
- [ ] Remove hardcoded anon key from debug PowerShell.
- [ ] Archive/delete duplicate project tester scripts.
- [ ] Archive stale docs that reference old ledger/dashboard systems.

## Suggested First Three PRs

### PR 1: Observability and Schema Audit

Scope:

- Add logger.
- Remove frontend upload logs.
- Add schema audit script/check.
- Document current Supabase drift.

Why first:

- It reduces noise and makes the next risky database step measurable.

### PR 2: Schema Repair and Types

Scope:

- Apply repair migration.
- Regenerate `src/shared/types/database.ts`.
- Remove or reduce schema fallback paths.
- Add tests around date/status helpers and backend booking capacity.

Why second:

- Backend migration work should not preserve live schema ambiguity.

### PR 3: Backend Auth Boundary

Scope:

- Add backend auth route and middleware.
- Replace frontend auth service calls.
- Remove frontend staff credential validation.

Why third:

- Every later workflow route needs trustworthy backend role checks.

## Commands for Verification

Run locally:

```powershell
npm run typecheck
npm run lint
npm run test
rg -n "supabase\.rpc|\.rpc\(" src
rg -n "console\.|debugger" src server vite.config.ts
rg -n "functions/v1|finalize-booking|gcs-upload" .
```

Run through Supabase MCP after migrations:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('booking_items', 'product_process_catalog', 'bookings')
order by table_name, ordinal_position;

select event_object_table, trigger_name, action_statement
from information_schema.triggers
where trigger_schema = 'public';

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## Final Target State

- React handles UI and calls backend APIs.
- Express backend owns auth, authorization, workflow mutations, notifications, external services, and uploads.
- Supabase stores data, enforces constraints, and exposes only narrow read access where intentional.
- Edge Functions are retired or explicit stubs.
- RLS policies are minimal and readable.
- Types are generated from live schema.
- Large UI files are split into hooks, services, and presentational components.
- Debug tools are separated from production code and contain no hardcoded keys.
- Logs are structured, redacted, and level-gated.

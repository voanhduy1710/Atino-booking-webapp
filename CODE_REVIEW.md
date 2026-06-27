# Full Code Review

Date: 2026-06-13

Scope: repository-wide review for refactoring, cleanup, dead code, optimization, maintainability, and risk. This review used the project code-review graph first, then targeted source reads and the repo's own validation commands.

## Executive Summary

The project is in a healthy build state: linting, typechecking, tests, and production build all pass. The biggest risks are not syntax or build failures; they are security/auth design, permissive upload behavior, large high-coupling React components, tracked local/debug artifacts, and low automated test coverage around the main booking/reviewer workflows.

## Validation Run

All checks passed:

- `npm run lint`
- `npm run typecheck`
- `npm run server:typecheck`
- `npm test` - 2 files, 12 tests
- `npm run build`

Graph snapshot:

- 151 files
- 520 nodes
- 4,677 edges
- Languages: Python, Bash, PowerShell, JavaScript, TypeScript, TSX, SQL
- Tests detected by graph: 14 test nodes, but only 2 first-party test files

## Priority Findings

### P0 - Server Trusts Client-Generated Tokens

Files:

- `src/features/auth/services/auth.service.ts`
- `server/lib/jwt.ts`
- `server/lib/httpAuth.ts`

The frontend creates the bearer token with `btoa(JSON.stringify(session))`, and the server accepts that plain base64 JSON as authentication. There is no signature, no issuer check, and no expiry for the new token format. Any client can forge a token such as `{"role":"admin","username":"x"}` and pass `requireAuth(['admin'])`.

This undermines all Express route role checks, including admin account management, reviewer actions, amendment resolution, booking deletion, and direct Supabase service-role operations behind the API.

Recommended fix:

- Move session/token issuance to the server.
- Sign JWTs with a server-only `JWT_SECRET`, or use opaque server sessions.
- Reject unsigned base64 session blobs in `server/lib/jwt.ts`.
- Add expiry and role validation.
- Add negative auth tests proving forged client tokens fail.

### P0 - Upload Endpoint Is Unauthenticated And Accepts Arbitrary Paths

Files:

- `server/index.ts`
- `server/routes/upload.ts`
- `server/config/storage.ts`

`/api/upload/gcs` is mounted without `requireAuth`. It accepts any multipart request with a `path` body field and writes to GCS under `GCS_PREFIX`. The path is not normalized or constrained to an expected temp/session namespace.

Impact:

- Anonymous users can upload files to the bucket if the service is reachable.
- A caller can choose object paths, overwrite predictable names, or pollute permanent prefixes.
- MIME type is checked from the client-provided upload metadata, not file content.

Recommended fix:

- Require supplier/admin auth for uploads.
- Generate object paths server-side instead of trusting `req.body.path`.
- Restrict uploads to `temp/{serverSessionId}/...`.
- Validate filename, extension, size, and magic bytes.
- Return a stored object key, not a public URL as the source of truth.

### P0 - Role Guard Allows Destructive Reviewer Routes Too Broadly

File:

- `server/routes/reviewer.ts`

The whole reviewer router allows `admin`, `manager`, and `warehouse_reviewer`, then exposes destructive routes under that same guard:

- `DELETE /bookings/:bookingId`
- `POST /bookings/:bookingId/draft-bill`

If only admins should delete bookings, this is currently too broad. Because auth tokens are forgeable, the practical severity is even higher.

Recommended fix:

- Add route-specific guards: admin-only for delete, explicit roles for draft bill editing.
- Add tests for manager/reviewer forbidden cases.
- Consider adding audit logging for destructive actions.

### P1 - Password Handling Sends And Stores Plaintext

Files:

- `src/features/auth/services/auth.service.ts`
- `server/routes/auth.ts`
- `server/routes/accounts.ts`

Supplier registration sends both `password_hash` and `password` to the backend. Admin reset sends both `password_hash` and `plaintext_password`. The database RPC names imply plaintext may be persisted or used downstream.

Recommended fix:

- Never send plaintext passwords beyond the immediate HTTPS request unless strictly required.
- Prefer server-side password hashing with a slow password hash, not client-side SHA-256.
- Remove plaintext password persistence from RPCs and schema.
- Add a migration/audit to remove existing stored plaintext if present.

### P1 - CORS Is Wide Open

File:

- `server/index.ts`

`app.use(cors())` allows any origin. Combined with bearer tokens in `localStorage`, broad CORS increases the blast radius of XSS or malicious browser contexts.

Recommended fix:

- Restrict CORS origins by environment.
- Prefer httpOnly secure cookies if the app keeps browser sessions.
- Add production startup validation for allowed origins.

### P1 - Source Contains Mojibake Vietnamese Strings

Examples:

- `server/routes/auth.ts`
- `server/routes/booking.ts`
- `server/routes/reviewer.ts`
- `src/shared/lib/apiClient.ts`
- `server/routes/upload.ts`

Many Vietnamese user-facing strings appear corrupted, for example `Vui lÃ²ng...`. This is likely an encoding conversion problem. It harms UX and makes future localization work risky.

Recommended fix:

- Restore files from a known-good UTF-8 source or re-enter affected strings.
- Add a simple audit script that fails on common mojibake sequences such as `Ã`, `Ä`, `áº`, `á»`.
- Keep all source files UTF-8.

### P1 - Main Workflow Coverage Is Thin

Current first-party tests:

- `server/routes/booking.test.ts`
- `src/shared/lib/bookingStatus.test.ts`

The graph flagged untested hotspots:

- `BookingForm`
- `BookingDetailModal`
- `ReviewerPage`
- `BookingAmendmentSection`
- `AmendmentPanel`
- `ProductProcessCombobox`

Recommended test additions:

- Auth tests for forged token rejection.
- Upload route tests for unauthenticated, bad MIME, oversized file, invalid path.
- Booking finalize integration tests around supplier scoping, delivery date windows, capacity, and item/photo insertion.
- Reviewer route authorization tests.
- React Testing Library smoke tests for `BookingForm`, reviewer modal actions, and amendment request/resolve flows.

## Refactoring Targets

### Large Components

The graph found 90 nodes/files above 80 lines. The largest production files are:

- `src/features/admin/ReportPage.tsx` - 575 lines
- `src/features/booking/components/BookingForm.tsx` - 526 lines
- `server/routes/booking.ts` - 433 lines
- `src/shared/components/filters/DateRangePickerPopup.tsx` - 432 lines
- `server/routes/productProcess.ts` - 367 lines
- `src/features/warehouse/reviewer/index.tsx` - 360 lines
- `src/features/warehouse/reviewer/BookingDetailModal.tsx` - 352 lines
- `src/features/booking/components/PoRow.tsx` - 322 lines

Recommended approach:

- Split container/data hooks from presentational components.
- Extract pure calculation utilities for booking totals, date windows, filters, and chart transforms.
- Keep API mutation logic in feature-specific hooks.
- Add tests around extracted pure functions first, then split UI safely.

### Booking Route Does Too Much

File:

- `server/routes/booking.ts`

This route owns auth parsing, capacity math, date normalization, schema fallback behavior, booking insertion, item insertion, photo insertion, notification creation, and legacy schema compatibility.

Recommended modules:

- `server/services/bookingCapacity.ts`
- `server/services/bookingFinalize.ts`
- `server/services/bookingNotifications.ts`
- `server/lib/dateWindow.ts`
- `server/repositories/bookings.ts`

### Duplicate Or Legacy Debug/Test Scripts

Tracked cleanup candidates:

- `project_tester.py`
- `debug/project_tester.py`
- `project_structure.py`
- `Project_structure.txt`
- `debug/raw_data.json`
- `debug/raw_data_product.json`
- `debug/fix_encoding.py`
- `debug/fix_encoding2.py`
- `debug/test-finalize.mjs`
- `debug/test-upload.mjs`

These may be useful locally, but they should either become documented scripts under `debug/` or be removed from source control. The root and debug tester scripts overlap heavily.

Recommended fix:

- Keep one maintained project audit runner.
- Move generated snapshots/raw data to ignored fixtures or delete them.
- Add `debug/raw_data*.json` to `.gitignore` if they must remain local.

### Tracked Local Agent/Editor Configuration

Tracked local/config paths include:

- `.claude/`
- `.codex/`
- `.gemini/`

This may be intentional for agent workflows, but it mixes personal tool configuration with application source. Keep only project-wide instructions that every contributor needs.

Recommended fix:

- Move personal settings to ignored local files.
- Keep shared agent instructions in `AGENTS.md` or docs only.
- Add explicit ignore rules for local agent cache/settings if they are not meant to ship.

### Type Safety Debt From `any`

ESLint disables `@typescript-eslint/no-explicit-any`, and `any` appears in key workflow files:

- `server/routes/booking.ts`
- `src/features/admin/ViewAsPage.tsx`
- `src/features/admin/ReportPage.tsx`
- `src/features/booking/MyBookings.tsx`
- `src/features/warehouse/reviewer/index.tsx`
- `src/features/warehouse/reviewer/BookingDetailModal.tsx`
- `src/features/warehouse/reviewer/AmendmentPanel.tsx`
- `src/features/notifications/components/NotificationPanel.tsx`

Recommended fix:

- Add typed DTOs for Supabase query shapes.
- Use `unknown` at API boundaries and validate with Zod.
- Re-enable `no-explicit-any` gradually by folder.

## Optimization Opportunities

### Build Output Has A Few Large Chunks

Largest production assets from `npm run build`:

- `Navbar-*.js` - 257.42 kB
- `index-*.js` - 204.50 kB
- `FilterDatePicker-*.js` - 171.59 kB
- `types-*.js` - 88.47 kB
- `ReviewerPage-*.js` - 30.70 kB
- `BookingConfirmation-*.js` - 28.69 kB
- `BookingForm-*.js` - 28.40 kB

Recommended fix:

- Inspect bundle composition with `rollup-plugin-visualizer`.
- Lazy-load heavy date picker code only where needed.
- Check whether shared imports from `Navbar` pull too much feature code into the common path.

### Capacity Checks Can Create Repeated Database Queries

File:

- `server/routes/booking.ts`

`capacityWindow()` loops date-by-date and calls `usedQuantityForDate()` for each day. Each call performs nested Supabase selects. This is fine at small scale but can become slow as data grows.

Recommended fix:

- Query all relevant dates in one call.
- Aggregate quantities in SQL/RPC.
- Cache short-lived capacity results if the UX polls frequently.

## Dead Code And Cleanup Checklist

Suggested cleanup order:

1. Fix auth/token verification and upload authorization first.
2. Add tests for auth and upload before broader refactors.
3. Repair mojibake strings.
4. Remove or consolidate debug scripts and generated data.
5. Split `BookingForm`, `ReviewerPage`, `BookingDetailModal`, and `server/routes/booking.ts`.
6. Introduce typed DTOs and reduce `any`.
7. Add bundle analysis and split large shared chunks.

## Notes

- `server/lib/supabase.ts` was already modified in the worktree before this review. This report does not change it.
- The passing validation commands are a good baseline; keep them green while applying the fixes above.

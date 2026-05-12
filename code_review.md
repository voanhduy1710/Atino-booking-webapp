# Code Review: Atino Booking Webapp

Date: 2026-05-12
Branch observed: main
Review source: code-review-graph plus focused file inspection

## Executive Summary

This project is a Vite/React booking app backed by Supabase and a small Express API. The code-review graph found 252 nodes, 2,194 edges, 85 files, and 17 communities. The feature boundaries are fairly clean: auth, booking, warehouse review/receive, admin, notifications, shared components, Express routes, and Supabase edge functions are mostly separated.

The biggest risk is not structure. It is security ownership. The app currently has multiple auth systems, accepts unsigned tokens in important places, exposes staff credential material to the browser, stores supplier plaintext passwords, and lets upload/finalize flows trust user-controlled paths and decoded token payloads. These are release-blocking issues for any production environment.

The second-largest risk is missing tests around the most connected user-facing workflows. The graph identifies untested hotspots in `ManagerPage`, `AccountsPage`, `SuppliersPage`, `ReviewerPage`, `WarehousesPage`, `AppRoutes`, `ReportPage`, `ReceiverPage`, `BookingForm`, and `PoRow`. Vitest is configured, but `npm test` is allowed to pass with no tests, and `rg` found no `*.test.*` or `*.spec.*` files.

## Code-Review Graph Findings

Graph summary:

| Signal | Finding |
| --- | --- |
| Nodes | 252 |
| Edges | 2,194 |
| Files | 85 |
| Communities | 17 |
| Cross-community warnings | 0 |
| Current diff risk | 0.85 high |
| Test gaps in changed graph | 17 |

Largest communities:

| Community | Size | Notes |
| --- | ---: | --- |
| `auth-api` | 22 | Login, registration, account approval, token helpers |
| `components-handle` | 19 | Booking form, PO rows, uploads, public booking detail |
| `reviewer-page` | 15 | Reviewer and receiver warehouse workflows |
| `lib-token` | 13 | Client token/session helpers and date utilities |
| `admin-page` | 9 | Reports and admin views |

Important graph hotspots:

| Hotspot | Degree | Risk |
| --- | ---: | --- |
| `ManagerPage` | 108 | Large, untested admin-like surface |
| `AccountsPage` | 83 | Account approval/reset/password exposure surface |
| `SuppliersPage` | 62 | Direct supplier mutations |
| `ReviewerPage` | 62 | Booking review workflow and item decisions |
| `WarehousesPage` | 57 | Direct warehouse mutations |
| `AppRoutes` | 56 | Route protection boundary |
| `ReportPage` | 55 | Reporting query surface |
| `BookingForm` | 31 | Booking creation and upload integration |
| `PoRow` | 30 | Upload state and item validation |

High-criticality flows:

| Flow | Criticality |
| --- | ---: |
| `LoginPage` | 0.76 |
| `isAuthenticated` | 0.62 |
| `hasRole` | 0.62 |
| `AccountsPage` | 0.62 |
| `loginApi` | 0.61 |
| `registerSupplierApi` | 0.61 |
| `BookingPage` | 0.53 |
| `verifyJWT` | 0.485 |
| `usePhotoUpload` | 0.485 |
| `ReceiverPage` | 0.37 |

The graph shows good feature isolation, but the high-risk flows are exactly the flows that need authentication, authorization, validation, and tests.

## Critical Security Problems

### 1. Client sessions are unsigned base64 and can be forged

Files:

- `src/features/auth/services/auth.service.ts:47`
- `src/shared/lib/auth.ts:27`
- `server/lib/jwt.ts:27`
- `server/routes/booking.ts:53`

`loginApi` creates sessions with:

```ts
btoa(JSON.stringify(session))
```

The frontend later trusts the decoded role in `getCurrentUser`, and the Express booking route accepts the same token format through `verifyJWT`. This is not authentication; it is a user-editable JSON blob. A user can create a token with `role: "admin"` or `role: "supplier"` and inject arbitrary `supplier_account_id`.

Impact:

- Client route guards can be bypassed.
- `POST /api/booking/finalize` can be called with forged supplier identity.
- Any server route that reuses `server/lib/jwt.ts` inherits the flaw.

Fix:

- Delete support for unsigned base64 session tokens.
- Issue only signed, expiring tokens server-side.
- Verify the signature server-side before trusting `role`, `supplier_account_id`, or `sub`.
- Prefer Supabase Auth or a single backend-owned JWT issuer with `jose`/WebCrypto verification.

### 2. `server/lib/jwt.ts` decodes JWT payloads but does not verify signatures

File: `server/lib/jwt.ts:27`

For three-part JWTs, the server decodes the middle segment and checks only `exp`. It never verifies the HMAC signature. This means an attacker can forge a JWT payload and the server will accept it if the JSON parses and `exp` is in the future.

Impact:

- Role escalation.
- Supplier impersonation.
- Booking creation under another supplier account.

Fix:

- Replace `verifyJWT` with real signature verification.
- Reject tokens without `iss`, `aud`, `sub`, `role`, `iat`, and `exp`.
- Add unit tests with valid token, expired token, tampered payload, tampered signature, missing claims, and unsigned base64 token.

### 3. Staff credentials are exposed to the browser

Files:

- `src/features/auth/services/auth.service.ts:63`
- `src/features/auth/services/auth.service.ts:82`

Staff login reads `VITE_STAFF_USERS`. Every `VITE_*` value is bundled into client JavaScript and sent to users. The code then compares SHA-256 password hashes in the browser.

Impact:

- Staff usernames and hashes are public.
- Weak hashes can be cracked offline.
- Staff auth can be replicated outside the UI.

Fix:

- Move all staff authentication to a server function.
- Remove `VITE_STAFF_USERS`.
- Store staff users in a protected table or identity provider.
- Use password hashing built for credentials, such as Argon2id or bcrypt, not raw SHA-256.

### 4. Default staff accounts and passwords are committed in the edge auth function

File: `supabase/functions/auth/index.ts:14`

The edge function includes default staff usernames, hashes, and comments showing original passwords such as `123456`.

Impact:

- Credentials are compromised by source access and git history.
- If the fallback is active in any environment, admin/staff access is exposed.

Fix:

- Remove `DEFAULT_STAFF`.
- Require `AUTH_USERS` or, better, move staff users to a database/auth provider.
- Rotate all staff passwords and invalidate old sessions.
- Treat the committed passwords as leaked.

### 5. JWT secret has an insecure fallback

File: `supabase/functions/auth/index.ts:6`

```ts
const JWT_SECRET = Deno.env.get("JWT_SECRET") ?? "dev-secret-change-me";
```

If the environment variable is missing, tokens are signed with a public secret.

Fix:

- Fail startup when `JWT_SECRET` is missing.
- Use a long random secret from the deployment secret store.
- Add a deployment check that blocks release if required secrets are absent.

### 6. Supplier plaintext passwords are stored and displayed

Files:

- `src/features/auth/services/auth.service.ts:152`
- `src/features/admin/tabs/AccountsTab.tsx:59`
- `src/features/admin/tabs/AccountsTab.tsx:114`
- `src/features/admin/tabs/AccountsTab.tsx:156`

Registration sends both `p_password_hash` and `p_password`. Password reset sends `p_plaintext_password`. The accounts tab queries `supplier_accounts` with `select('*')` and displays `a.password` behind a reveal button.

Impact:

- Database compromise exposes real passwords.
- Admin UI creates a shoulder-surfing and insider-risk path.
- Password reuse turns this into a broader account takeover risk.

Fix:

- Stop storing plaintext passwords.
- Remove `password` from `supplier_accounts`.
- Remove plaintext password display from the UI.
- Replace reset with one-time temporary password or reset link.
- Rotate all supplier passwords after migration.

### 7. Edge function approval/rejection authorization is incomplete

File: `supabase/functions/auth/index.ts:76`

`approve-supplier` only checks that an `Authorization` header starts with `Bearer `. It does not verify token signature or role. `reject-supplier` has no authorization check in the inspected code.

Impact:

- Unauthenticated or forged requests can approve/reject supplier accounts if the edge function is deployed.

Fix:

- Require a verified admin token for both actions.
- Share one auth verifier between edge functions.
- Add integration tests for unauthenticated, non-admin, expired, tampered, and valid admin requests.

### 8. Upload endpoint is unauthenticated and accepts user-controlled storage paths

Files:

- `server/routes/upload.ts:34`
- `server/lib/gcs.ts:42`
- `src/features/booking/hooks/usePhotoUpload.ts:39`
- `supabase/functions/gcs-upload/index.ts:119`

The Express upload route does not require authentication. The client supplies `path`, and the server writes to:

```ts
duy_booking_images/${relativePath}
```

MIME type and size are checked, but ownership, auth, path shape, extension consistency, and file magic are not.

Impact:

- Anyone who can reach `/api/upload/gcs` can upload files into the public bucket.
- Users can overwrite predictable object names.
- Uploads are not tied to a supplier, session, or booking.
- MIME spoofing can bypass content assumptions.

Fix:

- Require a verified supplier token for upload.
- Generate object keys server-side; do not trust client paths.
- Restrict paths to `temp/{supplier_account_id}/{session_id}/{uuid}.{ext}`.
- Check magic bytes for images/PDFs.
- Consider private bucket objects plus signed read URLs instead of public `allUsers` object viewer.

### 9. CORS is open on sensitive endpoints

Files:

- `server/index.ts:24`
- `supabase/functions/auth/index.ts:35`
- `supabase/functions/gcs-upload/index.ts:19`
- `supabase/functions/finalize-booking/index.ts:45`

The Express API uses `cors()` without an allowlist. Edge functions return `Access-Control-Allow-Origin: *`.

Impact:

- Browser requests from any origin are allowed.
- This is especially risky while bearer tokens are stored in localStorage and endpoints accept weak tokens.

Fix:

- Allow only production and staging origins.
- Keep local dev origins explicit.
- Add CSRF-resistant session strategy if cookies are introduced.

### 10. Authorization depends heavily on frontend route guards and database RPCs

Files:

- `src/app/routes.tsx:32`
- `src/features/auth/guard/RequireRole.tsx:12`
- `src/shared/config/permissions.ts:3`
- `src/features/admin/tabs/WarehousesTab.tsx:27`
- `src/features/admin/tabs/SuppliersTab.tsx:28`
- `src/features/warehouse/reviewer/BookingDetailModal.tsx:40`
- `src/features/warehouse/receiver/index.tsx:88`

The frontend route guard improves UX, but it is not a security boundary. Many Supabase writes and RPC calls are initiated directly from the browser using the anon client. The real protection must be Row Level Security and database function authorization, but no SQL migrations or RLS policies were present in the inspected tree.

Impact:

- If RLS/RPC permissions are loose, non-admin roles can mutate admin data directly.
- The source tree does not provide enough reviewable evidence that database permissions are safe.

Fix:

- Commit migrations and RLS policies to the repo.
- Every RPC should verify caller identity and role server-side or through Supabase auth claims.
- Add tests for role matrix: supplier, reviewer, receiver, manager, admin, anonymous.

## High-Priority Correctness Problems

### 11. Booking finalization is not transactional

Files:

- `server/routes/booking.ts:78`
- `server/routes/booking.ts:96`
- `supabase/functions/finalize-booking/index.ts:87`
- `supabase/functions/finalize-booking/index.ts:101`

Booking creation inserts the booking first, then loops over items and photos. Item insert failures are logged and skipped:

```ts
if (ie || !ins) {
  console.error('[booking] item insert error:', ie)
  continue
}
```

Impact:

- A booking can be created with missing items.
- The user receives success even after partial failure.
- Notifications may be sent for incomplete booking data.

Fix:

- Move finalize booking into a single database RPC transaction.
- Validate all items before insertion.
- Roll back the booking if any item or photo insert fails.
- Return structured validation errors to the client.

### 12. Finalize endpoint trusts client item payload too much

Files:

- `server/routes/booking.ts:33`
- `server/routes/booking.ts:78`
- `src/features/booking/schemas.ts:3`

The frontend uses Zod, but the backend does not re-validate the request body. Backend code trusts `warehouse_id`, `time_slot`, `delivery_note`, `items`, quantities, rounds, and photo paths.

Impact:

- Direct API callers can bypass frontend validation.
- Malformed or extreme data can enter the database.
- Unexpected shapes can cause partial inserts.

Fix:

- Add a server-side Zod schema for `FinalizeBody`.
- Enforce max items, quantity range, allowed time slots, UUID shapes, string lengths, and required photo rules.
- Reject unknown fields.

### 13. Upload state can succeed while form validation blocks hidden failed uploads

Files:

- `src/features/booking/hooks/usePhotoUpload.ts:28`
- `src/features/booking/components/PoRow.tsx:41`
- `src/features/booking/components/PoRow.tsx:57`

When `upload` returns `null`, the UI records an error file in local hook state but does not necessarily surface a form-level failure unless required path arrays are empty. A mixed batch can partially upload and partially fail.

Impact:

- Users can submit a PO with fewer attachments than intended.
- Failed upload state is split between `usePhotoUpload` state and React Hook Form state.

Fix:

- Return a structured upload result with success/failure per file.
- Block submit while any `hasErrors` state exists.
- Store upload status in form state or a central row-level attachment model.

### 14. Reviewer list can fetch the entire booking table

File: `src/features/warehouse/reviewer/index.tsx:88`

The reviewer query orders bookings but has no `.limit()` unless filters are applied. The graph identifies `ReviewerPage` as a hub and bridge node.

Impact:

- Slow initial load as bookings grow.
- Large payloads with joined rows.
- Browser memory and Supabase response limits can become production issues.

Fix:

- Add pagination: `.range(pageStart, pageEnd)` or cursor-based paging.
- Default to a recent delivery/submission window.
- Show total count only if needed.

### 15. Receiver lookup exposes booking details by bearer token only

File: `src/features/warehouse/receiver/index.tsx:61`

The receiver can look up bookings by `booking_token`. This may be intended for QR-based receiving, but it means the token is the access credential for booking details. The receiver page also calls `receive_booking` with `p_receiver_username: user?.sub ?? ''`; with forged client auth this value may be empty or attacker-controlled.

Impact:

- Leaked QR/token exposes booking details.
- Receiving authorization depends on database-side RPC checks that are not present in the repo.

Fix:

- Treat booking tokens as secrets with expiry or single-purpose scope.
- Require verified receiver/admin token for lookup and receive.
- Ensure `receive_booking` checks role and writes receiver identity from verified claims, not a client-supplied username.

### 16. Admin and manager mutation surfaces are duplicated

Files:

- `src/features/admin/tabs/WarehousesTab.tsx`
- `src/features/admin/tabs/SuppliersTab.tsx`
- `src/features/warehouse/WarehousesPage.tsx`
- `src/features/supplier/SuppliersPage.tsx`
- `src/features/manager/index.tsx`

Warehouse and supplier CRUD appears in multiple role-specific views. Some use similar queries/mutations with `as any`, direct deletes, and `window.confirm`.

Impact:

- Authorization and validation fixes must be repeated.
- UX and error behavior can drift.
- Role-specific permissions are hard to audit.

Fix:

- Extract shared hooks: `useWarehousesAdmin`, `useSuppliersAdmin`.
- Centralize mutation functions.
- Keep role-specific pages as thin presentation shells.

### 17. The active and legacy auth/finalize/upload systems conflict

Files:

- `src/features/auth/services/auth.service.ts`
- `server/routes/booking.ts`
- `server/routes/upload.ts`
- `supabase/functions/auth/index.ts`
- `supabase/functions/finalize-booking/index.ts`
- `supabase/functions/gcs-upload/index.ts`

There are two implementations for auth, upload, and booking finalization: Supabase edge functions and Express routes. They differ in token shape, password handling, notification recipients, VAT path handling, and authorization behavior.

Impact:

- It is unclear which implementation is production-authoritative.
- Fixes can be applied to one path while the other remains vulnerable.
- Debugging production behavior will be harder.

Fix:

- Pick one backend boundary.
- Delete or archive the unused implementation.
- If both must exist temporarily, add clear routing docs and parity tests.

## Medium-Priority Code Quality Problems

### 18. TypeScript safety is weakened by widespread `any`

Examples:

- `src/features/warehouse/reviewer/index.tsx:98`
- `src/features/warehouse/reviewer/index.tsx:114`
- `src/features/warehouse/reviewer/BookingDetailModal.tsx:14`
- `src/features/warehouse/reviewer/BookingDetailModal.tsx:101`
- `src/features/warehouse/receiver/index.tsx:68`
- `src/features/admin/tabs/AccountsTab.tsx:114`
- `src/features/admin/tabs/WarehousesTab.tsx:27`
- `src/features/admin/tabs/SuppliersTab.tsx:28`

Impact:

- Supabase response shape changes are not caught.
- Refactors around booking item/photo data can silently break.

Fix:

- Add typed DTOs for joined Supabase query results.
- Keep RPC argument/return types in `src/shared/types`.
- Avoid casting the Supabase client to `any` except for generated types that truly lag migrations.

### 19. No committed database schema/migrations were found

`rg --files -g "*.sql"` found no SQL files. The app depends heavily on Supabase tables, RPCs, triggers, RLS, and storage conventions.

Impact:

- Review cannot verify authorization logic.
- New environments are hard to reproduce.
- Security fixes may happen manually and drift.

Fix:

- Add Supabase migrations for tables, functions, RLS policies, indexes, and storage policies.
- Add seed data for non-secret local development.
- Document required secrets and deployment order.

### 20. Tests are effectively absent

Files:

- `package.json:13`
- `vitest.config.ts:1`

`test` is configured as `vitest run --passWithNoTests`, and no test files were found. The graph reports many untested hotspots.

Impact:

- Auth, routing, booking creation, upload, and role permissions can regress silently.
- Recent changed-file risk is high because changed hotspots have no mapped tests.

Fix:

- Remove `--passWithNoTests` once the first baseline tests land.
- Add unit tests for token verification, date utilities, booking schema, upload path generation, and auth guards.
- Add integration tests for finalize booking and account approval.
- Add Playwright smoke tests for login, supplier booking, reviewer approval, receiver receive, and admin account flows.

### 21. Destructive actions still use `window.confirm`

Examples:

- `src/features/admin/tabs/AccountsTab.tsx:184`
- `src/features/admin/tabs/WarehousesTab.tsx:86`
- `src/features/admin/tabs/SuppliersTab.tsx:91`
- `src/features/warehouse/reviewer/BookingDetailModal.tsx:170`

Impact:

- Inconsistent UX.
- Harder to test.
- Native dialogs are blocking and vary across browsers.

Fix:

- Replace with the shared `Modal`.
- Include resource name, consequence, confirm button, cancel button, loading state, and error state.

### 22. User-facing Vietnamese text appears mojibaked in several files

Many inspected source files display strings such as `TÃ i khoáº£n`, `ÄÄƒng kÃ½`, and `Lá»—i`. This may be an encoding/display artifact, but if these bytes are in source, users will see broken Vietnamese.

Impact:

- Poor UX and trust loss.
- Harder maintenance because text search becomes unreliable.

Fix:

- Confirm files are saved as UTF-8.
- Normalize affected files.
- Add an encoding check in CI if this has recurred.

## What Is Working Well

- Feature-based directory structure is understandable.
- The graph reports no cross-community coupling warnings.
- Shared components and shared libs are already emerging (`Lightbox`, `gcs`, `crypto`, date utilities).
- React Query is used consistently for async data and invalidation.
- Admin has recently been split into tabs, which reduces the old monolith risk.
- Booking form uses React Hook Form and Zod on the client.
- Upload size/type limits exist, even though server-side auth/path validation still needs work.
- Lazy loading is used for heavier pages.

## Recommended Fix Plan

### Phase 0: Incident-style containment

1. Rotate all staff passwords and any supplier passwords that may have been stored in plaintext.
2. Rotate `JWT_SECRET`, Supabase service role keys, and GCS service account keys if they were used in exposed environments.
3. Remove default staff credentials from deployed edge functions.
4. Disable or restrict unauthenticated upload endpoints until auth is fixed.
5. Confirm whether Express or Supabase edge functions are the production backend.

### Phase 1: Establish one auth model

1. Choose one token issuer.
2. Remove unsigned base64 token support from frontend and backend.
3. Implement real JWT signature verification in `server/lib/jwt.ts`.
4. Add token expiry and required claims.
5. Store staff credential data only server-side.
6. Update `RequireRole` to consume verified session data from the chosen auth model, while keeping server/database authorization authoritative.

### Phase 2: Remove plaintext password handling

1. Stop sending `p_password` and `p_plaintext_password`.
2. Drop or ignore the plaintext password column.
3. Remove password reveal UI from account tables.
4. Replace reset with a temporary password flow or email/SMS reset.
5. Add tests proving plaintext password fields are not selected or rendered.

### Phase 3: Lock down upload and booking finalize

1. Require verified supplier auth for `/api/upload/gcs`.
2. Generate object paths on the server.
3. Validate file magic bytes and extensions.
4. Add server-side Zod validation for finalize booking.
5. Move booking/item/photo insert into a transaction.
6. Return failure on any item/photo insert error.

### Phase 4: Commit database security to source

1. Add Supabase migrations.
2. Add RLS policies for each table.
3. Add SQL functions with explicit role checks.
4. Add indexes for reviewer filters: `delivery_date`, `submitted_at`, `status`, `supplier_id`, `booking_code`.
5. Document local setup and deployment secrets.

### Phase 5: Add focused tests

Start with the highest blast-radius tests:

1. `server/lib/jwt.test.ts`: rejects tampered JWTs and unsigned base64.
2. `server/routes/upload.test.ts`: rejects anonymous upload and invalid path/type.
3. `server/routes/booking.test.ts`: rejects forged supplier token and invalid body.
4. `src/shared/lib/auth.test.ts`: decodes only supported valid sessions after auth refactor.
5. `src/app/routes.test.tsx`: verifies role route redirects.
6. Playwright smoke: supplier creates booking, reviewer confirms item, receiver receives booking, admin approves account.

### Phase 6: Reduce maintenance risk

1. Extract shared warehouse/supplier/account mutation hooks.
2. Replace `any` casts with typed DTOs.
3. Add pagination to reviewer and report queries.
4. Replace `window.confirm` with shared modals.
5. Normalize Vietnamese source encoding.
6. Delete unused legacy backend code after production path is confirmed.

## Priority Table

| Priority | Issue | Severity | Suggested owner |
| --- | --- | --- | --- |
| P0 | Unsigned base64 sessions accepted | Critical | Backend/auth |
| P0 | JWT decode without signature verification | Critical | Backend/auth |
| P0 | Staff credentials exposed in client bundle | Critical | Auth |
| P0 | Hardcoded default staff credentials | Critical | Auth/DevOps |
| P0 | Plaintext supplier passwords | Critical | Auth/DB |
| P0 | Unauthenticated upload endpoint | Critical | Backend/storage |
| P1 | Incomplete edge approval/rejection auth | High | Backend/auth |
| P1 | Open CORS on sensitive endpoints | High | Backend/DevOps |
| P1 | Non-transactional booking finalize | High | Backend/DB |
| P1 | Missing server-side finalize validation | High | Backend |
| P1 | No committed DB migrations/RLS | High | DB |
| P2 | Reviewer query lacks pagination | Medium | Frontend/API |
| P2 | Widespread `any` casts | Medium | Frontend |
| P2 | Duplicate backend paths | Medium | Architecture |
| P2 | No tests despite configured Vitest | Medium | All |
| P3 | `window.confirm` destructive flows | Low | Frontend |
| P3 | Mojibaked text | Low | Frontend |

## Acceptance Criteria For A Safer Release

- No unsigned token format is accepted by server routes.
- Staff credentials are never present in `VITE_*` variables or client bundles.
- No plaintext password is stored, selected, or displayed.
- Upload requires a verified user and server-generated object path.
- Booking finalization is atomic.
- Reviewer list is paginated.
- Supabase migrations and RLS policies are committed.
- Tests fail when token signatures are tampered with.
- `npm test` no longer passes with zero tests.
- A Playwright smoke test covers the main supplier-to-receiver booking path.

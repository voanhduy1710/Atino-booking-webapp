# Atino Booking Webapp — Project Code Review

**Review date:** 2026-07-14  
**Scope:** frontend, Express API, database migrations, deployment files, dependencies, tests, generated/debug artifacts, and responsive/mobile behavior  
**Method:** code-review knowledge graph first, followed by focused source inspection, dependency audit, build/type/test validation, and browser checks at phone viewports

## Executive summary

This application should **not be exposed to untrusted users in its current state**. The main concern is not code style: the authentication design can be forged by a browser client, staff password hashes are compiled into the frontend bundle, supplier plaintext passwords appear to be stored and returned to administrators, sensitive database reads rely on public/anonymous access, and unauthenticated endpoints can upload files and trigger a database synchronization job.

The responsive shell works on a few public pages, but the authenticated mobile workflows are not yet usable as a complete mobile product. The booking PO grid, date range picker, reviewer table, detail modal, receiver actions, and full staff navigation need purpose-built small-screen layouts. The QR scanner also has a camera lifecycle leak and does expensive full-resolution image processing on the main thread.

| Area | Assessment | Release implication |
|---|---|---|
| Authentication and authorization | Critical | Release blocker |
| Credential and data exposure | Critical | Release blocker; rotate affected credentials |
| Upload and synchronization APIs | Critical | Release blocker |
| Database integrity/concurrency | High risk | Fix before production booking traffic |
| Dependency security | High risk | Patch and retest before deployment |
| Mobile authenticated workflows | Incomplete | Mobile release blocker |
| Test coverage | Inadequate for risk | Add security, transaction, and mobile E2E coverage |
| Maintainability | Medium-high debt | Refactor after security/integrity fixes |

## Review evidence and limitations

### Knowledge-graph results

- The graph indexed **517 nodes, 4,691 edges, 151 files, and 14 communities**.
- Comparing the repository with its root commit found **221 changed files, 332 changed nodes, 52 affected flows, and 318 test gaps**, with an overall risk score of **0.85**.
- The lowest-cohesion major areas were `src/features` (130 nodes, cohesion 0.0675) and `server/lib` (13 nodes, cohesion 0.0714). This matches the observed cross-feature imports and duplicated boundary logic.
- Highest-connectivity UI nodes include `PoRow` (degree 100), `BookingDetailModal` (92), `ReviewerPage` (81), `AccountManagement` (77), `BookingForm` (71), `ProductProcessPage` (70), and `AppRoutes` (59). These deserve regression tests before refactoring.
- Twenty untested hotspots were reported. Important uncovered nodes include `requireAuth`, `verifyJWT`, `uploadToGCS`, `assertCapacityDate`, `ReceiverPage`, and `AppRoutes`.

The graph's dead-code output is a candidate list, not a deletion list. It cannot always see JSX event references, React lazy/barrel exports, Vite plugin hooks, runtime configuration, or the reason historical SQL migrations exist. The verified list later in this report was confirmed with source/import searches.

### Validation performed

- `npm test`: passed, **2 test files / 12 tests**.
- `npm run build`: passed; Vite built 1,105 modules.
- `npm run server:typecheck`: passed.
- Frontend and server TypeScript checks with `noUnusedLocals` and `noUnusedParameters`: passed. This does not detect unused exported modules or dependencies.
- `npm audit --omit=dev`: failed with **12 production dependency vulnerabilities**: 3 high, 8 moderate, 1 low, 0 critical.
- Browser checks were performed at **390×844** and **320×700**. Public landing, login, guide, guide subpages, and an invalid public booking-detail route were inspected.

This was a repository review, not a penetration test of the live deployment. The repository does not contain a complete baseline database schema/policy history, so the current production RLS state cannot be fully reproduced or certified from this code alone.

## Release-blocking security findings

### SEC-01 — Client-forgeable authentication and roles (Critical)

**Evidence:** `src/features/auth/services/auth.service.ts:27-29,45`, `server/lib/jwt.ts:27-43`, `server/lib/httpAuth.ts:17-30`, and `project_tester.py:74-82`.

The client creates its own bearer token with `btoa(JSON.stringify(session))`. The server decodes that value and trusts its `role`; it does not verify a server signature. The compatibility path for an older JWT-like shape decodes the payload but also does not verify a signature. `project_tester.py` independently demonstrates the design by constructing an admin token from base64-encoded JSON.

Any caller who knows the role names can forge an `admin`, `manager`, or warehouse token and reach service-role-backed endpoints. Every backend role check built on `requireAuth` is therefore bypassable.

**Required fix:** replace this scheme with server-issued, cryptographically verified sessions. Prefer Supabase Auth with verified access tokens or a server-side session store with random opaque cookies. If custom JWTs remain, sign them with a server-only key; verify signature, issuer, audience, expiry, token type, and a stable user identifier on every request. Reject all unsigned/legacy tokens after a short migration window, support revocation, and add negative authorization tests for every protected router.

### SEC-02 — Staff credential hashes are shipped to every browser (Critical)

**Evidence:** `.env` defines `VITE_STAFF_USERS`; `deploy.ps1:98-104` writes it into `.env.production`; `server/routes/auth.ts:35-38` compares the supplied hash; and `src/features/auth/services/auth.service.ts:20-24,39-44` performs fast client-side SHA-256 hashing.

The `VITE_` prefix makes the staff credential map public at build time. A fresh production build was inspected without printing the values: all four configured staff usernames and password hashes were present in `dist`. These fast, unsalted hashes can be attacked offline and are not a safe password database.

**Required fix:** immediately rotate all affected staff passwords. Remove `VITE_STAFF_USERS` and any credential material from all browser builds. Keep identity records server-side and store passwords with Argon2id, scrypt, or bcrypt using per-password salts and appropriate cost settings. Use constant-time verification and a secret manager for remaining secrets. Treat previously deployed bundles as already disclosed.

### SEC-03 — Supplier plaintext passwords are accepted, stored, selected, and displayed (Critical)

**Evidence:** `src/features/auth/services/auth.service.ts:48-59`, `server/routes/auth.ts:87-104`, `src/features/accounts/AccountManagement.tsx:61-72,119-129,175-188`, and `server/routes/accounts.ts:47-60`.

Registration and password reset send both `password_hash` and plaintext `password` to RPCs. The admin account page performs `select('*')` and displays the `password` field. This indicates recoverable plaintext credentials exist in the database and are returned to browsers.

**Required fix:** remove the plaintext column and plaintext RPC parameters, migrate to one-way password hashes, and never return hash/password columns from an API or database view. Build explicit account DTOs instead of `select('*')`. Rotate supplier credentials, invalidate sessions, audit access logs, and notify affected users if policy requires it.

### SEC-04 — Public/anonymous database reads bypass application authorization (Critical)

**Evidence:** browser-side Supabase queries throughout the application and `supabase/migrations/20260519144500_lock_down_browser_writes.sql:1-2`, whose comment intentionally leaves public `SELECT` policies in place.

The browser uses the anonymous Supabase client to query business tables directly. Examples include supplier accounts, bookings, notifications, product data, and booking details; multiple queries use `select('*')`. Page routing and local-storage roles do not protect the database. Client-supplied filters such as supplier account ID or notification recipient are not authorization controls, because a caller can issue a different query directly.

**Required fix:** use real authenticated database claims and RLS policies bound to the authenticated user, or move sensitive reads behind verified backend endpoints. Revoke anonymous column/table access to passwords and private operational data. Create least-privilege views/DTOs. Add automated policy tests proving that one supplier cannot read another supplier's bookings, accounts, notifications, or documents. Check the deployed Supabase policy state separately because the baseline schema is missing here.

### SEC-05 — File upload is unauthenticated and accepts caller-controlled object paths (Critical)

**Evidence:** `server/routes/upload.ts:32-54`, `server/index.ts:91`, and `src/features/booking/hooks/usePhotoUpload.ts:75-77`.

`POST /api/upload` is mounted without authentication. It uses in-memory Multer storage, trusts the multipart MIME type, accepts an arbitrary `path` from the caller, and returns public GCS URLs. A caller can consume memory/bandwidth, place or overwrite predictable objects, and store non-image content under trusted-looking paths. Removing a photo in the UI only removes local form state; uploaded abandoned objects are not deleted.

**Required fix:** require a verified user and ownership context; generate random object names on the server; enforce a strict size/count quota; detect content by magic bytes and decode images; strip metadata if appropriate; use a private bucket with short-lived signed URLs; and implement deletion/retention for abandoned uploads. Do not return raw production errors. Upgrade Multer as described in DEP-01.

### SEC-06 — Every public page load can trigger an external sync and database write (Critical)

**Evidence:** `src/app/main.tsx:14`, `src/app/AppStartupSync.tsx:15-45`, and `server/routes/productProcess.ts:382-403`.

`AppStartupSync` runs before authentication and calls the unauthenticated `/api/product-process/sync` route. This makes ordinary landing/login visits trigger an external Lark fetch and bulk upsert/deactivation workflow. The module-level guard only prevents repeats in one JavaScript process; it does not protect across users, tabs, browser instances, or server instances.

There is also a destructive failure mode: the upsert helper returns early when the fetched row list is empty, after which the sync path can deactivate every older catalog row. Concurrent executions can race.

**Required fix:** remove sync from public startup. Make it an authenticated admin/internal job or scheduled worker. Add a distributed lock/single-flight mechanism, upstream timeout, staging table, row-count/sanity validation, and a transaction. Never deactivate the existing catalog after an empty, partial, or failed upstream response.

## High-priority security and integrity findings

### SEC-07 — Other unauthenticated proxy/data endpoints (High)

`server/routes/nhanh.ts:34-75` exposes the draft-products proxy without authentication or rate limiting. Product catalog reads may be intentionally public, but the decision and returned fields need to be explicit. Protect paid/sensitive upstream integrations, constrain query input, cache safe results, and apply per-user/IP quotas.

### SEC-08 — Role matrix is inconsistent across UI and API (High)

- `server/routes/reviewer.ts:7,109-118` protects the entire router with `admin`, `manager`, and `warehouse_reviewer`, so all three roles can call the delete endpoint even though `src/features/warehouse/reviewer/index.tsx` shows delete only to admins. Add an admin-only guard to the delete route.
- `src/shared/config/permissions.ts` lets `warehouse_receiver` enter `/reviewbooking`, while the backend reviewer router excludes that role. The page can render action controls that then fail with 403. Give the receiver a receiver-specific route/view or align both matrices.
- `/warehouses` and `/suppliers` are visible to staff roles, but `server/routes/adminResources.ts:7` makes every create/update/delete route admin-only. The pages hide only delete, leaving add/edit controls that fail for non-admin users. Introduce explicit `canView` and `canManage` capabilities and render read-only screens where appropriate.

Maintain one shared, auditable permission matrix and enforce it independently on the server. UI hiding is only a usability feature.

### SEC-09 — Booking input, atomicity, and concurrency are unsafe (High)

**Evidence:** `server/routes/booking.ts`, especially capacity checking around `214-223` and creation around `339-398`.

Untrusted JSON is TypeScript-cast rather than runtime-validated. Missing arrays, negative quantities/sizes, `NaN`-like coercions, oversized payloads, arbitrary strings, and invalid enum values are not comprehensively rejected server-side. Capacity is checked, then the booking and child rows are inserted separately and sequentially. A later failure leaves an orphan or partial booking, and some photo insert errors are ignored. Two concurrent requests can both pass the read-before-write capacity check and overbook. A repeated submit has no idempotency protection.

**Required fix:** validate the full request with a server-side Zod schema and enforce lengths, enums, item counts, date rules, and nonnegative finite numbers. Move capacity allocation and all booking/item/photo writes into one database transaction/RPC with locking or another serializable reservation strategy. Add database constraints. Require an idempotency key or unique client session ID and return the original booking for retries.

### SEC-10 — Missing abuse controls and response hardening (High)

**Evidence:** `server/index.ts:32-70`, open `cors()`, and `nginx.conf`.

- Login, registration, uploads, sync, and upstream proxy endpoints have no rate limits.
- CORS is unrestricted rather than allowlisted by deployed origin.
- Nginx lacks a Content Security Policy, frame protection, HSTS, Referrer-Policy, and Permissions-Policy.
- Tokens are stored in `localStorage`, increasing impact of any XSS.
- `x-forwarded-for` is logged without a documented trusted-proxy boundary.
- Request targets and UTF-8 diagnostic context can contain sensitive data. The byte-by-byte verification and detailed bad-byte logging are an avoidable CPU/log-amplification path.
- Upload errors expose raw internal messages in all environments.

Add endpoint-specific rate limits and body limits, an origin allowlist, secure cookie sessions, `helmet`/equivalent headers, a strict production CSP, correct proxy trust settings, structured redacted logs with request IDs, and centralized environment-aware error handling.

### SEC-11 — Public booking URLs and documents leak through bearer links (High)

`BookingDetailPublic` queries booking, supplier, item, and photo data directly through the anonymous client using a token in the URL. Tokens in URLs can appear in browser history, logs, analytics, screenshots, and referrers; returned GCS links are public.

Serve a minimal DTO through a rate-limited backend endpoint, use high-entropy revocable scoped tokens with expiry where business rules allow, set `Referrer-Policy: no-referrer`, avoid third-party resources on the page, and use signed document URLs. Do not disclose internal IDs or fields the recipient does not need.

### SEC-12 — Deployment secret handling and container hardening (High)

`deploy.ps1` passes service-role, GCS, Lark, and Nhanh values through `--set-env-vars`; use the platform's secret manager and `--set-secrets` instead. Remove every staff credential from Vite variables. `Dockerfile` installs development dependencies in the runtime image and does not switch to an unprivileged user. Use a multi-stage build or `npm ci --omit=dev`, pin a supported Node base image/digest, run the application as non-root, add a health check, and ensure the Nginx/Node multi-process setup has graceful shutdown and failure supervision.

## Dependency findings

### DEP-01 — Production dependency vulnerabilities (High)

`npm audit --omit=dev` reported 12 vulnerabilities on 2026-07-14:

- High: `multer` 2.1.1 has denial-of-service advisories; the unauthenticated memory-storage upload route raises the practical severity. Upgrade to a fixed release (audit indicated 2.2.0 or later), then retest upload limits and multipart behavior.
- High: `ws` 8.20.0 has memory disclosure/exhaustion advisories. Upgrade to a fixed 8.21.x-or-later release accepted by the dependency tree.
- High transitive: `form-data` through Google API dependencies.
- Moderate: `react-router`/`react-router-dom` 6.27.0 open-redirect advisory; update to a fixed compatible release and test all redirects/navigation guards.
- Moderate transitive chain: `@google-cloud/storage`, `gaxios`, `retry`, `uuid`, and `qs` advisories.
- Low development/build exposure: `esbuild` advisory.

Update in a dedicated dependency branch, inspect `npm audit` again, and run unit, E2E, upload, authentication, routing, and deployment smoke tests. Do not apply a blind force-upgrade in production.

### DEP-02 — Verified unused runtime dependencies (Cleanup)

No source imports were found for:

- `@tanstack/react-table`
- `@zxing/browser`
- `qrcode.react`

Remove them after one final runtime/config search and rebuild. `qrcode` and `jsqr` are used and should not be removed merely because related packages are unused.

## Mobile/responsive review

### What currently works

- The viewport meta tag is present.
- Landing, login, and guide pages fit without meaningful document overflow at 390×844 and 320×700.
- Login inputs/buttons are generally 44–52 px high.
- Several summary grids have responsive breakpoints, and some dense tables are wrapped in horizontal scroll containers.
- The receiver camera requests the environment-facing camera and uses `playsInline`, which is correct for mobile browsers.
- The notification panel is sized to the viewport on small screens.

### MOB-01 — Staff navigation has no mobile information architecture (High)

`src/shared/components/Navbar.tsx` uses a fixed-height, single-row layout with a nonshrinking logo, central route links, and nonshrinking notification/logout controls. There is no hamburger, drawer, bottom navigation, or controlled horizontal overflow. On the public guide subpages, four supplier tabs already squeeze into roughly 60–68 px widths, wrap, and make the document about 2 px wider than a 390 px viewport. Authenticated staff can have up to eight tabs plus right-side controls, so the full version cannot fit.

Use a compact header with a menu/drawer or role-specific bottom navigation. Keep primary actions visible, move secondary routes into a menu, show a clear active state, preserve notification access, and make every interactive target at least 44×44 px. The login password-eye control is approximately 18×18 px and also needs a larger hit area.

### MOB-02 — Booking form PO entry is unusable on a phone (High)

`src/features/booking/components/BookingForm.tsx:336-363` contains fixed three-column/nested nonwrapping delivery layout. `src/features/booking/components/PoRow.tsx:392-436` renders a 15-column `table-fixed` PO grid inside `overflow-visible` with percentage column widths. At phone width this compresses controls to tens of pixels instead of providing a usable editor.

Render each PO as a mobile card/accordion with one labeled field per row, a sticky total/status summary, and explicit add/remove actions. Keep the dense table for desktop at a defined breakpoint. If an interim table remains, give it a real `min-width`, horizontal scroll, sticky identifier/action columns, and an obvious scroll affordance. Add `inputMode`, autocomplete, and numeric keyboard hints where appropriate.

### MOB-03 — Date range picker cannot fit small screens (High)

`src/shared/components/filters/DateRangePickerPopup.tsx:350-427` combines two approximately 18 rem calendars, a 9 rem presets column, gaps, and padding in an absolutely positioned desktop popover. Its total width is far greater than a 320/390 px viewport; left/right position adjustment cannot solve that.

At a mobile breakpoint, use a full-screen/dialog sheet, one month at a time, stacked controls, and a collapsible presets list. Trap focus, support Escape/back navigation, restore focus on close, and prevent background scrolling. Test at 320, 360, 390, and 430 px.

### MOB-04 — Reviewer workflow depends on dense tables and hover (High)

`src/features/warehouse/reviewer/index.tsx` shows a wide, horizontally scrolling table and desktop filter controls. `BookingTooltip.tsx` uses a fixed `w-96` hover tooltip, which is wider than a 320 px viewport and has no touch equivalent. `BookingDetailModal.tsx` uses dense tables, a four-column summary, and small action icons/buttons.

Provide a card/list view on phones with the booking number, supplier, date, status, and primary action visible; open details in a bottom sheet or full-screen page. Replace hover-only information with tap/focus behavior. Collapse summaries to one/two columns, make actions 44 px high, and implement modal focus trapping, Escape, accessible labels, and focus restoration.

### MOB-05 — Receiver page and QR scanner need mobile-specific fixes (High)

`src/features/warehouse/receiver/index.tsx:49-52` clears only the scan interval on unmount; it does not stop all `MediaStream` tracks. If the component unmounts or video setup fails after `getUserMedia`, the camera may remain active. The scanner calls full-resolution canvas `getImageData` about every 300 ms (`:99-109`), creating unnecessary CPU, memory, heat, and battery load. The search/action row also remains a single flex row on narrow screens.

Keep the active stream in a ref and stop every track in effect cleanup and all error paths. Downscale frames before decoding, prefer the native `BarcodeDetector` when available or a worker-backed decoder, and pause scanning after a successful result. Add permission-denied guidance, manual code entry, image-from-gallery fallback, visible camera state, and a retry action. Stack the search input/buttons on phones and use a card-based receiving result. Camera access must be served from HTTPS outside localhost.

### MOB-06 — Uploads and touch interaction are incomplete (Medium)

Photo inputs constrain file types but do not consistently request `capture="environment"`. Add an explicit "Take photo" option plus a separate gallery option, client-side preview/compression, upload progress, retry/cancel, offline/error recovery, and server-enforced validation. The hook currently exposes unused `retry`/`hasErrors` state while deletion does not remove remote objects.

Audit all icon-only buttons and table actions for 44×44 px hit areas, visible focus, accessible names, and non-hover states. Communicate horizontal scrolling where it cannot yet be removed.

### MOB-07 — This is responsive web, not an installable/offline mobile app (Information)

No web app manifest, service worker, install experience, or offline strategy was found. If “mobile version” means an installable PWA or native-like field tool, that is a separate feature scope. Booking creation, upload retry, scanner fallback, and receiving conflict resolution need an explicit offline/network-loss design before claiming offline support.

### Recommended mobile acceptance matrix

- Viewports: 320×568, 360×800, 390×844, 430×932, tablet portrait, and desktop.
- Browsers/devices: current iOS Safari and Android Chrome, including a real-device camera test.
- Roles: supplier, manager, warehouse reviewer, warehouse receiver, and admin.
- Flows: login/logout, navigation, booking with multiple POs/photos, date selection, review/amend/delete authorization, receive/scan/manual fallback, notifications, account management, long Vietnamese strings, keyboard open, rotation, slow network, denied permissions, and failed uploads.
- Accessibility: keyboard-only desktop, screen-reader labels, focus order/trapping, 200% zoom, contrast, reduced motion, and 44×44 px targets.
- Automated assertions: no document overflow unless deliberately contained; no clipped dialogs; no console errors; streams stop after navigation; only one submission occurs after repeated taps.

## Reliability and performance findings

### PERF-01 — Full-table client fetches and aggregation (High)

- The reviewer page fetches a broad booking set and performs filtering/pagination in the browser.
- Product-process routes page through the whole catalog in 1,000-row batches, then the browser filters/pages it.
- `ReportPage` fetches bookings/items and aggregates on the client.

Move filtering, pagination, counts, and report aggregates into parameterized backend queries/RPCs. Return explicit DTOs with only visible columns. Add stable sort/cursor semantics and cancel stale requests.

### PERF-02 — Capacity endpoint is N+1 and polled repeatedly (High)

The capacity window computes used quantity one date at a time for up to 30 dates and then re-queries the selected date. The UI polls capacity endpoints every 30 seconds per user. Replace this with one grouped SQL query/RPC for the full date range, reuse the selected-date result, and apply a short server cache with deliberate invalidation after booking changes.

### PERF-03 — Common bundle is heavier than necessary (Medium)

Largest production chunks observed:

| Chunk | Raw | Gzip |
|---|---:|---:|
| `Navbar` | 257.42 kB | 69.00 kB |
| base `index` | 204.50 kB | 66.18 kB |
| `FilterDatePicker` | 171.59 kB | 44.62 kB |
| `types` | 88.47 kB | 24.57 kB |
| `ReviewerPage` | 30.70 kB | 7.97 kB |
| `BookingForm` | 29.52 kB | 8.83 kB |

The static `NotificationBell` import in `Navbar` pulls notification/Supabase/query logic into a common authenticated shell. Lazy-load role-specific navigation utilities and secondary panels. Analyze why the date picker costs 171 kB for the required behavior and consider a smaller accessible implementation. Measure route-level first load before and after splitting; do not optimize only by file size.

### PERF-04 — Booking row renders and catalog lookups scale poorly (Medium)

`BookingForm` watches the entire items collection, while each large `PoRow` uses multiple watch calls and repeatedly rebuilds/filters catalog-derived data. Normalize catalog data into memoized maps once, pass stable row-specific options, use `useWatch` at the narrowest field scope, and memoize row components. Virtualization may help only after the mobile card/table design is resolved.

### PERF-05 — External calls lack resilience (Medium)

Lark, Nhanh, and custom fetch paths generally lack explicit timeouts/abort behavior, bounded retry policy, and circuit breaking. The product token/catalog also lacks a robust shared cache. Add AbortController timeouts, retry only safe transient failures with jitter, cache tokens until shortly before expiry, and expose upstream failures without deleting/staling valid local data.

### REL-01 — Schema fallback code hides migration drift (Medium)

Several paths catch missing-column errors and retry legacy payload shapes. This doubles branches and can hide a deployment whose migrations failed. After a controlled rollout, remove legacy fallbacks, define one schema version, and fail startup/health checks when required migrations are missing.

### REL-02 — User identity display is already inconsistent (Low)

`src/shared/components/Navbar.tsx:67-69` displays `user.sub`, while the new session shape supplies `username`. The navbar can show a blank identity. Use one typed session contract and render `username` with an intentional fallback.

## Maintainability and refactoring

### Verified oversized units

| Unit | Approximate size | Recommendation |
|---|---:|---|
| `ReportPage` file | 575 lines | Split query/aggregation hook, filter model, KPI cards, report table/export |
| `BookingForm` file/function | 526 / 452 lines | Extract booking schema/defaults, delivery section, PO collection, submit mapper |
| `server/routes/booking.ts` | 433 lines | Separate validation, authorization, repository, capacity service, transactional command |
| `DateRangePickerPopup` file | 432 lines | Separate state/range logic, calendar view, presets, responsive dialog shell |
| `PoRow` file/function | 417 / 373 lines | Extract catalog selector, dimensions/quantity fields, photo section, derived totals |
| `server/routes/productProcess.ts` | 406 lines | Separate upstream client, parser, sync transaction, read API |
| Reviewer page/function | 360 / 317 lines | Extract server-query hook, filters, desktop table, mobile list, dialogs |
| `BookingDetailModal` file/function | 352 / 285 lines | Extract accessible dialog, summary, lines, amendment/actions |
| `AccountManagement` function | 226 lines | Replace direct DB access; separate query/mutations/form/dialog/table |

Refactor behind characterization tests. The highest-degree components have many dependents; split behavior incrementally rather than rewriting whole screens.

### REFACTOR-01 — Create explicit trust boundaries

The browser, API, Supabase, and upstream integrations currently share loosely typed shapes and `any` casts. Define:

1. Runtime request schemas at every API boundary.
2. Authenticated principal and capability types owned by the server.
3. Explicit public/private response DTOs instead of database rows and `select('*')`.
4. Repository/service layers for booking, capacity, accounts, catalog sync, and notifications.
5. Generated database types refreshed from the deployed schema and checked in CI.

### REFACTOR-02 — Remove feature-to-feature coupling and duplicate adapters

`MyBookings` imports `SUPPLIER_TABS` through `BookingForm` rather than a neutral constants module. Status derivation, API/DB mapping, date conversion, and SHA-256 helpers are duplicated. Move shared constants and pure adapters to narrowly named modules, keep feature internals private, and expose intentional public APIs through feature barrels only when there is more than one consumer.

### REFACTOR-03 — Consolidate data-fetching behavior

Introduce typed query keys and shared fetch/error/cancellation behavior for backend calls. Avoid mixing direct anonymous Supabase access, custom `fetch`, and service-role backend routes within the same feature. Once authorization is fixed, choose one trusted path for each resource and centralize cache invalidation after mutations.

## Dead code and cleanup

### Verified removal candidates

These had no source consumers after graph and import/search verification:

- `src/app/App.tsx` — `main.tsx` renders `AppRoutes` directly.
- `src/features/admin/index.tsx` — unused legacy feature entry.
- `src/features/manager/index.tsx` — unused legacy entry, referenced only by the unused admin entry.
- `src/features/admin/components/LinkBtn.tsx` — unused component/barrel export.
- `src/shared/lib/dateUtils.ts::computeDeliveryDatePreview` — unused exported helper.
- `src/shared/lib/auth.ts::isAuthenticated` and `hasRole` — unused helpers based on the insecure local token design.
- `src/features/booking/hooks/usePhotoUpload.ts` returned `retry` and `hasErrors` values — no consumers.
- Runtime packages in DEP-02.

Delete these in a small cleanup change after the security patch baseline is captured, then build/test. Do not combine their removal with large behavior refactors.

### Generated/debug/operational artifacts to classify

- `project_tester.py` overlaps with the `debug/` audit tools and contains an authentication-forging pattern. Keep only as an explicit security regression test after the auth redesign, or remove it from production packaging.
- `project_structure.py` and generated `Project_structure.txt` duplicate information available from the repository.
- `debug/raw_data.json` and `debug/raw_data_product.json` contain operational supplier/product/booking data and metadata. They should not be casually committed or included in images/artifacts. Determine whether the data is real, purge it from current history if necessary, rotate exposed identifiers/URLs where relevant, and replace it with synthetic fixtures.
- Encoding repair scripts and one-off debug scripts should move to a documented `scripts/maintenance/` area if still required; otherwise remove them.
- Exclude test/debug/raw snapshots from the production Docker build through a strict `.dockerignore` and multi-stage copy list.

### False-positive guardrails

Do **not** delete a graph candidate solely because it has zero static callers. Confirm JSX callbacks, router/lazy/barrel imports, Vite plugin hooks such as server configuration, environment-driven entrypoints, and reflection/dynamic imports. Do not delete applied SQL migrations; append corrective migrations instead. Examples the graph can misclassify include receiver routes/pages, event handlers, catalog fetch functions, status components, and historical migrations.

## Testing gaps and recommended suite

The current 12 tests do not match the application's risk or graph-reported 318 gaps.

### Security and API tests — first priority

- Reject unsigned, altered, expired, wrong-audience, wrong-role, and revoked tokens.
- For every protected endpoint, prove anonymous and each disallowed role receive 401/403.
- Prove reviewer/manager cannot delete; prove receivers cannot execute reviewer mutations.
- Rate-limit login, registration, upload, sync, and upstream proxy routes.
- Reject oversized/malformed uploads, spoofed MIME types, path manipulation, too many files, and non-owned resources.
- Verify account/list responses never contain plaintext passwords or password hashes.
- Supabase/RLS policy tests for cross-supplier isolation and anonymous denial.

### Booking integrity tests

- Runtime schema boundary cases, negative/nonfinite values, item limits, invalid dates/statuses.
- Concurrent bookings at capacity; exactly one succeeds when only one slot remains.
- Forced child insert/upload failure rolls back the whole booking.
- Duplicate/idempotent submission returns one booking.
- Catalog sync with empty, partial, duplicate, slow, and malformed upstream responses never deactivates good data.

### UI and mobile E2E tests

- Role-by-role route/action matrix.
- Booking, review, amendment, receiving, account, notification, and public-detail flows.
- Phone viewport overflow and modal visibility assertions.
- Real-device/manual camera lifecycle test plus mocked scanner state tests.
- Keyboard/focus/escape tests for all dialogs and date pickers.
- Slow/failed/offline upload and repeated-tap submission scenarios.

Add coverage reporting and minimum thresholds for critical server libraries/routes. Coverage percentage alone is not enough; assert the negative security paths and concurrency behavior explicitly.

## Prioritized remediation plan

### Phase 0 — Containment (same day)

1. Remove public access to sync and upload; temporarily disable them if a safe patch is not ready.
2. Rotate all staff and supplier passwords; invalidate existing tokens/sessions.
3. Stop deploying `VITE_STAFF_USERS`; remove credential material and plaintext password display.
4. Restrict Supabase anonymous reads and public GCS access to the minimum safe emergency policy.
5. Patch Multer and `ws`, then redeploy only after smoke tests.

### Phase 1 — Trust and integrity (before production use)

1. Implement verified server-issued authentication and a single role/capability matrix.
2. Move sensitive browser database access behind authenticated endpoints or JWT-bound RLS.
3. Replace plaintext credentials with strong server-side password hashing.
4. Make booking creation validated, transactional, concurrency-safe, and idempotent.
5. Harden uploads, public links, CORS, rate limits, security headers, logs, and secrets.
6. Convert catalog sync to a locked scheduled/admin job with transactional safeguards.

### Phase 2 — Mobile completion

1. Build role-specific mobile navigation.
2. Replace PO/reviewer/receiver dense tables with mobile cards and full-screen details.
3. Implement the responsive date picker/dialog behavior.
4. Fix camera cleanup/performance and add manual/gallery fallbacks.
5. Complete mobile accessibility and the acceptance matrix above.

### Phase 3 — Performance, refactor, and cleanup

1. Move pagination/aggregation/capacity calculations server-side.
2. Add timeouts, caching, cancellation, and resilient upstream handling.
3. Add characterization tests, then split the high-degree oversized components/routes.
4. Remove verified dead code/dependencies and classify debug/raw artifacts.
5. Remove schema compatibility fallbacks after migration enforcement.

## Suggested release gate

Do not call this production-ready until all Critical findings and SEC-07 through SEC-12 are resolved, dependency audit high findings are cleared or formally accepted with compensating controls, cross-tenant authorization tests pass, concurrent booking integrity is proven, and the complete mobile role/flow matrix passes on real iOS and Android devices. Build and typecheck success alone are not sufficient for this application's trust model.

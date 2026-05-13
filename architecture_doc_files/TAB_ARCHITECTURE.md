# Tab & Navigation Architecture

## Overview

Single-page app. No `<Routes>/<Route>` from react-router — navigation is fully manual. `AppContent` reads `location.pathname` directly and derives active state every render. URL is the single source of truth.

---

## File Map

| File | Role |
|---|---|
| `frontend/src/app/appConstants.ts` | Single source of truth: types, labels, path maps |
| `frontend/src/app/App.tsx` | Root entry, lazy-loads all pages, auth gate |
| `frontend/src/app/AppContent.tsx` | Header + content render, tab/subtab logic |
| `frontend/src/app/AppShared.tsx` | `TabDropdown` component, `ErrorFallback`, `LoadingSpinner` |

---

## Tab Structure

Defined in `appConstants.ts`. Six top-level tabs, each with optional subtabs:

```
approval        /approval
  ├── paymentproposal
  ├── productdevelopment
  ├── productdevelopmentreport
  ├── productapproval
  └── productapprovalreport

ledger          /ledger
  ├── data
  ├── report
  └── dataprocessor

balance         /balance
  ├── transactions
  └── currentbalance

cashflow        /cashflow
  ├── reconciliation
  └── linkedtransactions

dashboard       /dashboard
  ├── overview
  ├── revenue
  ├── expenses
  ├── pltable
  └── pltablebytime

report          /report          (no subtabs)
```

---

## URL → Active State (AppContent)

`activeTab` is derived from `location.pathname` on every render — **no state**, no useEffect:

```ts
const activeTab = (
  location.pathname.startsWith('/dashboard') ? 'dashboard' :
  location.pathname.startsWith('/balance')   ? 'balance'   :
  location.pathname.startsWith('/approval')  ? 'approval'  :
  location.pathname.startsWith('/cashflow')  ? 'cashflow'  :
  location.pathname.startsWith('/ledger')    ? 'ledger'    :
  (pathToTab[location.pathname] || 'approval')
) as TabType;
```

`activeSubTab` for each section uses `getSubTab()` — splits path at `/`, reads segment `[2]`, validates against known values, falls back to default:

```ts
const getSubTab = <T>(prefix, valid: T[], fallback: T): T => {
  if (location.pathname.startsWith(`/${prefix}/`)) {
    const sub = location.pathname.split('/')[2] as T;
    if (valid.includes(sub)) return sub;
  }
  return fallback;
};
```

---

## Navigation

All nav calls go through `navigate()` from react-router. No full page reloads.

**Tab switch** (`handleTabSelect` in AppContent):
```ts
navigate(tabToPath[tab]);   // e.g. '/approval' → triggers redirect to default subtab
```

**Subtab switch** (inline in header JSX):
```ts
navigate(`/dashboard/${tab}`);
```

**Default redirects** — bare paths get replaced immediately via `useEffect`:
```
/               → /approval/paymentproposal
/approval       → /approval/paymentproposal
/dashboard      → /dashboard/overview
/balance        → /balance/transactions
/cashflow       → /cashflow/reconciliation
/ledger         → /ledger/data
```

---

## Tab Dropdown (AppShared — `TabDropdown`)

Button in the header showing the active tab label. On click: opens a dropdown overlay.

**Hover flyout:** Hovering a dropdown item that has subtabs renders a second panel to the right (`left-full`) listing all subtabs. Clicking a subtab navigates directly to that path and closes the dropdown.

**Active state display:**
- Active tab row: `bg-gray-100 text-gray-900`
- Active subtab row: `bg-gray-100 text-gray-900 font-bold`
- Inactive: `text-gray-600`, hover `bg-gray-900 text-white` (inverted)

The dropdown is hidden via `visibility: hidden; opacity: 0` (not unmounted) so it doesn't flash on re-open.

---

## Subtab Bar in Header

When a tab is active, its subtab bar renders inline in the header row (to the right of the dropdown). Each subtab is an `<a>` with `onClick` that calls `navigate()` and `e.preventDefault()`:

```tsx
<a href={`/dashboard/${tab}`}
   onClick={(e) => { e.preventDefault(); navigate(`/dashboard/${tab}`); }}
   className={`... ${dashboardSubTab === tab ? 'border-gray-900 text-gray-900' : 'border-transparent ...'}`}>
  {dashboardSubTabLabels[tab]}
</a>
```

Active subtab shows `border-b-2 border-gray-900`. Inactive shows `border-transparent`.

---

## Page Rendering Strategy

**Approval tab** — always mounted, hidden with CSS. Avoids remounting and losing filter/scroll state when switching subtabs:

```tsx
const hidden = { position: 'absolute', top: 0, left: 0, width: '100%', height: 0,
                 overflow: 'hidden', visibility: 'hidden', pointerEvents: 'none' };
const visible = { position: 'relative' };

<div style={activeTab === 'approval' ? visible : hidden}>
  <div style={approvalSubTab === 'paymentproposal' ? visible : hidden}>
    <ApprovalSummaryPage />
  </div>
  ...
</div>
```

**All other tabs** — conditionally rendered with `&&`. Unmounted when not active:

```tsx
{activeTab === 'balance' && (
  <div>
    {balanceSubTab === 'transactions' && <BalanceSummaryPage />}
    {balanceSubTab === 'currentbalance' && <CurrentBalancePage />}
  </div>
)}
```

**Dashboard** — rendered once, receives `activeSubTab` as a prop; manages its own internal subtab switching:

```tsx
{activeTab === 'dashboard' && <DashboardPage viewMode={viewMode} activeSubTab={dashboardSubTab} />}
```

**Ledger** — same pattern as dashboard: single render, subtab as prop:

```tsx
{activeTab === 'ledger' && <LedgerPage ledgerSubTab={ledgerSubTab} />}
```

---

## Auth & Route Restrictions

`AuthWrapper` in `App.tsx` gates everything:

- Not authenticated → `LoginPage`
- Path is `/admin` → `AdminPage` (bypasses `AppContent`)
- Otherwise → `AppContent`

`AppContent` checks `allowedRoutes` from `useAuth()`:

- `allowedRoutes === null` → full access, show `TabDropdown`
- `allowedRoutes` is an array → restricted mode:
  - `TabDropdown` hidden, replaced with a plain label
  - Approval subtabs filtered to only show allowed routes
  - On load, redirected to `allowedRoutes[0]` if current path not in allowed list

---

## View Mode

Global `viewMode` state (`'summary' | 'detail'`) lives in `AppContent`. Toggle button in header right edge (labeled **Cha** / **Con**). Passed as prop to pages that support it (`ApprovalSummaryPage`, `BalanceSummaryPage`, `ReportExpensePage`, `DashboardPage`).

---

## Background Behaviors

**Keep-alive** — pings `/health` every 2 minutes. Pauses when browser tab is hidden (`visibilitychange`). Prevents Cloud Run cold starts during active sessions.

**Silent auto-refresh** — runs every 30 minutes. Calls ETL → waits for completion → invalidates React Query caches for approval, dashboard, report, cashflow.

**Full manual refresh** — refresh button in header. Runs full ETL pipeline (approval + sanxuat), waits for each, then refreshes all caches.

---

## Data Flow Summary

```
URL change
  → react-router location updates
    → AppContent re-renders
      → activeTab + activeSubTab derived from pathname
        → correct subtab bar shown in header
        → correct page div visible/rendered in main
          → page fetches its own data via React Query
```

No global tab state. No Redux. URL is the only state that matters for navigation.

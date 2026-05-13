# DateRangePickerPopup — Architecture & Implementation Guide

> **File**: `frontend/src/shared/components/filters/DateRangePickerPopup.tsx`  
> **Dependency**: `frontend/src/shared/components/filters/filterDateUtils.ts`  
> **Last updated**: 13-05-2026

---

## 1. Purpose

A single-trigger date range picker designed for compact filter bars. It replaces all legacy `FilterDatePicker` usages across the app. When the trigger is clicked, a popup opens with:
- A **preset sidebar** (11 Vietnamese quick-select options)
- A **dual-month calendar** with hover-range preview
- **Typed date inputs** (dd-mm-yyyy) in the footer
- **Apply / Cancel** buttons

The popup only commits to parent state when "Áp dụng" is clicked or a preset is selected. Cancelling or clicking outside discards pending changes.

---

## 2. Component API (`DateRangePickerPopupProps`)

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `startDate` | `string` | required | Selected start date — `"yyyy-mm-dd"` or `""` |
| `endDate` | `string` | required | Selected end date — `"yyyy-mm-dd"` or `""` |
| `onStartDateChange` | `(v: string) => void` | required | Called on apply/preset/clear |
| `onEndDateChange` | `(v: string) => void` | required | Called on apply/preset/clear |
| `label` | `string \| undefined` | `undefined` | Label above trigger for height alignment with sibling filters. Omit for no label. |
| `minDate` | `string \| undefined` | `undefined` | `"yyyy-mm-dd"` — days before this are greyed and unclickable |
| `maxWidth` | `number \| string` | `320` | Max CSS width of the trigger div. `320` = 320px. Set to `undefined` for no cap. |
| `isLoading` | `boolean` | `false` | Disables the trigger with reduced opacity while data loads |
| `className` | `string` | `""` | Extra Tailwind classes on the root wrapper div |

### Sizing behaviour
The root wrapper has:
```css
max-width: 320px;   /* default, from maxWidth prop */
min-width: 220px;   /* always — prevents flex squishing */
```
In a `flex-wrap` filter bar, the trigger takes its natural content width, never stretches past `maxWidth`, and never squishes below `minWidth`. The absolute popup always overflows the trigger freely regardless.

---

## 3. Internal State

```
open       boolean   — is the popup visible?
iStart     string    — pending start date (yyyy-mm-dd), local to popup until Apply
iEnd       string    — pending end date (yyyy-mm-dd)
picking    boolean   — true after 1st click, waiting for 2nd click to complete range
hover      string    — yyyy-mm-dd of day under mouse for live range preview
leftYM     [y, m]   — year+month shown in left calendar
rightYM    [y, m]   — year+month shown in right calendar (always = leftYM + 1 month)
popupLeft  number | undefined  — computed CSS left offset for viewport clamping
```

**Two-click date selection flow:**
1. User clicks first day → `iStart = day`, `iEnd = ''`, `picking = true`
2. Hover moves → `hover` updates, both calendars show a live blue range preview
3. User clicks second day → `[iStart, iEnd]` sorted so start ≤ end, `picking = false`
4. User clicks "Áp dụng" → `onStartDateChange(iStart)`, `onEndDateChange(iEnd)`, popup closes

**Preset flow** (bypasses Apply step):
- Clicking a preset immediately calls both change handlers and closes the popup

**Typed input flow:**
- User types `dd-mm-yyyy` in either text input
- On blur or Enter → parsed → if valid & ≥ minDate, updates `iStart`/`iEnd`
- Calendar navigates to the typed month automatically

---

## 4. Sub-components

### `MiniCal` (internal, not exported)
Renders one month calendar grid.

**Props:**
```typescript
{
  year: number; month: number;
  label: string;           // "Từ ngày" or "Đến ngày"
  start: string;           // currently selected start (yyyy-mm-dd)
  end: string;             // currently selected end (yyyy-mm-dd)
  hover: string;           // hovered date for range preview
  picking: boolean;        // true = range start selected, waiting for end
  minDate?: string;
  onDay: (s: string) => void;
  onHover: (s: string) => void;
  onPrev?: () => void;     // undefined = no left arrow shown
  onNext?: () => void;     // undefined = no right arrow shown
  onMonthYear: (y: number, m: number) => void;
}
```

**Month/Year navigation:** The header contains two native `<select>` elements:
- Month select: options are `VI_MONTHS` array (Tháng 1 … Tháng 12), value = `month` (0-indexed)
- Year select: options are `year - 5` to `year + 5` (11 entries), dynamically computed each render

Left calendar shows `onPrev` arrow; right calendar shows `onNext` arrow. When left navigates, right is forced to `left + 1 month`. When right navigates, left is forced to `right - 1 month`.

**Day cell colouring logic (priority order):**
1. `disabled` (< minDate) → `text-gray-300 cursor-not-allowed`
2. `isStart || isEnd` → `bg-blue-600 text-white font-bold`
3. `inRange` (between lo and hi) → `bg-blue-100 text-gray-900`
4. `isToday` → `border border-blue-400 text-blue-700 font-semibold`
5. default → `text-gray-800 hover:bg-blue-50`

During hover-preview (`picking = true`): `effEnd = hover` (not `end`), so the in-range highlight tracks the mouse in real-time.

---

### `TypedDateInput` (internal, not exported)

A controlled text input that:
- Displays dates as `dd-mm-yyyy` internally (not `yyyy-mm-dd`)
- Accepts free-text typing, commits on blur or **Enter**
- Syncs display when the external `value` prop changes (e.g., preset click)
- Silently rejects invalid entries and resets to the last valid value
- Respects `minDate` — typed dates before it are ignored

---

## 5. Viewport Clamping (Popup Positioning)

The popup is `position: absolute; top: 100%` relative to the wrapper div. On every open, a `useEffect` runs **after** the popup renders (with `visibility: hidden` to prevent flicker):

```
1. Measure popup width via popupRef.current.getBoundingClientRect()
2. Measure wrapper left edge via wrapRef.current.getBoundingClientRect()
3. Calculate: rightEdge = wrapRect.left + 0 + popupRect.width
4. If rightEdge + 8px > window.innerWidth → shift left = vw - 8 - popupWidth - wrapRect.left
5. If left would go negative → clamp to 8px from left edge
6. Set popupLeft, which makes popup visible
```

The popup renders hidden (`visibility: hidden`) at `popupLeft === undefined`, then becomes visible once `popupLeft` is set. This avoids a 1-frame flash of the popup in the wrong position.

---

## 6. Outside-Click Handling

```typescript
useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
        if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
}, [open]);
```

The entire component (trigger + popup) shares one `wrapRef`. Clicking anywhere inside — trigger, popup, calendars, preset buttons — does not close the popup. Only clicks outside the wrapper close it (discarding pending changes).

---

## 7. Presets (11 entries)

All computed at click time relative to `new Date()` (today):

| Label | Range |
|-------|-------|
| Hôm nay | today → today |
| Hôm qua | yesterday → yesterday |
| Hôm kia | 2 days ago → 2 days ago |
| Tuần nay | Monday of current week → today |
| Tuần trước | Monday of last week → Sunday of last week |
| Tháng này | 1st of current month → today |
| Tháng trước | 1st of last month → last day of last month |
| 3 tháng | 1st of month 3 months ago → today |
| 6 tháng | 1st of month 6 months ago → today |
| 9 tháng | 1st of month 9 months ago → today |
| 12 tháng | 1st of month 12 months ago → today |

Week starts on **Monday** (Vietnamese convention). `monOfWeek` converts Sunday (DOW 0) to the previous Monday.

Active preset is highlighted in blue (`bg-blue-100 text-blue-700 font-semibold`) if `startDate === presetStart && endDate === presetEnd`.

---

## 8. Date Utilities (`filterDateUtils.ts`)

```typescript
parseLocalDate(dateStr: string): Date | null
// "yyyy-mm-dd" → local Date. Does NOT use Date constructor string parsing
// (avoids UTC timezone shift). Returns null for empty string.

formatLocalDate(date: Date | null): string
// Date → "yyyy-mm-dd". Returns "" for null.
```

**Critical**: Never use `new Date("yyyy-mm-dd")` directly — this parses as UTC midnight and causes -1 day bugs in UTC+7. Always go through these helpers.

---

## 9. Display Format

Dates are displayed to users as **dd-mm-yyyy** throughout:
- Trigger text: `"01-04-2026 - 30-04-2026"`
- Typed inputs: placeholder `"dd-mm-yyyy"`, display synced to this format
- Internal state and props are always **yyyy-mm-dd** (ISO)

Conversion functions defined locally:
```typescript
fmtDisplay(s: string): string   // "yyyy-mm-dd" → "dd-mm-yyyy"
parseDMY(raw: string): string   // "dd-mm-yyyy" → "yyyy-mm-dd" or ""
                                // Rejects years outside 2000–2099
```

---

## 10. Usage Patterns

### Minimal (no label)
```tsx
<DateRangePickerPopup
    startDate={startDate}
    endDate={endDate}
    onStartDateChange={setStartDate}
    onEndDateChange={setEndDate}
/>
```

### With label + minDate (for height alignment in filter bars)
```tsx
<div className="relative">
    <DateRangePickerPopup
        label="Ngày"
        startDate={fromDate}
        endDate={toDate}
        onStartDateChange={v => setFromDate(v || LEDGER_START_DATE)}
        onEndDateChange={setToDate}
        minDate={LEDGER_START_DATE}
    />
</div>
```

### Override width (wider trigger)
```tsx
<DateRangePickerPopup
    label="Ngày"
    startDate={startDate}
    endDate={endDate}
    onStartDateChange={setStart}
    onEndDateChange={setEnd}
    maxWidth={420}
/>
```

### Full-width trigger (e.g. standalone form field)
```tsx
<DateRangePickerPopup
    startDate={startDate}
    endDate={endDate}
    onStartDateChange={setStart}
    onEndDateChange={setEnd}
    maxWidth={undefined}
    className="w-full"
/>
```

---

## 11. Filter Bar Integration Rules

All filter rows must use `flex flex-wrap gap-3 items-end` (NOT grid with `col-span`):

```tsx
<div className="flex flex-wrap gap-3 items-end">
    <FilterSearchInput ... />
    <FilterMultiSelect ... />
    <div className="relative">
        <DateRangePickerPopup label="Ngày" ... />
    </div>
    <FilterSingleSelect ... />
</div>
```

**Why not grid?** Grid `col-span-2` was the source of the original whitespace bug — the column was wider than `maxWidth`, leaving an empty gap. Flex-wrap lets each item take its natural width and wraps gracefully.

**Min-widths on filter siblings** (set globally in their components):
- `FilterSearchInput`: `min-w-[160px]`
- `FilterMultiSelect`: `min-w-[140px]`
- `FilterSingleSelect`: `min-w-[120px]`

These prevent flex from squishing siblings when many filters appear on one row.

---

## 12. File Location & Exports

```
frontend/src/shared/components/filters/
├── DateRangePickerPopup.tsx      ← named export: DateRangePickerPopup
├── filterDateUtils.ts            ← named exports: parseLocalDate, formatLocalDate
├── FilterBar.tsx                 ← context provider wrapping filter rows
├── FilterMultiSelect.tsx
├── FilterSingleSelect.tsx
├── FilterSearchInput.tsx
└── DateRangePresets.tsx          ← (legacy, not used by DateRangePickerPopup)
```

All filter components are re-exported from the filters index:
```typescript
import { DateRangePickerPopup, FilterBar, FilterMultiSelect, ... }
    from '../../shared/components/filters';
```

---

## 13. Pages Using This Component

| Route | File | Notes |
|-------|------|-------|
| `/ledger/data` | `features/ledger/LedgerDataTab.tsx` | `minDate=LEDGER_START_DATE` |
| `/ledger/report` | `features/ledger/LedgerReportTab.tsx` | `minDate=LEDGER_START_DATE` |
| `/balance/transactions` | `features/balance-summary/components/BalanceFilters.tsx` | No minDate |
| `/cashflow/reconciliation` | `features/cashflow/CashFlowOutPage.tsx` | `minDate=HARD_MIN` |
| `/approval/productdevelopmentreport` | `features/approval-summary/ProductDevReportPage.tsx` | No minDate |
| `/approval/productapprovalreport` | `features/approval-summary/ProductApprovalReportPage.tsx` | No minDate |
| `/report` | `features/report/components/ReportExpenseFilters.tsx` | No minDate |
| `/dashboard/*` | `features/dashboard/components/DashboardFilters.tsx` | No minDate |

---

## 14. Known Constraints & Gotchas

- **`FilterDatePicker` is legacy** — do NOT use it in new feature pages. It is kept only for reference.
- **`Date` UTC trap** — never parse `"yyyy-mm-dd"` with `new Date(str)` directly. Always use `parseLocalDate()`.
- **Right-calendar independence** — if you navigate the right calendar to a month, the left calendar shifts to `right - 1`. They are never independent. If you need fully independent calendars you'd need to refactor `setLeftNav`/`handleRightMonthYear`.
- **Popup z-index** — popup is `z-50`. If a parent has `position: relative` with a lower z-index context, the popup may be clipped. The `wrapRef` root div must not have `overflow: hidden`.
- **Year range in selects** — the year select shows `current year ± 5` (11 years). If users need dates outside this range (e.g. historical data pre-2021), increase the range in `MiniCal`:
  ```tsx
  const yearRange = Array.from({ length: 21 }, (_, i) => year - 10 + i);
  ```
- **Two-click selection** — if a user picks a start date and then clicks outside without picking an end, `picking` resets to `false` but `iStart`/`iEnd` are discarded (not applied). External state is unchanged.

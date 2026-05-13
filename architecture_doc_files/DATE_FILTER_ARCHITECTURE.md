# Date Filter Architecture

Two distinct date picker implementations exist. They serve different use cases and should not be confused.

---

## Component 1 — `FilterDatePicker` (primary, used everywhere)

**File:** `frontend/src/shared/components/filters/FilterDatePicker.tsx`

### What it is

Thin wrapper around `react-datepicker` with:
- Vietnamese locale injected via `date-fns/locale`
- Compact CSS for filter bar use
- String-based API (`"YYYY-MM-DD"` in/out — not `Date` objects)

### Vietnamese locale customization

`date-fns` ships a `vi` locale but its day/month labels need overriding for the short compact format used in filter bars:

```ts
import { vi } from 'date-fns/locale';

const customVi = {
    ...vi,
    localize: {
        ...vi.localize,
        day:   (n: number) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][n],
        month: (n: number) => `Tháng ${n + 1}`,
    },
};
registerLocale('vi', customVi as any);
```

- `day` — Sunday=0 maps to `'CN'` (Chủ nhật), Monday=1 maps to `'T2'` (Thứ 2), etc.
- `month` — zero-indexed, so `n + 1` gives `"Tháng 1"` through `"Tháng 12"`
- `registerLocale('vi', ...)` — called once at module load, applies to all `<DatePicker locale="vi" />` in the app

### Date format displayed to user

```
dd-MM-yyyy   →   e.g. 25-03-2024
```

This matches Vietnamese convention (day first, not month first).

### String ↔ Date conversion — `filterDateUtils.ts`

**File:** `frontend/src/shared/components/filters/filterDateUtils.ts`

All date state is stored as `"YYYY-MM-DD"` strings (easy to pass as API query params). Two util functions handle conversion:

```ts
// String → Date (for react-datepicker's `selected` prop)
export function parseLocalDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);   // month is 0-indexed in Date constructor
}

// Date → String (from react-datepicker's onChange)
export function formatLocalDate(date: Date | null): string {
    if (!date) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
```

**Why manual parsing instead of `date-fns/format`?**
Avoids timezone bugs. `new Date(y, m-1, d)` creates a local-time Date — no UTC offset shift that `new Date("2024-03-25")` (ISO string parsing) causes.

### Props API

```ts
interface FilterDatePickerProps {
    label: string;           // shown above input
    value: string;           // "YYYY-MM-DD" or ""
    onChange: (v: string) => void;
    placeholder?: string;
    minDate?: string;        // "YYYY-MM-DD" lower bound
    maxDate?: string;        // "YYYY-MM-DD" upper bound
    isClearable?: boolean;   // default true — shows ✕ button
    isLoading?: boolean;     // disables picker while data loads
    labelClassName?: string;
    className?: string;      // wrapper div
    wrapperClassName?: string; // forwarded to DatePicker (default "w-full")
}
```

### Features enabled

```tsx
<DatePicker
    showMonthDropdown    // month is a <select>, not arrow navigation
    showYearDropdown     // year is a <select>
    dropdownMode="select"
    isClearable={isClearable}
    locale="vi"
    dateFormat="dd-MM-yyyy"
/>
```

`dropdownMode="select"` is important — without it, year/month navigation is arrow-only, which is slow for ranges spanning years.

### Minimal usage

```tsx
import { FilterDatePicker } from '../../../shared/components/filters';

const [startDate, setStartDate] = useState(''); // "YYYY-MM-DD" or ""

<FilterDatePicker
    label="Từ ngày"
    value={startDate}
    onChange={setStartDate}
/>
```

### Date range pattern (two pickers side by side)

Used on every filter bar that has date range filtering:

```tsx
<div className="relative">
    <label className="block text-[10px] font-medium text-on-surface-var mb-0.5">
        Ngày chi tiền
    </label>
    <div className="flex items-center gap-1">
        <FilterDatePicker
            label=""
            value={startDate}
            onChange={setStartDate}
            placeholder="Từ ngày"
            wrapperClassName="flex-1"
            className="flex-1"
        />
        <span className="text-on-surface-var">-</span>
        <FilterDatePicker
            label=""
            value={endDate}
            onChange={setEndDate}
            placeholder="Đến ngày"
            wrapperClassName="flex-1"
            className="flex-1"
        />
    </div>
</div>
```

Pattern: outer label names the field, two pickers share the row with a `"-"` separator, both `label=""` so no duplicate label renders inside each picker.

---

## Component 2 — `DateRangePicker` (standalone, not used in filter bars)

**File:** `frontend/src/components/ui/DateRangePicker.tsx`

### What it is

Custom-built dual-calendar date range picker. No `react-datepicker` dependency — renders its own calendar grid using `date-fns` utilities.

**Not Vietnamese-localized.** Day headers are English (`Mon Tue Wed ...`), display format is `MMM d, yyyy` (e.g. `Mar 25, 2024`).

### When to use vs. `FilterDatePicker`

| | `FilterDatePicker` | `DateRangePicker` |
|---|---|---|
| Vietnamese UI | Yes | No |
| API | `string` (`YYYY-MM-DD`) | `Date \| null` objects |
| Layout | Compact, filter bar | Popover, standalone |
| Preset ranges | No | Yes (Today / This Week / This Month / Last Month / Last 3 Months / This Year) |
| Year/month nav | Dropdown select | Arrow buttons only |
| Two calendars | No (use two instances) | Yes (built-in side-by-side) |

### Props API

```ts
interface DateRangePickerProps {
    dateFrom: Date | null;
    dateTo:   Date | null;
    onDateChange: (from: Date | null, to: Date | null) => void;
}
```

### Selection logic

Click 1 → sets `internalFrom`, clears `internalTo`.
Click 2 → sets `internalTo`. If second click is before first, swaps them automatically.
**Apply** button required to commit — changes are not live until Apply is clicked.

### Calendar grid construction

```ts
const monthStart    = startOfMonth(month);
const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
const calendarEnd   = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
const days          = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
```

Week starts Monday. Days outside current month are rendered grayed-out and disabled.

### Preset ranges

```
today          → today → today
thisWeek       → startOfWeek(today, {weekStartsOn:1}) → today
thisMonth      → startOfMonth(today) → today
lastMonth      → startOfMonth(lastMonth) → endOfMonth(lastMonth)
last3Months    → startOfMonth(today - 2 months) → today
thisYear       → Jan 1 of current year → today
```

---

## Where Each Component Is Used

`FilterDatePicker` is used in 11 filter components across the app:

- `ApprovalSummaryFilters` — date range for payment date
- `DashboardFilters`
- `BalanceFilters`
- `ReportExpenseFilters`
- `CashFlowOutPage`
- `LedgerDataTab`, `LedgerReportTab`
- `ProductDevelopmentPage`, `ProductDevReportPage`, `ProductApprovalReportPage`

`DateRangePicker` is in `frontend/src/components/ui/` — the generic UI layer, available for standalone use but not currently wired into any filter bar.

---

## FilterBar Context (one-open-at-a-time)

**File:** `frontend/src/shared/components/filters/FilterBar.tsx`

`FilterDatePicker` is placed inside `<FilterBar>` alongside dropdowns. `FilterBar` provides a context that closes all other dropdowns when one opens. `FilterDatePicker` itself doesn't hook into this context — `react-datepicker` manages its own open/close. The `FilterBar` mousedown handler closes everything if the click lands outside any `[data-filter-item]` element.

---

## Dependency Summary

```
react-datepicker      — calendar UI, locale support
date-fns              — date math (startOfMonth, addMonths, etc.)
date-fns/locale (vi)  — base Vietnamese locale, customized in FilterDatePicker.tsx
```

No other date library. No moment.js. No dayjs.

---

## Copy-Paste Checklist for Another Project

1. Copy `FilterDatePicker.tsx` and `filterDateUtils.ts`
2. Install: `npm install react-datepicker date-fns`
3. Import CSS: `import 'react-datepicker/dist/react-datepicker.css'`
4. The `registerLocale` call inside `FilterDatePicker.tsx` fires on first import — no manual setup needed
5. Store dates as `"YYYY-MM-DD"` strings in state, pass directly to API query params
6. Use `parseLocalDate` / `formatLocalDate` if you need to do any `date-fns` math on the values

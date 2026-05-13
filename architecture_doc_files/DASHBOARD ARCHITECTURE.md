# Dashboard Architecture

## Overview

Dashboard is one tab in the app (`/dashboard`). It has 5 subtabs, each lazy-loaded. All subtabs share a single filter state that lives in `DashboardPage` — switching subtabs does not reset filters.

**Zero charting libraries.** Every chart is hand-drawn SVG. No Recharts, no Chart.js, no D3.

---

## File Structure

```
features/dashboard/
  DashboardPage.tsx              — subtab router, shared filter state
  components/
    DashboardFilters.tsx          — filter bar (dates, depots, business types)
    DashboardChart.tsx            — reusable SVG line chart component
    DashboardKPICard.tsx          — single KPI display card
    DashboardTable.tsx            — generic sortable table
    PLStructureEditor.tsx         — config modal for PL row structure
    PLStructureTableBody.tsx      — renders editable PL tree
    FilterMultiSelect.tsx         — dashboard-specific multi-select
  tabs/
    OverviewTab.tsx               — KPI cards, donut, line chart, bar chart, tables
    RevenueFlowTab.tsx            — combo bar+line chart, stacked area chart
    ExpenseDetailsTab.tsx         — expense category pie + bar chart
    PLTableTab.tsx                — P&L pivot table with collapsible rows
    PLTableByTimeTab.tsx          — P&L table sliced by time period
    overview/
      OverviewDepotTable.tsx      — sortable depot summary table
      OverviewProfitChart.tsx     — profit margin SVG line chart + async tooltip
    revenue/
      RevenueComboChart.tsx       — grouped bar + line overlay SVG chart
      RevenueStackedArea.tsx      — stacked percentage area SVG chart
      revenueUtils.ts             — shared formatters, useContainerWidth hook
    expense/
      ExpenseCategoryChart.tsx    — pie + horizontal bar chart
      ExpenseDetailTable.tsx      — expense detail table
    pl-table/
      PLTableTypes.ts             — shared types (PLRow, ColumnDef, etc.)
      PLTableHeader.tsx           — sticky column headers
      PLTableBody.tsx             — row rendering with collapse/expand
      PLTableTooltip.tsx          — cell hover tooltip
      PLTableTooltip.tsx          — tooltip component
      usePLTableTooltip.ts        — tooltip state hook
    pl-table-bytime/
      PLTableByTimeTable.tsx      — time-sliced variant of PL table
      PLTableByTimeTooltip.tsx    — tooltip for time variant
```

---

## Shared Filter State

`DashboardPage` owns all filter state. Every subtab receives the same `filterProps` object:

```ts
{
  startDate, endDate,
  selectedDepots, selectedBusinessTypes,
  viewBy,                          // 'day' | 'week' | 'month'
  onStartDateChange, onEndDateChange,
  onDepotsChange, onBusinessTypesChange,
  onViewByChange,
}
```

Each subtab renders its own `<DashboardFilters />` bar using these props — same filter values, same callbacks. Changing a filter in one subtab reflects in all others because state is in the parent.

---

## Data Loading Pattern

All subtabs follow the same two-phase load:

**Phase 1 — Cache check**
```
query: ['dashboard', 'cache']
→ GET cache status
→ if not loaded: POST loadCache, then re-check status
→ staleTime: 30s
```

**Phase 2 — Data fetch** (enabled only after cache is ready)
```
query: ['dashboard', <subtab>, ...filterParams]
→ fetch data with active filters
→ dependent on Phase 1 completing
```

If the cache returns a 400 on data fetch, the client retries cache load. This handles the race between cache expiry and an in-progress ETL.

Filter values are joined with `|||` as separator when multiple are selected:
```ts
depot: selectedDepots.join('|||')   // backend splits on |||
```

---

## Chart Architecture — All SVG, No Library

All charts are hand-drawn SVG elements. No external charting library is used anywhere in the dashboard.

### Why SVG directly

Full control over layout, label density, and tooltip triggers. Libraries like Recharts impose DOM structure that makes custom interactive behavior harder. The custom label-density algorithm (see below) would not be possible in most chart libraries.

---

## Chart Types

### 1 — Line Chart (smooth spline)

Used in: profit margin trend, revenue combo chart overlay.

**Path construction** — cubic Bezier spline using Catmull-Rom tension (`t = 0.3`):
```
For each segment i → i+1:
  control points derived from p[i-1], p[i], p[i+1], p[i+2]
  C x1,y1 x2,y2 x,y
```

**Y axis** — manually computed from `[minValue, maxValue]` of data. Three horizontal gridlines at min/mid/max.

**Hit areas** — invisible `<rect>` elements wider than the visible points capture hover. This makes hovering forgiving (no pixel-perfect aim required).

---

### 2 — Grouped Bar Chart (combo)

Used in: Revenue tab (`RevenueComboChart`).

Two bars per period (green = gross profit, red = total expense) plus a profit margin line overlaid on a secondary Y axis. Both axes are computed independently — bars use the left scale, line uses a mapped range within the same coordinate space.

Negative values supported — zero line computed and drawn as a dashed reference.

---

### 3 — Stacked Area Chart (percentage)

Used in: Revenue tab (`RevenueStackedArea`).

100% stacked — each column sums to 100%. Slices stored as `[start%, end%]` per type per period. Drawn as SVG `<path>` polygons (top edge + reversed bottom edge + close).

Render order is hardcoded so the most important business types appear consistently:
```
['Bán lẻ', 'Khác', 'TMĐT', 'Bán buôn vải', 'Bán buôn thời trang nam']
```

---

### 4 — Donut Chart (SVG stroke trick)

Used in: Overview tab (profit by business type).

Not a `<path>` — uses SVG `<circle>` with `strokeDasharray` + `strokeDashoffset`:
```
circumference = 2πr = 2 * 3.14 * 38 ≈ 238.76
each segment: strokeDasharray = `${pct * 2.51} ${100 * 2.51}`
offset = accumulated previous segments
```
`-rotate-90` transform on the SVG makes 12 o'clock the starting point.

---

### 5 — Pie Chart

Used in: Expense Details tab (`ExpenseCategoryChart`).

Standard `M 50 50 L x1 y1 A R R 0 largeArc 1 x2 y2 Z` arc paths. Special case: if a single slice covers ≥99.9% it renders as a `<circle>` (arc path becomes degenerate at 360°).

Labels outside the pie at radius 60 (vs chart radius 50). Only rendered when slice > 2% to avoid crowding.

---

### 6 — Horizontal Bar (inline)

Used in: expense breakdown lists, expense category sidebar.

Pure CSS div, no SVG:
```tsx
<div className="h-4 bg-gray-100 rounded overflow-hidden">
  <div style={{ width: `${pct}%`, backgroundColor: color }} />
</div>
```
Width normalized to `maxPercent` in the visible set (not absolute 100%), so the longest bar always fills the container.

---

### 7 — P&L Pivot Table

Used in: PLTable tab, PLTableByTime tab.

Not a chart — a hierarchical table with:
- Collapsible row groups (parent/child rows, `Set<string>` tracks collapsed state)
- Sticky column headers
- Duplicate sticky scrollbar at bottom (synced with table scroll via ref)
- Cell-level hover tooltip showing breakdown data
- Configurable row structure via `PLStructureEditor` modal (saved to backend)
- Excel export with styled output via `excelUtils`

---

## Label Density Algorithm

Every chart has a label-overflow problem: if every data point gets a label, they overlap. Custom algorithm used consistently across all charts:

```
computeVisibleLabels(getText, getX):
  iterate left → right
  show label only if its left edge clears the previous label's right edge + padding
  force-show the last label always (override previous if needed)
```

This runs at render time based on actual pixel positions — no static "show every Nth" sampling. Works correctly when zooming, resizing, or switching between day/week/month views.

---

## Responsive Width

Charts that need pixel-accurate layout (bar width, spacing) use a `useContainerWidth` hook:

```ts
// revenueUtils.ts
const useContainerWidth = (ref) => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return width;
}
```

SVG renders only after `width > 0`. This prevents a flash of zero-size chart on mount.

---

## Tooltip Pattern in Charts

Charts use the same hover-delay pattern as the product page tooltips (see TOOLTIP_ARCHITECTURE.md):

- `hoveredIndex` state in the chart component
- 200ms debounce timeout on mouseleave
- Timeout cancelled on mouseenter (row or tooltip)
- Some chart tooltips fetch additional data on hover (e.g., `OverviewProfitChart` fetches expense breakdown for hovered period via React Query, keyed by `period_start/period_end`)

---

## Color Palette

Two palettes exist. Both are hardcoded arrays — no dynamic color generation.

**Standard palette** (10 colors, used in most charts):
```ts
['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5',
 '#70AD47', '#9E480E', '#7030A0', '#C00000', '#00B0F0']
```

**Extended palette** (40 colors, used in expense category charts with many categories):
Extends the standard 10 with lighter/muted variants.

Both cycle with `idx % palette.length` for unlimited categories.

---

## View Mode (`viewMode`)

`viewMode` (`'summary' | 'detail'`) is passed from `AppContent` → `DashboardPage` → subtabs. Controls level of detail in tables (parent rows only vs all rows). Controlled by the Cha/Con toggle in the global header.

---

## Dependencies

| Purpose | Tool |
|---|---|
| Data fetching + caching | `@tanstack/react-query` |
| Charts | Raw SVG (no library) |
| Responsive sizing | Custom `ResizeObserver` hook |
| Excel export | Custom `excelUtils` (likely `xlsx` or `exceljs` under the hood) |
| Icons | `lucide-react` (Settings, AlertTriangle, Download) |
| Date handling | `date-fns` (via shared filter utils) |

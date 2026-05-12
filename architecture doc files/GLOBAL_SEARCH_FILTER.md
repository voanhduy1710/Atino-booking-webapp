# Global Search & Filter Architecture — Approval Page

## Overview

Keyword search on the approval page is a **full-stack feature**: debounced input on the frontend → SQL `LIKE` query on backend → Supabase/Postgres with a GIN trigram index. Filters (dropdowns, dates) follow the same path but without the index complexity.

---

## Frontend — Input Layer

**Component:** `FilterSearchInput` (`shared/components/filters/FilterSearchInput.tsx`)

Plain controlled `<input type="text">`. No internal debounce — fires `onChange` on every keystroke. Clear button (`✕`) appears when value is non-empty.

**Debounce lives in the page** (`ApprovalSummaryPage`):

```ts
const [searchInput, setSearchInput]       = useState('');   // raw, immediate
const [debouncedSearch, setDebouncedSearch] = useState(''); // delayed, sent to API

useEffect(() => {
    const t = setTimeout(() => {
        setDebouncedSearch(searchInput);
        setPage(1);            // reset to page 1 on new search
    }, 300);
    return () => clearTimeout(t);
}, [searchInput]);
```

`searchInput` drives the input's displayed value — instant, no lag.  
`debouncedSearch` drives the API query — fires 300ms after the user stops typing.

Keeping two variables (not one debounced state) lets the input feel responsive while the network call is batched.

---

## Frontend — Query Layer

`debouncedSearch` is included in the React Query key:

```ts
queryKey: ['approval', 'summary', page, pageSize, debouncedSearch, ...otherFilters]
```

Every unique combination of search + filters + page gets its own cache entry. Typing the same term twice hits the cache — no second network round-trip.

`placeholderData: (prev) => prev` keeps the previous page visible while the new query loads (no blank flash between keystrokes).

Search is sent to the API as the `search` param:
```ts
approvalApi.getSummary({ search: debouncedSearch || undefined, ... })
```
Empty string → `undefined` → param omitted → backend skips search logic entirely.

---

## Frontend — Display Feedback

`hasActiveSearch` flag = `debouncedSearch.trim().length > 0`.

When true, the filter bar shows a text indicator:
```
Đang tìm: "keyword"
```
Multi-word searches also show token breakdown:
```
Đang tìm: "nguyen van" ("nguyen" VÀ "van")
```
This tells the user the search is AND logic across tokens.

---

## Backend — Query Building

**File:** `backend/app/features/approval/queries.py` → `_build_where()`

Search string arrives as a single string. Backend splits on whitespace into tokens — each token must match independently (AND logic):

```python
terms = [t.strip() for t in search.split() if t.strip()]
# "nguyen van a" → ['nguyen', 'van', 'a']
```

For each token, conditions are built across two column groups then OR'd:

### Group 1 — Text columns (via `search_text`)

```sql
search_text LIKE '%{term_lowercased}%'
```

`search_text` is a generated column (see Database section below). One condition replaces what was previously 15 separate `LOWER(col) LIKE` conditions.

### Group 2 — Money columns

Money values are numeric. Search term has dots stripped (user may type `1.000.000`), then matched against string-cast values:

```python
tnodot = tlow.replace('.', '')   # "1.000.000" → "1000000"

for col in ['money1','money2','money1_cty','money2_cty','money3_cty']:
    COALESCE(CAST(CAST({col} AS BIGINT) AS VARCHAR), '') LIKE '%{tnodot}%'
```

### Group 3 — Date columns (special-cased)

Dates are detected by regex before building conditions:

```python
# Full date: "25-03-2024" → converted to ISO "2024-03-25" → exact match
re.match(r'^(\d{1,2})-(\d{1,2})-(\d{4})$', term)
→ date1 = '2024-03-25'

# Partial date: "25-03" → day+month without year → LIKE match
re.match(r'^(\d{1,2})-(\d{1,2})$', term)
→ date1 LIKE '%-03-25'
```

### Final WHERE clause assembly

```
WHERE
  (term1_condition) AND
  (term2_condition) AND
  ...other filters...
```

Each token's conditions (text OR money OR date) are grouped with `OR`. Tokens are combined with `AND`. Result: multi-word search requires all words to match somewhere in the row.

---

## Database — `search_text` Generated Column

**File:** `Z_scripts/sql/add_search_text_index.sql`

A `STORED` generated column on the `tong_hop_approval` table in Supabase/Postgres:

```sql
ALTER TABLE tong_hop_approval
ADD COLUMN search_text TEXT GENERATED ALWAYS AS (
    LOWER(
        COALESCE(request_no,          '') || ' ' ||
        COALESCE(serial_no,           '') || ' ' ||
        COALESCE(co_so_kinh_doanh,    '') || ' ' ||
        COALESCE(khoan_muc_phi,       '') || ' ' ||
        COALESCE(ten_san_pham,        '') || ' ' ||
        COALESCE(nguoi_thu_huong,     '') || ' ' ||
        COALESCE(ly_do_de_xuat,       '') || ' ' ||
        COALESCE(hang_muc_dau_tu,     '') || ' ' ||
        COALESCE(hang_muc_dau_tu_cha, '') || ' ' ||
        COALESCE(nha_cung_cap,        '') || ' ' ||
        COALESCE(record_id,           '')
    )
) STORED;
```

- `GENERATED ALWAYS AS ... STORED` — value computed and written at INSERT/UPDATE time. No cost at read time.
- All searchable text fields concatenated with spaces, pre-lowercased. No LOWER() needed at query time.
- `NULL` fields handled with `COALESCE(..., '')`.

### GIN Trigram Index

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_tong_hop_approval_search_trgm
ON tong_hop_approval USING GIN (search_text gin_trgm_ops);
```

`pg_trgm` breaks text into 3-character n-grams. The GIN index stores all trigrams for all rows. A `LIKE '%keyword%'` query breaks `keyword` into its trigrams, looks them up in the index, and intersects — dramatically faster than a sequential scan.

**Before this index:** every search did a full table scan with 15 separate `LOWER(col) LIKE` comparisons per row.  
**After:** single indexed column lookup. Expected speedup: 10–100x on large tables.

---

## Filter Params (non-search dropdowns)

Multi-select filters serialize selected values with `|||` as separator:

```ts
co_so_kinh_doanh: selectedValues.join('|||')   // "Hà Nội|||HCM"
```

Backend splits on `|||` and builds `IN (...)` clauses:

```python
vals = [v.strip() for v in param.split('|||') if v.strip()]
in_list = ', '.join(["'" + v.replace("'","''") + "'" for v in vals])
cond = f"{col} IN ({in_list})"
```

In `summary` view mode, multi-select filters use a subquery to group by `request_no` (a request can have multiple rows with different values — the filter should show the whole request if any row matches):

```sql
request_no IN (SELECT DISTINCT request_no FROM base_table WHERE col IN (...))
```

In `detail` view mode: direct `col IN (...)`.

If all options are selected (`selectedValues.length >= allOptions.length`), the frontend treats it as "no filter" and omits the param. Backend receives `undefined` → condition skipped.

---

## Full Data Flow

```
User types "nguyen van"
  → searchInput = "nguyen van"                   [instant]
  → 300ms debounce timer starts

300ms passes without another keystroke
  → debouncedSearch = "nguyen van"
  → page reset to 1
  → React Query fires: GET /api/approval/summary?search=nguyen+van&...

Backend receives search="nguyen van"
  → split → ['nguyen', 'van']
  → per token: search_text LIKE '%nguyen%' OR money_cols...
             AND search_text LIKE '%van%' OR money_cols...
  → GIN index used for search_text LIKE conditions
  → paginated results returned (limit/offset)

React Query caches response under key [..., "nguyen van", ...]
  → table renders filtered rows
  → filter bar shows: Đang tìm: "nguyen van" ("nguyen" VÀ "van")
```

---

## What Is NOT Searched

- Money columns: not in `search_text`, handled separately with dot-stripped CAST logic
- Date columns: not in `search_text`, handled separately with regex detection
- All other numeric/boolean columns: not searchable
- Columns not listed in the `search_text` concatenation: not searchable (adding a new searchable column requires altering the generated column definition)

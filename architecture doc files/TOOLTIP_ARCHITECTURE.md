# Tooltip Architecture — Product Pages

Both product pages share the same tooltip state machine and interaction model. The approval page adds extra complexity (image fetching, lightbox). Documented as a reusable pattern.

---

## Two Modes: Hover vs. Pinned

The tooltip has two distinct states:

| State | Trigger | Dismissed by |
|---|---|---|
| **Hover** | Mouse enters table row | Mouse leaves row OR tooltip (with 200-300ms delay) |
| **Pinned** | Click on row | Esc key, click outside tooltip, or row click on different row |

Pinned mode blocks all hover logic — entering/leaving rows does nothing while pinned.

---

## State (in page component)

```
tooltipRow        { row, x, y }  |  null
isTooltipPinned   boolean
tooltipHideTimeoutRef             debounce timer ref
tooltipRef                        ref to tooltip DOM element
```

`tooltipRow` holds the data to display **and** the pixel position to render at. Setting it to `null` hides the tooltip. Position is computed once when the row event fires and never recalculated.

---

## Position Calculation

Position is taken from the triggering row's `getBoundingClientRect()`:

```
x = row.right + 8     (tooltip appears to the right of the row)
y = row.top
```

The tooltip component clamps both values to stay within the viewport:

```
left = max(4, min(x, windowWidth - tooltipWidth - 4))
top  = max(4, min(y, windowHeight - estimatedHeight))
```

Result: tooltip always starts at the right edge of the hovered row, never clips off-screen.

---

## Hover Flow

```
row mouseenter
  → if pinned: do nothing
  → cancel any pending hide timer
  → setTooltipRow({ row, x, y })        ← shows tooltip

row mouseleave
  → if pinned: do nothing
  → start 200ms hide timer → setTooltipRow(null)

tooltip mouseenter
  → cancel pending hide timer            ← user moved mouse onto tooltip

tooltip mouseleave
  → if pinned: do nothing
  → start 200ms hide timer → setTooltipRow(null)
```

The timer gap lets the user move from row → tooltip without the tooltip vanishing. Without it, the brief moment the cursor is between the row and tooltip would trigger hide.

---

## Pinned Flow

```
row click
  → cancel pending hide timer
  → setTooltipRow({ row, x, y })
  → setIsTooltipPinned(true)

  [useEffect watches isTooltipPinned]
  → add document mousedown listener
      → if click target is outside tooltipRef.current:
          setTooltipRow(null), setIsTooltipPinned(false)
  → add document keydown listener
      → Esc: setTooltipRow(null), setIsTooltipPinned(false)

  [listeners removed on cleanup / next pin cycle]
```

The `mousedown` listener is added with a 0ms `setTimeout` delay. This prevents the same click that triggered pin from immediately firing the "click outside → close" handler.

---

## Tooltip Component Interface

```ts
{
  tooltipRow:      { row, x, y } | null
  isTooltipPinned: boolean
  tooltipRef:      React.RefObject<HTMLDivElement>   // parent holds the ref
  onMouseEnter:    () => void                        // cancel hide timer
  onMouseLeave:    () => void                        // start hide timer
}
```

Parent owns all state. Tooltip is pure display — receives data and position, emits mouse events upward. `tooltipRef` is also owned by the parent so the pinned click-outside handler can check containment without the tooltip managing its own outside-click logic.

---

## Simple Variant (text-only)

One page uses a tooltip that only shows structured text fields — no async data, no images. Implementation is minimal:

- Static list of `{ label, value }` pairs rendered as key/value rows
- Width constant (260px)
- `isTooltipPinned` controls a footer hint ("press Esc to close")
- No internal state — fully controlled by parent

---

## Extended Variant (images + lightbox)

The other page adds three layers on top:

### 1 — Async Image Loading

Certain fields in the row data contain URLs pointing to an external file storage system. These URLs expire quickly (~10 min). When the tooltip renders for a row, it fires a query to fetch fresh CDN URLs for that row's images. The query is keyed by row identifier so results cache for 8 minutes.

Each image slot:
- Shows a spinner while loading
- Shows a clickable thumbnail on success
- Falls back to a plain hyperlink on error

### 2 — Image Lightbox

Clicking any thumbnail opens a full-screen lightbox overlay (`position: fixed, z-index: 9999`, backdrop blur). The lightbox renders outside the tooltip in the React tree (sibling `<>` fragment) so z-index stacking is clean.

Lightbox close triggers:
- Click backdrop
- Click ✕ button
- Esc key — handled in **capture phase** so it fires before the page's bubble-phase Esc handler (which would also close the pin). `stopPropagation()` prevents the pin from closing on the same keypress.

### 3 — Pin-before-lightbox

Opening the lightbox from inside the tooltip triggers `onPinTooltip()` first. Without this, the full-screen backdrop would cover the tooltip's bounds, the tooltip's mouseleave timer would fire, and the tooltip (parent of the lightbox state) would unmount — killing the lightbox.

This is also why the pinned click-outside handler checks for a `[data-lightbox-root]` attribute on the backdrop before closing the tooltip:

```
if (document.querySelector('[data-lightbox-root]')) return;   // lightbox open → ignore
```

### 4 — Lightbox state lifecycle

The tooltip component is never unmounted — it returns `null` when `tooltipRow` is null but stays mounted. This keeps the query cache alive across row switches.

Side effect: lightbox state (`useState`) persists across row changes. A `ref`-based comparison resets the lightbox whenever the active row changes:

```
if (prevRequestNo !== currentRequestNo) {
    prevRequestNo = currentRequestNo
    if (lightbox !== null) setLightbox(null)
}
```

This runs during render (before commit), not in a `useEffect`, so the reset is synchronous with the row switch.

---

## Summary: What Makes This Work

| Problem | Solution |
|---|---|
| Tooltip vanishes when cursor crosses gap between row and tooltip | 200ms hide timer, cancelled if cursor enters tooltip |
| Tooltip closes when user opens image lightbox | Pin before lightbox open; check `[data-lightbox-root]` in outside-click handler |
| Esc closes both lightbox and pin simultaneously | Lightbox listens in capture phase + stopPropagation |
| CDN image URLs expire | Query re-fetches fresh URLs per row, 8-min stale time |
| Stale lightbox state after row switch | Synchronous ref comparison resets state mid-render |
| Click-outside listener fires on same click that opened pin | `setTimeout(0)` delays listener registration |

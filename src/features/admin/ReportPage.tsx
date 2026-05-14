/**
 * ReportPage — Báo cáo tổng hợp
 * Shared between /admin/report and /manager/report
 * SVG-only charts, no external charting library (same pattern as DASHBOARD ARCHITECTURE.md)
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { DateRangePickerPopup } from '@/shared/components/filters'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { Navbar } from '@/shared/components/Navbar'
import { getCurrentUser } from '@/shared/lib/auth'
import { ROLE_TABS } from '@/shared/config/navTabs'
import { type BookingStatus } from '@/shared/types/domain'
import { countBookingItemStatuses, deriveBookingStatus } from '@/shared/lib/bookingStatus'

// ── Color palette (same standard 10 from DASHBOARD ARCHITECTURE.md) ──────────
const PALETTE = [
  '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5',
  '#70AD47', '#9E480E', '#7030A0', '#C00000', '#00B0F0',
]

const STATUS_COLORS: Record<BookingStatus | string, string> = {
  pending:   '#FFC000',
  partially_approved: '#5B9BD5',
  partially_rejected: '#ED7D31',
  confirmed: '#70AD47',
  rejected:  '#C00000',
  received:  '#4472C4',
  cancelled: '#A5A5A5',
}

const STATUS_VI: Record<BookingStatus | string, string> = {
  pending:   'Chờ xác nhận',
  partially_approved: 'Duyệt một phần',
  partially_rejected: 'Từ chối một phần',
  confirmed: 'Đã xác nhận',
  rejected:  'Đã từ chối',
  received:  'Đã nhận hàng',
  cancelled: 'Đã huỷ',
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-[#ecdbe8] rounded-lg p-5 flex flex-col gap-1">
      <p className="text-xs text-[#888888] font-medium uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-bold" style={{ color: color ?? 'inherit' }}>{value}</p>
      {sub && <p className="text-xs text-[#888888]">{sub}</p>}
    </div>
  )
}

// ── useContainerWidth (ResizeObserver, same pattern as DASHBOARD ARCHITECTURE) ─
function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return width
}

// ── SVG Stacked Bar Chart — booking statuses by date ─────────────────────────
interface BookingDateDatum {
  label: string
  total: number
  statuses: Record<string, number>
}

interface ItemDateDatum {
  label: string
  total: number
  confirmed: number
  rejected: number
  pending: number
}

const STACK_STATUS_ORDER: BookingStatus[] = ['pending', 'partially_approved', 'confirmed', 'partially_rejected', 'rejected', 'received', 'cancelled']

function SVGBookingStackedBarChart({ data, height = 220 }: { data: BookingDateDatum[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useContainerWidth(containerRef)

  const maxVal = Math.max(...data.map((d) => d.total), 1)
  const paddingLeft = 36
  const paddingRight = 8
  const paddingTop = 16
  const paddingBottom = 30
  const chartW = width - paddingLeft - paddingRight
  const chartH = height - paddingTop - paddingBottom
  const barGap = 4
  const barW = data.length > 0 ? Math.max(4, (chartW / data.length) - barGap) : 0
  const xStep = data.length > 1 ? chartW / (data.length - 1) : chartW
  const xForPoint = (i: number) => paddingLeft + (data.length > 1 ? i * xStep : chartW / 2)
  const barXFor = (i: number) => paddingLeft + (i * chartW) / data.length + barGap / 2

  const labelMinGap = 40
  const visibleLabels: boolean[] = new Array(data.length).fill(false)
  let lastLabelRight = -Infinity
  for (let i = 0; i < data.length; i++) {
    const x = xForPoint(i)
    const labelLeft = x - 20
    if (labelLeft >= lastLabelRight + labelMinGap || i === 0) {
      visibleLabels[i] = true
      lastLabelRight = labelLeft + 40
    }
  }
  // Always show last label
  if (data.length > 0) visibleLabels[data.length - 1] = true

  return (
    <div ref={containerRef} className="w-full">
      {width === 0 ? (
        <div style={{ height }} className="flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : data.length === 0 ? (
        <div style={{ height }} className="flex items-center justify-center text-[#888888] text-sm">
          Không có dữ liệu
        </div>
      ) : (
        <svg width={width} height={height} style={{ overflow: 'visible' }} aria-label="Booking theo ngày giao">
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = paddingTop + chartH * (1 - pct)
            const val = Math.round(maxVal * pct)
            return (
              <g key={pct}>
                <line x1={paddingLeft} x2={paddingLeft + chartW} y1={y} y2={y} stroke="#E0E0E0" strokeDasharray={pct === 0 ? undefined : '3 3'} />
                <text x={paddingLeft - 4} y={y + 4} textAnchor="end" fontSize={9} fill="#888888">{val}</text>
              </g>
            )
          })}

          {data.map((d, i) => {
            const x = barXFor(i)
            let yCursor = paddingTop + chartH
            return (
              <g key={i}>
                {STACK_STATUS_ORDER.map((status) => {
                  const value = d.statuses[status] ?? 0
                  if (value === 0) return null
                  const h = (value / maxVal) * chartH
                  yCursor -= h
                  return (
                    <rect
                      key={status}
                      x={x}
                      y={yCursor}
                      width={barW}
                      height={h}
                      fill={STATUS_COLORS[status]}
                      rx={yCursor + h >= paddingTop + chartH - 1 ? 2 : 0}
                    />
                  )
                })}
                {d.total > 0 && (
                  <text x={x + barW / 2} y={Math.max(paddingTop + 10, yCursor - 4)} textAnchor="middle" fontSize={9} fill="#555555" fontWeight="600">
                    {d.total}
                  </text>
                )}
                {visibleLabels[i] && (
                  <text
                    x={xForPoint(i)}
                    y={paddingTop + chartH + 14}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#888888"
                  >
                    {d.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

// ── SVG Line Chart — total items by date + hover tooltip ─────────────────────
function SVGItemsLineChart({ data, height = 220 }: { data: ItemDateDatum[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const width = useContainerWidth(containerRef)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const maxVal = Math.max(...data.map((d) => d.total), 1)
  const paddingLeft = 36
  const paddingRight = 18
  const paddingTop = 18
  const paddingBottom = 30
  const chartW = width - paddingLeft - paddingRight
  const chartH = height - paddingTop - paddingBottom
  const xStep = data.length > 1 ? chartW / (data.length - 1) : chartW
  const xFor = (i: number) => paddingLeft + (data.length > 1 ? i * xStep : chartW / 2)
  const yFor = (value: number) => paddingTop + chartH - (value / maxVal) * chartH
  const points = data.map((d, i) => ({ x: xFor(i), y: yFor(d.total) }))
  const hovered = hoveredIndex === null ? null : data[hoveredIndex]
  const hoveredPoint = hoveredIndex === null ? null : points[hoveredIndex]

  const linePath = points.reduce((path, point, i) => {
    if (i === 0) return `M ${point.x} ${point.y}`
    const p0 = points[i - 2] ?? points[i - 1]
    const p1 = points[i - 1]
    const p2 = point
    const p3 = points[i + 1] ?? point
    const t = 0.3
    const cp1x = p1.x + (p2.x - p0.x) * t
    const cp1y = p1.y + (p2.y - p0.y) * t
    const cp2x = p2.x - (p3.x - p1.x) * t
    const cp2y = p2.y - (p3.y - p1.y) * t
    return `${path} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`
  }, '')

  const cancelHide = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  }
  const hideDelayed = () => {
    cancelHide()
    hideTimerRef.current = setTimeout(() => setHoveredIndex(null), 200)
  }

  const labelMinGap = 40
  const visibleLabels: boolean[] = new Array(data.length).fill(false)
  let lastLabelRight = -Infinity
  for (let i = 0; i < data.length; i++) {
    const x = xFor(i)
    const labelLeft = x - 20
    if (labelLeft >= lastLabelRight + labelMinGap || i === 0) {
      visibleLabels[i] = true
      lastLabelRight = labelLeft + 40
    }
  }
  if (data.length > 0) visibleLabels[data.length - 1] = true

  return (
    <div ref={containerRef} className="relative w-full">
      {width === 0 ? (
        <div style={{ height }} className="flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : data.length === 0 ? (
        <div style={{ height }} className="flex items-center justify-center text-[#888888] text-sm">
          Không có dữ liệu
        </div>
      ) : (
        <>
          <svg width={width} height={height} style={{ overflow: 'visible' }} aria-label="Tổng kiện hàng theo ngày giao">
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
              const y = paddingTop + chartH * (1 - pct)
              const val = Math.round(maxVal * pct)
              return (
                <g key={pct}>
                  <line x1={paddingLeft} x2={paddingLeft + chartW} y1={y} y2={y} stroke="#E0E0E0" strokeDasharray={pct === 0 ? undefined : '3 3'} />
                  <text x={paddingLeft - 4} y={y + 4} textAnchor="end" fontSize={9} fill="#888888">{val}</text>
                </g>
              )
            })}

            <g>
              <path d={linePath} fill="none" stroke="#80417A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              {points.map((point, i) => (
                <g key={data[i].label}>
                  <rect
                    x={point.x - Math.max(10, xStep / 2)}
                    y={paddingTop}
                    width={Math.max(20, xStep)}
                    height={chartH}
                    fill="transparent"
                    onMouseEnter={() => { cancelHide(); setHoveredIndex(i) }}
                    onMouseLeave={hideDelayed}
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={hoveredIndex === i ? 5 : 3.5}
                    fill="#80417A"
                    stroke="white"
                    strokeWidth={1.5}
                    onMouseEnter={() => { cancelHide(); setHoveredIndex(i) }}
                    onMouseLeave={hideDelayed}
                  />
                  <text x={point.x} y={point.y - 7} textAnchor="middle" fontSize={9} fill="#80417A" fontWeight="600">
                    {data[i].total}
                  </text>
                </g>
              ))}
            </g>
            {data.map((d, i) => visibleLabels[i] && (
              <text key={d.label} x={xFor(i)} y={paddingTop + chartH + 14} textAnchor="middle" fontSize={9} fill="#888888">
                {d.label}
              </text>
            ))}
          </svg>
          {hovered && hoveredPoint && (
            <div
              className="pointer-events-auto absolute z-20 w-48 rounded-lg border border-[#ecdbe8] bg-white p-3 text-xs shadow-xl"
              style={{
                left: Math.max(4, Math.min(hoveredPoint.x + 10, width - 200)),
                top: Math.max(4, hoveredPoint.y - 28),
              }}
              onMouseEnter={cancelHide}
              onMouseLeave={hideDelayed}
            >
              <p className="mb-2 font-semibold text-black">{hovered.label}</p>
              <div className="space-y-1 text-[#555555]">
                <div className="flex justify-between"><span>Tổng kiện hàng</span><span className="font-semibold text-black">{hovered.total}</span></div>
                <div className="flex justify-between"><span>Đã duyệt</span><span className="font-semibold text-[#1a7a3e]">{hovered.confirmed}</span></div>
                <div className="flex justify-between"><span>Từ chối</span><span className="font-semibold text-[#CC0000]">{hovered.rejected}</span></div>
                <div className="flex justify-between"><span>Chờ</span><span className="font-semibold text-[#A06B00]">{hovered.pending}</span></div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── SVG Donut / Pie Chart ─────────────────────────────────────────────────────
function SVGDonut({ slices, size = 120 }: { slices: { value: number; color: string; label: string }[]; size?: number }) {
  const total = slices.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <div style={{ width: size, height: size }} className="flex items-center justify-center text-[#888888] text-xs">N/A</div>

  const r = 38
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r

  let offset = 0
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      {slices.map((s, i) => {
        const pct = s.value / total
        const dash = pct * circumference
        const gap = circumference - dash
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={size === 120 ? 22 : 18}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
          />
        )
        offset += dash
        return el
      })}
      {/* Center hole */}
      <circle cx={cx} cy={cy} r={r - 12} fill="white" />
    </svg>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ReportPage({ embedded = false }: { embedded?: boolean }) {
  const user = getCurrentUser()
  const tabs = user ? (ROLE_TABS[user.role] ?? []) : []

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    document.title = 'Báo cáo — Atino'
  }, [])

  // ── Fetch all bookings in range ───────────────────────────────────────────
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['report-bookings', dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from('bookings')
        .select('id, status, delivery_date, submitted_at, suppliers!inner(name), booking_items(id, status)')
        .order('delivery_date', { ascending: true })
      if (dateFrom) q = q.gte('delivery_date', dateFrom)
      if (dateTo) q = q.lte('delivery_date', dateTo)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((b: any) => {
        const items = b.booking_items ?? []
        return {
          id: b.id,
          status: deriveBookingStatus(b.status, items),
          delivery_date: b.delivery_date as string,
          submitted_at: b.submitted_at as string,
          supplier_name: b.suppliers?.name ?? '—',
          items_count: items.length,
          item_status_counts: countBookingItemStatuses(items),
        }
      })
    },
  })

  // ── Derived KPIs ─────────────────────────────────────────────────────────
  const total = bookings.length
  const byStatus = bookings.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const totalItems = bookings.reduce((s, b) => s + b.items_count, 0)
  const returned = (byStatus['rejected'] ?? 0)
  const received = (byStatus['received'] ?? 0)

  // ── Bookings and items by date ───────────────────────────────────────────
  const byDate = bookings.reduce((acc, b) => {
    const row = acc[b.delivery_date] ?? {
      label: b.delivery_date.slice(5).replace('-', '/'),
      total: 0,
      statuses: {},
      totalItems: 0,
      confirmed: 0,
      rejected: 0,
      pending: 0,
    }
    row.total += 1
    row.statuses[b.status] = (row.statuses[b.status] ?? 0) + 1
    row.totalItems += b.items_count
    row.confirmed += b.item_status_counts.confirmed
    row.rejected += b.item_status_counts.rejected
    row.pending += b.item_status_counts.pending
    acc[b.delivery_date] = row
    return acc
  }, {} as Record<string, BookingDateDatum & ItemDateDatum & { totalItems: number }>)

  const dateRows = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => row)

  const dateSeries: BookingDateDatum[] = dateRows.map((row) => ({
    label: row.label,
    total: row.total,
    statuses: row.statuses,
  }))

  const itemSeries: ItemDateDatum[] = dateRows.map((row) => ({
    label: row.label,
    total: row.totalItems,
    confirmed: row.confirmed,
    rejected: row.rejected,
    pending: row.pending,
  }))

  // ── By supplier ──────────────────────────────────────────────────────────
  const bySupplier = bookings.reduce((acc, b) => {
    acc[b.supplier_name] = (acc[b.supplier_name] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const supplierEntries = Object.entries(bySupplier)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)

  const supplierMax = supplierEntries[0]?.[1] ?? 1

  // ── Status donut slices ───────────────────────────────────────────────────
  const donutSlices = (Object.entries(STATUS_COLORS) as [string, string][])
    .filter(([k]) => byStatus[k])
    .map(([k, color]) => ({ value: byStatus[k] ?? 0, color, label: STATUS_VI[k] }))

  const mainContent = (
    <main className="flex-1 lg:w-[80vw] max-w-none mx-auto w-full px-4 py-6">
      {/* Header + date filter */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold">Báo cáo tổng hợp</h1>
        <DateRangePickerPopup
          startDate={dateFrom}
          endDate={dateTo}
          onStartDateChange={setDateFrom}
          onEndDateChange={setDateTo}
          maxWidth={320}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <KPICard label="Tổng booking" value={total} sub={`${totalItems} đơn hàng (PO)`} />
            <KPICard label="Chờ xác nhận" value={byStatus['pending'] ?? 0} color="#FFC000" />
            <KPICard label="Đã xác nhận" value={byStatus['confirmed'] ?? 0} color="#70AD47" />
            <KPICard label="Đã từ chối / Trả hàng" value={returned} color="#C00000" sub={total > 0 ? `${((returned / total) * 100).toFixed(1)}% tổng booking` : undefined} />
            <KPICard label="Tổng kiện hàng" value={totalItems} />
            <KPICard
              label="Tỉ lệ thành công"
              value={total > 0 ? `${(((received + (byStatus['confirmed'] ?? 0)) / total) * 100).toFixed(1)}%` : '—'}
              sub="Xác nhận + Nhận hàng"
              color="#70AD47"
            />
          </div>

          {/* Row: bar chart + donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* Bookings by date */}
            <div className="lg:col-span-2 bg-white border border-[#ecdbe8] rounded-lg p-5">
              <p className="text-sm font-semibold mb-4">Booking theo ngày giao</p>
              <div className="flex gap-4 items-start">
                <div className="flex-1 min-w-0">
                  <SVGBookingStackedBarChart data={dateSeries} height={220} />
                </div>
                <div className="flex flex-col gap-1.5 text-xs flex-shrink-0 pt-2">
                  {STACK_STATUS_ORDER.map((status) => (
                    <span key={status} className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[status] }} />
                      {STATUS_VI[status]}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Status donut */}
            <div className="bg-white border border-[#ecdbe8] rounded-lg p-5">
              <p className="text-sm font-semibold mb-4">Phân bố trạng thái</p>
              {total === 0 ? (
                <div className="flex items-center justify-center h-32 text-[#888888] text-sm">Không có dữ liệu</div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <SVGDonut slices={donutSlices} size={120} />
                  <div className="w-full space-y-1.5">
                    {donutSlices.map((s) => (
                      <div key={s.label} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
                          <span className="text-[#555]">{s.label}</span>
                        </div>
                        <span className="font-semibold">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Items over time */}
          <div className="bg-white border border-[#ecdbe8] rounded-lg p-5 mb-4">
            <div className="mb-4">
              <p className="text-sm font-semibold">Tổng kiện hàng theo ngày giao</p>
              <p className="text-xs text-[#888888]">Di chuột vào từng điểm để xem đã duyệt / từ chối / chờ</p>
            </div>
            <SVGItemsLineChart data={itemSeries} height={220} />
          </div>

          {/* By supplier — horizontal bars */}
          <div className="bg-white border border-[#ecdbe8] rounded-lg p-5">
            <p className="text-sm font-semibold mb-4">Top nhà cung cấp (theo số booking)</p>
            {supplierEntries.length === 0 ? (
              <div className="text-[#888888] text-sm text-center py-6">Không có dữ liệu</div>
            ) : (
              <div className="space-y-2.5">
                {supplierEntries.map(([name, count], i) => {
                  const pct = (count / supplierMax) * 100
                  const color = PALETTE[i % PALETTE.length]
                  return (
                    <div key={name} className="flex items-center gap-3">
                      <span className="text-xs text-[#555] w-32 truncate flex-shrink-0" title={name}>{name}</span>
                      <div className="flex-1 h-5 bg-[#F5F5F5] rounded overflow-hidden">
                        <div
                          className="h-full rounded transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="text-xs font-semibold w-6 text-right">{count}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  )

  if (embedded) return mainContent
  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={tabs} activeTab="report" />
      {mainContent}
    </div>
  )
}

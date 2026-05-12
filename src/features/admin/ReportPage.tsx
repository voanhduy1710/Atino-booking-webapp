/**
 * ReportPage — Báo cáo tổng hợp
 * Shared between /admin/report and /manager/report
 * SVG-only charts, no external charting library (same pattern as DASHBOARD ARCHITECTURE.md)
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { FilterDatePicker } from '@/shared/components/FilterDatePicker'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { Navbar } from '@/shared/components/Navbar'
import { getCurrentUser } from '@/shared/lib/auth'
import { ROLE_TABS } from '@/shared/config/navTabs'
import { type BookingStatus } from '@/shared/types/domain'

// ── Color palette (same standard 10 from DASHBOARD ARCHITECTURE.md) ──────────
const PALETTE = [
  '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5',
  '#70AD47', '#9E480E', '#7030A0', '#C00000', '#00B0F0',
]

const STATUS_COLORS: Record<BookingStatus | string, string> = {
  pending:   '#FFC000',
  confirmed: '#70AD47',
  rejected:  '#C00000',
  received:  '#4472C4',
  cancelled: '#A5A5A5',
}

const STATUS_VI: Record<BookingStatus | string, string> = {
  pending:   'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  rejected:  'Đã từ chối',
  received:  'Đã nhận hàng',
  cancelled: 'Đã huỷ',
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-[#E0E0E0] rounded-lg p-5 flex flex-col gap-1">
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

// ── SVG Bar Chart — bookings by date ─────────────────────────────────────────
interface BarDatum { label: string; value: number; color?: string }

function SVGBarChart({ data, height = 160 }: { data: BarDatum[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useContainerWidth(containerRef)

  const maxVal = Math.max(...data.map((d) => d.value), 1)
  const paddingLeft = 36
  const paddingRight = 8
  const paddingTop = 16
  const paddingBottom = 28
  const chartW = width - paddingLeft - paddingRight
  const chartH = height - paddingTop - paddingBottom
  const barGap = 4
  const barW = data.length > 0 ? Math.max(4, (chartW / data.length) - barGap) : 0

  // Compute visible x-axis labels using label-density algorithm
  const labelMinGap = 40
  const visibleLabels: boolean[] = new Array(data.length).fill(false)
  let lastLabelRight = -Infinity
  for (let i = 0; i < data.length; i++) {
    const x = paddingLeft + (i + 0.5) * (chartW / data.length)
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
        <svg width={width} height={height} style={{ overflow: 'visible' }}>
          {/* Y gridlines */}
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

          {/* Bars */}
          {data.map((d, i) => {
            const x = paddingLeft + (i * chartW) / data.length + barGap / 2
            const barHeight = (d.value / maxVal) * chartH
            const y = paddingTop + chartH - barHeight
            const color = d.color ?? PALETTE[i % PALETTE.length]
            return (
              <g key={i}>
                <rect x={x} y={y} width={barW} height={barHeight} fill={color} rx={2} />
                {d.value > 0 && barHeight > 14 && (
                  <text x={x + barW / 2} y={y + 11} textAnchor="middle" fontSize={9} fill="white" fontWeight="600">
                    {d.value}
                  </text>
                )}
                {/* X-axis label */}
                {visibleLabels[i] && (
                  <text
                    x={x + barW / 2}
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
        .select('id, status, delivery_date, submitted_at, suppliers!inner(name), booking_items(id)')
        .order('delivery_date', { ascending: true })
      if (dateFrom) q = q.gte('delivery_date', dateFrom)
      if (dateTo) q = q.lte('delivery_date', dateTo)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((b: any) => ({
        id: b.id,
        status: b.status as BookingStatus,
        delivery_date: b.delivery_date as string,
        submitted_at: b.submitted_at as string,
        supplier_name: b.suppliers?.name ?? '—',
        items_count: b.booking_items?.length ?? 0,
      }))
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

  // ── Bookings by date (bar chart) ─────────────────────────────────────────
  const byDate = bookings.reduce((acc, b) => {
    acc[b.delivery_date] = (acc[b.delivery_date] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const dateSeries: BarDatum[] = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      label: date.slice(5).replace('-', '/'), // MM/DD
      value: count,
      color: '#4472C4',
    }))

  // ── Returned/rejected by date ─────────────────────────────────────────────
  const returnedByDate = bookings
    .filter((b) => b.status === 'rejected')
    .reduce((acc, b) => {
      acc[b.delivery_date] = (acc[b.delivery_date] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

  const returnedSeries: BarDatum[] = Object.entries(returnedByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      label: date.slice(5).replace('-', '/'),
      value: count,
      color: '#C00000',
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
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
      {/* Header + date filter */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold">Báo cáo tổng hợp</h1>
        <div className="flex items-center gap-1">
          <FilterDatePicker value={dateFrom} onChange={setDateFrom} placeholder="Từ ngày" />
          <span className="text-xs text-[#888888]">–</span>
          <FilterDatePicker value={dateTo} onChange={setDateTo} placeholder="Đến ngày" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <KPICard label="Tổng booking" value={total} sub={`${totalItems} đơn hàng (PO)`} />
            <KPICard label="Chờ xác nhận" value={byStatus['pending'] ?? 0} color="#FFC000" />
            <KPICard label="Đã xác nhận" value={byStatus['confirmed'] ?? 0} color="#70AD47" />
            <KPICard label="Đã nhận hàng" value={received} color="#4472C4" />
            <KPICard label="Đã từ chối / Trả hàng" value={returned} color="#C00000" sub={total > 0 ? `${((returned / total) * 100).toFixed(1)}% tổng booking` : undefined} />
            <KPICard label="Đã huỷ" value={byStatus['cancelled'] ?? 0} color="#A5A5A5" />
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
            <div className="lg:col-span-2 bg-white border border-[#E0E0E0] rounded-lg p-5">
              <p className="text-sm font-semibold mb-4">Booking theo ngày giao</p>
              <SVGBarChart data={dateSeries} height={180} />
            </div>

            {/* Status donut */}
            <div className="bg-white border border-[#E0E0E0] rounded-lg p-5">
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

          {/* Returned by date */}
          <div className="bg-white border border-[#E0E0E0] rounded-lg p-5 mb-4">
            <p className="text-sm font-semibold mb-1">Booking trả hàng / từ chối theo ngày giao</p>
            <p className="text-xs text-[#888888] mb-4">Trạng thái: Đã từ chối</p>
            {returnedSeries.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-[#888888] text-sm">Không có booking nào bị từ chối</div>
            ) : (
              <SVGBarChart data={returnedSeries} height={140} />
            )}
          </div>

          {/* By supplier — horizontal bars */}
          <div className="bg-white border border-[#E0E0E0] rounded-lg p-5">
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
    <div className="min-h-screen flex flex-col bg-[#F5F5F5]">
      <Navbar tabs={tabs} activeTab="report" />
      {mainContent}
    </div>
  )
}

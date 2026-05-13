/**
 * ReportPage â€” BÃ¡o cÃ¡o tá»•ng há»£p
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
import { deriveBookingStatus } from '@/shared/lib/bookingStatus'

// â”€â”€ Color palette (same standard 10 from DASHBOARD ARCHITECTURE.md) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  pending:   'Chá» xÃ¡c nháº­n',
  partially_approved: 'Duyá»‡t má»™t pháº§n',
  partially_rejected: 'Tá»« chá»‘i má»™t pháº§n',
  confirmed: 'ÄÃ£ xÃ¡c nháº­n',
  rejected:  'ÄÃ£ tá»« chá»‘i',
  received:  'ÄÃ£ nháº­n hÃ ng',
  cancelled: 'ÄÃ£ huá»·',
}

// â”€â”€ KPI Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function KPICard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-[#E0E0E0] rounded-lg p-5 flex flex-col gap-1">
      <p className="text-xs text-[#888888] font-medium uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-bold" style={{ color: color ?? 'inherit' }}>{value}</p>
      {sub && <p className="text-xs text-[#888888]">{sub}</p>}
    </div>
  )
}

// â”€â”€ useContainerWidth (ResizeObserver, same pattern as DASHBOARD ARCHITECTURE) â”€
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

// â”€â”€ SVG Bar Chart â€” bookings by date â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          KhÃ´ng cÃ³ dá»¯ liá»‡u
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

// â”€â”€ SVG Donut / Pie Chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ReportPage({ embedded = false }: { embedded?: boolean }) {
  const user = getCurrentUser()
  const tabs = user ? (ROLE_TABS[user.role] ?? []) : []

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    document.title = 'BÃ¡o cÃ¡o â€” Atino'
  }, [])

  // â”€â”€ Fetch all bookings in range â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      return (data ?? []).map((b: any) => ({
        id: b.id,
        status: deriveBookingStatus(b.status, b.booking_items ?? []),
        delivery_date: b.delivery_date as string,
        submitted_at: b.submitted_at as string,
        supplier_name: b.suppliers?.name ?? 'â€”',
        items_count: b.booking_items?.length ?? 0,
      }))
    },
  })

  // â”€â”€ Derived KPIs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const total = bookings.length
  const byStatus = bookings.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const totalItems = bookings.reduce((s, b) => s + b.items_count, 0)
  const returned = (byStatus['rejected'] ?? 0)
  const received = (byStatus['received'] ?? 0)

  // â”€â”€ Bookings by date (bar chart) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Returned/rejected by date â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ By supplier â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const bySupplier = bookings.reduce((acc, b) => {
    acc[b.supplier_name] = (acc[b.supplier_name] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const supplierEntries = Object.entries(bySupplier)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)

  const supplierMax = supplierEntries[0]?.[1] ?? 1

  // â”€â”€ Status donut slices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const donutSlices = (Object.entries(STATUS_COLORS) as [string, string][])
    .filter(([k]) => byStatus[k])
    .map(([k, color]) => ({ value: byStatus[k] ?? 0, color, label: STATUS_VI[k] }))

  const mainContent = (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
      {/* Header + date filter */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold">BÃ¡o cÃ¡o tá»•ng há»£p</h1>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <KPICard label="Tá»•ng booking" value={total} sub={`${totalItems} Ä‘Æ¡n hÃ ng (PO)`} />
            <KPICard label="Chá» xÃ¡c nháº­n" value={byStatus['pending'] ?? 0} color="#FFC000" />
            <KPICard label="ÄÃ£ xÃ¡c nháº­n" value={byStatus['confirmed'] ?? 0} color="#70AD47" />
            <KPICard label="ÄÃ£ nháº­n hÃ ng" value={received} color="#4472C4" />
            <KPICard label="ÄÃ£ tá»« chá»‘i / Tráº£ hÃ ng" value={returned} color="#C00000" sub={total > 0 ? `${((returned / total) * 100).toFixed(1)}% tá»•ng booking` : undefined} />
            <KPICard label="ÄÃ£ huá»·" value={byStatus['cancelled'] ?? 0} color="#A5A5A5" />
            <KPICard label="Tá»•ng kiá»‡n hÃ ng" value={totalItems} />
            <KPICard
              label="Tá»‰ lá»‡ thÃ nh cÃ´ng"
              value={total > 0 ? `${(((received + (byStatus['confirmed'] ?? 0)) / total) * 100).toFixed(1)}%` : 'â€”'}
              sub="XÃ¡c nháº­n + Nháº­n hÃ ng"
              color="#70AD47"
            />
          </div>

          {/* Row: bar chart + donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* Bookings by date */}
            <div className="lg:col-span-2 bg-white border border-[#E0E0E0] rounded-lg p-5">
              <p className="text-sm font-semibold mb-4">Booking theo ngÃ y giao</p>
              <SVGBarChart data={dateSeries} height={180} />
            </div>

            {/* Status donut */}
            <div className="bg-white border border-[#E0E0E0] rounded-lg p-5">
              <p className="text-sm font-semibold mb-4">PhÃ¢n bá»‘ tráº¡ng thÃ¡i</p>
              {total === 0 ? (
                <div className="flex items-center justify-center h-32 text-[#888888] text-sm">KhÃ´ng cÃ³ dá»¯ liá»‡u</div>
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
            <p className="text-sm font-semibold mb-1">Booking tráº£ hÃ ng / tá»« chá»‘i theo ngÃ y giao</p>
            <p className="text-xs text-[#888888] mb-4">Tráº¡ng thÃ¡i: ÄÃ£ tá»« chá»‘i</p>
            {returnedSeries.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-[#888888] text-sm">KhÃ´ng cÃ³ booking nÃ o bá»‹ tá»« chá»‘i</div>
            ) : (
              <SVGBarChart data={returnedSeries} height={140} />
            )}
          </div>

          {/* By supplier â€” horizontal bars */}
          <div className="bg-white border border-[#E0E0E0] rounded-lg p-5">
            <p className="text-sm font-semibold mb-4">Top nhÃ  cung cáº¥p (theo sá»‘ booking)</p>
            {supplierEntries.length === 0 ? (
              <div className="text-[#888888] text-sm text-center py-6">KhÃ´ng cÃ³ dá»¯ liá»‡u</div>
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
    <div className="min-h-screen flex flex-col bg-[#FFF5FF]">
      <Navbar tabs={tabs} activeTab="report" />
      {mainContent}
    </div>
  )
}

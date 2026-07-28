import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getJson } from '@/shared/lib/apiClient'
import { Navbar } from '@/shared/components/Navbar'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { Pagination } from '@/shared/components/Pagination'
import { Lightbox } from '@/shared/components/Lightbox'
import { DateRangePickerPopup } from '@/shared/components/filters'
import { formatDateDisplay, formatDateTimeDisplay } from '@/shared/lib/dateUtils'
import { countBookingItemStatuses, deriveBookingStatus, getBookingStatusTags, type BookingStatusTag } from '@/shared/lib/bookingStatus'
import { TIME_SLOT_LABELS } from '@/shared/types/domain'
import { getCurrentUser } from '@/shared/lib/auth'
import { ROLE_TABS } from '@/shared/config/navTabs'
import { BookingTooltip, type BookingRow } from './BookingTooltip'
import { BookingDetailModal, type SelectedBooking } from './BookingDetailModal'
import { DEFAULT_PAGE_SIZE } from '@/shared/constants/ui'
import type { CSSProperties } from 'react'

const STATUS_FILTER_OPTIONS: Array<{
  value: BookingStatusTag | 'all'
  label: string
  style: CSSProperties
}> = [
  { value: 'all', label: 'Tất cả trạng thái', style: { backgroundColor: '#FFFFFF', color: '#000000' } },
  { value: 'pending', label: 'Chờ xác nhận', style: { backgroundColor: '#F5F5F5', color: '#555555' } },
  { value: 'confirmed', label: 'Đã xác nhận', style: { backgroundColor: '#1a7a3e', color: '#FFFFFF' } },
  { value: 'rejected', label: 'Đã từ chối', style: { backgroundColor: '#CC0000', color: '#FFFFFF' } },
  { value: 'returned', label: 'Trả hàng', style: { backgroundColor: '#FFF4E5', color: '#7A3E00' } },
]
const PAGE_SIZE = DEFAULT_PAGE_SIZE

export default function ReviewerPage({ embedded = false }: { embedded?: boolean }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<BookingStatusTag | 'all'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [selectedBooking, setSelectedBooking] = useState<SelectedBooking | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [tooltipRow, setTooltipRow] = useState<{ row: BookingRow; x: number; y: number } | null>(null)
  const [isTooltipPinned, setIsTooltipPinned] = useState(false)
  const tooltipHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const queryClient = useQueryClient()
  const user = getCurrentUser()
  const canDelete = user?.role === 'admin'
  const tabs = user ? (ROLE_TABS[user.role] ?? []) : []
  const selectedStatusStyle = STATUS_FILTER_OPTIONS.find((option) => option.value === statusFilter)?.style

  useEffect(() => { document.title = 'Xác nhận booking — Atino' }, [])
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    setCurrentPage(1)
  }, [dateFrom, dateTo, statusFilter, debouncedSearch, supplierFilter])

  useEffect(() => {
    if (!isTooltipPinned) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setTooltipRow(null); setIsTooltipPinned(false) }
    }
    const handleClick = (e: MouseEvent) => {
      if (document.querySelector('[data-lightbox-root]')) return
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setTooltipRow(null); setIsTooltipPinned(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    const t = setTimeout(() => document.addEventListener('mousedown', handleClick), 0)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleClick)
      clearTimeout(t)
    }
  }, [isTooltipPinned])

  const showTooltip = (row: BookingRow, el: Element) => {
    if (isTooltipPinned) return
    if (tooltipHideTimer.current) clearTimeout(tooltipHideTimer.current)
    const rect = el.getBoundingClientRect()
    setTooltipRow({ row, x: rect.right + 8, y: rect.top })
  }
  const hideTooltipDelayed = () => {
    if (isTooltipPinned) return
    tooltipHideTimer.current = setTimeout(() => setTooltipRow(null), 200)
  }
  const cancelHide = () => { if (tooltipHideTimer.current) clearTimeout(tooltipHideTimer.current) }
  const pinCurrentTooltip = () => setIsTooltipPinned(true)
  const closeTooltip = () => {
    setTooltipRow(null)
    setIsTooltipPinned(false)
  }

  const { data: suppliers = [] } = useQuery({
    queryKey: ['reviewer-suppliers'],
    queryFn: async () => {
      const result = await getJson<{ suppliers: { id: string; name: string }[] }>('/api/reviewer/suppliers')
      return result.suppliers
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: bookingPage = { bookings: [] as BookingRow[], total: 0 }, isLoading } = useQuery({
    queryKey: ['reviewer-bookings', dateFrom, dateTo, statusFilter, debouncedSearch, supplierFilter, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (supplierFilter !== 'all') params.set('supplier_id', supplierFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      params.set('page', String(currentPage))
      params.set('page_size', String(PAGE_SIZE))
      const result = await getJson<{ bookings: any[]; total: number }>(`/api/reviewer/bookings?${params}`)
      const data = result.bookings
      const rows = (data ?? []).map((b: any) => {
        const items = b.booking_items ?? []
        const statusTags = getBookingStatusTags(items)
        return {
          id: b.id, booking_code: b.booking_code, booking_token: b.booking_token,
          supplier_account_id: b.supplier_account_id,
          delivery_date: b.delivery_date, time_slot: b.time_slot, status: deriveBookingStatus(b.status, items),
          submitted_at: b.submitted_at, supplier_name: b.suppliers?.name ?? '—',
          supplier_code: b.suppliers?.code ?? '—',
          warehouse_name: b.warehouses?.name ?? '—',
          items_count: items.length,
          item_status_counts: countBookingItemStatuses(items),
          status_tags: statusTags,
          ghi_chu: b.ghi_chu,
          reject_reasons: items.map((item: any) => item.reject_reason).filter(Boolean).join('; '),
          item_codes: items.map((item: any) => ({ product_code: item.product_code, process_code: item.process_code })),
          nhanh_draft_bill_id: b.nhanh_draft_bill_id,
        }
      }) as BookingRow[]
      return { bookings: rows, total: result.total }
    },
  })

  const bookings = bookingPage.bookings
  const totalPages = Math.max(1, Math.ceil(bookingPage.total / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedBookings = bookings

  useEffect(() => {
    if (currentPage !== safePage) setCurrentPage(safePage)
  }, [currentPage, safePage])

  const openBooking = async (row: BookingRow) => {
    const result = await getJson<{ booking: any }>(`/api/reviewer/bookings/${row.id}`)
    const data = result.booking
    const d = data as any
    const items = d.booking_items ?? []
    setSelectedBooking({
      ...row,
      status: deriveBookingStatus(d.status, items),
      items,
      item_status_counts: countBookingItemStatuses(items),
      status_tags: getBookingStatusTags(items),
      ghi_chu: d.ghi_chu,
      delivery_note: d.delivery_note,
      nhanh_draft_bill_id: d.nhanh_draft_bill_id,
    })
  }

  const handleListRefresh = () => void queryClient.invalidateQueries({ queryKey: ['reviewer-bookings'] })
  const refreshSelectedBooking = async () => {
    if (!selectedBooking) return
    await openBooking(selectedBooking)
  }

  const content = (
    <main className="flex-1 mx-auto w-full lg:w-[80vw] max-w-none px-4 py-6">
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <h1 className="text-xl font-bold">Xác nhận booking</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm mã booking..."
              className="input-field text-sm py-1.5 pr-7 w-44"
            />
            {searchInput && (
              <button type="button" onClick={() => { setSearchInput(''); setDebouncedSearch('') }} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888888] hover:text-black text-base leading-none">✕</button>
            )}
          </div>
          <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="input-field text-sm py-1.5 w-44">
            <option value="all">Tất cả NCC</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as BookingStatusTag | 'all')}
            className="input-field text-sm py-1.5 w-44"
            style={selectedStatusStyle}
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} style={option.style}>
                {option.label}
              </option>
            ))}
          </select>
          <DateRangePickerPopup
            startDate={dateFrom}
            endDate={dateTo}
            onStartDateChange={setDateFrom}
            onEndDateChange={setDateTo}
            maxWidth={320}
          />
        </div>
      </div>

      <div className="mb-4" />

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : bookings.length === 0 ? (
        <div className="bg-white border border-[#ecdbe8] rounded-lg p-16 text-center text-[#888888]">
          <p>Không có booking nào</p>
        </div>
      ) : (
        <div className="overflow-hidden bg-white border border-[#ecdbe8] rounded-lg relative">
          <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[900px] w-full text-sm data-table">
            <thead>
              <tr>
                <th className="table-header">Mã booking</th>
                <th className="table-header">Mã NCC</th>
                <th className="table-header">Kho</th>
                <th className="table-header w-24">Ngày giao</th>
                <th className="table-header w-28">Khung giờ</th>
                <th className="table-header w-20">SL PO</th>
                <th className="table-header w-36">Tiến độ</th>
                <th className="table-header w-32">Thời gian đăng ký</th>
                <th className="table-header">Mã SP · Mã QT</th>
                <th className="table-header whitespace-nowrap w-52">Trạng thái</th>
                <th className="table-header min-w-44">Ghi chú</th>
                <th className="table-header min-w-44">Lí do</th>
              </tr>
            </thead>
            <tbody>
              {paginatedBookings.map((b) => (
                <tr
                  key={b.id}
                  className="cursor-pointer"
                  onMouseEnter={(e) => showTooltip(b, e.currentTarget)}
                  onMouseLeave={hideTooltipDelayed}
                  onClick={() => void openBooking(b)}
                >
                  <td className="table-cell font-mono font-bold">{b.booking_code}</td>
                  <td className="table-cell font-mono text-xs">{b.supplier_code}</td>
                  <td className="table-cell">{b.warehouse_name}</td>
                  <td className="table-cell text-xs">{formatDateDisplay(b.delivery_date)}</td>
                  <td className="table-cell">{TIME_SLOT_LABELS[b.time_slot]}</td>
                  <td className="table-cell text-center">{b.items_count}</td>
                  <td className="table-cell text-xs text-[#514253] whitespace-nowrap">
                    <span className="block">{b.item_status_counts.confirmed}/{b.items_count} duyệt</span>
                    <span className="block">{b.item_status_counts.rejected}/{b.items_count} từ chối</span>
                    <span className="block">{b.item_status_counts.returned}/{b.items_count} trả hàng</span>
                  </td>
                  <td className="table-cell text-xs text-[#888888]">{formatDateTimeDisplay(b.submitted_at)}</td>
                  <td className="table-cell">
                    <div className="space-y-0.5">
                      {b.item_codes.map((ic, i) => (
                        <p key={i} className="font-mono text-[10px] whitespace-nowrap">{ic.product_code} · {ic.process_code}</p>
                      ))}
                    </div>
                  </td>
                  <td className="table-cell whitespace-nowrap">
                    <div className="flex flex-col items-start gap-1">
                      {b.status_tags.map((status) => <StatusBadge key={status} status={status} />)}
                    </div>
                  </td>
                  <td className="table-cell max-w-52 text-xs text-[#555555]">{b.ghi_chu || <span className="text-[#BBBBBB]">—</span>}</td>
                  <td className="table-cell max-w-52 text-xs text-[#CC0000]">{b.reject_reasons || <span className="text-[#BBBBBB]">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="divide-y divide-[#ecdbe8] md:hidden">
            {paginatedBookings.map((booking) => (
              <button
                key={booking.id}
                type="button"
                onClick={() => void openBooking(booking)}
                className="block min-h-11 w-full p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#80417A]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold">{booking.booking_code}</p>
                    <p className="mt-1 text-xs text-[#555555]">{booking.supplier_code} · {booking.warehouse_name}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {booking.status_tags.map((status) => <StatusBadge key={status} status={status} />)}
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div><dt className="text-[#888888]">Ngày giao</dt><dd className="font-medium">{formatDateDisplay(booking.delivery_date)}</dd></div>
                  <div><dt className="text-[#888888]">Khung giờ</dt><dd className="font-medium">{TIME_SLOT_LABELS[booking.time_slot]}</dd></div>
                  <div><dt className="text-[#888888]">Sản phẩm</dt><dd>{booking.items_count}</dd></div>
                  <div><dt className="text-[#888888]">Tiến độ</dt><dd>{booking.item_status_counts.confirmed} duyệt · {booking.item_status_counts.rejected} từ chối</dd></div>
                </dl>
                {booking.ghi_chu && <p className="mt-3 line-clamp-2 text-xs text-[#555555]">{booking.ghi_chu}</p>}
              </button>
            ))}
          </div>
          <Pagination
            currentPage={safePage}
            pageSize={PAGE_SIZE}
            totalItems={bookingPage.total}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {tooltipRow && (
        <BookingTooltip
          row={tooltipRow.row}
          x={tooltipRow.x}
          y={tooltipRow.y}
          isPinned={isTooltipPinned}
          tooltipRef={tooltipRef}
          onMouseEnter={cancelHide}
          onMouseLeave={hideTooltipDelayed}
          onPhotoClick={setLightboxSrc}
          onPin={pinCurrentTooltip}
          onViewDetails={() => { closeTooltip(); void openBooking(tooltipRow.row) }}
        />
      )}

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onPhotoClick={setLightboxSrc}
          onListRefresh={handleListRefresh}
          onBookingRefresh={refreshSelectedBooking}
          onActionComplete={closeTooltip}
          canDelete={canDelete}
        />
      )}
    </main>
  )

  if (embedded) return <div className="flex flex-col bg-[#fdf8ff]">{content}</div>
  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={tabs} activeTab="reviewer" />
      {content}
    </div>
  )
}

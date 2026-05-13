import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Navbar } from '@/shared/components/Navbar'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { Lightbox } from '@/shared/components/Lightbox'
import { DateRangePickerPopup } from '@/shared/components/filters'
import { formatDateDisplay, formatDateTimeDisplay } from '@/shared/lib/dateUtils'
import { countBookingItemStatuses, deriveBookingStatus, getBookingStatusTags, type BookingStatusTag } from '@/shared/lib/bookingStatus'
import { TIME_SLOT_LABELS } from '@/shared/types/domain'
import { getCurrentUser } from '@/shared/lib/auth'
import { ROLE_TABS } from '@/shared/config/navTabs'
import { BookingTooltip, type BookingRow } from './BookingTooltip'
import { BookingDetailModal, type SelectedBooking } from './BookingDetailModal'

export default function ReviewerPage({ embedded = false }: { embedded?: boolean }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<BookingStatusTag | 'all'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [selectedBooking, setSelectedBooking] = useState<SelectedBooking | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [tooltipRow, setTooltipRow] = useState<{ row: BookingRow; x: number; y: number } | null>(null)
  const [isTooltipPinned, setIsTooltipPinned] = useState(false)
  const tooltipHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const queryClient = useQueryClient()
  const user = getCurrentUser()
  const canDelete = user?.role === 'admin'
  const tabs = user ? (ROLE_TABS[user.role] ?? []) : []

  useEffect(() => { document.title = 'XÃ¡c nháº­n booking â€” Atino' }, [])
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

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
      const { data, error } = await supabase.from('suppliers').select('id, name').order('name')
      if (error) return []
      return data as { id: string; name: string }[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['reviewer-bookings', dateFrom, dateTo, statusFilter, debouncedSearch, supplierFilter],
    queryFn: async () => {
      let q = supabase
        .from('bookings')
        .select('id, booking_code, booking_token, delivery_date, time_slot, status, submitted_at, suppliers!inner(name), warehouses!inner(name), booking_items(id, status)')
        .order('submitted_at', { ascending: false })
      if (dateFrom) q = q.gte('delivery_date', dateFrom)
      if (dateTo) q = q.lte('delivery_date', dateTo)
      if (debouncedSearch) q = q.ilike('booking_code', `%${debouncedSearch}%`)
      if (supplierFilter !== 'all') q = q.eq('supplier_id', supplierFilter)
      const { data, error } = await q
      if (error) throw error
      const rows = (data ?? []).map((b: any) => {
        const items = b.booking_items ?? []
        const statusTags = getBookingStatusTags(items)
        return {
          id: b.id, booking_code: b.booking_code, booking_token: b.booking_token,
          delivery_date: b.delivery_date, time_slot: b.time_slot, status: deriveBookingStatus(b.status, items),
          submitted_at: b.submitted_at, supplier_name: b.suppliers?.name ?? 'â€”',
          warehouse_name: b.warehouses?.name ?? 'â€”',
          items_count: items.length,
          item_status_counts: countBookingItemStatuses(items),
          status_tags: statusTags,
        }
      }) as BookingRow[]
      return statusFilter === 'all' ? rows : rows.filter((b) => b.status_tags.includes(statusFilter))
    },
  })

  const openBooking = async (row: BookingRow) => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, booking_items(*, booking_item_photos(id, storage_path, photo_type))')
      .eq('id', row.id)
      .single()
    if (error || !data) return
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
        <h1 className="text-xl font-bold">XÃ¡c nháº­n booking</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="TÃ¬m mÃ£ booking..."
              className="input-field text-sm py-1.5 pr-7 w-44"
            />
            {searchInput && (
              <button type="button" onClick={() => { setSearchInput(''); setDebouncedSearch('') }} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888888] hover:text-black text-base leading-none">âœ•</button>
            )}
          </div>
          <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="input-field text-sm py-1.5 w-44">
            <option value="all">Táº¥t cáº£ NCC</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as BookingStatusTag | 'all')} className="input-field text-sm py-1.5 w-44">
            <option value="all">Táº¥t cáº£ tráº¡ng thÃ¡i</option>
            <option value="pending">Chá» xÃ¡c nháº­n</option>
            <option value="partially_approved">Duyá»‡t má»™t pháº§n</option>
            <option value="partially_rejected">Tá»« chá»‘i má»™t pháº§n</option>
            <option value="confirmed">ÄÃ£ xÃ¡c nháº­n</option>
            <option value="rejected">ÄÃ£ tá»« chá»‘i</option>
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
        <div className="bg-white border border-[#E0E0E0] rounded-lg p-16 text-center text-[#888888]">
          <p>KhÃ´ng cÃ³ booking nÃ o</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white border border-[#E0E0E0] rounded-lg relative">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F5F5]">
                <th className="table-header">MÃ£ booking</th>
                <th className="table-header">NhÃ  cung cáº¥p</th>
                <th className="table-header">Kho</th>
                <th className="table-header w-24">NgÃ y giao</th>
                <th className="table-header w-28">Khung giá»</th>
                <th className="table-header w-20">SL PO</th>
                <th className="table-header w-36">Tiáº¿n Ä‘á»™</th>
                <th className="table-header w-32">ÄÄƒng kÃ½ lÃºc</th>
                <th className="table-header whitespace-nowrap w-52">Tráº¡ng thÃ¡i</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr
                  key={b.id}
                  className="border-t border-[#E0E0E0] hover:bg-[#F9F9F9] cursor-pointer"
                  onMouseEnter={(e) => showTooltip(b, e.currentTarget)}
                  onMouseLeave={hideTooltipDelayed}
                  onClick={() => void openBooking(b)}
                >
                  <td className="table-cell font-mono font-bold">{b.booking_code}</td>
                  <td className="table-cell">{b.supplier_name}</td>
                  <td className="table-cell">{b.warehouse_name}</td>
                  <td className="table-cell text-xs">{formatDateDisplay(b.delivery_date)}</td>
                  <td className="table-cell">{TIME_SLOT_LABELS[b.time_slot]}</td>
                  <td className="table-cell text-center">{b.items_count}</td>
                  <td className="table-cell text-xs text-[#888888] whitespace-nowrap">
                    <span className="block">{b.item_status_counts.confirmed}/{b.items_count} duyá»‡t</span>
                    <span className="block">{b.item_status_counts.rejected}/{b.items_count} tá»« chá»‘i</span>
                  </td>
                  <td className="table-cell text-xs text-[#888888]">{formatDateTimeDisplay(b.submitted_at)}</td>
                  <td className="table-cell whitespace-nowrap">
                    <div className="flex flex-col items-start gap-1">
                      {b.status_tags.map((status) => <StatusBadge key={status} status={status} />)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          userSub={user?.sub ?? ''}
        />
      )}
    </main>
  )

  if (embedded) return <div className="flex flex-col bg-[#FFF5FF]">{content}</div>
  return (
    <div className="min-h-screen flex flex-col bg-[#FFF5FF]">
      <Navbar tabs={tabs} activeTab="reviewer" />
      {content}
    </div>
  )
}

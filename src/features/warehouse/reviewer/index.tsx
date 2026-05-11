import { useState, useEffect, useRef, type RefObject } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Navbar } from '@/shared/components/Navbar'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { FilterDatePicker } from '@/shared/components/FilterDatePicker'
import { formatDateDisplay, formatDateTimeDisplay } from '@/shared/lib/dateUtils'
import { TIME_SLOT_LABELS, type TimeSlot, type BookingStatus } from '@/shared/types/domain'
import { getCurrentUser } from '@/shared/lib/auth'

const GCS_BASE = 'https://storage.googleapis.com/atino-media'
const resolvePhotoUrl = (path: string) => path.startsWith('http') ? path : `${GCS_BASE}/${path}`

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])
  return (
    <div data-lightbox-root className="fixed inset-0 bg-black/85 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white text-3xl font-bold leading-none hover:opacity-70" onClick={onClose}>×</button>
      <img src={src} alt="" className="max-w-full max-h-full object-contain rounded shadow-2xl" onClick={(e) => e.stopPropagation()} />
    </div>
  )
}

function BookingTooltip({
  row, x, y, isPinned, tooltipRef, onMouseEnter, onMouseLeave, onPhotoClick, onPin,
}: {
  row: BookingRow; x: number; y: number; isPinned: boolean
  tooltipRef: RefObject<HTMLDivElement>
  onMouseEnter: () => void; onMouseLeave: () => void
  onPhotoClick: (src: string) => void; onPin: () => void
}) {
  const { data: photos = [] } = useQuery({
    queryKey: ['tooltip-photos', row.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_items')
        .select('vat_invoice_url, booking_item_photos(storage_path, photo_type)')
        .eq('booking_id', row.id)
      if (error) return []
      const urls: { src: string; label: string }[] = []
      for (const item of data ?? []) {
        if ((item as any).vat_invoice_url) urls.push({ src: (item as any).vat_invoice_url, label: 'VAT' })
        for (const p of (item as any).booking_item_photos ?? []) {
          urls.push({
            src: resolvePhotoUrl(p.storage_path),
            label: p.photo_type === 'delivery_slip' ? 'Phiếu giao' : 'Chênh lệch',
          })
        }
      }
      return urls
    },
    staleTime: 8 * 60 * 1000,
  })

  const clampedX = Math.max(4, Math.min(x, window.innerWidth - 336))
  const clampedY = Math.max(4, Math.min(y, window.innerHeight - 320))

  return (
    <div
      ref={tooltipRef}
      className="fixed z-40 w-80 bg-white border border-[#E0E0E0] rounded-lg shadow-xl p-3 pointer-events-auto"
      style={{ left: clampedX, top: clampedY }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <p className="font-mono font-bold text-xs mb-2">{row.booking_code}</p>
      <div className="space-y-1.5 mb-3">
        {([
          ['Nhà cung cấp', row.supplier_name],
          ['Kho', row.warehouse_name],
          ['Ngày giao', formatDateDisplay(row.delivery_date)],
          ['Khung giờ', TIME_SLOT_LABELS[row.time_slot]],
          ['SL PO', String(row.items_count)],
          ['Đăng ký lúc', formatDateTimeDisplay(row.submitted_at)],
        ] as [string, string][]).map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <span className="text-[#888888] text-xs flex-shrink-0">{label}</span>
            <span className="text-xs text-right">{value}</span>
          </div>
        ))}
      </div>
      {photos.length > 0 && (
        <div>
          <p className="text-[10px] text-[#888888] uppercase tracking-wider mb-1.5">Ảnh đính kèm</p>
          <div className="flex flex-wrap gap-1.5">
            {photos.map((ph, i) => (
              <button
                key={i}
                type="button"
                title={ph.label}
                onClick={() => { onPin(); onPhotoClick(ph.src) }}
                className="w-16 h-16 rounded border border-[#E0E0E0] overflow-hidden hover:border-black transition-colors flex-shrink-0"
              >
                <img src={ph.src} alt={ph.label} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
      {isPinned && <p className="text-[10px] text-[#BBBBBB] mt-2 text-right">Nhấn Esc để đóng</p>}
    </div>
  )
}

interface BookingRow {
  id: string
  booking_code: string
  booking_token: string
  delivery_date: string
  time_slot: TimeSlot
  status: BookingStatus
  submitted_at: string
  supplier_name: string
  warehouse_name: string
  items_count: number
}

interface SelectedBooking extends BookingRow {
  items: any[]
  ghi_chu: string | null
  delivery_note: string
}

interface Props {
  embedded?: boolean
  canDelete?: boolean
}

export default function ReviewerPage({ embedded = false, canDelete = false }: Props) {
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [selectedBooking, setSelectedBooking] = useState<SelectedBooking | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectItemId, setRejectItemId] = useState<string | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [resolveAmendmentId, setResolveAmendmentId] = useState<string | null>(null)
  const [resolveDecision, setResolveDecision] = useState<'approved' | 'denied' | null>(null)
  const [resolveNote, setResolveNote] = useState('')

  // Tooltip state
  const [tooltipRow, setTooltipRow] = useState<{ row: BookingRow; x: number; y: number } | null>(null)
  const [isTooltipPinned, setIsTooltipPinned] = useState(false)
  const tooltipHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const queryClient = useQueryClient()
  const user = getCurrentUser()

  useEffect(() => {
    if (!embedded) document.title = 'Xác nhận booking — Atino'
  }, [embedded])

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
  const cancelHide = () => {
    if (tooltipHideTimer.current) clearTimeout(tooltipHideTimer.current)
  }
  const pinCurrentTooltip = () => setIsTooltipPinned(true)

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['reviewer-bookings', dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from('bookings')
        .select(`
          id, booking_code, booking_token, delivery_date, time_slot, status, submitted_at,
          suppliers!inner(name),
          warehouses!inner(name),
          booking_items(id)
        `)
        .order('submitted_at', { ascending: false })
      if (dateFrom) q = q.gte('delivery_date', dateFrom)
      if (dateTo) q = q.lte('delivery_date', dateTo)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((b: any) => ({
        id: b.id,
        booking_code: b.booking_code,
        booking_token: b.booking_token,
        delivery_date: b.delivery_date,
        time_slot: b.time_slot,
        status: b.status,
        submitted_at: b.submitted_at,
        supplier_name: b.suppliers?.name ?? '—',
        warehouse_name: b.warehouses?.name ?? '—',
        items_count: b.booking_items?.length ?? 0,
      })) as BookingRow[]
    },
  })

  const openBooking = async (row: BookingRow) => {
    const { data } = await supabase
      .from('bookings')
      .select('*, booking_items(*, booking_item_photos(id, storage_path, photo_type))')
      .eq('id', row.id)
      .single()
    const d = data as any
    if (d) {
      setSelectedBooking({ ...row, items: d.booking_items ?? [], ghi_chu: d.ghi_chu, delivery_note: d.delivery_note })
    }
  }

  const confirmItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.rpc('confirm_booking_item', {
        p_item_id: itemId,
        p_reviewer_username: user?.sub ?? '',
      } as any)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reviewer-bookings'] })
      if (selectedBooking) void openBooking(selectedBooking)
    },
  })

  const rejectItemMutation = useMutation({
    mutationFn: async ({ itemId, reason }: { itemId: string; reason: string }) => {
      const { error } = await supabase.rpc('reject_booking_item', {
        p_item_id: itemId,
        p_reason: reason,
        p_reviewer_username: user?.sub ?? '',
      } as any)
      if (error) throw error
    },
    onSuccess: () => {
      setRejectItemId(null)
      setRejectReason('')
      void queryClient.invalidateQueries({ queryKey: ['reviewer-bookings'] })
      if (selectedBooking) void openBooking(selectedBooking)
    },
  })

  const { data: bookingAmendment, refetch: refetchAmendment } = useQuery({
    queryKey: ['reviewer-amendment', selectedBooking?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('booking_amendments' as any)
        .select('id, amendment_type, request_note, status, reviewer_note, created_at')
        .eq('booking_id', selectedBooking!.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      return (data as { id: string; amendment_type: string; request_note: string; status: string; reviewer_note: string | null; created_at: string } | null) ?? null
    },
    enabled: !!selectedBooking?.id,
  })

  const resolveAmendmentMutation = useMutation({
    mutationFn: async ({ amendmentId, decision, note }: { amendmentId: string; decision: string; note: string }) => {
      const { error } = await supabase.rpc('resolve_booking_amendment' as any, {
        p_amendment_id: amendmentId,
        p_reviewer_username: user?.sub ?? '',
        p_decision: decision,
        p_note: note,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setResolveAmendmentId(null)
      setResolveDecision(null)
      setResolveNote('')
      void queryClient.invalidateQueries({ queryKey: ['reviewer-bookings'] })
      void refetchAmendment()
      if (selectedBooking) void openBooking(selectedBooking)
    },
  })

  const deleteBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc('admin_delete_booking' as any, { p_booking_id: bookingId })
      if (error) throw error
    },
    onSuccess: () => {
      setSelectedBooking(null)
      void queryClient.invalidateQueries({ queryKey: ['reviewer-bookings'] })
    },
  })

  const formatDateLabel = (d: string) => {
    if (!d) return ''
    const [y, m, day] = d.split('-')
    return `${day}-${m}-${y}`
  }

  const content = (
    <main className={`flex-1 max-w-5xl mx-auto w-full px-4 ${embedded ? 'py-4' : 'py-6'}`}>
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <h1 className="text-xl font-bold">Xác nhận booking</h1>
        <div className="flex items-center gap-1">
          <FilterDatePicker value={dateFrom} onChange={setDateFrom} placeholder="Từ ngày" />
          <span className="text-xs text-[#888888]">-</span>
          <FilterDatePicker value={dateTo} onChange={setDateTo} placeholder="Đến ngày" />
        </div>
      </div>
      {(dateFrom || dateTo) && (
        <p className="text-xs text-[#888888] mb-4">
          Ngày giao:{' '}
          {dateFrom && dateTo
            ? `Từ ${formatDateLabel(dateFrom)} đến ${formatDateLabel(dateTo)}`
            : dateFrom
            ? `Từ ${formatDateLabel(dateFrom)}`
            : `Đến ${formatDateLabel(dateTo)}`}
        </p>
      )}
      {!dateFrom && !dateTo && <div className="mb-4" />}

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : bookings.length === 0 ? (
        <div className="bg-white border border-[#E0E0E0] rounded-lg p-16 text-center text-[#888888]">
          <p>Không có booking nào{dateFrom || dateTo ? ' trong khoảng thời gian này' : ''}</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white border border-[#E0E0E0] rounded-lg relative">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F5F5]">
                <th className="table-header">Mã booking</th>
                <th className="table-header">Nhà cung cấp</th>
                <th className="table-header">Kho</th>
                <th className="table-header w-24">Ngày giao</th>
                <th className="table-header w-28">Khung giờ</th>
                <th className="table-header w-20">SL PO</th>
                <th className="table-header w-32">Đăng ký lúc</th>
                <th className="table-header whitespace-nowrap">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr
                  key={b.id}
                  className="border-t border-[#E0E0E0] hover:bg-[#F9F9F9] cursor-pointer"
                  onMouseEnter={(e) => showTooltip(b, e.currentTarget)}
                  onMouseLeave={hideTooltipDelayed}
                  onClick={() => openBooking(b)}
                >
                  <td className="table-cell font-mono font-bold">{b.booking_code}</td>
                  <td className="table-cell">{b.supplier_name}</td>
                  <td className="table-cell">{b.warehouse_name}</td>
                  <td className="table-cell text-xs">{formatDateDisplay(b.delivery_date)}</td>
                  <td className="table-cell">{TIME_SLOT_LABELS[b.time_slot]}</td>
                  <td className="table-cell text-center">{b.items_count}</td>
                  <td className="table-cell text-xs text-[#888888]">{formatDateTimeDisplay(b.submitted_at)}</td>
                  <td className="table-cell whitespace-nowrap"><StatusBadge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Hover tooltip */}
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
        />
      )}

      {/* Booking detail modal */}
      <Modal
        isOpen={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
        title={`Booking: ${selectedBooking?.booking_code ?? ''}`}
        size="xl"
      >
        {selectedBooking && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-[#888888]">Nhà cung cấp</p><p className="font-medium">{selectedBooking.supplier_name}</p></div>
              <div><p className="text-xs text-[#888888]">Kho</p><p className="font-medium">{selectedBooking.warehouse_name}</p></div>
              <div><p className="text-xs text-[#888888]">Ngày giao</p><p className="font-medium">{formatDateDisplay(selectedBooking.delivery_date)}</p></div>
              <div><p className="text-xs text-[#888888]">Khung giờ</p><p className="font-medium">{TIME_SLOT_LABELS[selectedBooking.time_slot]}</p></div>
            </div>

            {selectedBooking.ghi_chu && (
              <div className="p-3 bg-[#F5F5F5] rounded text-sm">{selectedBooking.ghi_chu}</div>
            )}

            <div className="overflow-x-auto border border-[#E0E0E0] rounded">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F5F5F5]">
                    <th className="table-header">Mã SP</th>
                    <th className="table-header">Mã QT</th>
                    <th className="table-header">Lần giao</th>
                    <th className="table-header">SL</th>
                    <th className="table-header">Ảnh</th>
                    <th className="table-header whitespace-nowrap">Trạng thái</th>
                    <th className="table-header">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBooking.items.map((item: any) => {
                    const photos: { src: string; label: string }[] = []
                    if (item.vat_invoice_url) photos.push({ src: item.vat_invoice_url, label: 'Hóa đơn VAT' })
                    for (const p of item.booking_item_photos ?? []) {
                      photos.push({
                        src: resolvePhotoUrl(p.storage_path),
                        label: p.photo_type === 'delivery_slip' ? 'Phiếu giao' : 'Chênh lệch',
                      })
                    }
                    return (
                      <tr key={item.id} className="border-t border-[#E0E0E0]">
                        <td className="table-cell font-mono">{item.product_code}</td>
                        <td className="table-cell font-mono">{item.process_code}</td>
                        <td className="table-cell text-center">{item.is_final_round ? 'Cuối' : item.delivery_round}</td>
                        <td className="table-cell text-right">{item.quantity_booked}</td>
                        <td className="table-cell">
                          {photos.length > 0 ? (
                            <div className="flex gap-1 flex-wrap">
                              {photos.map((ph, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  title={ph.label}
                                  onClick={() => setLightboxSrc(ph.src)}
                                  className="w-10 h-10 flex-shrink-0 rounded border border-[#E0E0E0] overflow-hidden hover:border-black transition-colors"
                                >
                                  <img src={ph.src} alt={ph.label} className="w-full h-full object-cover" />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[#BBBBBB]">—</span>
                          )}
                        </td>
                        <td className="table-cell whitespace-nowrap"><StatusBadge status={item.status} /></td>
                        <td className="table-cell">
                          {item.status === 'pending' && (
                            <div className="flex gap-2">
                              <Button
                                variant="success"
                                loading={confirmItemMutation.isPending}
                                onClick={() => confirmItemMutation.mutate(item.id)}
                                className="text-xs py-1 px-2"
                              >
                                Duyệt
                              </Button>
                              <Button
                                variant="danger-outline"
                                onClick={() => setRejectItemId(item.id)}
                                className="text-xs py-1 px-2"
                              >
                                Từ chối
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pending amendment panel */}
            {bookingAmendment && (
              <div className="mt-4 border border-[#F5C518] bg-[#FFF8E1] rounded-lg p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-sm">
                      {bookingAmendment.amendment_type === 'recall' ? '⚠️ Yêu cầu huỷ booking' : '✏️ Yêu cầu chỉnh sửa booking'}
                    </p>
                    <p className="text-xs text-[#888888] mt-0.5">{bookingAmendment.request_note}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="success"
                    className="text-xs py-1 px-3"
                    loading={resolveAmendmentMutation.isPending && resolveDecision === 'approved'}
                    onClick={() => {
                      setResolveAmendmentId(bookingAmendment.id)
                      setResolveDecision('approved')
                      setResolveNote('')
                    }}
                  >
                    Chấp thuận
                  </Button>
                  <Button
                    variant="danger-outline"
                    className="text-xs py-1 px-3"
                    loading={resolveAmendmentMutation.isPending && resolveDecision === 'denied'}
                    onClick={() => {
                      setResolveAmendmentId(bookingAmendment.id)
                      setResolveDecision('denied')
                      setResolveNote('')
                    }}
                  >
                    Từ chối
                  </Button>
                </div>
              </div>
            )}

            {/* Admin delete */}
            {canDelete && (
              <div className="mt-4 flex justify-end">
                <Button
                  variant="danger-outline"
                  loading={deleteBookingMutation.isPending}
                  onClick={() => {
                    if (selectedBooking && window.confirm(`Xoá booking ${selectedBooking.booking_code}? Không thể hoàn tác.`)) {
                      deleteBookingMutation.mutate(selectedBooking.id)
                    }
                  }}
                  className="text-xs py-1.5 px-3"
                >
                  Xoá booking
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Resolve amendment modal */}
      <Modal
        isOpen={!!resolveAmendmentId && !!resolveDecision}
        onClose={() => { setResolveAmendmentId(null); setResolveDecision(null) }}
        title={resolveDecision === 'approved' ? 'Chấp thuận yêu cầu' : 'Từ chối yêu cầu'}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-[#888888]">
            {resolveDecision === 'denied' ? 'Nhập lý do từ chối (bắt buộc):' : 'Ghi chú phản hồi (tuỳ chọn):'}
          </p>
          <textarea
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            rows={3}
            className="input-field resize-none w-full"
            placeholder="Ghi chú..."
          />
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setResolveAmendmentId(null); setResolveDecision(null) }} className="flex-1">
              Huỷ
            </Button>
            <Button
              variant={resolveDecision === 'approved' ? 'success' : 'danger-outline'}
              loading={resolveAmendmentMutation.isPending}
              disabled={resolveDecision === 'denied' && !resolveNote.trim()}
              onClick={() =>
                resolveAmendmentId && resolveDecision &&
                resolveAmendmentMutation.mutate({ amendmentId: resolveAmendmentId, decision: resolveDecision, note: resolveNote })
              }
              className="flex-1"
            >
              Xác nhận
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject reason modal */}
      <Modal
        isOpen={!!rejectItemId}
        onClose={() => setRejectItemId(null)}
        title="Từ chối đơn hàng"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-[#888888]">Vui lòng nhập lý do từ chối:</p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            className="input-field resize-none"
            placeholder="Lý do từ chối..."
            id="reject-reason-input"
          />
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setRejectItemId(null)} className="flex-1">
              Huỷ
            </Button>
            <Button
              variant="danger-outline"
              loading={rejectItemMutation.isPending}
              disabled={!rejectReason.trim()}
              onClick={() =>
                rejectItemId && rejectItemMutation.mutate({ itemId: rejectItemId, reason: rejectReason })
              }
              className="flex-1"
            >
              Xác nhận từ chối
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  )

  if (embedded) {
    return <div className="flex flex-col bg-[#F5F5F5]">{content}</div>
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F5]">
      <Navbar />
      {content}
    </div>
  )
}

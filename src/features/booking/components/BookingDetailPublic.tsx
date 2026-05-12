import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
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

interface ProposedChanges {
  delivery_date?: string
  time_slot?: string
  ghi_chu?: string
  items?: Array<{ id: string; quantity_booked: number }>
}

interface BookingAmendment {
  id: string
  amendment_type: 'update' | 'recall'
  request_note: string
  proposed_changes: ProposedChanges | null
  status: 'pending' | 'approved' | 'denied'
  reviewer_note: string | null
  created_at: string
}

interface EditFormState {
  delivery_date: string
  time_slot: string
  ghi_chu: string
  items: Array<{ id: string; product_code: string; process_code: string; quantity_booked: number }>
}

interface BookingRow {
  id: string
  booking_code: string
  booking_token: string
  supplier_account_id: string
  delivery_date: string
  time_slot: TimeSlot
  status: BookingStatus
  submitted_at: string
  ghi_chu: string | null
  confirmed_by: string | null
  received_by: string | null
  warehouses: { name: string; code: string } | null
  suppliers: { name: string; code: string } | null
  booking_items: Array<{
    id: string
    product_code: string
    process_code: string
    delivery_round: number
    is_final_round: boolean
    quantity_booked: number
    quantity_received: number | null
    status: string
    vat_invoice_url: string | null
    booking_item_photos: Array<{
      id: string
      storage_path: string
      photo_type: string
    }>
  }>
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white text-3xl font-bold leading-none hover:opacity-70"
        onClick={onClose}
      >
        ×
      </button>
      <img
        src={src}
        alt=""
        className="max-w-full max-h-full object-contain rounded shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

function PhotoThumbnail({ src, label, onClick }: { src: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-12 h-12 flex-shrink-0 rounded border border-[#E0E0E0] overflow-hidden hover:border-black transition-colors"
      title={label}
    >
      <img src={src} alt={label} className="w-full h-full object-cover" />
      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
    </button>
  )
}

export default function BookingDetailPublic() {
  const { token } = useParams<{ token: string }>()
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [amendModal, setAmendModal] = useState<'update' | 'recall' | null>(null)
  const [amendNote, setAmendNote] = useState('')
  const [amendError, setAmendError] = useState('')
  const [editForm, setEditForm] = useState<EditFormState | null>(null)

  const user = getCurrentUser()
  const queryClient = useQueryClient()

  useEffect(() => {
    document.title = 'Chi tiết đăng ký — Atino Booking'
  }, [])

  const { data: booking, isLoading, error } = useQuery({
    queryKey: ['booking-public', token],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, booking_code, booking_token, supplier_account_id, delivery_date, time_slot, status,
          submitted_at, ghi_chu, confirmed_by, received_by,
          suppliers(name, code),
          warehouses(name, code),
          booking_items(
            id, product_code, process_code, delivery_round, is_final_round,
            quantity_booked, quantity_received, status, vat_invoice_url,
            booking_item_photos(id, storage_path, photo_type)
          )
        `)
        .eq('booking_token', token!)
        .single()
      if (error) throw error
      return data as unknown as BookingRow
    },
    enabled: !!token,
  })

  const { data: pendingAmendment } = useQuery({
    queryKey: ['booking-amendment', booking?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('booking_amendments' as any)
        .select('id, amendment_type, request_note, proposed_changes, status, reviewer_note, created_at')
        .eq('booking_id', booking!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      return (data as BookingAmendment | null) ?? null
    },
    enabled: !!booking?.id,
  })

  const requestAmendmentMutation = useMutation({
    mutationFn: async ({ type, note, proposed_changes }: { type: string; note: string; proposed_changes?: object }) => {
      if (!booking || !user) return
      const { data, error } = await supabase.rpc('request_booking_amendment' as any, {
        p_booking_id: booking.id,
        p_supplier_account_id: user.supplier_account_id,
        p_type: type,
        p_note: note,
        p_proposed_changes: proposed_changes ?? null,
      } as any)
      if (error) throw error
      if ((data as any)?.error) throw new Error((data as any).error)
    },
    onSuccess: () => {
      setAmendModal(null)
      setAmendNote('')
      setAmendError('')
      setEditForm(null)
      void queryClient.invalidateQueries({ queryKey: ['booking-amendment', booking?.id] })
    },
    onError: (e: Error) => setAmendError(e.message),
  })

  const isOwner = user?.role === 'supplier' && user.supplier_account_id === booking?.supplier_account_id
  const canRequestAmendment = isOwner && booking && !['received', 'cancelled', 'rejected'].includes(booking.status)

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    )
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-[#888888]">
          <p className="text-2xl">❌</p>
          <p>Không tìm thấy đơn đăng ký.</p>
          <Link to="/" className="btn-outline">Về trang chủ</Link>
        </div>
      </div>
    )
  }

  const items = booking.booking_items ?? []

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F5]">
      <Navbar />

      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        <div className="bg-white border border-[#E0E0E0] rounded-lg px-6 py-5 mb-4">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="font-mono text-lg font-bold">{booking.booking_code}</p>
              <p className="text-sm text-[#888888]">
                Đăng ký lúc {formatDateTimeDisplay(booking.submitted_at)}
              </p>
            </div>
            <StatusBadge status={booking.status} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-[#888888] mb-0.5">Kho</p>
              <p className="font-medium">{booking.warehouses?.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-[#888888] mb-0.5">Ngày giao</p>
              <p className="font-medium">{formatDateDisplay(booking.delivery_date)}</p>
            </div>
            <div>
              <p className="text-xs text-[#888888] mb-0.5">Khung giờ</p>
              <p className="font-medium">{TIME_SLOT_LABELS[booking.time_slot]}</p>
            </div>
            <div>
              <p className="text-xs text-[#888888] mb-0.5">Nhà cung cấp</p>
              <p className="font-medium">{booking.suppliers?.name ?? '—'}</p>
            </div>
            {booking.confirmed_by && (
              <div>
                <p className="text-xs text-[#888888] mb-0.5">Xác nhận bởi</p>
                <p className="font-medium">{booking.confirmed_by}</p>
              </div>
            )}
            {booking.received_by && (
              <div>
                <p className="text-xs text-[#888888] mb-0.5">Nhận bởi</p>
                <p className="font-medium">{booking.received_by}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-[#E0E0E0] rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E0E0E0]">
            <h2 className="font-bold text-sm">Danh sách đơn hàng ({items.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-[#F5F5F5]">
                  <th className="table-header w-28">Mã SP</th>
                  <th className="table-header w-28">Mã QT</th>
                  <th className="table-header w-20">Lần giao</th>
                  <th className="table-header w-20">SL đk</th>
                  <th className="table-header w-20">SL nhận</th>
                  <th className="table-header">Ảnh</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const photos: { src: string; label: string }[] = []
                  const vatPhotos = (item.booking_item_photos ?? []).filter((p) => p.photo_type === 'vat_invoice')
                  if (vatPhotos.length > 0) {
                    for (const p of vatPhotos) photos.push({ src: resolvePhotoUrl(p.storage_path), label: 'Hóa đơn VAT' })
                  } else if (item.vat_invoice_url) {
                    photos.push({ src: item.vat_invoice_url, label: 'Hóa đơn VAT' })
                  }
                  for (const p of item.booking_item_photos ?? []) {
                    if (p.photo_type === 'vat_invoice') continue
                    photos.push({
                      src: resolvePhotoUrl(p.storage_path),
                      label: p.photo_type === 'delivery_slip' ? 'Phiếu giao' : 'Chênh lệch',
                    })
                  }

                  return (
                    <tr key={item.id} className="border-t border-[#E0E0E0]">
                      <td className="table-cell font-mono">{item.product_code}</td>
                      <td className="table-cell font-mono">{item.process_code}</td>
                      <td className="table-cell text-center">
                        {item.is_final_round ? 'Cuối' : item.delivery_round}
                      </td>
                      <td className="table-cell text-right">{item.quantity_booked}</td>
                      <td className="table-cell text-right">
                        {item.quantity_received ?? '—'}
                      </td>
                      <td className="table-cell">
                        {photos.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {photos.map((ph, i) => (
                              <PhotoThumbnail
                                key={i}
                                src={ph.src}
                                label={ph.label}
                                onClick={() => setLightboxSrc(ph.src)}
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="text-[#BBBBBB]">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {booking.ghi_chu && (
          <div className="mt-4 bg-white border border-[#E0E0E0] rounded-lg px-6 py-4">
            <p className="text-xs text-[#888888] mb-1">Ghi chú</p>
            <p className="text-sm">{booking.ghi_chu}</p>
          </div>
        )}

        {/* Amendment section — supplier only */}
        {isOwner && (
          <div className="mt-4 bg-white border border-[#E0E0E0] rounded-lg px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#888888] mb-3">Yêu cầu điều chỉnh</p>
            {pendingAmendment ? (
              <div className={`rounded p-3 text-sm ${
                pendingAmendment.status === 'pending' ? 'bg-[#FFF8E1] border border-[#F5C518]' :
                pendingAmendment.status === 'approved' ? 'bg-[#F0FFF4] border border-[#1a7a3e]' :
                'bg-[#FFF0F0] border border-[#CC0000]'
              }`}>
                <p className="font-medium mb-1">
                  {pendingAmendment.amendment_type === 'recall' ? 'Yêu cầu huỷ' : 'Yêu cầu chỉnh sửa'} —{' '}
                  {pendingAmendment.status === 'pending' ? 'Đang chờ xử lý' :
                   pendingAmendment.status === 'approved' ? 'Đã chấp thuận' : 'Đã từ chối'}
                </p>
                <p className="text-[#888888] text-xs">{pendingAmendment.request_note}</p>
                {pendingAmendment.reviewer_note && (
                  <p className="text-xs mt-1 italic">Phản hồi: {pendingAmendment.reviewer_note}</p>
                )}
              </div>
            ) : canRequestAmendment ? (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setAmendModal('update')
                    setAmendNote('')
                    setAmendError('')
                    setEditForm({
                      delivery_date: booking.delivery_date,
                      time_slot: booking.time_slot,
                      ghi_chu: booking.ghi_chu ?? '',
                      items: (booking.booking_items ?? []).map((item) => ({
                        id: item.id,
                        product_code: item.product_code,
                        process_code: item.process_code,
                        quantity_booked: item.quantity_booked,
                      })),
                    })
                  }}
                  className="btn-outline text-sm py-1.5 px-3"
                >
                  Yêu cầu chỉnh sửa
                </button>
                <button
                  onClick={() => { setAmendModal('recall'); setAmendNote(''); setAmendError('') }}
                  className="text-sm py-1.5 px-3 border border-[#CC0000] text-[#CC0000] rounded hover:bg-[#FFF0F0] transition-colors"
                >
                  Yêu cầu huỷ
                </button>
              </div>
            ) : (
              <p className="text-sm text-[#888888]">Booking này không thể yêu cầu điều chỉnh.</p>
            )}
          </div>
        )}
      </main>

      {/* Amendment request modal */}
      <Modal
        isOpen={!!amendModal}
        onClose={() => { setAmendModal(null); setEditForm(null) }}
        title={amendModal === 'recall' ? 'Yêu cầu huỷ booking' : 'Yêu cầu chỉnh sửa booking'}
        size={amendModal === 'update' ? 'lg' : 'sm'}
      >
        {amendModal === 'recall' ? (
          <div className="space-y-4">
            <p className="text-sm text-[#888888]">Mô tả lý do bạn muốn huỷ booking này. Yêu cầu sẽ được xem xét bởi reviewer.</p>
            <textarea
              value={amendNote}
              onChange={(e) => setAmendNote(e.target.value)}
              rows={4}
              className="input-field resize-none w-full"
              placeholder="Lý do huỷ..."
            />
            {amendError && <p className="text-xs text-[#CC0000]">{amendError}</p>}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setAmendModal(null)} className="flex-1">Huỷ</Button>
              <Button
                variant="danger-outline"
                loading={requestAmendmentMutation.isPending}
                disabled={!amendNote.trim()}
                onClick={() => requestAmendmentMutation.mutate({ type: 'recall', note: amendNote })}
                className="flex-1"
              >
                Gửi yêu cầu
              </Button>
            </div>
          </div>
        ) : editForm ? (
          <div className="space-y-4">
            <p className="text-sm text-[#888888]">Chỉnh sửa thông tin booking bên dưới. Reviewer sẽ xem xét và quyết định chấp thuận hoặc từ chối.</p>

            {/* Booking-level fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-[#888888] block mb-1">Ngày giao</label>
                <FilterDatePicker
                  value={editForm.delivery_date}
                  onChange={(v) => setEditForm({ ...editForm, delivery_date: v })}
                  placeholder="Chọn ngày"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#888888] block mb-1">Khung giờ</label>
                <select
                  value={editForm.time_slot}
                  onChange={(e) => setEditForm({ ...editForm, time_slot: e.target.value })}
                  className="input-field text-sm"
                >
                  {(Object.entries(TIME_SLOT_LABELS) as [string, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-[#888888] block mb-1">Ghi chú</label>
              <textarea
                value={editForm.ghi_chu}
                onChange={(e) => setEditForm({ ...editForm, ghi_chu: e.target.value })}
                rows={2}
                className="input-field resize-none w-full"
                placeholder="Ghi chú (tuỳ chọn)"
              />
            </div>

            {/* Item quantities */}
            <div>
              <p className="text-xs font-medium text-[#888888] mb-2">Số lượng đơn hàng</p>
              <div className="border border-[#E0E0E0] rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F5F5F5]">
                      <th className="table-header">Mã SP</th>
                      <th className="table-header">Mã QT</th>
                      <th className="table-header w-24">Số lượng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editForm.items.map((item, idx) => (
                      <tr key={item.id} className="border-t border-[#E0E0E0]">
                        <td className="table-cell font-mono">{item.product_code}</td>
                        <td className="table-cell font-mono">{item.process_code}</td>
                        <td className="table-cell">
                          <input
                            type="number"
                            min={1}
                            value={item.quantity_booked}
                            onChange={(e) => {
                              const updated = [...editForm.items]
                              updated[idx] = { ...updated[idx], quantity_booked: Number(e.target.value) }
                              setEditForm({ ...editForm, items: updated })
                            }}
                            className="input-field text-sm w-20"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="text-xs font-medium text-[#888888] block mb-1">Lý do / ghi chú yêu cầu *</label>
              <textarea
                value={amendNote}
                onChange={(e) => setAmendNote(e.target.value)}
                rows={2}
                className="input-field resize-none w-full"
                placeholder="Mô tả lý do chỉnh sửa..."
              />
            </div>

            {amendError && <p className="text-xs text-[#CC0000]">{amendError}</p>}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setAmendModal(null); setEditForm(null) }} className="flex-1">Huỷ</Button>
              <Button
                variant="primary"
                loading={requestAmendmentMutation.isPending}
                disabled={!amendNote.trim()}
                onClick={() => {
                  const proposed: ProposedChanges = {
                    delivery_date: editForm.delivery_date,
                    time_slot: editForm.time_slot,
                    ghi_chu: editForm.ghi_chu,
                    items: editForm.items.map((i) => ({ id: i.id, quantity_booked: i.quantity_booked })),
                  }
                  requestAmendmentMutation.mutate({ type: 'update', note: amendNote, proposed_changes: proposed })
                }}
                className="flex-1"
              >
                Gửi yêu cầu
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

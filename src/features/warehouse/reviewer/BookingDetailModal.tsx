import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/Button'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { AttachmentThumbnail } from '@/shared/components/AttachmentThumbnail'
import { resolvePhotoUrl } from '@/shared/lib/gcs'
import { countBookingItemStatuses, formatBookingItemSummary } from '@/shared/lib/bookingStatus'
import { formatDateDisplay } from '@/shared/lib/dateUtils'
import { TIME_SLOT_LABELS } from '@/shared/types/domain'
import { postJson } from '@/shared/lib/apiClient'
import { AmendmentPanel } from './AmendmentPanel'
import type { BookingRow } from './BookingTooltip'

export interface SelectedBooking extends BookingRow {
  items: any[]
  ghi_chu: string | null
  delivery_note: string
  nhanh_draft_bill_id?: string | null
}

interface Props {
  booking: SelectedBooking
  onClose: () => void
  onPhotoClick: (src: string) => void
  onListRefresh: () => void
  onBookingRefresh: () => Promise<void>
  onActionComplete: () => void
  canDelete: boolean
}

interface NhanhRow {
  billId: number | string
  product_id: number | string
  product_name: string
  color: string
  size: string
  required_quantity: number
  required_description: string
}

const REVERT_WINDOW_MS = 30 * 60 * 1000

function isWithin30Min(reviewedAt: string | null | undefined): boolean {
  if (!reviewedAt) return false
  return Date.now() - new Date(reviewedAt).getTime() < REVERT_WINDOW_MS
}

function minutesLeft(reviewedAt: string): number {
  const elapsed = (Date.now() - new Date(reviewedAt).getTime()) / 60_000
  return Math.max(0, Math.floor(30 - elapsed))
}

function itemTotal(item: any): number {
  return Number(item.total_quantity ?? item.quantity_booked ?? 0)
}

function itemPhotos(item: any, type: 'vat_invoice' | 'delivery_slip') {
  const photos = (item.booking_item_photos ?? [])
    .filter((photo: any) => photo.photo_type === type)
    .map((photo: any) => resolvePhotoUrl(photo.storage_path))
  if (type === 'vat_invoice' && photos.length === 0 && item.vat_invoice_url) return [item.vat_invoice_url]
  return photos
}

export function BookingDetailModal({ booking, onClose, onPhotoClick, onListRefresh, onBookingRefresh, onActionComplete, canDelete }: Props) {
  const queryClient = useQueryClient()
  const [rejectItemId, setRejectItemId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionItemId, setActionItemId] = useState<string | null>(null)
  const [draftBillId, setDraftBillId] = useState(booking.nhanh_draft_bill_id ?? '')
  const [savedDraftBillId, setSavedDraftBillId] = useState(booking.nhanh_draft_bill_id ?? '')
  const itemCounts = countBookingItemStatuses(booking.items)

  useEffect(() => {
    setDraftBillId(booking.nhanh_draft_bill_id ?? '')
    setSavedDraftBillId(booking.nhanh_draft_bill_id ?? '')
  }, [booking.nhanh_draft_bill_id])

  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const nhanhQuery = useQuery({
    queryKey: ['nhanh-draft-products', savedDraftBillId],
    queryFn: async () => postJson<{ rows: NhanhRow[] }>('/api/nhanh/draft-products', { billId: savedDraftBillId }),
    enabled: !!savedDraftBillId,
    retry: false,
  })

  const refreshAll = async () => {
    onListRefresh()
    void queryClient.invalidateQueries({ queryKey: ['reviewer-amendment', booking.id] })
    await onBookingRefresh()
    onActionComplete()
    setActionItemId(null)
  }

  const confirmItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      setActionItemId(itemId)
      await postJson<{ ok: true }>(`/api/reviewer/items/${itemId}/confirm`)
    },
    onSuccess: () => { void refreshAll() },
    onError: () => setActionItemId(null),
  })

  const rejectItemMutation = useMutation({
    mutationFn: async ({ itemId, reason }: { itemId: string; reason: string }) => {
      setActionItemId(itemId)
      await postJson<{ ok: true }>(`/api/reviewer/items/${itemId}/reject`, { reason })
    },
    onSuccess: () => {
      setRejectItemId(null)
      setRejectReason('')
      void refreshAll()
    },
    onError: () => setActionItemId(null),
  })

  const returnItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      setActionItemId(itemId)
      await postJson<{ ok: true }>(`/api/reviewer/items/${itemId}/return`)
    },
    onSuccess: () => { void refreshAll() },
    onError: () => setActionItemId(null),
  })

  const revertItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      setActionItemId(itemId)
      await postJson<{ ok: true }>(`/api/reviewer/items/${itemId}/revert`)
    },
    onSuccess: () => { void refreshAll() },
    onError: (e: Error) => { setActionItemId(null); alert(e.message) },
  })

  const deleteBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      await postJson<{ ok: true }>(`/api/reviewer/bookings/${bookingId}`, undefined, { method: 'DELETE' })
    },
    onSuccess: () => { onClose(); onListRefresh() },
  })

  const saveDraftBillMutation = useMutation({
    mutationFn: async () => {
      const value = draftBillId.trim() || null
      await postJson<{ ok: true }>(`/api/reviewer/bookings/${booking.id}/draft-bill`, {
        nhanh_draft_bill_id: value,
      })
    },
    onSuccess: async () => {
      setSavedDraftBillId(draftBillId.trim())
      onListRefresh()
      await onBookingRefresh()
      void queryClient.invalidateQueries({ queryKey: ['nhanh-draft-products'] })
    },
  })

  const nhanhRows = nhanhQuery.data?.rows ?? []
  const nhanhTotal = nhanhRows.reduce((sum, row) => sum + Number(row.required_quantity ?? 0), 0)
  const bookingTotal = booking.items.reduce((sum, item) => sum + itemTotal(item), 0)

  return (
    <>
      <Modal isOpen onClose={onClose} title={`Booking: ${booking.booking_code}`} size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-[#888888]">Nhà cung cấp</p><p className="font-medium">{booking.supplier_name}</p></div>
            <div><p className="text-xs text-[#888888]">Kho</p><p className="font-medium">{booking.warehouse_name}</p></div>
            <div><p className="text-xs text-[#888888]">Ngày giao</p><p className="font-medium">{formatDateDisplay(booking.delivery_date)}</p></div>
            <div><p className="text-xs text-[#888888]">Khung giờ</p><p className="font-medium">{TIME_SLOT_LABELS[booking.time_slot]}</p></div>
          </div>

          <div className="rounded border border-[#ecdbe8] bg-white p-3">
            <label className="form-label text-xs">Id phiếu nháp</label>
            <div className="mt-1 flex gap-2">
              <input
                value={draftBillId}
                onChange={(e) => setDraftBillId(e.target.value)}
                className="input-field text-sm"
                placeholder="Nhập billId Nhanh"
              />
              <Button
                type="button"
                variant="outline"
                loading={saveDraftBillMutation.isPending}
                onClick={() => saveDraftBillMutation.mutate()}
                className="whitespace-nowrap text-sm py-2"
              >
                Lưu
              </Button>
            </div>
            {saveDraftBillMutation.error && (
              <p className="form-error mt-1">{(saveDraftBillMutation.error as Error).message}</p>
            )}
          </div>

          {booking.ghi_chu && <div className="p-3 bg-[#F5F5F5] rounded text-sm">{booking.ghi_chu}</div>}

          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="rounded border border-[#ecdbe8] px-2 py-2"><p className="font-bold text-[#1a7a3e]">{itemCounts.confirmed}/{itemCounts.total}</p><p className="text-[#888888]">Đã duyệt</p></div>
            <div className="rounded border border-[#ecdbe8] px-2 py-2"><p className="font-bold text-[#CC0000]">{itemCounts.rejected}/{itemCounts.total}</p><p className="text-[#888888]">Từ chối</p></div>
            <div className="rounded border border-[#ecdbe8] px-2 py-2"><p className="font-bold text-[#7A3E00]">{itemCounts.returned}/{itemCounts.total}</p><p className="text-[#888888]">Trả hàng</p></div>
            <div className="rounded border border-[#ecdbe8] px-2 py-2"><p className="font-bold text-[#888888]">{itemCounts.pending}/{itemCounts.total}</p><p className="text-[#888888]">Chờ xử lý</p></div>
          </div>
          <p className="text-xs text-[#888888]">{formatBookingItemSummary(itemCounts)}</p>

          {savedDraftBillId && (
            <div className="rounded border border-[#ecdbe8] bg-[#FFFCF5] p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">Đối chiếu Nhanh</p>
                {nhanhQuery.isFetching && <span className="text-xs text-[#888888]">Đang tải...</span>}
              </div>
              {nhanhQuery.error ? (
                <p className="mt-2 text-xs text-[#CC0000]">{(nhanhQuery.error as Error).message}</p>
              ) : (
                <div className="mt-2 space-y-2">
                  <p className={`text-xs font-medium ${nhanhTotal === bookingTotal ? 'text-[#1a7a3e]' : 'text-[#CC0000]'}`}>
                    Booking: {bookingTotal} | Nhanh: {nhanhTotal}
                  </p>
                  {nhanhRows.length > 0 && (
                    <div className="max-h-32 overflow-auto rounded border border-[#ecdbe8] bg-white">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[#F5F5F5]">
                            <th className="px-2 py-1 text-left">ID nhanh SP</th>
                            <th className="px-2 py-1 text-left">Tên SP</th>
                            <th className="px-2 py-1 text-left">Màu</th>
                            <th className="px-2 py-1 text-left">Size</th>
                            <th className="px-2 py-1 text-right">SL</th>
                            <th className="px-2 py-1 text-left">Mô tả</th>
                          </tr>
                        </thead>
                        <tbody>
                          {nhanhRows.map((row, i) => (
                            <tr key={`${row.product_id}-${i}`} className="border-t border-[#ecdbe8]">
                              <td className="px-2 py-1">{row.product_id}</td>
                              <td className="px-2 py-1">{row.product_name}</td>
                              <td className="px-2 py-1">{row.color || '—'}</td>
                              <td className="px-2 py-1">{row.size || '—'}</td>
                              <td className="px-2 py-1 text-right">{row.required_quantity}</td>
                              <td className="px-2 py-1">{row.required_description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="hidden overflow-x-auto border border-[#ecdbe8] rounded sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F5F5F5]">
                  <th className="table-header">Tên SP</th>
                  <th className="table-header">Mã đơn</th>
                  <th className="table-header">Mã kho</th>
                  <th className="table-header">Màu</th>
                  <th className="table-header">Lần giao</th>
                  <th className="table-header">SL</th>
                  <th className="table-header">Ảnh VAT</th>
                  <th className="table-header">Ảnh phiếu giao hàng</th>
                  <th className="table-header whitespace-nowrap">Trạng thái</th>
                  <th className="table-header">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {booking.items.map((item: any) => {
                  const vatPhotos = itemPhotos(item, 'vat_invoice')
                  const slipPhotos = itemPhotos(item, 'delivery_slip')
                  const canRevert = isWithin30Min(item.reviewed_at)
                  return (
                    <tr key={item.id} className="border-t border-[#ecdbe8]">
                      <td className="table-cell font-mono">{item.product_code}</td>
                      <td className="table-cell font-mono">{item.process_code}</td>
                      <td className="table-cell font-mono">{item.warehouse_code ?? '—'}</td>
                      <td className="table-cell">{item.mau ?? '—'}</td>
                      <td className="table-cell text-center">{item.is_final_round ? 'Cuối' : item.delivery_round}</td>
                      <td className="table-cell text-right">{itemTotal(item)}</td>
                      <td className="table-cell">
                        {vatPhotos.length > 0 ? <div className="flex gap-1 flex-wrap">{vatPhotos.map((src: string, i: number) => <AttachmentThumbnail key={i} src={src} label="VAT" onClick={() => onPhotoClick(src)} className="w-10 h-10" />)}</div> : <span className="text-[#BBBBBB]">—</span>}
                      </td>
                      <td className="table-cell">
                        {slipPhotos.length > 0 ? <div className="flex gap-1 flex-wrap">{slipPhotos.map((src: string, i: number) => <AttachmentThumbnail key={i} src={src} label="Phiếu giao" onClick={() => onPhotoClick(src)} className="w-10 h-10" />)}</div> : <span className="text-[#BBBBBB]">—</span>}
                      </td>
                      <td className="table-cell whitespace-nowrap"><StatusBadge status={item.status} /></td>
                      <td className="table-cell">
                        {item.status === 'pending' ? (
                          <div className="flex flex-wrap gap-2">
                            <Button variant="success" loading={confirmItemMutation.isPending && actionItemId === item.id} disabled={rejectItemMutation.isPending || returnItemMutation.isPending || revertItemMutation.isPending} onClick={() => confirmItemMutation.mutate(item.id)} className="text-xs py-1 px-2">Duyệt</Button>
                            <Button variant="danger-outline" disabled={confirmItemMutation.isPending || rejectItemMutation.isPending || returnItemMutation.isPending || revertItemMutation.isPending} onClick={() => setRejectItemId(item.id)} className="text-xs py-1 px-2">Từ chối</Button>
                            <Button variant="outline" loading={returnItemMutation.isPending && actionItemId === item.id} disabled={confirmItemMutation.isPending || rejectItemMutation.isPending || returnItemMutation.isPending || revertItemMutation.isPending} onClick={() => returnItemMutation.mutate(item.id)} className="text-xs py-1 px-2">Trả hàng</Button>
                          </div>
                        ) : (item.status === 'confirmed' || item.status === 'rejected' || item.status === 'returned') && canRevert ? (
                          <div className="flex flex-col gap-1">
                            {(item.status === 'rejected' || item.status === 'returned') && item.reject_reason && <p className="max-w-40 text-xs text-[#CC0000]">{item.reject_reason}</p>}
                            <Button variant="outline" loading={revertItemMutation.isPending && actionItemId === item.id} disabled={revertItemMutation.isPending || confirmItemMutation.isPending || rejectItemMutation.isPending || returnItemMutation.isPending} onClick={() => revertItemMutation.mutate(item.id)} className="text-xs py-1 px-2 whitespace-nowrap">Hoàn tác ({minutesLeft(item.reviewed_at)}p)</Button>
                          </div>
                        ) : (item.status === 'rejected' || item.status === 'returned') && item.reject_reason ? (
                          <p className="max-w-40 text-xs text-[#CC0000]">{item.reject_reason}</p>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 sm:hidden">
            {booking.items.map((item: any) => {
              const vatPhotos = itemPhotos(item, 'vat_invoice')
              const slipPhotos = itemPhotos(item, 'delivery_slip')
              const canRevert = isWithin30Min(item.reviewed_at)
              return (
                <article key={item.id} className="rounded border border-[#ecdbe8] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold">{item.product_code}</p>
                      <p className="font-mono text-xs text-[#555555]">{item.process_code}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div><dt className="text-[#888888]">Kho / Màu</dt><dd>{item.warehouse_code ?? '—'} / {item.mau ?? '—'}</dd></div>
                    <div><dt className="text-[#888888]">Lần giao / SL</dt><dd>{item.is_final_round ? 'Cuối' : item.delivery_round} / {itemTotal(item)}</dd></div>
                  </dl>
                  {(vatPhotos.length > 0 || slipPhotos.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {vatPhotos.map((src: string, index: number) => <AttachmentThumbnail key={`vat-${index}`} src={src} label="VAT" onClick={() => onPhotoClick(src)} className="h-11 w-11" />)}
                      {slipPhotos.map((src: string, index: number) => <AttachmentThumbnail key={`slip-${index}`} src={src} label="Phiếu giao" onClick={() => onPhotoClick(src)} className="h-11 w-11" />)}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.status === 'pending' ? (
                      <>
                        <Button variant="success" loading={confirmItemMutation.isPending && actionItemId === item.id} disabled={rejectItemMutation.isPending || returnItemMutation.isPending || revertItemMutation.isPending} onClick={() => confirmItemMutation.mutate(item.id)}>Duyệt</Button>
                        <Button variant="danger-outline" disabled={confirmItemMutation.isPending || rejectItemMutation.isPending || returnItemMutation.isPending || revertItemMutation.isPending} onClick={() => setRejectItemId(item.id)}>Từ chối</Button>
                        <Button variant="outline" loading={returnItemMutation.isPending && actionItemId === item.id} disabled={confirmItemMutation.isPending || rejectItemMutation.isPending || returnItemMutation.isPending || revertItemMutation.isPending} onClick={() => returnItemMutation.mutate(item.id)}>Trả hàng</Button>
                      </>
                    ) : (item.status === 'confirmed' || item.status === 'rejected' || item.status === 'returned') && canRevert ? (
                      <Button variant="outline" loading={revertItemMutation.isPending && actionItemId === item.id} disabled={revertItemMutation.isPending || confirmItemMutation.isPending || rejectItemMutation.isPending || returnItemMutation.isPending} onClick={() => revertItemMutation.mutate(item.id)}>Hoàn tác ({minutesLeft(item.reviewed_at)}p)</Button>
                    ) : null}
                  </div>
                  {(item.status === 'rejected' || item.status === 'returned') && item.reject_reason && <p className="mt-2 text-xs text-[#CC0000]">{item.reject_reason}</p>}
                </article>
              )
            })}
          </div>

          <AmendmentPanel bookingId={booking.id} currentBooking={booking} onSuccess={refreshAll} />

          {canDelete && (
            <div className="flex justify-end">
              <Button
                variant="danger-outline"
                loading={deleteBookingMutation.isPending}
                onClick={() => {
                  if (window.confirm(`Xoá booking ${booking.booking_code}? Không thể hoàn tác.`)) {
                    deleteBookingMutation.mutate(booking.id)
                  }
                }}
                className="text-xs py-1.5 px-3"
              >
                Xoá booking
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <Modal isOpen={!!rejectItemId} onClose={() => setRejectItemId(null)} title="Từ chối đơn hàng" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#888888]">Vui lòng nhập lý do từ chối:</p>
          <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className="input-field resize-none" placeholder="Lý do từ chối..." />
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setRejectItemId(null)} className="flex-1">Huỷ</Button>
            <Button variant="danger-outline" loading={rejectItemMutation.isPending && actionItemId === rejectItemId} disabled={!rejectReason.trim()} onClick={() => rejectItemId && rejectItemMutation.mutate({ itemId: rejectItemId, reason: rejectReason })} className="flex-1">Xác nhận</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}


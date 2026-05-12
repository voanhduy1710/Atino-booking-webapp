import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/Button'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { buildPhotoList } from '@/shared/lib/gcs'
import { formatDateDisplay } from '@/shared/lib/dateUtils'
import { TIME_SLOT_LABELS } from '@/shared/types/domain'
import { AmendmentPanel } from './AmendmentPanel'
import type { BookingRow } from './BookingTooltip'

export interface SelectedBooking extends BookingRow {
  items: any[]
  ghi_chu: string | null
  delivery_note: string
}

interface Props {
  booking: SelectedBooking
  onClose: () => void
  onPhotoClick: (src: string) => void
  onListRefresh: () => void
  canDelete: boolean
  userSub: string
}

export function BookingDetailModal({ booking, onClose, onPhotoClick, onListRefresh, canDelete, userSub }: Props) {
  const queryClient = useQueryClient()
  const [rejectItemId, setRejectItemId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const refreshAll = () => {
    onListRefresh()
    void queryClient.invalidateQueries({ queryKey: ['reviewer-amendment', booking.id] })
  }

  const confirmItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.rpc('confirm_booking_item', {
        p_item_id: itemId,
        p_reviewer_username: userSub,
      } as any)
      if (error) throw error
    },
    onSuccess: refreshAll,
  })

  const rejectItemMutation = useMutation({
    mutationFn: async ({ itemId, reason }: { itemId: string; reason: string }) => {
      const { error } = await supabase.rpc('reject_booking_item', {
        p_item_id: itemId,
        p_reason: reason,
        p_reviewer_username: userSub,
      } as any)
      if (error) throw error
    },
    onSuccess: () => {
      setRejectItemId(null); setRejectReason('')
      refreshAll()
    },
  })

  const deleteBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc('admin_delete_booking' as any, { p_booking_id: bookingId } as any)
      if (error) throw error
    },
    onSuccess: () => { onClose(); onListRefresh() },
  })

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

          {booking.ghi_chu && (
            <div className="p-3 bg-[#F5F5F5] rounded text-sm">{booking.ghi_chu}</div>
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
                {booking.items.map((item: any) => {
                  const photos = buildPhotoList(item)
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
                                onClick={() => onPhotoClick(ph.src)}
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

          <AmendmentPanel
            bookingId={booking.id}
            currentBooking={booking}
            userSub={userSub}
            onSuccess={refreshAll}
          />

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
          />
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setRejectItemId(null)} className="flex-1">Huỷ</Button>
            <Button
              variant="danger-outline"
              loading={rejectItemMutation.isPending}
              disabled={!rejectReason.trim()}
              onClick={() => rejectItemId && rejectItemMutation.mutate({ itemId: rejectItemId, reason: rejectReason })}
              className="flex-1"
            >
              Xác nhận từ chối
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

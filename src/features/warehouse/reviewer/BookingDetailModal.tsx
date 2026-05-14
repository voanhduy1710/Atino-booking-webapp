import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/Button'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { AttachmentThumbnail } from '@/shared/components/AttachmentThumbnail'
import { buildPhotoList } from '@/shared/lib/gcs'
import { countBookingItemStatuses, formatBookingItemSummary } from '@/shared/lib/bookingStatus'
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
  onBookingRefresh: () => Promise<void>
  onActionComplete: () => void
  canDelete: boolean
  userSub: string
}

export function BookingDetailModal({ booking, onClose, onPhotoClick, onListRefresh, onBookingRefresh, onActionComplete, canDelete, userSub }: Props) {
  const queryClient = useQueryClient()
  const [rejectItemId, setRejectItemId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionItemId, setActionItemId] = useState<string | null>(null)
  const itemCounts = countBookingItemStatuses(booking.items)

  const notifySupplier = async (eventType: 'booking_confirmed' | 'booking_rejected', message: string) => {
    if (!booking.supplier_account_id) return
    await supabase.from('notifications').insert({
      recipient_type: 'supplier_account',
      recipient_id: booking.supplier_account_id,
      event_type: eventType,
      message,
      booking_id: booking.id,
    } as any)
  }

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
      const { error } = await supabase.rpc('confirm_booking_item', {
        p_item_id: itemId,
        p_reviewer_username: userSub,
      } as any)
      if (error) throw error
      await notifySupplier('booking_confirmed', `ÄÆ¡n ${booking.booking_code} cÃ³ sáº£n pháº©m Ä‘Ã£ Ä‘Æ°á»£c duyá»‡t.`)
    },
    onSuccess: () => { void refreshAll() },
    onError: () => setActionItemId(null),
  })

  const rejectItemMutation = useMutation({
    mutationFn: async ({ itemId, reason }: { itemId: string; reason: string }) => {
      setActionItemId(itemId)
      const { error } = await supabase.rpc('reject_booking_item', {
        p_item_id: itemId,
        p_reason: reason,
        p_reviewer_username: userSub,
      } as any)
      if (error) throw error
      await notifySupplier('booking_rejected', `ÄÆ¡n ${booking.booking_code} cÃ³ sáº£n pháº©m bá»‹ tá»« chá»‘i. LÃ­ do: ${reason}`)
    },
    onSuccess: () => {
      setRejectItemId(null); setRejectReason('')
      void refreshAll()
    },
    onError: () => setActionItemId(null),
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
            <div><p className="text-xs text-[#888888]">NhÃ  cung cáº¥p</p><p className="font-medium">{booking.supplier_name}</p></div>
            <div><p className="text-xs text-[#888888]">Kho</p><p className="font-medium">{booking.warehouse_name}</p></div>
            <div><p className="text-xs text-[#888888]">NgÃ y giao</p><p className="font-medium">{formatDateDisplay(booking.delivery_date)}</p></div>
            <div><p className="text-xs text-[#888888]">Khung giá»</p><p className="font-medium">{TIME_SLOT_LABELS[booking.time_slot]}</p></div>
          </div>

          {booking.ghi_chu && (
            <div className="p-3 bg-[#F5F5F5] rounded text-sm">{booking.ghi_chu}</div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded border border-[#ecdbe8] px-2 py-2">
              <p className="font-bold text-[#1a7a3e]">{itemCounts.confirmed}/{itemCounts.total}</p>
              <p className="text-[#888888]">ÄÃ£ duyá»‡t</p>
            </div>
            <div className="rounded border border-[#ecdbe8] px-2 py-2">
              <p className="font-bold text-[#CC0000]">{itemCounts.rejected}/{itemCounts.total}</p>
              <p className="text-[#888888]">Tá»« chá»‘i</p>
            </div>
            <div className="rounded border border-[#ecdbe8] px-2 py-2">
              <p className="font-bold text-[#888888]">{itemCounts.pending}/{itemCounts.total}</p>
              <p className="text-[#888888]">Chá» xá»­ lÃ½</p>
            </div>
          </div>
          <p className="text-xs text-[#888888]">{formatBookingItemSummary(itemCounts)}</p>

          <div className="overflow-x-auto border border-[#ecdbe8] rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F5F5F5]">
                  <th className="table-header">MÃ£ SP</th>
                  <th className="table-header">MÃ£ QT</th>
                  <th className="table-header">Láº§n giao</th>
                  <th className="table-header">SL</th>
                  <th className="table-header">áº¢nh</th>
                  <th className="table-header whitespace-nowrap">Tráº¡ng thÃ¡i</th>
                  <th className="table-header">Thao tÃ¡c</th>
                </tr>
              </thead>
              <tbody>
                {booking.items.map((item: any) => {
                  const photos = buildPhotoList(item)
                  return (
                    <tr key={item.id} className="border-t border-[#ecdbe8]">
                      <td className="table-cell font-mono">{item.product_code}</td>
                      <td className="table-cell font-mono">{item.process_code}</td>
                      <td className="table-cell text-center">{item.is_final_round ? 'Cuá»‘i' : item.delivery_round}</td>
                      <td className="table-cell text-right">{item.quantity_booked}</td>
                      <td className="table-cell">
                        {photos.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {photos.map((ph, i) => (
                              <AttachmentThumbnail
                                key={i}
                                src={ph.src}
                                label={ph.label}
                                onClick={() => onPhotoClick(ph.src)}
                                className="w-10 h-10"
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="text-[#BBBBBB]">â€”</span>
                        )}
                      </td>
                      <td className="table-cell whitespace-nowrap"><StatusBadge status={item.status} /></td>
                      <td className="table-cell">
                        {item.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button
                              variant="success"
                              loading={confirmItemMutation.isPending && actionItemId === item.id}
                              disabled={rejectItemMutation.isPending}
                              onClick={() => confirmItemMutation.mutate(item.id)}
                              className="text-xs py-1 px-2"
                            >
                              Duyá»‡t
                            </Button>
                            <Button
                              variant="danger-outline"
                              disabled={confirmItemMutation.isPending || rejectItemMutation.isPending}
                              onClick={() => setRejectItemId(item.id)}
                              className="text-xs py-1 px-2"
                            >
                              Tá»« chá»‘i
                            </Button>
                          </div>
                        )}
                        {item.status === 'rejected' && item.reject_reason && (
                          <p className="max-w-40 text-xs text-[#CC0000]">{item.reject_reason}</p>
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
                  if (window.confirm(`XoÃ¡ booking ${booking.booking_code}? KhÃ´ng thá»ƒ hoÃ n tÃ¡c.`)) {
                    deleteBookingMutation.mutate(booking.id)
                  }
                }}
                className="text-xs py-1.5 px-3"
              >
                XoÃ¡ booking
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={!!rejectItemId}
        onClose={() => setRejectItemId(null)}
        title="Tá»« chá»‘i Ä‘Æ¡n hÃ ng"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-[#888888]">Vui lÃ²ng nháº­p lÃ½ do tá»« chá»‘i:</p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            className="input-field resize-none"
            placeholder="LÃ½ do tá»« chá»‘i..."
          />
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setRejectItemId(null)} className="flex-1">Huá»·</Button>
            <Button
              variant="danger-outline"
              loading={rejectItemMutation.isPending && actionItemId === rejectItemId}
              disabled={!rejectReason.trim()}
              onClick={() => rejectItemId && rejectItemMutation.mutate({ itemId: rejectItemId, reason: rejectReason })}
              className="flex-1"
            >
              XÃ¡c nháº­n tá»« chá»‘i
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { formatDateDisplay } from '@/shared/lib/dateUtils'
import { TIME_SLOT_LABELS, type TimeSlot } from '@/shared/types/domain'
import type { BookingRow } from './BookingTooltip'

interface SelectedBooking extends BookingRow {
  items: any[]
  ghi_chu: string | null
}

interface Props {
  bookingId: string
  currentBooking: SelectedBooking
  userSub: string
  onSuccess: () => void
}

export function AmendmentPanel({ bookingId, currentBooking, userSub, onSuccess }: Props) {
  const [resolveId, setResolveId] = useState<string | null>(null)
  const [resolveDecision, setResolveDecision] = useState<'approved' | 'denied' | null>(null)
  const [resolveNote, setResolveNote] = useState('')

  const { data: amendment, refetch } = useQuery({
    queryKey: ['reviewer-amendment', bookingId],
    queryFn: async () => {
      const { data } = await supabase
        .from('booking_amendments' as any)
        .select('id, amendment_type, request_note, proposed_changes, status, reviewer_note, created_at')
        .eq('booking_id', bookingId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      return (data as {
        id: string; amendment_type: string; request_note: string
        proposed_changes: { delivery_date?: string; time_slot?: string; ghi_chu?: string; items?: Array<{ id: string; quantity_booked: number }> } | null
        status: string; reviewer_note: string | null; created_at: string
      } | null) ?? null
    },
    enabled: !!bookingId,
  })

  const resolveMutation = useMutation({
    mutationFn: async ({ amendmentId, decision, note }: { amendmentId: string; decision: string; note: string }) => {
      const { error } = await supabase.rpc('resolve_booking_amendment' as any, {
        p_amendment_id: amendmentId,
        p_reviewer_username: userSub,
        p_decision: decision,
        p_note: note,
      } as any)
      if (error) throw error

      if (currentBooking.supplier_account_id) {
        const typeLabel = amendment?.amendment_type === 'recall' ? 'huỷ' : 'chỉnh sửa'
        const statusLabel = decision === 'approved' ? 'chấp thuận' : 'từ chối'
        await supabase.from('notifications').insert({
          recipient_type: 'supplier_account',
          recipient_id: currentBooking.supplier_account_id,
          event_type: decision === 'approved' ? 'amendment_approved' : 'amendment_denied',
          message: `Yêu cầu ${typeLabel} booking ${currentBooking.booking_code} đã được ${statusLabel}.`,
          booking_id: bookingId,
        } as any)
      }
    },
    onSuccess: () => {
      setResolveId(null); setResolveDecision(null); setResolveNote('')
      onSuccess()
      void refetch()
    },
  })

  if (!amendment) return null

  const pc = amendment.proposed_changes
  const isUpdate = amendment.amendment_type === 'update'

  return (
    <>
      <div className="border border-[#F5C518] bg-[#FFF8E1] rounded-lg p-4 space-y-3">
        <p className="font-semibold text-sm">
          {isUpdate ? '🖍 Yêu cầu chỉnh sửa booking' : '⚠️ Yêu cầu huỷ booking'}
        </p>
        <p className="text-xs text-[#888888]">{amendment.request_note}</p>

        {isUpdate && pc && (
          <div className="bg-white border border-[#ecdbe8] rounded text-xs overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F5F5F5]">
                  <th className="px-3 py-2 text-left font-medium text-[#888888]">Trường</th>
                  <th className="px-3 py-2 text-left font-medium text-[#888888]">Hiện tại</th>
                  <th className="px-3 py-2 text-left font-medium text-[#888888]">Đề xuất</th>
                </tr>
              </thead>
              <tbody>
                {pc.delivery_date && pc.delivery_date !== currentBooking.delivery_date && (
                  <tr className="border-t border-[#ecdbe8]">
                    <td className="px-3 py-2 text-[#888888]">Ngày giao</td>
                    <td className="px-3 py-2">{formatDateDisplay(currentBooking.delivery_date)}</td>
                    <td className="px-3 py-2 font-medium text-[#1a7a3e]">{formatDateDisplay(pc.delivery_date)}</td>
                  </tr>
                )}
                {pc.time_slot && pc.time_slot !== currentBooking.time_slot && (
                  <tr className="border-t border-[#ecdbe8]">
                    <td className="px-3 py-2 text-[#888888]">Khung giờ</td>
                    <td className="px-3 py-2">{TIME_SLOT_LABELS[currentBooking.time_slot]}</td>
                    <td className="px-3 py-2 font-medium text-[#1a7a3e]">{TIME_SLOT_LABELS[pc.time_slot as TimeSlot] ?? pc.time_slot}</td>
                  </tr>
                )}
                {'ghi_chu' in pc && pc.ghi_chu !== (currentBooking.ghi_chu ?? '') && (
                  <tr className="border-t border-[#ecdbe8]">
                    <td className="px-3 py-2 text-[#888888]">Ghi chú</td>
                    <td className="px-3 py-2 text-[#888888] italic">{currentBooking.ghi_chu || '(trống)'}</td>
                    <td className="px-3 py-2 font-medium text-[#1a7a3e]">{pc.ghi_chu || '(xoá)'}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {pc.items && pc.items.length > 0 && (() => {
              const changedItems = pc.items.filter((pi) => {
                const orig = currentBooking.items.find((it: any) => it.id === pi.id)
                return orig && orig.quantity_booked !== pi.quantity_booked
              })
              if (changedItems.length === 0) return null
              return (
                <div className="border-t border-[#ecdbe8]">
                  <p className="px-3 pt-2 pb-1 text-[10px] text-[#888888] uppercase tracking-wider">Số lượng đơn hàng</p>
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#F5F5F5]">
                        <th className="px-3 py-1 text-left font-medium text-[#888888]">Mã SP</th>
                        <th className="px-3 py-1 text-left font-medium text-[#888888]">Mã QT</th>
                        <th className="px-3 py-1 text-right font-medium text-[#888888]">Hiện tại</th>
                        <th className="px-3 py-1 text-right font-medium text-[#888888]">Đề xuất</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changedItems.map((pi) => {
                        const orig = currentBooking.items.find((it: any) => it.id === pi.id)
                        return (
                          <tr key={pi.id} className="border-t border-[#ecdbe8]">
                            <td className="px-3 py-1 font-mono">{orig?.product_code}</td>
                            <td className="px-3 py-1 font-mono">{orig?.process_code}</td>
                            <td className="px-3 py-1 text-right">{orig?.quantity_booked}</td>
                            <td className="px-3 py-1 text-right font-medium text-[#1a7a3e]">{pi.quantity_booked}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="success"
            className="text-xs py-1 px-3"
            loading={resolveMutation.isPending && resolveDecision === 'approved'}
            onClick={() => { setResolveId(amendment.id); setResolveDecision('approved'); setResolveNote('') }}
          >
            Chấp thuận
          </Button>
          <Button
            variant="danger-outline"
            className="text-xs py-1 px-3"
            loading={resolveMutation.isPending && resolveDecision === 'denied'}
            onClick={() => { setResolveId(amendment.id); setResolveDecision('denied'); setResolveNote('') }}
          >
            Từ chối
          </Button>
        </div>
      </div>

      <Modal
        isOpen={!!resolveId && !!resolveDecision}
        onClose={() => { setResolveId(null); setResolveDecision(null) }}
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
            <Button variant="outline" onClick={() => { setResolveId(null); setResolveDecision(null) }} className="flex-1">Huỷ</Button>
            <Button
              variant={resolveDecision === 'approved' ? 'success' : 'danger-outline'}
              loading={resolveMutation.isPending}
              disabled={resolveDecision === 'denied' && !resolveNote.trim()}
              onClick={() =>
                resolveId && resolveDecision &&
                resolveMutation.mutate({ amendmentId: resolveId, decision: resolveDecision, note: resolveNote })
              }
              className="flex-1"
            >
              Xác nhận
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

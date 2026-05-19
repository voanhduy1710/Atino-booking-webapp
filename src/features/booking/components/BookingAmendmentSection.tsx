import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { postJson } from '@/shared/lib/apiClient'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { FilterDatePicker } from '@/shared/components/FilterDatePicker'
import { TIME_SLOT_LABELS, type TimeSlot, type BookingStatus } from '@/shared/types/domain'
import type { DecodedToken } from '@/shared/lib/auth'

interface BookingItem {
  id: string
  product_code: string
  process_code: string
  quantity_booked: number
}

interface BookingForAmendment {
  id: string
  delivery_date: string
  time_slot: TimeSlot
  ghi_chu: string | null
  status: BookingStatus
  supplier_account_id: string
  booking_items: BookingItem[]
}

interface EditFormState {
  delivery_date: string
  time_slot: string
  ghi_chu: string
  items: Array<{ id: string; product_code: string; process_code: string; quantity_booked: number }>
}

interface Amendment {
  id: string
  amendment_type: 'update' | 'recall'
  request_note: string
  proposed_changes: object | null
  status: 'pending' | 'approved' | 'denied'
  reviewer_note: string | null
  created_at: string
}

interface Props {
  booking: BookingForAmendment
  user: DecodedToken | null
}

export function BookingAmendmentSection({ booking, user }: Props) {
  const queryClient = useQueryClient()
  const [amendModal, setAmendModal] = useState<'update' | 'recall' | null>(null)
  const [amendNote, setAmendNote] = useState('')
  const [amendError, setAmendError] = useState('')
  const [editForm, setEditForm] = useState<EditFormState | null>(null)

  const isOwner = user?.role === 'supplier' && user.supplier_account_id === booking.supplier_account_id
  const canRequest = isOwner && !['received', 'cancelled', 'rejected'].includes(booking.status)

  const { data: pendingAmendment } = useQuery({
    queryKey: ['booking-amendment', booking.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('booking_amendments' as any)
        .select('id, amendment_type, request_note, proposed_changes, status, reviewer_note, created_at')
        .eq('booking_id', booking.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      return (data as Amendment | null) ?? null
    },
    enabled: !!booking.id,
  })

  const requestAmendmentMutation = useMutation({
    mutationFn: async ({ type, note, proposed_changes }: { type: string; note: string; proposed_changes?: object }) => {
      await postJson<{ ok: true }>(`/api/amendments/bookings/${booking.id}/request`, {
        type,
        note,
        proposed_changes: proposed_changes ?? null,
      })
    },
    onSuccess: () => {
      setAmendModal(null); setAmendNote(''); setAmendError(''); setEditForm(null)
      void queryClient.invalidateQueries({ queryKey: ['booking-amendment', booking.id] })
    },
    onError: (e: Error) => setAmendError(e.message),
  })

  if (!isOwner) return null

  return (
    <div className="mt-4 bg-white border border-[#ecdbe8] rounded-lg px-6 py-4">
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
      ) : canRequest ? (
        <div className="flex gap-2">
          <button
            onClick={() => {
              setAmendModal('update'); setAmendNote(''); setAmendError('')
              setEditForm({
                delivery_date: booking.delivery_date,
                time_slot: booking.time_slot,
                ghi_chu: booking.ghi_chu ?? '',
                items: booking.booking_items.map((item) => ({
                  id: item.id, product_code: item.product_code, process_code: item.process_code, quantity_booked: item.quantity_booked,
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

      <Modal
        isOpen={!!amendModal}
        onClose={() => { setAmendModal(null); setEditForm(null) }}
        title={amendModal === 'recall' ? 'Yêu cầu huỷ booking' : 'Yêu cầu chỉnh sửa booking'}
        size={amendModal === 'update' ? 'lg' : 'sm'}
      >
        {amendModal === 'recall' ? (
          <div className="space-y-4">
            <p className="text-sm text-[#888888]">Mô tả lý do bạn muốn huỷ booking này.</p>
            <textarea value={amendNote} onChange={(e) => setAmendNote(e.target.value)} rows={4} className="input-field resize-none w-full" placeholder="Lý do huỷ..." />
            {amendError && <p className="text-xs text-[#CC0000]">{amendError}</p>}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setAmendModal(null)} className="flex-1">Huỷ</Button>
              <Button variant="danger-outline" loading={requestAmendmentMutation.isPending} disabled={!amendNote.trim()} onClick={() => requestAmendmentMutation.mutate({ type: 'recall', note: amendNote })} className="flex-1">Gửi yêu cầu</Button>
            </div>
          </div>
        ) : editForm ? (
          <div className="space-y-4">
            <p className="text-sm text-[#888888]">Chỉnh sửa thông tin booking bên dưới.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-[#888888] block mb-1">Ngày giao</label>
                <FilterDatePicker value={editForm.delivery_date} onChange={(v) => setEditForm({ ...editForm, delivery_date: v })} placeholder="Chọn ngày" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#888888] block mb-1">Khung giờ</label>
                <select value={editForm.time_slot} onChange={(e) => setEditForm({ ...editForm, time_slot: e.target.value })} className="input-field text-sm">
                  {(Object.entries(TIME_SLOT_LABELS) as [string, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-[#888888] block mb-1">Ghi chú</label>
              <textarea value={editForm.ghi_chu} onChange={(e) => setEditForm({ ...editForm, ghi_chu: e.target.value })} rows={2} className="input-field resize-none w-full" placeholder="Ghi chú (tuỳ chọn)" />
            </div>
            <div>
              <p className="text-xs font-medium text-[#888888] mb-2">Số lượng đơn hàng</p>
              <div className="border border-[#ecdbe8] rounded overflow-hidden">
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
                      <tr key={item.id} className="border-t border-[#ecdbe8]">
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
            <div>
              <label className="text-xs font-medium text-[#888888] block mb-1">Lý do / ghi chú yêu cầu *</label>
              <textarea value={amendNote} onChange={(e) => setAmendNote(e.target.value)} rows={2} className="input-field resize-none w-full" placeholder="Mô tả lý do chỉnh sửa..." />
            </div>
            {amendError && <p className="text-xs text-[#CC0000]">{amendError}</p>}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setAmendModal(null); setEditForm(null) }} className="flex-1">Huỷ</Button>
              <Button
                variant="primary"
                loading={requestAmendmentMutation.isPending}
                disabled={!amendNote.trim()}
                onClick={() => {
                  const proposed = {
                    delivery_date: editForm.delivery_date, time_slot: editForm.time_slot, ghi_chu: editForm.ghi_chu,
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

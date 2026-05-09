import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Navbar } from '@/shared/components/Navbar'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { formatDateDisplay } from '@/shared/lib/dateUtils'
import { TIME_SLOT_LABELS, type TimeSlot, type BookingStatus } from '@/shared/types/domain'
import { getCurrentUser } from '@/shared/lib/auth'

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

export default function ReviewerPage() {
  const [dateFilter, setDateFilter] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [selectedBooking, setSelectedBooking] = useState<SelectedBooking | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectItemId, setRejectItemId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const user = getCurrentUser()

  useEffect(() => {
    document.title = 'Xác nhận booking — Atino'
  }, [])

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['reviewer-bookings', dateFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, booking_code, booking_token, delivery_date, time_slot, status, submitted_at,
          suppliers!inner(name),
          warehouses!inner(name),
          booking_items(id)
        `)
        .eq('delivery_date', dateFilter)
        .order('submitted_at', { ascending: false })
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
      .select('*, booking_items(*)')
      .eq('id', row.id)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reviewer-bookings'] })
      if (selectedBooking) {
        void openBooking(selectedBooking)
      }
    },
  })

  const rejectItemMutation = useMutation({
    mutationFn: async ({ itemId, reason }: { itemId: string; reason: string }) => {
      const { error } = await supabase.rpc('reject_booking_item', {
        p_item_id: itemId,
        p_reason: reason,
        p_reviewer_username: user?.sub ?? '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F5]">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">Xác nhận booking</h1>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="input-field w-40"
            id="reviewer-date-filter"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
        ) : bookings.length === 0 ? (
          <div className="bg-white border border-[#E0E0E0] rounded-lg p-16 text-center text-[#888888]">
            <p>Không có booking nào cho ngày {formatDateDisplay(dateFilter)}</p>
          </div>
        ) : (
          <div className="overflow-x-auto bg-white border border-[#E0E0E0] rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F5F5F5]">
                  <th className="table-header">Mã booking</th>
                  <th className="table-header">Nhà cung cấp</th>
                  <th className="table-header">Kho</th>
                  <th className="table-header w-28">Khung giờ</th>
                  <th className="table-header w-20">SL PO</th>
                  <th className="table-header">Trạng thái</th>
                  <th className="table-header w-20">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id} className="border-t border-[#E0E0E0] hover:bg-[#F9F9F9]">
                    <td className="table-cell font-mono font-bold">{b.booking_code}</td>
                    <td className="table-cell">{b.supplier_name}</td>
                    <td className="table-cell">{b.warehouse_name}</td>
                    <td className="table-cell">{TIME_SLOT_LABELS[b.time_slot]}</td>
                    <td className="table-cell text-center">{b.items_count}</td>
                    <td className="table-cell"><StatusBadge status={b.status} /></td>
                    <td className="table-cell">
                      <button
                        onClick={() => openBooking(b)}
                        className="text-sm text-[#888888] hover:text-black underline"
                      >
                        Xem
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

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
                    <th className="table-header">Trạng thái</th>
                    <th className="table-header">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBooking.items.map((item: any) => (
                    <tr key={item.id} className="border-t border-[#E0E0E0]">
                      <td className="table-cell font-mono">{item.product_code}</td>
                      <td className="table-cell font-mono">{item.process_code}</td>
                      <td className="table-cell text-center">{item.is_final_round ? 'Cuối' : item.delivery_round}</td>
                      <td className="table-cell text-right">{item.quantity_booked}</td>
                      <td className="table-cell"><StatusBadge status={item.status} /></td>
                      <td className="table-cell">
                        {item.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
    </div>
  )
}

import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Navbar } from '@/shared/components/Navbar'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { formatDateDisplay, formatDateTimeDisplay } from '@/shared/lib/dateUtils'
import { TIME_SLOT_LABELS, type TimeSlot, type BookingStatus } from '@/shared/types/domain'

interface BookingRow {
  id: string
  booking_code: string
  booking_token: string
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
  }>
}

export default function BookingDetailPublic() {
  const { token } = useParams<{ token: string }>()

  useEffect(() => {
    document.title = 'Chi tiết đăng ký — Atino Booking'
  }, [])

  const { data: booking, isLoading, error } = useQuery({
    queryKey: ['booking-public', token],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, booking_code, booking_token, delivery_date, time_slot, status,
          submitted_at, ghi_chu, confirmed_by, received_by,
          suppliers(name, code),
          warehouses(name, code),
          booking_items(id, product_code, process_code, delivery_round, is_final_round, quantity_booked, quantity_received, status)
        `)
        .eq('booking_token', token!)
        .single()
      if (error) throw error
      return data as unknown as BookingRow
    },
    enabled: !!token,
  })

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
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F5F5F5]">
                  <th className="table-header">Mã SP</th>
                  <th className="table-header">Mã QT</th>
                  <th className="table-header w-24">Lần giao</th>
                  <th className="table-header w-24">SL đăng ký</th>
                  <th className="table-header w-24">SL thực nhận</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
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
                  </tr>
                ))}
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
      </main>
    </div>
  )
}

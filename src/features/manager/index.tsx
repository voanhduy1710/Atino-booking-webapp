import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Navbar } from '@/shared/components/Navbar'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { formatDateDisplay } from '@/shared/lib/dateUtils'
import { TIME_SLOT_LABELS, type TimeSlot, type BookingStatus } from '@/shared/types/domain'

export default function ManagerPage() {
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState<string>(new Date().toISOString().split('T')[0])
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all')

  useEffect(() => { document.title = 'Quản lý — Atino' }, [])

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['manager-bookings', dateFrom, dateTo, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from('bookings')
        .select('id, booking_code, delivery_date, time_slot, status, submitted_at, suppliers!inner(name), warehouses!inner(name), booking_items(id)')
        .gte('delivery_date', dateFrom)
        .lte('delivery_date', dateTo)
        .order('delivery_date', { ascending: false })

      if (statusFilter !== 'all') q = q.eq('status', statusFilter)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((b: any) => ({
        id: b.id,
        booking_code: b.booking_code,
        delivery_date: b.delivery_date,
        time_slot: b.time_slot,
        status: b.status,
        submitted_at: b.submitted_at,
        supplier_name: b.suppliers?.name ?? '—',
        warehouse_name: b.warehouses?.name ?? '—',
        items_count: b.booking_items?.length ?? 0,
      }))
    },
  })

  const { data: capacity = [] } = useQuery({
    queryKey: ['daily-capacity', dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_capacity')
        .select('*')
        .gte('delivery_date', dateFrom)
        .lte('delivery_date', dateTo)
        .order('delivery_date')
      if (error) throw error
      return data ?? []
    },
  })

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F5]">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <h1 className="text-xl font-bold mb-6">Quản lý booking</h1>

        {/* Capacity summary */}
        {capacity.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {capacity.map((row: any) => (
              <div key={row.delivery_date} className="bg-white border border-[#E0E0E0] rounded-lg p-4 text-center">
                <p className="text-xs text-[#888888] mb-1">{formatDateDisplay(row.delivery_date)}</p>
                <p className="text-xl font-bold">{row.total_bookings}</p>
                <p className="text-xs text-[#888888]">bookings</p>
                <p className="text-sm font-semibold mt-1">{row.confirmed_units ?? 0} kiện</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field w-36" />
          <span className="self-center text-[#888888]">→</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field w-36" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as BookingStatus | 'all')}
            className="input-field w-48"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="pending">Chờ xác nhận</option>
            <option value="confirmed">Đã xác nhận</option>
            <option value="received">Đã nhận hàng</option>
            <option value="rejected">Đã từ chối</option>
          </select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
        ) : (
          <div className="overflow-x-auto bg-white border border-[#E0E0E0] rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F5F5F5]">
                  <th className="table-header">Mã booking</th>
                  <th className="table-header">Nhà cung cấp</th>
                  <th className="table-header">Kho</th>
                  <th className="table-header">Ngày giao</th>
                  <th className="table-header">Khung giờ</th>
                  <th className="table-header">SL PO</th>
                  <th className="table-header">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b: any) => (
                  <tr key={b.id} className="border-t border-[#E0E0E0]">
                    <td className="table-cell font-mono font-bold text-xs">{b.booking_code}</td>
                    <td className="table-cell">{b.supplier_name}</td>
                    <td className="table-cell">{b.warehouse_name}</td>
                    <td className="table-cell">{formatDateDisplay(b.delivery_date)}</td>
                    <td className="table-cell">{TIME_SLOT_LABELS[b.time_slot as TimeSlot]}</td>
                    <td className="table-cell text-center">{b.items_count}</td>
                    <td className="table-cell"><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
                {bookings.length === 0 && (
                  <tr><td colSpan={7} className="table-cell text-center text-[#888888] py-8">Không có dữ liệu</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

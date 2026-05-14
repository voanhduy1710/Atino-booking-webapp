import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { getCurrentUser } from '@/shared/lib/auth'
import { Navbar } from '@/shared/components/Navbar'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { formatDateDisplay } from '@/shared/lib/dateUtils'
import { deriveBookingStatus, getBookingStatusTags } from '@/shared/lib/bookingStatus'
import { TIME_SLOT_LABELS, type BookingStatus, type TimeSlot } from '@/shared/types/domain'
import { Link } from 'react-router-dom'
import { SUPPLIER_TABS } from '@/features/booking/components/BookingForm'

interface MyBooking {
  id: string
  booking_code: string
  booking_token: string
  delivery_date: string
  time_slot: TimeSlot
  status: BookingStatus
  submitted_at: string
  warehouse_name: string
  warehouse_code: string
  status_tags: BookingStatus[]
  ghi_chu: string | null
  reject_reasons: string
  booking_items?: Array<{ status: string; reject_reason: string | null }>
}

// â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function MyBookingsPage() {
  const user = getCurrentUser()
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all')

  useEffect(() => {
    document.title = 'Lá»‹ch sá»­ Ä‘Äƒng kÃ½ â€” Atino Booking'
  }, [])

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['my-bookings', user?.supplier_account_id, statusFilter],
    queryFn: async () => {
      if (!user?.supplier_account_id) return []
      const q = supabase
        .from('bookings')
        .select('id, booking_code, booking_token, delivery_date, time_slot, status, submitted_at, ghi_chu, warehouses!inner(name, code), booking_items(status, reject_reason)')
        .eq('supplier_account_id', user.supplier_account_id)
        .order('submitted_at', { ascending: false })
        .limit(100)

      const { data, error } = await q
      if (error) throw error

      const rows = (data ?? []).map((b: any) => {
        const items = b.booking_items ?? []
        const status = deriveBookingStatus(b.status, items)
        const itemStatusTags = getBookingStatusTags(items)
        const statusTags = status === 'received' || status === 'cancelled'
          ? [status]
          : itemStatusTags.length > 0 ? itemStatusTags : [status]
        return {
          id: b.id,
          booking_code: b.booking_code,
          booking_token: b.booking_token,
          delivery_date: b.delivery_date,
          time_slot: b.time_slot,
          status,
          status_tags: statusTags,
          ghi_chu: b.ghi_chu,
          reject_reasons: items.map((item: any) => item.reject_reason).filter(Boolean).join('; '),
          submitted_at: b.submitted_at,
          warehouse_name: b.warehouses?.name ?? '',
          warehouse_code: b.warehouses?.code ?? '',
        }
      }) as MyBooking[]
      return statusFilter === 'all' ? rows : rows.filter((b) => b.status_tags.includes(statusFilter))
    },
    enabled: !!user?.supplier_account_id,
  })

  const STATUS_TABS: { label: string; value: BookingStatus | 'all' }[] = [
    { label: 'Táº¥t cáº£', value: 'all' },
    { label: 'Chá» xÃ¡c nháº­n', value: 'pending' },
    { label: 'Duyá»‡t má»™t pháº§n', value: 'partially_approved' },
    { label: 'Tá»« chá»‘i má»™t pháº§n', value: 'partially_rejected' },
    { label: 'ÄÃ£ xÃ¡c nháº­n', value: 'confirmed' },
    { label: 'ÄÃ£ nháº­n hÃ ng', value: 'received' },
    { label: 'ÄÃ£ tá»« chá»‘i', value: 'rejected' },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={SUPPLIER_TABS} activeTab="my-bookings" />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">Lá»‹ch sá»­ Ä‘Äƒng kÃ½ giao hÃ ng</h1>
          <Link to="/booking/new" className="btn-green" id="new-booking-btn">
            + ÄÄƒng kÃ½ má»›i
          </Link>
        </div>

        {/* Status filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${statusFilter === tab.value
                  ? 'bg-[#80417A] text-white border-[#80417A] font-bold'
                  : 'bg-white text-[#888888] border-[#ecdbe8] hover:border-[#80417A] hover:text-black'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Booking list */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-white border border-[#ecdbe8] rounded-lg p-16 text-center text-[#888888]">
            <p>ChÆ°a cÃ³ Ä‘Äƒng kÃ½ nÃ o</p>
            <Link to="/booking/new" className="mt-3 text-sm text-black underline block">
              Táº¡o Ä‘Æ¡n Ä‘Äƒng kÃ½ ngay
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {bookings.map((b) => (
              <Link
                key={b.id}
                to={`/booking/${b.booking_token}`}
                className="block bg-white border border-[#ecdbe8] rounded-lg px-5 py-4 hover:border-[#80417A] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold">{b.booking_code}</p>
                    <p className="text-xs text-[#888888] mt-0.5">
                      {b.warehouse_name} â€¢ Giao ngÃ y {formatDateDisplay(b.delivery_date)} â€¢{' '}
                      {TIME_SLOT_LABELS[b.time_slot]}
                    </p>
                    <div className="mt-2 grid gap-1 text-xs text-[#555555] sm:grid-cols-2">
                      <p><span className="font-semibold text-black">Ghi chÃº:</span> {b.ghi_chu || <span className="text-[#BBBBBB]">â€”</span>}</p>
                      <p><span className="font-semibold text-black">LÃ­ do:</span> {b.reject_reasons || <span className="text-[#BBBBBB]">â€”</span>}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {b.status_tags.map((status) => <StatusBadge key={status} status={status} />)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

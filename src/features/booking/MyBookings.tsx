import { useState, useEffect } from 'react'
import { type NavTab } from '@/shared/components/Navbar'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { getCurrentUser } from '@/shared/lib/auth'
import { Navbar } from '@/shared/components/Navbar'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { formatDateDisplay } from '@/shared/lib/dateUtils'
import { TIME_SLOT_LABELS, type BookingStatus, type TimeSlot } from '@/shared/types/domain'
import { Link } from 'react-router-dom'

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
}

// ── Inline guide content ──────────────────────────────────────────────────────

const CREATE_STEPS = [
  {
    step: 1,
    title: 'Đăng nhập tài khoản',
    desc: 'Sử dụng tên đăng nhập và mật khẩu được cấp. Nếu chưa có tài khoản, vui lòng đăng ký và chờ admin xác nhận.',
  },
  {
    step: 2,
    title: 'Chọn kho và điền thông tin nhà cung cấp',
    desc: 'Chọn kho hàng từ dropdown. Mã NCC và Tên NCC được tự động điền từ tài khoản của bạn.',
  },
  {
    step: 3,
    title: 'Nhập số lượng đơn hàng (PO)',
    desc: 'Nhập số lượng đơn hàng (1–99). Hệ thống sẽ tạo ra số hàng tương ứng trong bảng đơn hàng.',
  },
  {
    step: 4,
    title: 'Điền thông tin từng đơn hàng',
    desc: 'Cho mỗi hàng: nhập Mã sản phẩm — Mã quy trình, chọn Số lần giao, nhập Số kiện/thùng, tải lên ảnh phiếu giao. Nếu đây là lần giao đầu tiên (Số lần giao = 1), bắt buộc phải tải lên Hóa đơn VAT.',
  },
  {
    step: 5,
    title: 'Chọn khung giờ giao hàng',
    desc: 'Chọn một trong bốn khung giờ: 07:00–09:00, 09:00–11:00, 13:30–15:30, 15:30–17:00. Đơn hàng đăng ký trước 18:00 sẽ giao ngày N+1, từ 18:00 trở đi sẽ giao ngày N+2.',
  },
  {
    step: 6,
    title: 'Gửi đăng ký và lưu mã QR',
    desc: 'Nhấn "Đăng ký". Sau khi thành công, bạn sẽ nhận được mã booking và mã QR. Vui lòng lưu hoặc in mã QR để sử dụng khi giao hàng tại kho.',
  },
]

const RECEIVING_STEPS = [
  {
    step: 1,
    title: 'Đăng ký trước khi đến',
    desc: 'Nhà cung cấp phải hoàn thành đăng ký giao hàng trên hệ thống. Đơn hàng cần được xác nhận bởi nhân viên kho trước khi đến giao.',
  },
  {
    step: 2,
    title: 'Đến kho đúng khung giờ đã đăng ký',
    desc: 'Xuất trình mã QR hoặc mã booking cho nhân viên kho tại cổng. Hàng hóa phải đúng chủng loại và số lượng đã đăng ký.',
  },
  {
    step: 3,
    title: 'Nhân viên kho xác nhận nhận hàng',
    desc: 'Nhân viên sẽ kiểm tra, đếm số lượng thực nhận và xác nhận trên hệ thống. Nếu có chênh lệch, sẽ được ghi nhận và xử lý theo chính sách của Atino.',
  },
]

function GuideCreateContent() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h2 className="text-xl font-bold mb-1">Hướng dẫn tạo đơn đăng ký giao hàng</h2>
      <p className="text-[#888888] text-sm mb-8">
        Làm theo các bước dưới đây để đăng ký giao hàng thành công.
      </p>
      <div className="space-y-7">
        {CREATE_STEPS.map(({ step, title, desc }) => (
          <div key={step} className="flex gap-5">
            <div className="flex-shrink-0 w-9 h-9 rounded-full border-2 border-black flex items-center justify-center font-bold text-sm">
              {step}
            </div>
            <div>
              <h3 className="font-semibold mb-1">{title}</h3>
              <p className="text-[#888888] text-sm leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-10 pt-6 border-t border-[#E0E0E0]">
        <Link to="/booking/new" className="btn-primary inline-flex" id="guide-go-to-booking">
          Đăng ký giao hàng ngay
        </Link>
      </div>
    </div>
  )
}

function GuideReceivingContent() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h2 className="text-xl font-bold mb-1">Quy trình giao nhận hàng</h2>
      <p className="text-[#888888] text-sm mb-8">
        Quy trình chuẩn khi giao hàng đến kho Atino.
      </p>
      <div className="space-y-7">
        {RECEIVING_STEPS.map(({ step, title, desc }) => (
          <div key={step} className="flex gap-5">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm">
              {step}
            </div>
            <div>
              <h3 className="font-semibold mb-1">{title}</h3>
              <p className="text-[#888888] text-sm leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 p-4 border border-[#E0E0E0] rounded-lg bg-[#F5F5F5]">
        <p className="text-sm text-[#888888]">
          <strong className="text-black">Lưu ý:</strong> Hàng giao thiếu hoặc không đúng chủng loại sẽ bị trả về.
          Vui lòng đến đúng khung giờ đã chọn. Trễ giờ có thể bị từ chối nhận hàng.
        </p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type PageTab = 'bookings' | 'guide-create' | 'guide-receiving'

const PAGE_TABS: NavTab[] = [
  { id: 'bookings',         label: '📋 Đơn của tôi' },
  { id: 'guide-create',    label: '📝 Tạo đơn' },
  { id: 'guide-receiving', label: '🏭 Nhận hàng' },
]

export default function MyBookingsPage() {
  const user = getCurrentUser()
  const [pageTab, setPageTab] = useState<PageTab>('bookings')
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all')

  useEffect(() => {
    document.title = 'Lịch sử đăng ký — Atino Booking'
  }, [])

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['my-bookings', user?.supplier_account_id, statusFilter],
    queryFn: async () => {
      if (!user?.supplier_account_id) return []
      const q = supabase
        .from('bookings')
        .select('id, booking_code, booking_token, delivery_date, time_slot, status, submitted_at, warehouses!inner(name, code)')
        .eq('supplier_account_id', user.supplier_account_id)
        .order('submitted_at', { ascending: false })
        .limit(100)

      if (statusFilter !== 'all') {
        q.eq('status', statusFilter)
      }

      const { data, error } = await q
      if (error) throw error

      return (data ?? []).map((b: any) => ({
        id: b.id,
        booking_code: b.booking_code,
        booking_token: b.booking_token,
        delivery_date: b.delivery_date,
        time_slot: b.time_slot,
        status: b.status,
        submitted_at: b.submitted_at,
        warehouse_name: b.warehouses?.name ?? '',
        warehouse_code: b.warehouses?.code ?? '',
      })) as MyBooking[]
    },
    enabled: !!user?.supplier_account_id,
  })

  const STATUS_TABS: { label: string; value: BookingStatus | 'all' }[] = [
    { label: 'Tất cả', value: 'all' },
    { label: 'Chờ xác nhận', value: 'pending' },
    { label: 'Đã xác nhận', value: 'confirmed' },
    { label: 'Đã nhận hàng', value: 'received' },
    { label: 'Đã từ chối', value: 'rejected' },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F5]">
      <Navbar
        tabs={PAGE_TABS}
        activeTab={pageTab}
        onTabChange={(id) => setPageTab(id as PageTab)}
      />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">
            {pageTab === 'bookings' && 'Lịch sử đăng ký giao hàng'}
            {pageTab === 'guide-create' && 'Hướng dẫn tạo đơn'}
            {pageTab === 'guide-receiving' && 'Quy trình nhận hàng'}
          </h1>
          <Link to="/booking/new" className="btn-green" id="new-booking-btn">
            + Đăng ký mới
          </Link>
        </div>

        {/* Tab content */}
        {pageTab === 'bookings' && (
          <>
            {/* Status filters */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setStatusFilter(tab.value)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    statusFilter === tab.value
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-[#888888] border-[#E0E0E0] hover:border-black hover:text-black'
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
              <div className="bg-white border border-[#E0E0E0] rounded-lg p-16 text-center text-[#888888]">
                <p>Chưa có đăng ký nào</p>
                <button
                  onClick={() => setPageTab('guide-create')}
                  className="mt-3 text-sm text-black underline"
                >
                  Xem hướng dẫn tạo đơn
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {bookings.map((b) => (
                  <Link
                    key={b.id}
                    to={`/booking/${b.booking_token}`}
                    className="block bg-white border border-[#E0E0E0] rounded-lg px-5 py-4 hover:border-black transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-bold">{b.booking_code}</p>
                        <p className="text-xs text-[#888888] mt-0.5">
                          {b.warehouse_name} • Giao ngày {formatDateDisplay(b.delivery_date)} •{' '}
                          {TIME_SLOT_LABELS[b.time_slot]}
                        </p>
                      </div>
                      <StatusBadge status={b.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {pageTab === 'guide-create' && (
          <div className="bg-white border border-[#E0E0E0] rounded-lg">
            <GuideCreateContent />
          </div>
        )}

        {pageTab === 'guide-receiving' && (
          <div className="bg-white border border-[#E0E0E0] rounded-lg">
            <GuideReceivingContent />
          </div>
        )}
      </main>
    </div>
  )
}

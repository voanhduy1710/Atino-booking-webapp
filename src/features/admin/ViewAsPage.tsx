import { useState, useEffect, lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Navbar } from '@/shared/components/Navbar'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { Pagination } from '@/shared/components/Pagination'
import { Link } from 'react-router-dom'
import { formatDateDisplay, formatDateTimeDisplay } from '@/shared/lib/dateUtils'
import { deriveBookingStatus } from '@/shared/lib/bookingStatus'
import { TIME_SLOT_LABELS, type BookingStatus, type TimeSlot } from '@/shared/types/domain'
import { getCurrentUser } from '@/shared/lib/auth'
import { ROLE_TABS } from '@/shared/config/navTabs'
import { DEFAULT_PAGE_SIZE } from '@/shared/constants/ui'

const ReviewerPage = lazy(() => import('@/features/warehouse/ReviewerPage'))
const WarehousesPage = lazy(() => import('@/features/warehouse/WarehousesPage'))
const SuppliersPage = lazy(() => import('@/features/supplier/SuppliersPage'))
const ReportPage = lazy(() => import('@/features/admin/ReportPage'))

type RoleView = 'warehouse_reviewer' | 'manager' | 'supplier'
type PageId = 'reviewer' | 'warehouses' | 'suppliers' | 'report'

const ROLE_LABELS: Record<RoleView, string> = {
  warehouse_reviewer: 'Reviewer',
  manager: 'Manager',
  supplier: 'Supplier',
}
const PAGE_SIZE = DEFAULT_PAGE_SIZE

// ── Supplier view — all bookings, read-only ───────────────────────────────────
interface SupplierBooking {
  id: string
  booking_code: string
  booking_token: string
  delivery_date: string
  time_slot: TimeSlot
  status: BookingStatus
  submitted_at: string
  supplier_name: string
  warehouse_name: string
  ghi_chu: string | null
  reject_reasons: string
}

function SupplierView() {
  const [currentPage, setCurrentPage] = useState(1)
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['viewas-supplier-bookings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_code, booking_token, delivery_date, time_slot, status, submitted_at, ghi_chu, suppliers!inner(name), warehouses!inner(name), booking_items(status, reject_reason)')
        .order('submitted_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []).map((b: any) => ({
        id: b.id,
        booking_code: b.booking_code,
        booking_token: b.booking_token,
        delivery_date: b.delivery_date,
        time_slot: b.time_slot,
        status: deriveBookingStatus(b.status, b.booking_items ?? []),
        submitted_at: b.submitted_at,
        supplier_name: b.suppliers?.name ?? '—',
        warehouse_name: b.warehouses?.name ?? '—',
        ghi_chu: b.ghi_chu,
        reject_reasons: (b.booking_items ?? []).map((item: any) => item.reject_reason).filter(Boolean).join('; '),
      })) as SupplierBooking[]
    },
  })

  if (isLoading) {
    return <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
  }

  const totalPages = Math.max(1, Math.ceil(bookings.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedBookings = bookings.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <main className="flex-1 lg:w-[80vw] max-w-none mx-auto w-full px-4 py-6">
      <p className="text-xs text-[#888888] mb-4">Đang xem giao diện Supplier — hiển thị tất cả booking (admin view)</p>
      {bookings.length === 0 ? (
        <div className="bg-white border border-[#ecdbe8] rounded-lg p-16 text-center text-[#888888]">
          <p>Không có booking nào</p>
        </div>
      ) : (
        <div className="overflow-hidden bg-white border border-[#ecdbe8] rounded-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-sm data-table">
              <thead>
                <tr>
                  <th className="table-header">Mã booking</th>
                  <th className="table-header">Nhà cung cấp</th>
                  <th className="table-header">Kho</th>
                  <th className="table-header w-24">Ngày giao</th>
                  <th className="table-header w-28">Khung giờ</th>
                  <th className="table-header w-32">Đăng ký lúc</th>
                  <th className="table-header">Trạng thái</th>
                  <th className="table-header min-w-44">Ghi chú</th>
                  <th className="table-header min-w-44">Lí do</th>
                </tr>
              </thead>
              <tbody>
                {paginatedBookings.map((b) => (
                  <tr key={b.id}>
                    <td className="table-cell font-mono font-bold">
                      <Link to={`/booking/${b.booking_token}`} className="hover:underline">{b.booking_code}</Link>
                    </td>
                    <td className="table-cell">{b.supplier_name}</td>
                    <td className="table-cell">{b.warehouse_name}</td>
                    <td className="table-cell text-xs">{formatDateDisplay(b.delivery_date)}</td>
                    <td className="table-cell">{TIME_SLOT_LABELS[b.time_slot]}</td>
                    <td className="table-cell text-xs text-[#888888]">{formatDateTimeDisplay(b.submitted_at)}</td>
                    <td className="table-cell"><StatusBadge status={b.status} /></td>
                    <td className="table-cell max-w-52 text-xs text-[#555555]">{b.ghi_chu || <span className="text-[#BBBBBB]">—</span>}</td>
                    <td className="table-cell max-w-52 text-xs text-[#CC0000]">{b.reject_reasons || <span className="text-[#BBBBBB]">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={safePage}
            pageSize={PAGE_SIZE}
            totalItems={bookings.length}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </main>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function ViewAsPage() {
  const user = getCurrentUser()
  const tabs = user ? (ROLE_TABS[user.role] ?? []) : []
  const [roleView, setRoleView] = useState<RoleView>('warehouse_reviewer')
  const [pageId, setPageId] = useState<PageId>('reviewer')

  useEffect(() => { document.title = 'View as — Atino' }, [])

  useEffect(() => {
    const roleTabs = ROLE_TABS[roleView] ?? []
    if (roleTabs.length > 0) setPageId(roleTabs[0].id as PageId)
  }, [roleView])

  const roleTabs = ROLE_TABS[roleView] ?? []

  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={tabs} activeTab="viewas" />

      {/* Combined bar: page tabs (left) + role selector (right) */}
      <div className="flex items-stretch justify-between border-b border-[#d5c0d5] bg-white px-4 shadow-sm">
        {/* Inner page tabs for the viewed role */}
        <div className="flex">
          {roleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setPageId(t.id as PageId)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${pageId === t.id
                ? 'border-[#9F27C7] bg-[#9F27C7] text-white font-bold'
                : 'border-transparent text-[#514253] font-bold hover:bg-[#f1ebf4] hover:text-[#9F27C7]'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Role selector */}
        <div className="flex">
          {(Object.keys(ROLE_LABELS) as RoleView[]).map((r) => (
            <button
              key={r}
              onClick={() => setRoleView(r)}
              className={`px-4 py-3 text-sm font-medium transition-colors ${roleView === r ? 'bg-[#9F27C7] text-white font-bold' : 'text-[#514253] font-bold hover:bg-[#f1ebf4] hover:text-[#9F27C7]'
                }`}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <Suspense fallback={<div className="flex justify-center py-16"><LoadingSpinner /></div>}>
        {roleView === 'supplier' && <SupplierView />}
        {roleView !== 'supplier' && pageId === 'reviewer' && <ReviewerPage embedded />}
        {roleView !== 'supplier' && pageId === 'warehouses' && <WarehousesPage embedded />}
        {roleView !== 'supplier' && pageId === 'suppliers' && <SuppliersPage embedded />}
        {roleView !== 'supplier' && pageId === 'report' && <ReportPage embedded />}
      </Suspense>
    </div>
  )
}

import { useState, useEffect, lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Navbar } from '@/shared/components/Navbar'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { Link } from 'react-router-dom'
import { formatDateDisplay, formatDateTimeDisplay } from '@/shared/lib/dateUtils'
import { deriveBookingStatus } from '@/shared/lib/bookingStatus'
import { TIME_SLOT_LABELS, type BookingStatus, type TimeSlot } from '@/shared/types/domain'
import { getCurrentUser } from '@/shared/lib/auth'
import { ROLE_TABS } from '@/shared/config/navTabs'

const ReviewerPage   = lazy(() => import('@/features/warehouse/ReviewerPage'))
const WarehousesPage = lazy(() => import('@/features/warehouse/WarehousesPage'))
const SuppliersPage  = lazy(() => import('@/features/supplier/SuppliersPage'))
const ReportPage     = lazy(() => import('@/features/admin/ReportPage'))

type RoleView = 'warehouse_reviewer' | 'manager' | 'supplier'
type PageId   = 'reviewer' | 'warehouses' | 'suppliers' | 'report'

const ROLE_LABELS: Record<RoleView, string> = {
  warehouse_reviewer: 'Reviewer',
  manager:            'Manager',
  supplier:           'Supplier',
}

// â”€â”€ Supplier view â€” all bookings, read-only â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
}

function SupplierView() {
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['viewas-supplier-bookings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_code, booking_token, delivery_date, time_slot, status, submitted_at, suppliers!inner(name), warehouses!inner(name), booking_items(status)')
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
        supplier_name: b.suppliers?.name ?? 'â€”',
        warehouse_name: b.warehouses?.name ?? 'â€”',
      })) as SupplierBooking[]
    },
  })

  if (isLoading) {
    return <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
  }

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
      <p className="text-xs text-[#888888] mb-4">Äang xem giao diá»‡n Supplier â€” hiá»ƒn thá»‹ táº¥t cáº£ booking (admin view)</p>
      {bookings.length === 0 ? (
        <div className="bg-white border border-[#E0E0E0] rounded-lg p-16 text-center text-[#888888]">
          <p>KhÃ´ng cÃ³ booking nÃ o</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white border border-[#E0E0E0] rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F5F5]">
                <th className="table-header">MÃ£ booking</th>
                <th className="table-header">NhÃ  cung cáº¥p</th>
                <th className="table-header">Kho</th>
                <th className="table-header w-24">NgÃ y giao</th>
                <th className="table-header w-28">Khung giá»</th>
                <th className="table-header w-32">ÄÄƒng kÃ½ lÃºc</th>
                <th className="table-header">Tráº¡ng thÃ¡i</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t border-[#E0E0E0] hover:bg-[#F9F9F9]">
                  <td className="table-cell font-mono font-bold">
                    <Link to={`/booking/${b.booking_token}`} className="hover:underline">{b.booking_code}</Link>
                  </td>
                  <td className="table-cell">{b.supplier_name}</td>
                  <td className="table-cell">{b.warehouse_name}</td>
                  <td className="table-cell text-xs">{formatDateDisplay(b.delivery_date)}</td>
                  <td className="table-cell">{TIME_SLOT_LABELS[b.time_slot]}</td>
                  <td className="table-cell text-xs text-[#888888]">{formatDateTimeDisplay(b.submitted_at)}</td>
                  <td className="table-cell"><StatusBadge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

// â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ViewAsPage() {
  const user = getCurrentUser()
  const tabs = user ? (ROLE_TABS[user.role] ?? []) : []
  const [roleView, setRoleView] = useState<RoleView>('warehouse_reviewer')
  const [pageId, setPageId]     = useState<PageId>('reviewer')

  useEffect(() => { document.title = 'View as â€” Atino' }, [])

  useEffect(() => {
    const roleTabs = ROLE_TABS[roleView] ?? []
    if (roleTabs.length > 0) setPageId(roleTabs[0].id as PageId)
  }, [roleView])

  const roleTabs = ROLE_TABS[roleView] ?? []

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF5FF]">
      <Navbar tabs={tabs} activeTab="viewas" />

      {/* Combined bar: page tabs (left) + role selector (right) */}
      <div className="flex items-stretch justify-between border-b border-[#E3B2E2] bg-[#E3B2E2] px-4">
        {/* Inner page tabs for the viewed role */}
        <div className="flex">
          {roleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setPageId(t.id as PageId)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                pageId === t.id
                  ? 'border-[#AD58A6] bg-[#AD58A6] text-white font-bold'
                  : 'border-transparent text-black font-bold hover:bg-[#D69AD4]'
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
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                roleView === r ? 'bg-[#AD58A6] text-white font-bold' : 'text-black font-bold hover:bg-[#D69AD4]'
              }`}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <Suspense fallback={<div className="flex justify-center py-16"><LoadingSpinner /></div>}>
        {roleView === 'supplier'                            && <SupplierView />}
        {roleView !== 'supplier' && pageId === 'reviewer'  && <ReviewerPage embedded />}
        {roleView !== 'supplier' && pageId === 'warehouses'&& <WarehousesPage embedded />}
        {roleView !== 'supplier' && pageId === 'suppliers' && <SuppliersPage embedded />}
        {roleView !== 'supplier' && pageId === 'report'    && <ReportPage embedded />}
      </Suspense>
    </div>
  )
}

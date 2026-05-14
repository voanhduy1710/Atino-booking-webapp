import { useState, useEffect, lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { Navbar } from '@/shared/components/Navbar'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { AccountsTab } from './tabs/AccountsTab'
import { WarehousesTab } from './tabs/WarehousesTab'
import { SuppliersTab } from './tabs/SuppliersTab'
import type { NavTab } from '@/shared/components/Navbar'

const ReviewerPage = lazy(() => import('@/features/warehouse/ReviewerPage'))
const ManagerPage = lazy(() => import('@/features/manager/index'))
const ReportPage = lazy(() => import('@/features/admin/ReportPage'))

type AdminTab = 'accounts' | 'warehouses' | 'suppliers' | 'reviewbookings' | 'manageviews' | 'report'
type ManageViewsTab = 'reviewer' | 'manager'

const ADMIN_TABS: NavTab[] = [
  { id: 'accounts', label: 'Tài khoản NCC', href: '/admin/accounts' },
  { id: 'warehouses', label: 'Kho hàng', href: '/admin/warehouses' },
  { id: 'suppliers', label: 'Nhà cung cấp', href: '/admin/suppliers' },
  { id: 'reviewbookings', label: 'Xác nhận booking', href: '/admin/reviewbookings' },
  { id: 'manageviews', label: 'Manage views', href: '/admin/manageviews' },
  { id: 'report', label: 'Báo cáo', href: '/admin/report' },
]

const VALID_TABS: AdminTab[] = ['accounts', 'warehouses', 'suppliers', 'reviewbookings', 'manageviews', 'report']

const Spinner = () => <div className="flex justify-center py-16"><LoadingSpinner /></div>

export default function AdminPage() {
  const { pathname } = useLocation()
  const [manageViewsTab, setManageViewsTab] = useState<ManageViewsTab>('reviewer')

  const activeTab: AdminTab = (() => {
    for (const t of VALID_TABS) {
      if (pathname.includes(`/admin/${t}`)) return t
    }
    return 'accounts'
  })()

  useEffect(() => { document.title = 'Admin — Atino' }, [])

  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={ADMIN_TABS} activeTab={activeTab} />

      {activeTab === 'reviewbookings' && (
        <Suspense fallback={<Spinner />}>
          <ReviewerPage embedded />
        </Suspense>
      )}

      {activeTab === 'report' && (
        <Suspense fallback={<Spinner />}>
          <ReportPage />
        </Suspense>
      )}

      {activeTab === 'manageviews' && (
        <div className="flex flex-col flex-1">
          <div className="flex justify-end border-b border-[#d5c0d5] bg-white px-4 shadow-sm">
            {(['reviewer', 'manager'] as ManageViewsTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setManageViewsTab(t)}
                className={`px-4 py-3 text-sm font-medium transition-colors ${manageViewsTab === t ? 'bg-[#bf2ef0] text-white font-bold' : 'text-[#514253] font-bold hover:bg-[#f1ebf4] hover:text-[#bf2ef0]'
                  }`}
              >
                {t === 'reviewer' ? 'Reviewer' : 'Manager'}
              </button>
            ))}
          </div>
          <Suspense fallback={<Spinner />}>
            {manageViewsTab === 'reviewer' && <ReviewerPage embedded />}
            {manageViewsTab === 'manager' && <ManagerPage embedded />}
          </Suspense>
        </div>
      )}

      {(activeTab === 'accounts' || activeTab === 'warehouses' || activeTab === 'suppliers') && (
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
          {activeTab === 'accounts' && <AccountsTab />}
          {activeTab === 'warehouses' && <WarehousesTab />}
          {activeTab === 'suppliers' && <SuppliersTab />}
        </main>
      )}
    </div>
  )
}

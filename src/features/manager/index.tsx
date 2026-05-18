import { lazy, Suspense, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { SupplierTable } from '@/features/adminResources/SupplierTable'
import { WarehouseTable } from '@/features/adminResources/WarehouseTable'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { Navbar } from '@/shared/components/Navbar'
import type { NavTab } from '@/shared/components/Navbar'

const ReviewerPage = lazy(() => import('@/features/warehouse/ReviewerPage'))
const ReportPage = lazy(() => import('@/features/admin/ReportPage'))

type ManagerTab = 'reviewer' | 'warehouses' | 'suppliers' | 'report'

const VALID_MANAGER_TABS: ManagerTab[] = ['reviewer', 'warehouses', 'suppliers', 'report']

const MANAGER_TABS: NavTab[] = [
  { id: 'reviewer', label: 'Xác nhận booking', href: '/manager/reviewer' },
  { id: 'warehouses', label: 'Kho hàng', href: '/manager/warehouses' },
  { id: 'suppliers', label: 'Nhà cung cấp', href: '/manager/suppliers' },
  { id: 'report', label: 'Báo cáo', href: '/manager/report' },
]

interface Props {
  embedded?: boolean
}

const Spinner = () => <div className="flex justify-center py-16"><LoadingSpinner /></div>

export default function ManagerPage({ embedded = false }: Props) {
  const { pathname } = useLocation()
  const [internalTab, setInternalTab] = useState<ManagerTab>('reviewer')

  const activeTab: ManagerTab = embedded
    ? internalTab
    : (() => {
      for (const t of VALID_MANAGER_TABS) {
        if (pathname.includes(`/manager/${t}`)) return t
      }
      return 'reviewer'
    })()

  useEffect(() => {
    if (!embedded) document.title = 'Quản lý - Atino'
  }, [embedded])

  const tabContent = (
    <>
      {activeTab === 'reviewer' && (
        <Suspense fallback={<Spinner />}>
          <ReviewerPage embedded />
        </Suspense>
      )}
      {activeTab === 'warehouses' && (
        <main className="flex-1 lg:w-[80vw] max-w-none mx-auto w-full px-4 py-6">
          <WarehouseTable queryKey="manager-warehouses" />
        </main>
      )}
      {activeTab === 'suppliers' && (
        <main className="flex-1 lg:w-[80vw] max-w-none mx-auto w-full px-4 py-6">
          <SupplierTable queryKey="manager-suppliers" />
        </main>
      )}
      {activeTab === 'report' && (
        <Suspense fallback={<Spinner />}>
          <ReportPage />
        </Suspense>
      )}
    </>
  )

  if (embedded) {
    return (
      <div className="flex flex-col bg-[#fdf8ff]">
        <div className="flex border-b border-[#d5c0d5] bg-white px-4 shadow-sm">
          {MANAGER_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setInternalTab(t.id as ManagerTab)}
              className={`px-4 py-3 text-sm font-medium transition-colors ${activeTab === t.id ? 'bg-[#9F27C7] text-white font-bold' : 'text-[#514253] font-bold hover:bg-[#f1ebf4] hover:text-[#9F27C7]'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tabContent}
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={MANAGER_TABS} activeTab={activeTab} />
      {tabContent}
    </div>
  )
}

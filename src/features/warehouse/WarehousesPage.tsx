import { useEffect } from 'react'
import { WarehouseTable } from '@/features/adminResources/WarehouseTable'
import { Navbar } from '@/shared/components/Navbar'
import { ROLE_TABS } from '@/shared/config/navTabs'
import { getCurrentUser } from '@/shared/lib/auth'

export default function WarehousesPage({ embedded = false }: { embedded?: boolean }) {
  const user = getCurrentUser()
  const canDelete = user?.role === 'admin'
  const tabs = user ? (ROLE_TABS[user.role] ?? []) : []

  useEffect(() => { document.title = 'Kho hàng - Atino' }, [])

  const content = (
    <main className="flex-1 lg:w-[80vw] max-w-none mx-auto w-full px-4 py-6">
      <WarehouseTable canDelete={canDelete} />
    </main>
  )

  if (embedded) return content
  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={tabs} activeTab="warehouses" />
      {content}
    </div>
  )
}

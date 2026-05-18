import { useEffect } from 'react'
import { AccountManagement } from '@/features/accounts/AccountManagement'
import { Navbar } from '@/shared/components/Navbar'
import { getCurrentUser } from '@/shared/lib/auth'
import { ROLE_TABS } from '@/shared/config/navTabs'

export default function AccountsPage() {
  const user = getCurrentUser()
  const tabs = user ? (ROLE_TABS[user.role] ?? []) : []

  useEffect(() => { document.title = 'Tài khoản - Atino' }, [])

  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={tabs} activeTab="accounts" />
      <main className="flex-1 lg:w-[80vw] max-w-none mx-auto w-full px-4 py-6">
        <AccountManagement />
      </main>
    </div>
  )
}

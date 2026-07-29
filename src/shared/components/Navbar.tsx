import { lazy, Suspense } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { removeSession, getCurrentUser } from '@/shared/lib/auth'
import { postJson } from '@/shared/lib/apiClient'

const NotificationBell = lazy(() => import('@/features/notifications/components/NotificationBell').then((module) => ({
  default: module.NotificationBell,
})))

export type NavTab = { id: string; label: string; href?: string }

interface Props {
  showNotifications?: boolean
  /** Tabs to render in the center of the navbar */
  tabs?: NavTab[]
  /** Currently active tab id */
  activeTab?: string
  /** Called when a tab is clicked (ignored when tab has href) */
  onTabChange?: (id: string) => void
}

export function Navbar({
  showNotifications = true,
  tabs,
  activeTab,
  onTabChange,
}: Props) {
  const navigate = useNavigate()
  const user = getCurrentUser()

  const handleLogout = async () => {
    try {
      await postJson<{ ok: true }>('/api/auth/logout')
    } finally {
      removeSession()
    }
    navigate('/login')
  }

  return (
    <nav className="relative bg-white border-b border-[#d5c0d5] px-3 sm:px-6 h-14 flex items-center justify-between flex-shrink-0 shadow-sm gap-2">
      {/* Logo */}
      <Link to="/" className="flex items-center flex-shrink-0">
        <img src="/Atino Logo.svg" alt="Atino" className="h-7 w-auto" />
      </Link>

      {/* Center tabs (optional) */}
      {tabs && tabs.length > 0 && (
        <div className="flex h-full min-w-0 flex-1 items-stretch justify-center mx-2 overflow-hidden sm:mx-4">
          <div className="scrollbar-none flex h-full max-w-full items-stretch overflow-x-auto scroll-smooth">
            {tabs.map((tab) => {
              const cls = `flex h-full shrink-0 items-center justify-center whitespace-nowrap px-3 text-center text-xs font-bold transition-colors sm:px-4 sm:text-sm ${activeTab === tab.id
                ? 'bg-[#9F27C7] text-white'
                : 'text-[#514253] hover:bg-[#f1ebf4] hover:text-[#9F27C7]'
                }`
              return tab.href ? (
                <Link key={tab.id} id={`nav-tab-${tab.id}`} to={tab.href} className={cls}>
                  {tab.label}
                </Link>
              ) : (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id}`}
                  onClick={() => onTabChange?.(tab.id)}
                  className={cls}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Right side */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {user && (
          <span className="hidden sm:block text-sm font-semibold text-black">
            {user.username ?? user.sub}
          </span>
        )}

        {showNotifications && user && (
          <Suspense fallback={<span className="min-h-11 min-w-11" aria-hidden="true" />}>
            <NotificationBell />
          </Suspense>
        )}

        {user && (
          <button
            onClick={() => void handleLogout()}
            className="min-h-11 min-w-11 text-sm font-semibold text-[#9F27C7] hover:text-[#77009a] transition-colors"
            id="logout-btn"
          >
            Đăng xuất
          </button>
        )}
      </div>
    </nav>
  )
}

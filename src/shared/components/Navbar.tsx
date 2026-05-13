import { Link, useNavigate } from 'react-router-dom'
import { removeToken, getCurrentUser } from '@/shared/lib/auth'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'

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

  const handleLogout = () => {
    removeToken()
    navigate('/login')
  }

  return (
    <nav className="bg-[#E3B2E2] border-b border-[#E3B2E2] px-4 sm:px-6 h-14 flex items-center justify-between flex-shrink-0">
      {/* Logo */}
      <Link to="/" className="flex items-center flex-shrink-0">
        <img src="/Atino Logo.svg" alt="Atino" className="h-7 w-auto" />
      </Link>

      {/* Center tabs (optional) */}
      {tabs && tabs.length > 0 && (
        <div className="flex items-stretch h-full gap-0 mx-4">
          {tabs.map((tab) => {
            const cls = `px-4 text-sm transition-colors h-full flex items-center ${
              activeTab === tab.id
                ? 'bg-[#AD58A6] text-white font-bold'
                : 'text-black font-bold hover:bg-[#D69AD4]'
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
      )}

      {/* Right side */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {user && (
          <span className="hidden sm:block text-sm font-semibold text-black">
            {user.sub}
          </span>
        )}

        {showNotifications && user && (
          <NotificationBell />
        )}

        {user && (
          <button
            onClick={handleLogout}
            className="text-sm font-semibold text-black hover:text-white transition-colors"
            id="logout-btn"
          >
            Đăng xuất
          </button>
        )}
      </div>
    </nav>
  )
}

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
    <nav className="bg-white border-b border-[#E0E0E0] px-4 sm:px-6 h-14 flex items-center justify-between flex-shrink-0">
      {/* Logo */}
      <Link to="/" className="flex items-center flex-shrink-0">
        <img src="/Atino Logo.svg" alt="Atino" className="h-7 w-auto" />
      </Link>

      {/* Center tabs (optional) */}
      {tabs && tabs.length > 0 && (
        <div className="flex items-stretch h-full gap-0 mx-4">
          {tabs.map((tab) => {
            const cls = `px-4 text-sm font-medium transition-colors h-full flex items-center ${
              activeTab === tab.id
                ? 'bg-black text-white'
                : 'text-[#888888] hover:text-black'
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
          <span className="hidden sm:block text-sm text-[#888888]">
            {user.sub}
          </span>
        )}

        {showNotifications && user && (
          <NotificationBell />
        )}

        {user && (
          <button
            onClick={handleLogout}
            className="text-sm text-[#888888] hover:text-black transition-colors"
            id="logout-btn"
          >
            Đăng xuất
          </button>
        )}
      </div>
    </nav>
  )
}

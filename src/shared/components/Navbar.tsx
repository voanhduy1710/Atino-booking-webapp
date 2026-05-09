import { Link, useNavigate } from 'react-router-dom'
import { removeToken, getCurrentUser } from '@/shared/lib/auth'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'

interface Props {
  showNotifications?: boolean
}

export function Navbar({ showNotifications = true }: Props) {
  const navigate = useNavigate()
  const user = getCurrentUser()

  const handleLogout = () => {
    removeToken()
    navigate('/login')
  }

  return (
    <nav className="bg-white border-b border-[#E0E0E0] px-4 sm:px-6 h-14 flex items-center justify-between flex-shrink-0">
      {/* Logo */}
      <Link to="/" className="flex items-center">
        <img src="/Atino Logo.svg" alt="Atino" className="h-7 w-auto" />
      </Link>

      {/* Right side */}
      <div className="flex items-center gap-3">
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

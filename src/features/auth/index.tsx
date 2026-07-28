import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { LoginForm } from './components/LoginForm'
import { getCurrentUser } from '@/shared/lib/auth'

const roleRouteMap: Record<string, string> = {
  supplier: '/my-bookings',
  warehouse_reviewer: '/reviewbooking',
  warehouse_receiver: '/reviewbooking',
  manager: '/reviewbooking',
  admin: '/accounts',
}

export default function LoginPage() {
  const user = getCurrentUser()

  useEffect(() => {
    document.title = 'Đăng nhập — Atino Booking'
  }, [])

  if (user) {
    const redirect = roleRouteMap[user.role] ?? '/'
    return <Navigate to={redirect} replace />
  }

  return (
    <div className="min-h-screen bg-[#fdf8ff] flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <a href="/" className="mb-8">
        <img src="/Atino Logo.svg" alt="Atino" className="h-10 w-auto" />
      </a>

      {/* Card */}
      <div className="w-full max-w-md bg-white border border-[#ecdbe8] rounded-lg overflow-hidden">
        <div className="bg-[#9F27C7] px-6 py-3 text-center text-sm font-semibold text-white">Đăng nhập</div>
        <div className="p-6"><LoginForm /></div>
      </div>

      <p className="mt-6 text-xs text-[#888888]">
        © 2026 Atino — Hệ thống đăng ký giao hàng
      </p>
    </div>
  )
}

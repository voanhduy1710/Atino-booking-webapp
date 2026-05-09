import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { LoginForm } from './components/LoginForm'
import { RegisterForm } from './components/RegisterForm'
import { getCurrentUser } from '@/shared/lib/auth'

type Tab = 'login' | 'register'

const roleRouteMap: Record<string, string> = {
  supplier: '/my-bookings',
  warehouse_reviewer: '/reviewer',
  warehouse_receiver: '/receiver',
  manager: '/manager',
  admin: '/admin',
}

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>('login')
  const user = getCurrentUser()

  useEffect(() => {
    document.title = 'Đăng nhập — Atino Booking'
  }, [])

  if (user) {
    const redirect = roleRouteMap[user.role] ?? '/'
    return <Navigate to={redirect} replace />
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <a href="/" className="mb-8">
        <img src="/Atino Logo.svg" alt="Atino" className="h-10 w-auto" />
      </a>

      {/* Card */}
      <div className="w-full max-w-md bg-white border border-[#E0E0E0] rounded-lg overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-[#E0E0E0]">
          <button
            id="tab-login"
            onClick={() => setTab('login')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              tab === 'login'
                ? 'bg-black text-white'
                : 'bg-white text-[#888888] hover:text-black'
            }`}
          >
            Đăng nhập
          </button>
          <button
            id="tab-register"
            onClick={() => setTab('register')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              tab === 'register'
                ? 'bg-black text-white'
                : 'bg-white text-[#888888] hover:text-black'
            }`}
          >
            Đăng ký tài khoản
          </button>
        </div>

        {/* Form */}
        <div className="p-6">
          {tab === 'login' ? (
            <LoginForm />
          ) : (
            <RegisterForm onSuccess={() => setTab('login')} />
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-[#888888]">
        © 2026 Atino — Hệ thống đăng ký giao hàng
      </p>
    </div>
  )
}

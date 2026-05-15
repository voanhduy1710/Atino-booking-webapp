import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { LoginForm } from './components/LoginForm'
import { RegisterForm } from './components/RegisterForm'
import { getCurrentUser } from '@/shared/lib/auth'

type Tab = 'login' | 'register'

const roleRouteMap: Record<string, string> = {
  supplier: '/my-bookings',
  warehouse_reviewer: '/reviewbooking',
  warehouse_receiver: '/reviewbooking',
  manager: '/reviewbooking',
  admin: '/accounts',
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
    <div className="min-h-screen bg-[#fdf8ff] flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <a href="/" className="mb-8">
        <img src="/Atino Logo.svg" alt="Atino" className="h-10 w-auto" />
      </a>

      {/* Card */}
      <div className="w-full max-w-md bg-white border border-[#ecdbe8] rounded-lg overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-[#d5c0d5] bg-white">
          <button
            id="tab-login"
            onClick={() => setTab('login')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'login'
              ? 'bg-[#9F27C7] text-white'
              : 'text-[#514253] hover:bg-[#f1ebf4] hover:text-[#9F27C7]'
              }`}
          >
            Đăng nhập
          </button>
          <button
            id="tab-register"
            onClick={() => setTab('register')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'register'
              ? 'bg-[#9F27C7] text-white'
              : 'text-[#514253] hover:bg-[#f1ebf4] hover:text-[#9F27C7]'
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

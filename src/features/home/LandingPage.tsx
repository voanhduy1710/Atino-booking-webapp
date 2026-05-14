import { Link, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { getCurrentUser } from '@/shared/lib/auth'

export default function LandingPage() {
  const navigate = useNavigate()
  const user = getCurrentUser()

  useEffect(() => {
    document.title = 'Đơn Đăng Ký — Atino Booking'
  }, [])

  const handleBooking = () => {
    if (user?.role === 'supplier') {
      navigate('/booking/new')
    } else {
      navigate('/login')
    }
  }

  return (
    <div className="min-h-screen bg-[#fdf8ff] flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <div className="mb-10">
        <img src="/Atino Logo.svg" alt="Atino" className="h-16 w-auto mx-auto" />
      </div>

      {/* Title */}
      <h1 className="text-3xl font-bold tracking-widest uppercase text-center mb-2">
        ĐƠN ĐĂNG KÝ
      </h1>
      <p className="text-[#888888] text-center mb-10 text-sm">
        Vui lòng chọn đơn đăng ký phù hợp
      </p>

      {/* Buttons */}
      <div className="w-full max-w-sm space-y-3">
        <button
          id="cta-booking"
          onClick={handleBooking}
          className="w-full py-5 border border-[#80417A] text-black font-semibold text-base hover:bg-[#80417A] hover:text-white transition-colors rounded"
        >
          Đăng ký giao hàng
        </button>

        <Link
          to="/guide/create"
          id="cta-guide-create"
          className="block w-full py-5 border border-[#80417A] text-black font-semibold text-base text-center hover:bg-[#80417A] hover:text-white transition-colors rounded"
        >
          Hướng dẫn tạo đơn
        </Link>

        <Link
          to="/guide/receiving"
          id="cta-guide-receiving"
          className="block w-full py-5 border border-[#80417A] text-black font-semibold text-base text-center hover:bg-[#80417A] hover:text-white transition-colors rounded"
        >
          Quy trình giao nhận hàng
        </Link>
      </div>

      {/* Login link */}
      <div className="mt-10 text-right w-full max-w-sm">
        <Link
          to="/login"
          id="login-link"
          className="text-sm text-[#888888] hover:text-black transition-colors"
        >
          Đăng nhập →
        </Link>
      </div>
    </div>
  )
}

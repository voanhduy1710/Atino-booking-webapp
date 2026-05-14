import { Link, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { getCurrentUser } from '@/shared/lib/auth'

export default function LandingPage() {
  const navigate = useNavigate()
  const user = getCurrentUser()

  useEffect(() => {
    document.title = 'ÄÆ¡n ÄÄƒng KÃ½ â€” Atino Booking'
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
        ÄÆ N ÄÄ‚NG KÃ
      </h1>
      <p className="text-[#888888] text-center mb-10 text-sm">
        Vui lÃ²ng chá»n Ä‘Æ¡n Ä‘Äƒng kÃ½ phÃ¹ há»£p
      </p>

      {/* Buttons */}
      <div className="w-full max-w-sm space-y-3">
        <button
          id="cta-booking"
          onClick={handleBooking}
          className="w-full py-5 border border-[#80417A] text-black font-semibold text-base hover:bg-[#80417A] hover:text-white transition-colors rounded"
        >
          ÄÄƒng kÃ½ giao hÃ ng
        </button>

        <Link
          to="/guide/create"
          id="cta-guide-create"
          className="block w-full py-5 border border-[#80417A] text-black font-semibold text-base text-center hover:bg-[#80417A] hover:text-white transition-colors rounded"
        >
          HÆ°á»›ng dáº«n táº¡o Ä‘Æ¡n
        </Link>

        <Link
          to="/guide/receiving"
          id="cta-guide-receiving"
          className="block w-full py-5 border border-[#80417A] text-black font-semibold text-base text-center hover:bg-[#80417A] hover:text-white transition-colors rounded"
        >
          Quy trÃ¬nh giao nháº­n hÃ ng
        </Link>
      </div>

      {/* Login link */}
      <div className="mt-10 text-right w-full max-w-sm">
        <Link
          to="/login"
          id="login-link"
          className="text-sm text-[#888888] hover:text-black transition-colors"
        >
          ÄÄƒng nháº­p â†’
        </Link>
      </div>
    </div>
  )
}

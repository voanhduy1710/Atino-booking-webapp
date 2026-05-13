import { useEffect } from 'react'
import { useLocation, Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { useRef } from 'react'
import { Navbar } from '@/shared/components/Navbar'
import { formatDateDisplay } from '@/shared/lib/dateUtils'
import { getCurrentUser } from '@/shared/lib/auth'
import { ROLE_TABS } from '@/shared/config/navTabs'
import { SUPPLIER_TABS } from './BookingForm'

interface BookingResult {
  booking_code: string
  booking_token: string
  delivery_date: string
}

export default function BookingConfirmationPage() {
  const location = useLocation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const result = location.state as BookingResult | null
  const user = getCurrentUser()
  const tabs = user?.role === 'admin' ? (ROLE_TABS.admin ?? []) : SUPPLIER_TABS
  const listHref = user?.role === 'admin' ? '/reviewbooking' : '/my-bookings'

  useEffect(() => {
    document.title = 'ÄÄƒng kÃ½ thÃ nh cÃ´ng â€” Atino Booking'
  }, [])

  useEffect(() => {
    if (result?.booking_token && canvasRef.current) {
      const qrData = `${window.location.origin}/booking/${result.booking_token}`
      void QRCode.toCanvas(canvasRef.current, qrData, {
        width: 240,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      })
    }
  }, [result])

  if (!result) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar tabs={tabs} activeTab={user?.role === 'admin' ? 'new-booking' : 'my-bookings'} />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-[#888888]">
          <p>KhÃ´ng tÃ¬m tháº¥y thÃ´ng tin booking.</p>
          <Link to="/booking/new" className="btn-outline">
            Táº¡o Ä‘Äƒng kÃ½ má»›i
          </Link>
        </div>
      </div>
    )
  }

  const handlePrint = () => window.print()

  const handleDownloadQR = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `${result.booking_code}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF5FF]">
      <Navbar tabs={tabs} activeTab={user?.role === 'admin' ? 'new-booking' : 'my-bookings'} />

      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="bg-white border border-[#E0E0E0] rounded-lg w-full max-w-lg p-8 text-center">
          <div className="w-16 h-16 rounded-full border-2 border-black flex items-center justify-center mx-auto mb-6 text-2xl">
            âœ“
          </div>

          <h1 className="text-lg font-bold mb-1">ÄÄƒng kÃ½ thÃ nh cÃ´ng!</h1>
          <p className="text-sm text-[#888888] mb-6">
            Vui lÃ²ng lÆ°u hoáº·c in mÃ£ QR bÃªn dÆ°á»›i Ä‘á»ƒ sá»­ dá»¥ng khi Ä‘áº¿n giao hÃ ng.
          </p>

          <div className="flex justify-center mb-4">
            <canvas ref={canvasRef} className="border border-[#E0E0E0] rounded" />
          </div>

          <p className="font-mono text-base font-bold tracking-widest mb-1">
            {result.booking_code}
          </p>
          <p className="text-sm text-[#888888] mb-6">
            Giao hÃ ng ngÃ y:{' '}
            <strong className="text-black">{formatDateDisplay(result.delivery_date)}</strong>
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to={`/booking/${result.booking_token}`}
              className="btn-outline flex-1 text-center"
              id="view-booking-detail"
            >
              Xem chi tiáº¿t
            </Link>
            <button onClick={handleDownloadQR} className="btn-outline flex-1" id="download-qr">
              Táº£i QR Code
            </button>
            <button onClick={handlePrint} className="btn-primary flex-1" id="print-confirmation">
              In xÃ¡c nháº­n
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-[#E0E0E0]">
            <Link to={listHref} className="text-sm text-[#888888] hover:text-black transition-colors" id="go-to-my-bookings">
              Xem danh sÃ¡ch Ä‘Äƒng kÃ½ â†’
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

import { useEffect } from 'react'
import { useLocation, Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { useRef } from 'react'
import { Navbar } from '@/shared/components/Navbar'
import { formatDateDisplay } from '@/shared/lib/dateUtils'
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

  useEffect(() => {
    document.title = 'Đăng ký thành công — Atino Booking'
  }, [])

  useEffect(() => {
    if (result?.booking_token && canvasRef.current) {
      const qrData = `ATINO:${result.booking_code}:${result.booking_token}`
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
        <Navbar tabs={SUPPLIER_TABS} activeTab="my-bookings" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-[#888888]">
          <p>Không tìm thấy thông tin booking.</p>
          <Link to="/booking/new" className="btn-outline">
            Tạo đăng ký mới
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
    <div className="min-h-screen flex flex-col bg-[#F5F5F5]">
      <Navbar tabs={SUPPLIER_TABS} activeTab="my-bookings" />

      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="bg-white border border-[#E0E0E0] rounded-lg w-full max-w-lg p-8 text-center">
          <div className="w-16 h-16 rounded-full border-2 border-black flex items-center justify-center mx-auto mb-6 text-2xl">
            ✓
          </div>

          <h1 className="text-lg font-bold mb-1">Đăng ký thành công!</h1>
          <p className="text-sm text-[#888888] mb-6">
            Vui lòng lưu hoặc in mã QR bên dưới để sử dụng khi đến giao hàng.
          </p>

          <div className="flex justify-center mb-4">
            <canvas ref={canvasRef} className="border border-[#E0E0E0] rounded" />
          </div>

          <p className="font-mono text-base font-bold tracking-widest mb-1">
            {result.booking_code}
          </p>
          <p className="text-sm text-[#888888] mb-6">
            Giao hàng ngày:{' '}
            <strong className="text-black">{formatDateDisplay(result.delivery_date)}</strong>
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={handleDownloadQR} className="btn-outline flex-1" id="download-qr">
              Tải QR Code
            </button>
            <button onClick={handlePrint} className="btn-primary flex-1" id="print-confirmation">
              In xác nhận
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-[#E0E0E0]">
            <Link to="/my-bookings" className="text-sm text-[#888888] hover:text-black transition-colors" id="go-to-my-bookings">
              Xem danh sách đăng ký →
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import jsQR from 'jsqr'
import { supabase } from '@/shared/lib/supabase'
import { Navbar } from '@/shared/components/Navbar'
import { Button } from '@/shared/components/Button'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { formatDateDisplay } from '@/shared/lib/dateUtils'
import { deriveBookingStatus } from '@/shared/lib/bookingStatus'
import { type TimeSlot, type BookingStatus } from '@/shared/types/domain'
import { getCurrentUser } from '@/shared/lib/auth'
import { ROLE_TABS } from '@/shared/config/navTabs'

interface BookingDetail {
  id: string
  booking_code: string
  booking_token: string
  delivery_date: string
  time_slot: TimeSlot
  status: BookingStatus
  supplier_name: string
  warehouse_name: string
  ghi_chu: string | null
  items: Array<{
    id: string
    product_code: string
    process_code: string
    delivery_round: number
    is_final_round: boolean
    quantity_booked: number
    quantity_received: number | null
    status: string
  }>
}

export default function ReceiverPage() {
  const [tokenInput, setTokenInput] = useState('')
  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [isLooking, setIsLooking] = useState(false)
  const [scanning, setScanning] = useState(false)
  const user = getCurrentUser()
  const tabs = user ? (ROLE_TABS[user.role] ?? []) : []
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scanIntervalRef = useRef<number | null>(null)

  useEffect(() => {
    document.title = 'Nháº­n hÃ ng â€” Atino'
    return () => { if (scanIntervalRef.current) clearInterval(scanIntervalRef.current) }
  }, [])

  const lookupBooking = async (tokenStr: string) => {
    setLookupError(null)
    setIsLooking(true)
    try {
      const parts = tokenStr.split(':')
      const tok = parts.length === 3 ? parts[2] : tokenStr

      const { data, error } = await supabase
        .from('bookings')
        .select('*, suppliers!inner(name), warehouses!inner(name), booking_items(*)')
        .eq('booking_token', tok)
        .single()

      if (error || !data) { setLookupError('KhÃ´ng tÃ¬m tháº¥y booking'); return }

      const d = data as any
      const b: BookingDetail = {
        id: d.id, booking_code: d.booking_code, booking_token: d.booking_token,
        delivery_date: d.delivery_date, time_slot: d.time_slot as TimeSlot,
        status: deriveBookingStatus(d.status, d.booking_items ?? []), supplier_name: d.suppliers?.name ?? 'â€”',
        warehouse_name: d.warehouses?.name ?? 'â€”', ghi_chu: d.ghi_chu,
        items: d.booking_items ?? [],
      }
      setBooking(b)
      const init: Record<string, number> = {}
      for (const item of b.items) init[item.id] = item.quantity_booked
      setQuantities(init)
    } finally {
      setIsLooking(false)
    }
  }

  const receiveDirectMutation = useMutation({
    mutationFn: async () => {
      if (!booking) return
      const { error } = await supabase.rpc('receive_booking', {
        p_booking_token: booking.booking_token,
        p_quantities: quantities,
        p_receiver_username: user?.sub ?? '',
      } as any)
      if (error) throw error
    },
    onSuccess: () => { if (booking) void lookupBooking(booking.booking_token) },
  })

  const startScanning = async () => {
    setScanning(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        scanIntervalRef.current = window.setInterval(() => {
          if (!videoRef.current || !canvasRef.current) return
          const ctx = canvasRef.current.getContext('2d')
          if (!ctx) return
          canvasRef.current.width = videoRef.current.videoWidth
          canvasRef.current.height = videoRef.current.videoHeight
          ctx.drawImage(videoRef.current, 0, 0)
          const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height)
          if (code?.data) { setTokenInput(code.data); stopScanning(); void lookupBooking(code.data) }
        }, 300)
      }
    } catch {
      setScanning(false)
      alert('KhÃ´ng thá»ƒ truy cáº­p camera')
    }
  }

  const stopScanning = () => {
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((t) => t.stop())
      videoRef.current.srcObject = null
    }
    setScanning(false)
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF5FF]">
      <Navbar tabs={tabs} activeTab="receiver" />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        <h1 className="text-xl font-bold mb-6">Nháº­n hÃ ng</h1>

        <div className="bg-white border border-[#E0E0E0] rounded-lg px-6 py-5 mb-4">
          <p className="font-semibold text-sm mb-3">QuÃ©t mÃ£ QR hoáº·c nháº­p mÃ£ booking</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void lookupBooking(tokenInput) }}
              placeholder="Nháº­p mÃ£ booking hoáº·c dÃ¡n mÃ£ QR..."
              className="input-field flex-1"
              id="booking-token-input"
            />
            <Button onClick={() => void lookupBooking(tokenInput)} loading={isLooking} disabled={!tokenInput.trim()} id="lookup-btn">Tra cá»©u</Button>
            <Button variant="outline" onClick={scanning ? stopScanning : () => void startScanning()} id="scan-btn">
              {scanning ? 'â¹ Dá»«ng' : 'ðŸ“· QuÃ©t'}
            </Button>
          </div>
          {scanning && (
            <div className="mt-3 relative">
              <video ref={videoRef} className="w-full rounded border border-[#E0E0E0]" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}
          {lookupError && <p className="form-error mt-2">{lookupError}</p>}
        </div>

        {booking && (
          <div className="bg-white border border-[#E0E0E0] rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E0E0E0] flex items-center justify-between">
              <div>
                <p className="font-mono font-bold">{booking.booking_code}</p>
                <p className="text-xs text-[#888888]">{booking.supplier_name} â€¢ {formatDateDisplay(booking.delivery_date)}</p>
              </div>
              <StatusBadge status={booking.status} />
            </div>

            {booking.status === 'confirmed' || booking.status === 'partially_approved' ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#F5F5F5]">
                        <th className="table-header">MÃ£ SP</th>
                        <th className="table-header">MÃ£ QT</th>
                        <th className="table-header">SL Ä‘Äƒng kÃ½</th>
                        <th className="table-header">SL thá»±c nháº­n</th>
                      </tr>
                    </thead>
                    <tbody>
                      {booking.items.filter((i) => i.status === 'confirmed').map((item) => (
                        <tr key={item.id} className="border-t border-[#E0E0E0]">
                          <td className="table-cell font-mono">{item.product_code}</td>
                          <td className="table-cell font-mono">{item.process_code}</td>
                          <td className="table-cell text-right">{item.quantity_booked}</td>
                          <td className="table-cell">
                            <input
                              type="number"
                              min={0}
                              value={quantities[item.id] ?? item.quantity_booked}
                              onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))}
                              className="input-field w-20 text-right"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-4">
                  <Button fullWidth loading={receiveDirectMutation.isPending} onClick={() => receiveDirectMutation.mutate()} id="confirm-receive-btn">
                    XÃ¡c nháº­n nháº­n hÃ ng
                  </Button>
                </div>
              </>
            ) : (
              <div className="px-6 py-8 text-center text-[#888888] text-sm">
                {booking.status === 'received' ? 'âœ… ÄÃ£ nháº­n hÃ ng thÃ nh cÃ´ng.'
                  : booking.status === 'pending' ? 'â³ Booking chÆ°a Ä‘Æ°á»£c reviewer xÃ¡c nháº­n.'
                  : booking.status === 'partially_rejected' ? 'â³ Booking cÃ²n sáº£n pháº©m chÆ°a Ä‘Æ°á»£c duyá»‡t Ä‘á»ƒ nháº­n hÃ ng.'
                  : 'âŒ Booking Ä‘Ã£ bá»‹ tá»« chá»‘i.'}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

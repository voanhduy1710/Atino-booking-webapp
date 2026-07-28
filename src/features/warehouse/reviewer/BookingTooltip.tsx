import { type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getJson } from '@/shared/lib/apiClient'
import { buildPhotoList } from '@/shared/lib/gcs'
import { formatDateDisplay, formatDateTimeDisplay } from '@/shared/lib/dateUtils'
import { TIME_SLOT_LABELS, type TimeSlot, type BookingStatus } from '@/shared/types/domain'
import { AttachmentThumbnail } from '@/shared/components/AttachmentThumbnail'
import { formatBookingItemSummary, type BookingItemStatusCounts, type BookingStatusTag } from '@/shared/lib/bookingStatus'

export interface BookingRow {
  id: string
  booking_code: string
  booking_token: string
  delivery_date: string
  time_slot: TimeSlot
  status: BookingStatus
  submitted_at: string
  supplier_name: string
  supplier_code: string
  supplier_account_id: string
  warehouse_name: string
  items_count: number
  item_status_counts: BookingItemStatusCounts
  status_tags: BookingStatusTag[]
  ghi_chu: string | null
  reject_reasons: string
  item_codes: Array<{ product_code: string; process_code: string }>
  nhanh_draft_bill_id?: string | null
}

interface TooltipItem {
  product_code: string
  process_code: string
  warehouse_code: string | null
  mau: string | null
  delivery_round: number
  is_final_round: boolean
  quantity_booked: number
  total_quantity: number | null
}

interface Props {
  row: BookingRow
  x: number
  y: number
  isPinned: boolean
  tooltipRef: RefObject<HTMLDivElement>
  onMouseEnter: () => void
  onMouseLeave: () => void
  onPhotoClick: (src: string) => void
  onPin: () => void
  onViewDetails: () => void
}

export function BookingTooltip({ row, x, y, isPinned, tooltipRef, onMouseEnter, onMouseLeave, onPhotoClick, onPin, onViewDetails }: Props) {
  const { data } = useQuery({
    queryKey: ['tooltip-items', row.id],
    queryFn: async () => {
      const result = await getJson<{ booking: { booking_items?: any[] } }>(`/api/reviewer/bookings/${row.id}`)
      const data = result.booking.booking_items ?? []
      const items: TooltipItem[] = data.map((d: any) => ({
        product_code: d.product_code,
        process_code: d.process_code,
        warehouse_code: d.warehouse_code,
        mau: d.mau,
        delivery_round: d.delivery_round,
        is_final_round: d.is_final_round,
        quantity_booked: d.quantity_booked,
        total_quantity: d.total_quantity,
      }))
      const photos = data.flatMap((item) => buildPhotoList(item as any))
      return { items, photos }
    },
    staleTime: 8 * 60 * 1000,
  })

  const items = data?.items ?? []
  const photos = data?.photos ?? []
  const clampedX = Math.max(4, Math.min(x, window.innerWidth - 400))
  const clampedY = Math.max(4, Math.min(y, window.innerHeight - 400))

  return (
    <div ref={tooltipRef} className="fixed z-40 w-[min(24rem,calc(100vw-1rem))] bg-white border border-[#ecdbe8] rounded-lg shadow-xl p-3 pointer-events-auto" style={{ left: clampedX, top: clampedY }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <p className="font-mono font-bold text-xs mb-2">{row.booking_code}</p>
      <div className="space-y-1.5 mb-3">
        {([
          ['Mã NCC', row.supplier_code],
          ['Kho', row.warehouse_name],
          ['Ngày giao', formatDateDisplay(row.delivery_date)],
          ['Khung giờ', TIME_SLOT_LABELS[row.time_slot]],
          ['Xử lý', formatBookingItemSummary(row.item_status_counts)],
          ['Đăng ký lúc', formatDateTimeDisplay(row.submitted_at)],
        ] as [string, string][]).map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <span className="text-[#888888] text-xs flex-shrink-0">{label}</span>
            <span className="text-xs text-right">{value}</span>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-[#888888] uppercase tracking-wider mb-1.5">Đơn hàng</p>
          <div className="border border-[#ecdbe8] rounded overflow-hidden">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-[#F5F5F5]">
                  <th className="px-2 py-1 text-left text-[#888888] font-medium">Tên SP</th>
                  <th className="px-2 py-1 text-left text-[#888888] font-medium">Mã đơn</th>
                  <th className="px-2 py-1 text-left text-[#888888] font-medium">Kho/Màu</th>
                  <th className="px-2 py-1 text-center text-[#888888] font-medium">Lần</th>
                  <th className="px-2 py-1 text-right text-[#888888] font-medium">SL</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-t border-[#ecdbe8]">
                    <td className="px-2 py-1 font-mono">{item.product_code}</td>
                    <td className="px-2 py-1 font-mono">{item.process_code}</td>
                    <td className="px-2 py-1">{[item.warehouse_code, item.mau].filter(Boolean).join(' / ') || '-'}</td>
                    <td className="px-2 py-1 text-center">{item.is_final_round ? 'Cuối' : item.delivery_round}</td>
                    <td className="px-2 py-1 text-right">{item.total_quantity ?? item.quantity_booked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {photos.length > 0 && (
        <div>
          <p className="text-[10px] text-[#888888] uppercase tracking-wider mb-1.5">Ảnh đính kèm</p>
          <div className="flex flex-wrap gap-1.5">
            {photos.map((ph, i) => <AttachmentThumbnail key={i} src={ph.src} label={ph.label} onClick={() => { onPin(); onPhotoClick(ph.src) }} className="w-16 h-16" />)}
          </div>
        </div>
      )}
      <button type="button" onClick={onViewDetails} className="mt-3 w-full rounded border border-[#80417A] px-3 py-1.5 text-xs font-medium hover:bg-[#80417A] hover:text-white transition-colors">
        Xem chi tiết
      </button>
      {isPinned && <p className="text-[10px] text-[#BBBBBB] mt-2 text-right">Nhấn Esc để đóng</p>}
    </div>
  )
}

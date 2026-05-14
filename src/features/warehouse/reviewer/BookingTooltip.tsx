import { type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
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
  supplier_account_id: string
  warehouse_name: string
  items_count: number
  item_status_counts: BookingItemStatusCounts
  status_tags: BookingStatusTag[]
  ghi_chu: string | null
  reject_reasons: string
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
  const { data: photos = [] } = useQuery({
    queryKey: ['tooltip-photos', row.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_items')
        .select('vat_invoice_url, booking_item_photos(storage_path, photo_type)')
        .eq('booking_id', row.id)
      if (error) return []
      return (data ?? []).flatMap((item) => buildPhotoList(item as any))
    },
    staleTime: 8 * 60 * 1000,
  })

  const clampedX = Math.max(4, Math.min(x, window.innerWidth - 336))
  const clampedY = Math.max(4, Math.min(y, window.innerHeight - 320))

  return (
    <div
      ref={tooltipRef}
      className="fixed z-40 w-80 bg-white border border-[#ecdbe8] rounded-lg shadow-xl p-3 pointer-events-auto"
      style={{ left: clampedX, top: clampedY }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <p className="font-mono font-bold text-xs mb-2">{row.booking_code}</p>
      <div className="space-y-1.5 mb-3">
        {([
          ['NhÃ  cung cáº¥p', row.supplier_name],
          ['Kho', row.warehouse_name],
          ['NgÃ y giao', formatDateDisplay(row.delivery_date)],
          ['Khung giá»', TIME_SLOT_LABELS[row.time_slot]],
          ['SL PO', String(row.items_count)],
          ['Xá»­ lÃ½', formatBookingItemSummary(row.item_status_counts)],
          ['ÄÄƒng kÃ½ lÃºc', formatDateTimeDisplay(row.submitted_at)],
        ] as [string, string][]).map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <span className="text-[#888888] text-xs flex-shrink-0">{label}</span>
            <span className="text-xs text-right">{value}</span>
          </div>
        ))}
      </div>
      {photos.length > 0 && (
        <div>
          <p className="text-[10px] text-[#888888] uppercase tracking-wider mb-1.5">áº¢nh Ä‘Ã­nh kÃ¨m</p>
          <div className="flex flex-wrap gap-1.5">
            {photos.map((ph, i) => (
              <AttachmentThumbnail
                key={i}
                src={ph.src}
                label={ph.label}
                onClick={() => { onPin(); onPhotoClick(ph.src) }}
                className="w-16 h-16"
              />
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onViewDetails}
        className="mt-3 w-full rounded border border-[#80417A] px-3 py-1.5 text-xs font-medium hover:bg-[#80417A] hover:text-white transition-colors"
      >
        Xem chi tiáº¿t
      </button>
      {isPinned && <p className="text-[10px] text-[#BBBBBB] mt-2 text-right">Nháº¥n Esc Ä‘á»ƒ Ä‘Ã³ng</p>}
    </div>
  )
}

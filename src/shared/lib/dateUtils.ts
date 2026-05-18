import { toZonedTime, format } from 'date-fns-tz'

const ICT = 'Asia/Ho_Chi_Minh'
const DELIVERY_CUTOFF_HOUR_ICT = 17
const DELIVERY_CUTOFF_MINUTE_ICT = 30

export function nowICT(): Date {
  return toZonedTime(new Date(), ICT)
}

export function getDeliveryDateOffsets(now = nowICT()): { min: number; max: number } {
  const minutes = now.getHours() * 60 + now.getMinutes()
  const cutoff = DELIVERY_CUTOFF_HOUR_ICT * 60 + DELIVERY_CUTOFF_MINUTE_ICT
  return minutes <= cutoff ? { min: 1, max: 3 } : { min: 2, max: 4 }
}

export function addDaysICT(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function getDeliveryDateWindow(now = nowICT()): { minDate: Date; maxDate: Date; minISO: string; maxISO: string } {
  const offsets = getDeliveryDateOffsets(now)
  const minDate = addDaysICT(now, offsets.min)
  const maxDate = addDaysICT(now, offsets.max)
  return {
    minDate,
    maxDate,
    minISO: formatDateISO(minDate),
    maxISO: formatDateISO(maxDate),
  }
}

export function computeDeliveryDatePreview(): Date {
  return getDeliveryDateWindow().minDate
}

export function formatDateDisplay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(toZonedTime(d, ICT), 'dd/MM/yyyy', { timeZone: ICT })
}

export function formatDateTimeDisplay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(toZonedTime(d, ICT), 'dd/MM/yyyy HH:mm', { timeZone: ICT })
}

export function formatDateISO(date: Date): string {
  return format(toZonedTime(date, ICT), 'yyyy-MM-dd', { timeZone: ICT })
}

export function relativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)

  if (diffMin < 1) return 'Vua xong'
  if (diffMin < 60) return `${diffMin} phut truoc`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} gio truoc`
  const diffDay = Math.floor(diffHour / 24)
  return `${diffDay} ngay truoc`
}

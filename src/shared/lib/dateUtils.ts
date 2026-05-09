import { toZonedTime, format } from 'date-fns-tz'

const ICT = 'Asia/Ho_Chi_Minh'

/**
 * Get the current time in ICT timezone.
 */
export function nowICT(): Date {
  return toZonedTime(new Date(), ICT)
}

/**
 * Compute the delivery date per business rule:
 * - Before 18:00 ICT → N+1 (tomorrow)
 * - At or after 18:00 ICT → N+2 (day after tomorrow)
 *
 * NOTE: The authoritative value is set server-side by the DB trigger.
 * This function is for client-side preview only.
 */
export function computeDeliveryDatePreview(): Date {
  const now = nowICT()
  const hour = now.getHours()
  const offset = hour < 18 ? 1 : 2
  const result = new Date(now)
  result.setDate(result.getDate() + offset)
  return result
}

/**
 * Format a date for display: DD/MM/YYYY
 */
export function formatDateDisplay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(toZonedTime(d, ICT), 'dd/MM/yyyy', { timeZone: ICT })
}

/**
 * Format a datetime for display: DD/MM/YYYY HH:mm
 */
export function formatDateTimeDisplay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(toZonedTime(d, ICT), 'dd/MM/yyyy HH:mm', { timeZone: ICT })
}

/**
 * Format a date as YYYY-MM-DD for booking code prefix or DB storage.
 */
export function formatDateISO(date: Date): string {
  return format(toZonedTime(date, ICT), 'yyyy-MM-dd', { timeZone: ICT })
}

/**
 * Human-readable relative time (e.g., "2 giờ trước")
 */
export function relativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)

  if (diffMin < 1) return 'Vừa xong'
  if (diffMin < 60) return `${diffMin} phút trước`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} giờ trước`
  const diffDay = Math.floor(diffHour / 24)
  return `${diffDay} ngày trước`
}

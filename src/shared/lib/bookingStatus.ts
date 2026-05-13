import type { BookingItemStatus, BookingStatus } from '@/shared/types/domain'

export interface BookingItemStatusCounts {
  total: number
  pending: number
  confirmed: number
  rejected: number
}

export type BookingStatusTag = 'pending' | 'partially_approved' | 'partially_rejected' | 'confirmed' | 'rejected'

export const countBookingItemStatuses = (items: Array<{ status: BookingItemStatus | string }>): BookingItemStatusCounts => {
  const counts: BookingItemStatusCounts = { total: items.length, pending: 0, confirmed: 0, rejected: 0 }
  for (const item of items) {
    if (item.status === 'confirmed') counts.confirmed += 1
    else if (item.status === 'rejected') counts.rejected += 1
    else counts.pending += 1
  }
  return counts
}

export const deriveBookingStatus = (
  currentStatus: BookingStatus | string,
  items: Array<{ status: BookingItemStatus | string }>
): BookingStatus => {
  if (currentStatus === 'received' || currentStatus === 'cancelled') return currentStatus as BookingStatus

  const counts = countBookingItemStatuses(items)
  if (counts.total === 0 || counts.pending === counts.total) return 'pending'
  if (counts.confirmed === counts.total) return 'confirmed'
  if (counts.rejected === counts.total) return 'rejected'
  if (counts.confirmed > 0) return 'partially_approved'
  return 'partially_rejected'
}

export const formatBookingItemSummary = (counts: BookingItemStatusCounts): string =>
  `${counts.confirmed}/${counts.total} duyệt · ${counts.rejected}/${counts.total} từ chối · ${counts.pending}/${counts.total} chờ`

export const getBookingStatusTags = (items: Array<{ status: BookingItemStatus | string }>): BookingStatusTag[] => {
  const counts = countBookingItemStatuses(items)
  const tags: BookingStatusTag[] = []

  if (counts.pending > 0) tags.push('pending')
  if (counts.confirmed > 0 && counts.confirmed < counts.total) tags.push('partially_approved')
  if (counts.rejected > 0 && counts.rejected < counts.total) tags.push('partially_rejected')
  if (counts.confirmed === counts.total && counts.total > 0) tags.push('confirmed')
  if (counts.rejected === counts.total && counts.total > 0) tags.push('rejected')

  return tags
}

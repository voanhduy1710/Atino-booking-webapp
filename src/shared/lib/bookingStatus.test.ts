import { describe, expect, it } from 'vitest'
import { countBookingItemStatuses, deriveBookingStatus, formatBookingItemSummary, getBookingStatusTags } from './bookingStatus'

describe('booking status helpers', () => {
  it('keeps an all-pending booking pending', () => {
    const items = [{ status: 'pending' }, { status: 'pending' }]

    expect(deriveBookingStatus('pending', items)).toBe('pending')
  })

  it('marks mixed confirmed and pending items as partially approved', () => {
    const items = [{ status: 'confirmed' }, { status: 'pending' }, { status: 'pending' }]

    expect(deriveBookingStatus('pending', items)).toBe('partially_approved')
  })

  it('marks mixed rejected and pending items as partially rejected when no item is confirmed', () => {
    const items = [{ status: 'rejected' }, { status: 'pending' }]

    expect(deriveBookingStatus('pending', items)).toBe('partially_rejected')
  })

  it('marks mixed confirmed and rejected items as partially approved', () => {
    const items = [{ status: 'confirmed' }, { status: 'rejected' }]

    expect(deriveBookingStatus('pending', items)).toBe('partially_approved')
  })

  it('keeps terminal booking statuses unchanged', () => {
    const items = [{ status: 'confirmed' }]

    expect(deriveBookingStatus('received', items)).toBe('received')
    expect(deriveBookingStatus('cancelled', items)).toBe('cancelled')
  })

  it('formats item progress counts', () => {
    const counts = countBookingItemStatuses([
      { status: 'confirmed' },
      { status: 'rejected' },
      { status: 'pending' },
      { status: 'pending' },
    ])

    expect(counts).toEqual({ total: 4, pending: 2, confirmed: 1, rejected: 1 })
    expect(formatBookingItemSummary(counts)).toBe('1/4 duyệt · 1/4 từ chối · 2/4 chờ')
  })

  it('returns every matching status tag for mixed item states', () => {
    const tags = getBookingStatusTags([
      { status: 'confirmed' },
      { status: 'rejected' },
      { status: 'pending' },
    ])

    expect(tags).toEqual(['pending', 'partially_approved', 'partially_rejected'])
  })
})

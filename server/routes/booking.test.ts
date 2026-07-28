// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { bookingRequestError, finalizeSchema, normalizeDeliveryDate } from './booking'

describe('normalizeDeliveryDate', () => {
  it('keeps valid date-only ISO values unchanged', () => {
    expect(normalizeDeliveryDate('2026-05-21')).toBe('2026-05-21')
  })

  it('trims valid ISO values without shifting the day', () => {
    expect(normalizeDeliveryDate(' 2026-05-21 ')).toBe('2026-05-21')
  })

  it('rejects display-formatted dates before database insert', () => {
    expect(() => normalizeDeliveryDate('21-05-2026')).toThrow('Ngày giao hàng không hợp lệ')
  })

  it('rejects impossible calendar dates', () => {
    expect(() => normalizeDeliveryDate('2026-02-31')).toThrow('Ngày giao hàng không hợp lệ')
  })
})

describe('booking request schema', () => {
  const valid = {
    warehouse_id: '6f9619ff-8b86-d011-b42d-00cf4fc964ff',
    delivery_date: '2026-07-28',
    time_slot: '08-1130',
    delivery_note: 'Delivery note',
    session_id: '6f9619ff-8b86-d011-b42d-00cf4fc964fe',
    items: [{
      product_code: 'PRODUCT',
      process_code: 'ORDER',
      delivery_round: 1,
      is_final_round: false,
      total_quantity: 10,
    }],
  }

  it('accepts a bounded valid booking request', () => {
    expect(finalizeSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects negative quantities and unknown time slots', () => {
    expect(finalizeSchema.safeParse({
      ...valid,
      time_slot: 'midnight',
      items: [{ ...valid.items[0], total_quantity: -1 }],
    }).success).toBe(false)
  })

  it('returns a clear message when no delivery time is selected', () => {
    const result = finalizeSchema.safeParse({
      ...valid,
      time_slot: null,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(bookingRequestError(result.error)).toBe(
        'Vui lòng chọn khung giờ giao hàng (08:00–11:30 hoặc 13:30–17:00)',
      )
    }
  })

  it('rejects zero item quantities with the row number', () => {
    const result = finalizeSchema.safeParse({
      ...valid,
      items: [{ ...valid.items[0], total_quantity: 0 }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(bookingRequestError(result.error)).toBe('Dòng 1: Tổng số lượng phải lớn hơn 0')
    }
  })

  it('rejects booking totals above the 20,000 product limit', () => {
    const result = finalizeSchema.safeParse({
      ...valid,
      items: [{ ...valid.items[0], total_quantity: 20_001 }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(bookingRequestError(result.error)).toContain('vượt giới hạn 20.000')
    }
  })

  it('rejects non-UUID idempotency keys and excessive item counts', () => {
    expect(finalizeSchema.safeParse({
      ...valid,
      session_id: 'repeat-me',
      items: Array.from({ length: 101 }, () => valid.items[0]),
    }).success).toBe(false)
  })
})

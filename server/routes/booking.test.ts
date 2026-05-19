// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { normalizeDeliveryDate } from './booking'

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

import { describe, expect, it } from 'vitest'
import { bookingFormSchema } from './schemas'

const validItem = {
  product_code: 'SP-01',
  process_code: 'DON-01',
  warehouse_code: 'KHO-01',
  mau: 'Đen',
  delivery_round: 2,
  is_final_round: false,
  total_quantity: 10,
  size_s_28: 10,
  size_m_29: null,
  size_l_30: null,
  size_xl_31: null,
  size_2xl_32: null,
  size_3xl_33: null,
  size_4xl_34: null,
  vat_temp_paths: [],
  slip_temp_paths: ['uploads/user/slip.jpg'],
}

const validForm = {
  warehouse_id: 'warehouse-id',
  delivery_date: '2026-07-29',
  time_slot: '08-1130',
  ghi_chu: '',
  items: [validItem],
}

describe('bookingFormSchema', () => {
  it('shows a useful time-slot error for null values', () => {
    const result = bookingFormSchema.safeParse({ ...validForm, time_slot: null })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'Vui lòng chọn khung giờ giao hàng (08:00–11:30 hoặc 13:30–17:00)',
      )
    }
  })

  it('rejects totals above the per-booking limit', () => {
    const result = bookingFormSchema.safeParse({
      ...validForm,
      items: [{
        ...validItem,
        total_quantity: 20_001,
        size_s_28: 20_001,
      }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('vượt giới hạn 20.000'))).toBe(true)
    }
  })
})

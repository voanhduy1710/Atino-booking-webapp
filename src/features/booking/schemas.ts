import { z } from 'zod'
import {
  MAX_BOOKING_ITEMS,
  MAX_DAILY_TOTAL_QUANTITY,
  MAX_NOTE_LENGTH,
} from '@/shared/constants/booking'
import { BOOKING_TIME_SLOTS } from '@/shared/types/domain'

const TIME_SLOT_REQUIRED_MESSAGE =
  'Vui lòng chọn khung giờ giao hàng (08:00–11:30 hoặc 13:30–17:00)'

const sizeNumber = z.preprocess((value) => {
  if (value === '' || value == null) return null
  return value
}, z.coerce.number().int().min(0).max(999_999).nullable())

export const poRowSchema = z.object({
  product_code: z.string().min(1, 'Vui lòng chọn mã sản phẩm').max(100),
  process_code: z.string().min(1, 'Vui lòng chọn mã đơn').max(100),
  warehouse_code: z.string().min(1, 'Vui lòng chọn mã kho').max(100),
  mau: z.string().min(1, 'Vui lòng chọn màu').max(100),
  delivery_round: z.coerce.number().int().min(1, 'Số lần giao phải >= 1'),
  is_final_round: z.boolean(),
  quantity_booked: z.coerce.number().int().min(1).optional(),
  total_quantity: z.coerce.number().int().min(1, 'Tổng số lượng phải >= 1'),
  size_s_28: sizeNumber,
  size_m_29: sizeNumber,
  size_l_30: sizeNumber,
  size_xl_31: sizeNumber,
  size_2xl_32: sizeNumber,
  size_3xl_33: sizeNumber,
  size_4xl_34: sizeNumber,
  vat_temp_paths: z.array(z.string()).optional(),
  slip_temp_paths: z.array(z.string()).min(1, 'Vui lòng tải lên ít nhất 1 ảnh phiếu giao'),
})

export const bookingFormSchema = z.object({
  warehouse_id: z.string().min(1, 'Vui lòng chọn kho'),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày giao hàng không hợp lệ'),
  time_slot: z.enum(BOOKING_TIME_SLOTS, {
    errorMap: () => ({ message: TIME_SLOT_REQUIRED_MESSAGE }),
  }),
  ghi_chu: z.string().max(MAX_NOTE_LENGTH, `Ghi chú tối đa ${MAX_NOTE_LENGTH} ký tự`).optional(),
  items: z
    .array(poRowSchema)
    .min(1, 'Phải có ít nhất 1 đơn hàng')
    .max(MAX_BOOKING_ITEMS),
})
  .superRefine((data, ctx) => {
    let bookingTotal = 0

    data.items.forEach((item, idx) => {
      const total =
        (item.size_s_28 ?? 0) +
        (item.size_m_29 ?? 0) +
        (item.size_l_30 ?? 0) +
        (item.size_xl_31 ?? 0) +
        (item.size_2xl_32 ?? 0) +
        (item.size_3xl_33 ?? 0) +
        (item.size_4xl_34 ?? 0)
      bookingTotal += total

      if (total !== item.total_quantity) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Tổng số lượng phải bằng tổng các size',
          path: ['items', idx, 'total_quantity'],
        })
      }
      if (item.delivery_round === 1 && (!item.vat_temp_paths || item.vat_temp_paths.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Vui lòng tải lên ít nhất 1 hóa đơn VAT cho lần giao 1',
          path: ['items', idx, 'vat_temp_paths'],
        })
      }
    })

    if (bookingTotal > MAX_DAILY_TOTAL_QUANTITY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Tổng số lượng ${bookingTotal.toLocaleString('vi-VN')} vượt giới hạn ${MAX_DAILY_TOTAL_QUANTITY.toLocaleString('vi-VN')} sản phẩm cho một booking`,
        path: ['items'],
      })
    }
  })

export type BookingFormData = z.infer<typeof bookingFormSchema>
export type PoRowData = z.infer<typeof poRowSchema>

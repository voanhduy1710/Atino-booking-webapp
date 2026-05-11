import { z } from 'zod'

export const poRowSchema = z.object({
  product_code: z.string().min(1, 'Vui lòng nhập mã sản phẩm').max(100),
  process_code: z.string().min(1, 'Vui lòng nhập mã quy trình').max(100),
  delivery_round: z.number().int().min(1, 'Số lần giao phải ≥ 1'),
  is_final_round: z.boolean(),
  quantity_booked: z.number().int().min(1, 'Số kiện/thùng phải ≥ 1'),
  vat_temp_paths: z.array(z.string()).optional(),
  slip_temp_paths: z.array(z.string()).min(1, 'Vui lòng tải lên ít nhất 1 ảnh phiếu giao'),
})

export const bookingFormSchema = z.object({
  warehouse_id: z.string().min(1, 'Vui lòng chọn kho'),
  time_slot: z.enum(['07-09', '09-11', '13-15', '15-17'], {
    required_error: 'Vui lòng chọn khung giờ',
  }),
  ghi_chu: z.string().max(500, 'Ghi chú tối đa 500 ký tự').optional(),
  items: z
    .array(poRowSchema)
    .min(1, 'Phải có ít nhất 1 đơn hàng')
    .max(99),
})
  .superRefine((data, ctx) => {
    data.items.forEach((item, idx) => {
      if (item.delivery_round === 1 && (!item.vat_temp_paths || item.vat_temp_paths.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Vui lòng tải lên ít nhất 1 hóa đơn VAT cho lần giao 1',
          path: ['items', idx, 'vat_temp_paths'],
        })
      }
    })
  })

export type BookingFormData = z.infer<typeof bookingFormSchema>
export type PoRowData = z.infer<typeof poRowSchema>

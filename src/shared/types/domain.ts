// Domain types and enums, hand-written until Supabase types are regenerated.

export type AccountStatus = 'pending' | 'active' | 'disabled' | 'deleted' | 'rejected'
export type BookingStatus = 'pending' | 'partially_approved' | 'partially_rejected' | 'confirmed' | 'rejected' | 'returned' | 'received' | 'cancelled'
export type BookingItemStatus = 'pending' | 'confirmed' | 'rejected' | 'returned'
export type TimeSlot = '08-1130' | '1330-17' | '07-09' | '09-11' | '13-15' | '15-17'

export const BOOKING_TIME_SLOTS = ['08-1130', '1330-17'] as const
export type PhotoType = 'delivery_slip' | 'vat_invoice' | 'discrepancy'
export type NotificationRecipient = 'supplier_account' | 'staff'
export type UserRole = 'admin' | 'warehouse_reviewer' | 'warehouse_receiver' | 'manager' | 'supplier'

export const TIME_SLOT_LABELS: Record<TimeSlot, string> = {
  '08-1130': 'Sáng: 08:00 - 11:30',
  '1330-17': 'Chiều: 13:30 - 17:00',
  '07-09': '07:00 - 09:00',
  '09-11': '09:00 - 11:00',
  '13-15': '13:30 - 15:30',
  '15-17': '15:30 - 17:00',
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Đang chờ xác nhận',
  partially_approved: 'Duyệt một phần',
  partially_rejected: 'Từ chối một phần',
  confirmed: 'Đã xác nhận - chờ giao hàng',
  rejected: 'Đã từ chối',
  returned: 'Trả hàng',
  received: 'Đã nhận hàng',
  cancelled: 'Đã huỷ',
}

export const STANDARD_DELIVERY_NOTE =
  'Vui lòng mang đầy đủ hàng hóa theo đúng số lượng đã đăng ký. ' +
  'Hàng giao thiếu hoặc không đúng chủng loại sẽ bị trả về. ' +
  'Vui lòng đến đúng khung giờ đã chọn.'

export interface Warehouse {
  id: string
  code: string
  name: string
  active: boolean
}

export interface Supplier {
  id: string
  code: string
  name: string
  active: boolean
}

export interface SupplierAccount {
  id: string
  username: string
  full_name: string
  supplier_code_requested: string
  supplier_id: string | null
  status: AccountStatus
  reject_reason: string | null
  created_at: string
  approved_at: string | null
}

export interface Booking {
  id: string
  booking_code: string
  booking_token: string
  supplier_account_id: string
  supplier_id: string
  warehouse_id: string
  delivery_date: string
  time_slot: TimeSlot
  ghi_chu: string | null
  delivery_note: string
  nhanh_draft_bill_id: string | null
  status: BookingStatus
  submitted_at: string
  confirmed_by: string | null
  confirmed_at: string | null
  received_by: string | null
  received_at: string | null
}

export interface BookingItem {
  id: string
  booking_id: string
  product_code: string
  process_code: string
  delivery_round: number
  is_final_round: boolean
  quantity_booked: number
  warehouse_code: string | null
  mau: string | null
  total_quantity: number
  size_s_28: number
  size_m_29: number
  size_l_30: number
  size_xl_31: number
  size_2xl_32: number
  size_3xl_33: number
  size_4xl_34: number
  quantity_received: number | null
  status: BookingItemStatus
  vat_invoice_url: string | null
  reject_reason: string | null
}

export interface BookingItemPhoto {
  id: string
  booking_item_id: string
  storage_path: string
  photo_type: PhotoType
  uploaded_at: string
}

export interface ProductProcessCatalog {
  id: string
  lark_record_id: string
  product_name: string
  order_code: string
  warehouse_code: string | null
  mau: string | null
  order_date: string | null
  total_quantity: number
  size_s_28: number | null
  size_m_29: number | null
  size_l_30: number | null
  size_xl_31: number | null
  size_2xl_32: number | null
  size_3xl_33: number | null
  size_4xl_34: number | null
  active: boolean
  last_synced_at: string
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  recipient_type: NotificationRecipient
  recipient_id: string
  event_type: string
  message: string
  booking_id: string | null
  is_read: boolean
  created_at: string
}

export interface BookingWithDetails extends Booking {
  supplier_name?: string
  warehouse_name?: string
  warehouse_code?: string
  items?: BookingItem[]
}

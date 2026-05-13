// Domain types and enums — hand-written (not generated from Supabase)

export type AccountStatus = 'pending' | 'active' | 'rejected'
export type BookingStatus = 'pending' | 'partially_approved' | 'partially_rejected' | 'confirmed' | 'rejected' | 'received' | 'cancelled'
export type BookingItemStatus = 'pending' | 'confirmed' | 'rejected'
export type TimeSlot = '07-09' | '09-11' | '13-15' | '15-17'
export type PhotoType = 'delivery_slip' | 'discrepancy'
export type NotificationRecipient = 'supplier_account' | 'staff'
export type UserRole = 'admin' | 'warehouse_reviewer' | 'warehouse_receiver' | 'manager' | 'supplier'

export const TIME_SLOT_LABELS: Record<TimeSlot, string> = {
  '07-09': '07:00 – 09:00',
  '09-11': '09:00 – 11:00',
  '13-15': '13:30 – 15:30',
  '15-17': '15:30 – 17:00',
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Đang chờ xác nhận',
  partially_approved: 'Duyệt một phần',
  partially_rejected: 'Từ chối một phần',
  confirmed: 'Đã xác nhận — chờ giao hàng',
  rejected: 'Đã từ chối',
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

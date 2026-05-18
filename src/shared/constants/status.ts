import type { AccountStatus, BookingStatus } from '@/shared/types/domain'

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  pending: 'Chờ xác nhận',
  active: 'Đang hoạt động',
  rejected: 'Đã từ chối',
}

export const ACCOUNT_STATUS_CLASSES: Record<AccountStatus, string> = {
  pending: 'status-pending',
  active: 'status-confirmed',
  rejected: 'status-rejected',
}

export const ACCOUNT_STATUS_FILTER_OPTIONS: Array<{ value: AccountStatus | 'all'; label: string }> = [
  { value: 'pending', label: ACCOUNT_STATUS_LABELS.pending },
  { value: 'active', label: ACCOUNT_STATUS_LABELS.active },
  { value: 'rejected', label: ACCOUNT_STATUS_LABELS.rejected },
  { value: 'all', label: 'Tất cả' },
]

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Đang chờ xác nhận',
  partially_approved: 'Duyệt một phần',
  partially_rejected: 'Từ chối một phần',
  confirmed: 'Đã xác nhận',
  rejected: 'Đã từ chối',
  returned: 'Trả hàng',
  received: 'Đã nhận hàng',
  cancelled: 'Đã huỷ',
}

export const BOOKING_STATUS_CLASSES: Record<BookingStatus, string> = {
  pending: 'status-pending',
  partially_approved: 'status-partial',
  partially_rejected: 'status-partial-rejected',
  confirmed: 'status-confirmed',
  rejected: 'status-rejected',
  returned: 'status-returned',
  received: 'status-confirmed',
  cancelled: 'status-cancelled',
}

export const BOOKING_STATUS_HEX_COLORS: Record<BookingStatus, string> = {
  pending: '#FFC000',
  partially_approved: '#5B9BD5',
  partially_rejected: '#ED7D31',
  confirmed: '#70AD47',
  rejected: '#C00000',
  returned: '#7A3E00',
  received: '#4472C4',
  cancelled: '#A5A5A5',
}

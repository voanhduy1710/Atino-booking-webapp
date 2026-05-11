import type { NavTab } from '@/shared/components/Navbar'

/**
 * Shared supplier navigation tabs.
 * Kept here (not in BookingForm) so guide pages can import without
 * pulling the entire BookingForm chunk into their lazy bundle.
 */
export const SUPPLIER_TABS: NavTab[] = [
  { id: 'new-booking',  label: 'Đăng ký',             href: '/booking/new' },
  { id: 'my-bookings',  label: 'Đơn của tôi',         href: '/my-bookings' },
  { id: 'guide-create', label: 'Quy trình đăng ký',   href: '/guide/create' },
  { id: 'guide',        label: 'Quy trình nhận hàng', href: '/guide/receiving' },
]

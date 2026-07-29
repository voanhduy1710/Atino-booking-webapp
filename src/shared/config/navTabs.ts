import type { NavTab } from '@/shared/components/Navbar'

export const ROLE_TABS: Record<string, NavTab[]> = {
  warehouse_reviewer: [
    { id: 'reviewer', label: 'Xác nhận booking', href: '/reviewbooking' },
    { id: 'warehouses', label: 'Kho hàng', href: '/warehouses' },
    { id: 'suppliers', label: 'Nhà cung cấp', href: '/suppliers' },
    { id: 'product-process', label: 'Mã SP / Mã QT', href: '/product-process' },
    { id: 'report', label: 'Báo cáo', href: '/report' },
  ],
  warehouse_receiver: [
    { id: 'receiver', label: 'Nhận hàng', href: '/reviewbooking' },
  ],
  manager: [
    { id: 'reviewer', label: 'Xác nhận booking', href: '/reviewbooking' },
    { id: 'warehouses', label: 'Kho hàng', href: '/warehouses' },
    { id: 'suppliers', label: 'Nhà cung cấp', href: '/suppliers' },
    { id: 'product-process', label: 'Mã SP / Mã QT', href: '/product-process' },
    { id: 'report', label: 'Báo cáo', href: '/report' },
  ],
  admin: [
    { id: 'accounts', label: 'Các tài khoản', href: '/accounts' },
    { id: 'new-booking', label: 'Đăng ký', href: '/booking/new' },
    { id: 'warehouses', label: 'Kho hàng', href: '/warehouses' },
    { id: 'suppliers', label: 'Nhà cung cấp', href: '/suppliers' },
    { id: 'product-process', label: 'Mã SP / Mã QT', href: '/product-process' },
    { id: 'reviewer', label: 'Xác nhận booking', href: '/reviewbooking' },
    { id: 'report', label: 'Báo cáo', href: '/report' },
    { id: 'viewas', label: 'View as', href: '/viewas' },
  ],
}

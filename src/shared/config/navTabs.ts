import type { NavTab } from '@/shared/components/Navbar'

export const ROLE_TABS: Record<string, NavTab[]> = {
  warehouse_reviewer: [
    { id: 'reviewer', label: 'Xác nhận booking', href: '/reviewer' },
  ],
  warehouse_receiver: [
    { id: 'reviewer', label: 'Xác nhận booking', href: '/reviewer' },
    { id: 'receiver', label: 'Nhận hàng',         href: '/receiver' },
  ],
  manager: [
    { id: 'reviewer',    label: 'Xác nhận booking', href: '/reviewer' },
    { id: 'warehouses',  label: 'Kho hàng',          href: '/warehouses' },
    { id: 'suppliers',   label: 'Nhà cung cấp',      href: '/suppliers' },
    { id: 'report',      label: 'Báo cáo',            href: '/report' },
  ],
  admin: [
    { id: 'accounts',    label: 'Tài khoản NCC',     href: '/accounts' },
    { id: 'warehouses',  label: 'Kho hàng',           href: '/warehouses' },
    { id: 'suppliers',   label: 'Nhà cung cấp',       href: '/suppliers' },
    { id: 'reviewer',    label: 'Xác nhận booking',   href: '/reviewer' },
    { id: 'report',      label: 'Báo cáo',             href: '/report' },
  ],
}

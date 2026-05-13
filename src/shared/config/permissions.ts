import type { UserRole } from '@/shared/types/domain'

export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/booking/new':    ['supplier', 'admin'],
  '/my-bookings':    ['supplier'],
  '/reviewbooking':  ['warehouse_reviewer', 'warehouse_receiver', 'manager', 'admin'],
  '/report':         ['warehouse_reviewer', 'warehouse_receiver', 'manager', 'admin'],
  '/warehouses':     ['warehouse_reviewer', 'warehouse_receiver', 'manager', 'admin'],
  '/suppliers':      ['warehouse_reviewer', 'warehouse_receiver', 'manager', 'admin'],
  '/accounts':       ['admin'],
  '/viewas':         ['admin'],
}

export const ROLE_HOME: Record<string, string> = {
  supplier:           '/my-bookings',
  warehouse_reviewer: '/reviewbooking',
  warehouse_receiver: '/reviewbooking',
  manager:            '/reviewbooking',
  admin:              '/accounts',
}

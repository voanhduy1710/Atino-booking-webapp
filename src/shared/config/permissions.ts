import type { UserRole } from '@/shared/types/domain'

export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/booking/new':                 ['supplier'],
  '/my-bookings':                 ['supplier'],
  '/reviewer':                    ['warehouse_reviewer', 'warehouse_receiver', 'manager', 'admin'],
  '/receiver':                    ['warehouse_receiver', 'admin'],
  '/report':                      ['manager', 'admin'],
  '/warehouses':                  ['manager', 'admin'],
  '/suppliers':                   ['manager', 'admin'],
  '/accounts':                    ['admin'],
}

export const ROLE_HOME: Record<string, string> = {
  supplier:            '/my-bookings',
  warehouse_reviewer:  '/reviewer',
  warehouse_receiver:  '/reviewer',
  manager:             '/reviewer',
  admin:               '/accounts',
}

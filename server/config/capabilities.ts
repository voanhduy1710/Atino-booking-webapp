export const APP_ROLES = [
  'admin',
  'warehouse_reviewer',
  'warehouse_receiver',
  'manager',
  'supplier',
] as const

export type AppRole = typeof APP_ROLES[number]

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && APP_ROLES.includes(value as AppRole)
}

export const CAPABILITY_ROLES = {
  createBooking: ['supplier', 'admin'],
  reviewBookings: ['warehouse_reviewer', 'manager', 'admin'],
  receiveBookings: ['warehouse_receiver', 'manager', 'admin'],
  viewReports: ['warehouse_reviewer', 'manager', 'admin'],
  viewResources: ['warehouse_reviewer', 'manager', 'admin'],
  manageResources: ['admin'],
  manageAccounts: ['admin'],
  syncCatalog: ['admin'],
} as const

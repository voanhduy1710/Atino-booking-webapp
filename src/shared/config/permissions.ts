import type { UserRole } from '@/shared/types/domain'
import { CAPABILITY_ROLES } from '../../../server/config/capabilities'

export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/booking/new':    [...CAPABILITY_ROLES.createBooking],
  '/my-bookings':    ['supplier'],
  '/reviewbooking':  [...CAPABILITY_ROLES.reviewBookings, 'warehouse_receiver'],
  '/report':         [...CAPABILITY_ROLES.viewReports],
  '/warehouses':     [...CAPABILITY_ROLES.viewResources],
  '/suppliers':      [...CAPABILITY_ROLES.viewResources],
  '/product-process':[...CAPABILITY_ROLES.viewResources],
  '/accounts':       [...CAPABILITY_ROLES.manageAccounts],
  '/viewas':         [...CAPABILITY_ROLES.manageAccounts],
}

export const ROLE_HOME: Record<string, string> = {
  supplier:           '/my-bookings',
  warehouse_reviewer: '/reviewbooking',
  warehouse_receiver: '/reviewbooking',
  manager:            '/reviewbooking',
  admin:              '/accounts',
}

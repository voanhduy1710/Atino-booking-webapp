import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { UserRole } from '@/shared/types/domain'
import { getCurrentUser } from '@/shared/lib/auth'

interface Props {
  roles: UserRole[]
  children: ReactNode
}

export function RequireRole({ roles, children }: Props) {
  const user = getCurrentUser()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!roles.includes(user.role as UserRole)) {
    // Redirect to their allowed route or home
    const roleRouteMap: Record<string, string> = {
      supplier: '/my-bookings',
      warehouse_reviewer: '/reviewer',
      warehouse_receiver: '/reviewer',
      manager: '/manager',
      admin: '/admin',
    }
    const redirect = roleRouteMap[user.role] ?? '/'
    return <Navigate to={redirect} replace />
  }

  return <>{children}</>
}

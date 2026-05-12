import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { UserRole } from '@/shared/types/domain'
import { getCurrentUser } from '@/shared/lib/auth'
import { ROLE_HOME } from '@/shared/config/permissions'

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
    const redirect = ROLE_HOME[user.role] ?? '/'
    return <Navigate to={redirect} replace />
  }

  return <>{children}</>
}

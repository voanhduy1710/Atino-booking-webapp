export interface DecodedToken {
  sub?: string
  username?: string
  role: 'admin' | 'warehouse_reviewer' | 'warehouse_receiver' | 'manager' | 'supplier'
  allowedRoutes?: string[]
  supplier_id?: string
  supplier_account_id?: string
  exp?: number
}

const SESSION_KEY = 'atino_session_profile'

export function saveSession(user: DecodedToken): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

export function removeSession(): void {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem('atino_jwt')
}

function readSession(): DecodedToken | null {
  try {
    const value = localStorage.getItem(SESSION_KEY)
    if (!value) return null
    const decoded = JSON.parse(value) as DecodedToken
    return decoded.role ? decoded : null
  } catch {
    return null
  }
}

export function getCurrentUser(): DecodedToken | null {
  const user = readSession()
  if (user?.exp && user.exp * 1000 <= Date.now()) {
    removeSession()
    return null
  }
  return user
}

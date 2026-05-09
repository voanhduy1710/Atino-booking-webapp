export interface DecodedToken {
  sub?: string
  username?: string
  role: 'admin' | 'warehouse_reviewer' | 'warehouse_receiver' | 'manager' | 'supplier'
  allowedRoutes?: string[]
  supplier_id?: string
  supplier_account_id?: string
  exp?: number
}

const JWT_KEY = 'atino_jwt'

export function saveToken(token: string): void {
  localStorage.setItem(JWT_KEY, token)
}

export function getToken(): string | null {
  return localStorage.getItem(JWT_KEY)
}

export function removeToken(): void {
  localStorage.removeItem(JWT_KEY)
}

/**
 * Decode a token.
 * Supports both formats:
 *   - New: plain base64(JSON)  → btoa(JSON.stringify(session))
 *   - Old: JWT (3 parts)       → header.payload.signature (for migration compatibility)
 */
export function decodeToken(token: string): DecodedToken | null {
  try {
    const parts = token.split('.')
    let payload: string

    if (parts.length === 3) {
      // JWT format: decode the middle part
      payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    } else {
      // New format: the entire token is base64(JSON)
      payload = token
    }

    const decoded = JSON.parse(atob(payload))
    // Normalise: new format uses 'username', old JWT used 'sub'
    if (!decoded.role) return null
    return decoded as DecodedToken
  } catch {
    return null
  }
}

export function getCurrentUser(): DecodedToken | null {
  const token = getToken()
  if (!token) return null

  const decoded = decodeToken(token)
  if (!decoded) return null

  // Old JWT tokens have exp; new tokens don't expire (session cleared on logout)
  if (decoded.exp && decoded.exp * 1000 < Date.now()) {
    removeToken()
    return null
  }

  return decoded
}

export function isAuthenticated(): boolean {
  return getCurrentUser() !== null
}

export function hasRole(role: DecodedToken['role']): boolean {
  const user = getCurrentUser()
  return user?.role === role
}

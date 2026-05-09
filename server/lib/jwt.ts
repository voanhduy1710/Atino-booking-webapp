/**
 * server/lib/jwt.ts
 * Decodes Bearer tokens issued by the frontend auth service.
 *
 * Two formats are supported:
 *   New (default): btoa(JSON.stringify(session)) — plain base64, no dots, no exp
 *   Old (JWT):     header.payload.signature      — base64url, 3 parts, has exp
 */

export interface JWTPayload {
  sub?: string
  username?: string
  role: string
  supplier_id?: string
  supplier_account_id?: string
  exp?: number
}

function padBase64(s: string): string {
  return s + '='.repeat((4 - (s.length % 4)) % 4)
}

/**
 * Decode and validate a Bearer token.
 * Returns null if malformed or expired.
 */
export function verifyJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split('.')
    let payload: JWTPayload

    if (parts.length === 3) {
      // Old JWT format: decode the middle part (base64url)
      const padded = padBase64(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
      payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8')) as JWTPayload
      if (payload.exp && payload.exp * 1000 < Date.now()) return null
    } else {
      // New format: entire token is plain base64(JSON), no expiry
      payload = JSON.parse(Buffer.from(token, 'base64').toString('utf-8')) as JWTPayload
    }

    if (!payload.role) return null
    return payload
  } catch {
    return null
  }
}

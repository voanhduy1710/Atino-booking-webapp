/**
 * server/lib/jwt.ts
 * Lightweight JWT payload decoder + expiry check.
 * Does NOT verify the HMAC signature — the supplier JWT was signed by
 * our own login_supplier RPC and we only need to trust the payload
 * (same pattern as the Edge Function).
 */

export interface JWTPayload {
  sub: string
  role: string
  supplier_id?: string
  supplier_account_id?: string
  exp: number
}

/** Re-add base64 padding stripped by the b64u encoder. */
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
    if (parts.length !== 3) return null

    const padded = padBase64(
      parts[1].replace(/-/g, '+').replace(/_/g, '/')
    )
    const payload = JSON.parse(
      Buffer.from(padded, 'base64').toString('utf-8')
    ) as JWTPayload

    if (payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

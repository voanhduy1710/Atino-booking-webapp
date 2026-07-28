import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { isAppRole, type AppRole } from '../config/capabilities.js'

const ISSUER = 'atino-booking-api'
const AUDIENCE = 'atino-booking-web'
const developmentSecret = randomBytes(32).toString('base64url')

export interface JWTPayload {
  sub: string
  username: string
  role: AppRole
  supplier_id?: string
  supplier_account_id?: string
  exp: number
  iat: number
  iss: string
  aud: string
  typ: 'access'
  jti: string
}

export type SessionClaims = Pick<JWTPayload, 'sub' | 'username' | 'role' | 'supplier_id' | 'supplier_account_id'> & {
  jti?: string
}

function signingSecret(): string | null {
  const secret = process.env.AUTH_JWT_SECRET
  if (secret && secret.length >= 32) return secret
  return process.env.NODE_ENV === 'production' ? null : developmentSecret
}

function sign(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url')
}

export function issueJWT(claims: SessionClaims, ttlSeconds = 60 * 60 * 8): string {
  const secret = signingSecret()
  if (!secret) throw new Error('AUTH_JWT_SECRET must be configured with at least 32 characters')
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ ...claims, jti: claims.jti ?? randomUUID(), exp: now + ttlSeconds, iat: now, iss: ISSUER, aud: AUDIENCE, typ: 'access' })).toString('base64url')
  return `${header}.${payload}.${sign(`${header}.${payload}`, secret)}`
}

export function verifyJWT(token: string): JWTPayload | null {
  const secret = signingSecret()
  if (!secret) return null
  const [header, body, suppliedSignature, ...rest] = token.split('.')
  if (!header || !body || !suppliedSignature || rest.length) return null
  try {
    const expected = Buffer.from(sign(`${header}.${body}`, secret), 'base64url')
    const supplied = Buffer.from(suppliedSignature, 'base64url')
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null
    const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { alg?: string; typ?: string }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JWTPayload
    const now = Math.floor(Date.now() / 1000)
    if (parsedHeader.alg !== 'HS256' || parsedHeader.typ !== 'JWT' || payload.iss !== ISSUER || payload.aud !== AUDIENCE || payload.typ !== 'access' || !payload.sub || !payload.username || !isAppRole(payload.role) || !/^[0-9a-f-]{36}$/i.test(payload.jti) || !Number.isInteger(payload.iat) || payload.iat > now + 60 || !Number.isInteger(payload.exp) || payload.exp <= now) return null
    return payload
  } catch {
    return null
  }
}

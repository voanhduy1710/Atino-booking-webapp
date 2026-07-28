import { createHmac, randomUUID } from 'crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { issueJWT, verifyJWT } from './jwt.js'

const originalSecret = process.env.AUTH_JWT_SECRET
const originalNodeEnv = process.env.NODE_ENV

function signedToken(overrides: Record<string, unknown> = {}, headerOverrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000)
  const secret = process.env.AUTH_JWT_SECRET!
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', ...headerOverrides })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    sub: 'staff:alice',
    username: 'alice',
    role: 'admin',
    jti: randomUUID(),
    iat: now,
    exp: now + 3600,
    iss: 'atino-booking-api',
    aud: 'atino-booking-web',
    typ: 'access',
    ...overrides,
  })).toString('base64url')
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

afterEach(() => {
  if (originalSecret === undefined) delete process.env.AUTH_JWT_SECRET
  else process.env.AUTH_JWT_SECRET = originalSecret
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
})

describe('JWT access tokens', () => {
  it('accepts a token issued with the configured server secret', () => {
    process.env.AUTH_JWT_SECRET = 'a'.repeat(32)
    const token = issueJWT({ sub: 'staff:alice', username: 'alice', role: 'admin' })
    expect(verifyJWT(token)).toMatchObject({ sub: 'staff:alice', username: 'alice', role: 'admin' })
  })

  it('uses an ephemeral secret only outside production when none is configured', () => {
    delete process.env.AUTH_JWT_SECRET
    process.env.NODE_ENV = 'development'
    const token = issueJWT({ sub: 'staff:alice', username: 'alice', role: 'admin' })
    expect(verifyJWT(token)).not.toBeNull()
    process.env.NODE_ENV = 'production'
    expect(verifyJWT(token)).toBeNull()
  })

  it('rejects unsigned, altered, expired, and wrong-secret tokens', () => {
    process.env.AUTH_JWT_SECRET = 'a'.repeat(32)
    const token = issueJWT({ sub: 'staff:alice', username: 'alice', role: 'admin' })
    expect(verifyJWT(Buffer.from(JSON.stringify({ role: 'admin' })).toString('base64'))).toBeNull()
    expect(verifyJWT(`${token.slice(0, -1)}x`)).toBeNull()
    expect(verifyJWT(issueJWT({ sub: 'staff:alice', username: 'alice', role: 'admin' }, -1))).toBeNull()
    process.env.AUTH_JWT_SECRET = 'b'.repeat(32)
    expect(verifyJWT(token)).toBeNull()
  })

  it('rejects wrong audience, issuer, type, algorithm, role, and future-issued tokens', () => {
    process.env.AUTH_JWT_SECRET = 'a'.repeat(32)
    expect(verifyJWT(signedToken({ aud: 'other-app' }))).toBeNull()
    expect(verifyJWT(signedToken({ iss: 'other-api' }))).toBeNull()
    expect(verifyJWT(signedToken({ typ: 'refresh' }))).toBeNull()
    expect(verifyJWT(signedToken({}, { alg: 'none' }))).toBeNull()
    expect(verifyJWT(signedToken({ role: 'root' }))).toBeNull()
    expect(verifyJWT(signedToken({ iat: Math.floor(Date.now() / 1000) + 120 }))).toBeNull()
  })
})

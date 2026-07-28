import express from 'express'
import { createHash } from 'crypto'
import type { AddressInfo } from 'net'
import { afterEach, describe, expect, it } from 'vitest'
import authRouter, { getStaffUsers } from './auth.js'

const originalStaffUsers = process.env.STAFF_USERS
const originalStaffUsersB64 = process.env.STAFF_USERS_B64
const originalLegacyUsers = process.env.VITE_STAFF_USERS
const originalSecret = process.env.AUTH_JWT_SECRET
const originalSessionStoreDisabled = process.env.AUTH_SESSION_STORE_DISABLED
const originalNodeEnv = process.env.NODE_ENV

afterEach(() => {
  for (const [name, value] of [
    ['STAFF_USERS', originalStaffUsers],
    ['STAFF_USERS_B64', originalStaffUsersB64],
    ['VITE_STAFF_USERS', originalLegacyUsers],
    ['AUTH_JWT_SECRET', originalSecret],
    ['AUTH_SESSION_STORE_DISABLED', originalSessionStoreDisabled],
    ['NODE_ENV', originalNodeEnv],
  ] as const) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

it('does not load VITE_STAFF_USERS in production and rejects invalid configured roles', () => {
  delete process.env.STAFF_USERS
  delete process.env.STAFF_USERS_B64
  process.env.VITE_STAFF_USERS = JSON.stringify([
    { username: 'legacy-admin', password_hash: 'hash', role: 'admin' },
    { username: 'invalid-role', password_hash: 'hash', role: 'root' },
  ])

  process.env.NODE_ENV = 'production'
  expect(getStaffUsers()).toEqual([])

  process.env.NODE_ENV = 'test'
  expect(getStaffUsers()).toEqual([
    { username: 'legacy-admin', password_hash: 'hash', role: 'admin' },
  ])
})

describe('staff login migration compatibility', () => {
  it('logs voanhduy1710 in from legacy server env without exposing client-issued tokens', async () => {
    const passwordHash = createHash('sha256').update('test-password').digest('hex')
    delete process.env.STAFF_USERS
    delete process.env.STAFF_USERS_B64
    process.env.VITE_STAFF_USERS = JSON.stringify([
      { username: 'voanhduy1710', password_hash: passwordHash, role: 'admin' },
    ])
    process.env.AUTH_JWT_SECRET = 'server-only-login-test-secret-32-chars'
    process.env.AUTH_SESSION_STORE_DISABLED = 'true'

    const app = express()
    app.use(express.json())
    app.use('/api/auth', authRouter)
    const server = app.listen(0)
    try {
      const port = (server.address() as AddressInfo).port
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'voanhduy1710', password: 'test-password' }),
      })
      expect(response.status).toBe(200)
      const result = await response.json() as { role: string; user: { username: string; role: string } }
      expect(result.role).toBe('admin')
      expect(result.user).toMatchObject({ username: 'voanhduy1710', role: 'admin' })
      expect(response.headers.get('set-cookie')).toContain('atino_session=')
      expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})

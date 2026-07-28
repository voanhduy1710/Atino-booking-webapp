import express from 'express'
import type { AddressInfo } from 'net'
import { afterEach, describe, expect, it } from 'vitest'
import { issueJWT } from './jwt.js'
import { requireAuth } from './httpAuth.js'

const originalSecret = process.env.AUTH_JWT_SECRET
const originalSessionStoreDisabled = process.env.AUTH_SESSION_STORE_DISABLED

afterEach(() => {
  if (originalSecret === undefined) delete process.env.AUTH_JWT_SECRET
  else process.env.AUTH_JWT_SECRET = originalSecret
  if (originalSessionStoreDisabled === undefined) delete process.env.AUTH_SESSION_STORE_DISABLED
  else process.env.AUTH_SESSION_STORE_DISABLED = originalSessionStoreDisabled
})

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express()
  app.get('/admin', requireAuth(['admin']), (_req, res) => res.json({ ok: true }))
  const server = app.listen(0)
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

describe('requireAuth', () => {
  it('rejects anonymous and disallowed roles', async () => {
    process.env.AUTH_JWT_SECRET = 'authorization-test-secret-at-least-32'
    process.env.AUTH_SESSION_STORE_DISABLED = 'true'
    await withServer(async (baseUrl) => {
      expect((await fetch(`${baseUrl}/admin`)).status).toBe(401)
      const supplier = issueJWT({ sub: 'supplier:1', username: 'supplier', role: 'supplier' })
      expect((await fetch(`${baseUrl}/admin`, { headers: { Cookie: `atino_session=${supplier}` } })).status).toBe(403)
    })
  })

  it('accepts a verified HttpOnly-cookie token for the allowed role', async () => {
    process.env.AUTH_JWT_SECRET = 'authorization-test-secret-at-least-32'
    process.env.AUTH_SESSION_STORE_DISABLED = 'true'
    await withServer(async (baseUrl) => {
      const admin = issueJWT({ sub: 'staff:admin', username: 'admin', role: 'admin' })
      const response = await fetch(`${baseUrl}/admin`, { headers: { Cookie: `atino_session=${admin}` } })
      expect(response.status).toBe(200)
    })
  })
})

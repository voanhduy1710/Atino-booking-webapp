import express from 'express'
import type { AddressInfo } from 'net'
import { afterEach, describe, expect, it } from 'vitest'
import { issueJWT } from '../lib/jwt.js'
import receiverRouter from './receiver.js'
import reviewerRouter from './reviewer.js'

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
  app.use(express.json())
  app.use('/reviewer', reviewerRouter)
  app.use('/receiver', receiverRouter)
  const server = app.listen(0)
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

function cookieFor(role: 'admin' | 'manager' | 'warehouse_reviewer' | 'warehouse_receiver' | 'supplier'): string {
  return `atino_session=${issueJWT({ sub: `${role}:test`, username: role, role })}`
}

describe('route authorization matrix', () => {
  it('rejects anonymous access to protected workflow routes', async () => {
    process.env.AUTH_JWT_SECRET = 'authorization-route-test-secret-32'
    process.env.AUTH_SESSION_STORE_DISABLED = 'true'
    await withServer(async (baseUrl) => {
      expect((await fetch(`${baseUrl}/reviewer/items/not-a-uuid/confirm`, { method: 'POST' })).status).toBe(401)
      expect((await fetch(`${baseUrl}/receiver/bookings/not-a-uuid/receive`, { method: 'POST' })).status).toBe(401)
    })
  })

  it('blocks receivers from reviewer mutations and managers from deleting bookings', async () => {
    process.env.AUTH_JWT_SECRET = 'authorization-route-test-secret-32'
    process.env.AUTH_SESSION_STORE_DISABLED = 'true'
    await withServer(async (baseUrl) => {
      const reviewerMutation = await fetch(`${baseUrl}/reviewer/items/not-a-uuid/confirm`, {
        method: 'POST',
        headers: { Cookie: cookieFor('warehouse_receiver') },
      })
      expect(reviewerMutation.status).toBe(403)

      const bookingDelete = await fetch(`${baseUrl}/reviewer/bookings/not-a-uuid`, {
        method: 'DELETE',
        headers: { Cookie: cookieFor('manager') },
      })
      expect(bookingDelete.status).toBe(403)
    })
  })
})

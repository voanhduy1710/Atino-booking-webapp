import { describe, expect, it } from 'vitest'
import { createHash } from 'crypto'
import { hashPassword, isStrongPasswordHash, verifyPassword } from './password.js'

describe('password hashing', () => {
  it('uses salted bcrypt hashes and verifies the password', async () => {
    const first = await hashPassword('correct horse battery staple')
    const second = await hashPassword('correct horse battery staple')
    expect(first).not.toBe(second)
    expect(isStrongPasswordHash(first)).toBe(true)
    expect(await verifyPassword('correct horse battery staple', first)).toEqual({ valid: true, needsUpgrade: false })
    expect((await verifyPassword('wrong password', first)).valid).toBe(false)
  })

  it('accepts legacy SHA-256 once and marks it for upgrade', async () => {
    const legacy = createHash('sha256').update('legacy-password').digest('hex')
    expect(await verifyPassword('legacy-password', legacy)).toEqual({ valid: true, needsUpgrade: true })
  })
})

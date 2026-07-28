import { createHash, timingSafeEqual } from 'crypto'
import { compare, hash } from 'bcryptjs'

const BCRYPT_ROUNDS = 12

function constantTimeTextEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected)
  const right = Buffer.from(actual)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function isStrongPasswordHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(value)
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, storedHash: string): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (isStrongPasswordHash(storedHash)) {
    return { valid: await compare(password, storedHash), needsUpgrade: false }
  }

  const legacyHash = createHash('sha256').update(password).digest('hex')
  return { valid: constantTimeTextEqual(storedHash, legacyHash), needsUpgrade: true }
}

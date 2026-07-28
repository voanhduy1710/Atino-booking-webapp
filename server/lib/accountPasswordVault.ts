import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function key(): Buffer {
  const encoded = process.env.ACCOUNT_PASSWORD_ENCRYPTION_KEY ?? ''
  const value = Buffer.from(encoded, 'base64')
  if (value.length === 32) return value
  const authSecret = process.env.AUTH_JWT_SECRET ?? ''
  if (authSecret.length >= 32) return createHash('sha256').update('atino-account-password-vault:v1\0').update(authSecret).digest()
  throw new Error('ACCOUNT_PASSWORD_ENCRYPTION_KEY must be a base64-encoded 32-byte key')
}

export function encryptActualPassword(password: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key(), iv)
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`
}

export function decryptActualPassword(value: string): string {
  const [version, ivText, tagText, ciphertextText] = value.split('.')
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText) throw new Error('Stored password ciphertext is invalid')
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8')
}

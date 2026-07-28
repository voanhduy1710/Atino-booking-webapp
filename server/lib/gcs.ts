import { createHash, createSign } from 'crypto'
import { buildGcsPath, GCS_BUCKET, GCS_PREFIX } from '../config/storage.js'
import { resilientFetch } from './resilientFetch.js'

interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

let serviceAccount: ServiceAccount | null = null
let accessTokenCache: { value: string; expiresAt: number } | null = null

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

function credentials(): ServiceAccount {
  if (serviceAccount) return serviceAccount
  const encoded = process.env.GCS_SERVICE_ACCOUNT_JSON_B64
  const raw = process.env.GCS_SERVICE_ACCOUNT_JSON
  if (!encoded && !raw) throw new Error('GCS credentials env var not set')
  const parsed = JSON.parse(encoded ? Buffer.from(encoded, 'base64').toString('utf8') : raw!) as ServiceAccount
  if (!parsed.client_email || !parsed.private_key) throw new Error('Invalid GCS service account credentials')
  serviceAccount = parsed
  return parsed
}

function rsaSign(value: string, privateKey: string, output: 'base64url' | 'hex'): string {
  const signer = createSign('RSA-SHA256')
  signer.update(value)
  signer.end()
  return signer.sign(privateKey).toString(output)
}

async function accessToken(): Promise<string> {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) return accessTokenCache.value
  const account = credentials()
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.read_write',
    aud: account.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const assertion = `${header}.${payload}.${rsaSign(`${header}.${payload}`, account.private_key, 'base64url')}`
  const response = await resilientFetch(account.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    timeoutMs: 10_000,
    retryUnsafe: true,
    circuitKey: 'google-storage',
  })
  const body = await response.json() as { access_token?: string; expires_in?: number }
  if (!response.ok || !body.access_token) throw new Error('GCS authentication failed')
  accessTokenCache = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 120) * 1000,
  }
  return accessTokenCache.value
}

function encodeObjectPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export interface UploadResult {
  url: string
  path: string
}

export function normalizeObjectPath(path: string): string {
  if (!path.startsWith('https://')) return path
  const url = new URL(path)
  const bucketPrefix = `/${GCS_BUCKET}/`
  if (url.hostname !== 'storage.googleapis.com' || !url.pathname.startsWith(bucketPrefix)) {
    throw new Error('Unsupported storage URL')
  }
  return decodeURIComponent(url.pathname.slice(bucketPrefix.length))
}

function assertConfiguredPath(path: string): string {
  const objectPath = normalizeObjectPath(path)
  if (!objectPath.startsWith(`${GCS_PREFIX}/`)) throw new Error('Storage path is outside the configured prefix')
  return objectPath
}

export async function getSignedReadUrl(path: string, ttlMs = 15 * 60 * 1000): Promise<string> {
  const objectPath = assertConfiguredPath(path)
  const account = credentials()
  const now = new Date()
  const timestamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const date = timestamp.slice(0, 8)
  const scope = `${date}/auto/storage/goog4_request`
  const credential = `${account.client_email}/${scope}`
  const expires = Math.min(604800, Math.max(1, Math.floor(ttlMs / 1000)))
  const canonicalUri = `/${encodeURIComponent(GCS_BUCKET)}/${encodeObjectPath(objectPath)}`
  const query = new URLSearchParams({
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential': credential,
    'X-Goog-Date': timestamp,
    'X-Goog-Expires': String(expires),
    'X-Goog-SignedHeaders': 'host',
  })
  query.sort()
  const canonicalRequest = [
    'GET',
    canonicalUri,
    query.toString(),
    'host:storage.googleapis.com\n',
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')
  const canonicalHash = createHash('sha256').update(canonicalRequest).digest('hex')
  const stringToSign = `GOOG4-RSA-SHA256\n${timestamp}\n${scope}\n${canonicalHash}`
  query.set('X-Goog-Signature', rsaSign(stringToSign, account.private_key, 'hex'))
  return `https://storage.googleapis.com${canonicalUri}?${query.toString()}`
}

export async function deleteFromGCS(path: string): Promise<void> {
  const objectPath = assertConfiguredPath(path)
  const response = await resilientFetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(GCS_BUCKET)}/o/${encodeURIComponent(objectPath)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await accessToken()}` },
      timeoutMs: 15_000,
      circuitKey: 'google-storage',
    }
  )
  if (!response.ok && response.status !== 404) throw new Error('GCS delete failed')
}

export async function uploadToGCS(
  fileBuffer: Buffer,
  contentType: string,
  relativePath: string
): Promise<UploadResult> {
  const gcsPath = buildGcsPath(relativePath)
  const url = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(GCS_BUCKET)}/o`)
  url.searchParams.set('uploadType', 'media')
  url.searchParams.set('name', gcsPath)
  const response = await resilientFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': contentType,
    },
    body: fileBuffer,
    timeoutMs: 30_000,
    retryUnsafe: true,
    circuitKey: 'google-storage',
  })
  if (!response.ok) throw new Error('GCS upload failed')
  return { url: await getSignedReadUrl(gcsPath), path: gcsPath }
}

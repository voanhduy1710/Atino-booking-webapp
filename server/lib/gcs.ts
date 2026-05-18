/**
 * server/lib/gcs.ts
 * Google Cloud Storage upload helper using the official Node SDK.
 * Much simpler than the manual JWT/fetch approach in the Edge Function.
 */

import { Storage } from '@google-cloud/storage'
import { buildGcsPath, buildGcsPublicUrl, GCS_BUCKET } from '../config/storage.js'

let _storage: Storage | null = null

function getStorage(): Storage {
  if (_storage) return _storage

  // GCS_SERVICE_ACCOUNT_JSON_B64: base64-encoded JSON (used in Cloud Run to avoid shell quoting issues)
  // GCS_SERVICE_ACCOUNT_JSON: raw JSON (local .env fallback)
  const b64 = process.env.GCS_SERVICE_ACCOUNT_JSON_B64
  const raw = process.env.GCS_SERVICE_ACCOUNT_JSON
  if (!b64 && !raw) throw new Error('GCS credentials env var not set')

  const saJson = b64 ? Buffer.from(b64, 'base64').toString('utf8') : raw!
  const credentials = JSON.parse(saJson) as object
  _storage = new Storage({ credentials })
  return _storage
}

export interface UploadResult {
  url: string
  path: string
}

/**
 * Upload a Buffer to GCS.
 * @param fileBuffer  Raw file bytes
 * @param contentType MIME type (e.g. "image/jpeg")
 * @param relativePath  e.g. "temp/{sessionId}/GC01_1.jpg"
 * @returns public URL + full GCS object path
 */
export async function uploadToGCS(
  fileBuffer: Buffer,
  contentType: string,
  relativePath: string
): Promise<UploadResult> {
  const storage = getStorage()
  const gcsPath = buildGcsPath(relativePath)

  const file = storage.bucket(GCS_BUCKET).file(gcsPath)
  await file.save(fileBuffer, {
    contentType,
    resumable: false,
  })

  const publicUrl = buildGcsPublicUrl(gcsPath)
  return { url: publicUrl, path: gcsPath }
}

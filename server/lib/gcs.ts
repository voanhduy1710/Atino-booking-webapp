/**
 * server/lib/gcs.ts
 * Google Cloud Storage upload helper using the official Node SDK.
 * Much simpler than the manual JWT/fetch approach in the Edge Function.
 */

import { Storage } from '@google-cloud/storage'

const BUCKET = 'atino-media'
const PREFIX = 'duy_booking_images'

let _storage: Storage | null = null

function getStorage(): Storage {
  if (_storage) return _storage

  const saJson = process.env.GCS_SERVICE_ACCOUNT_JSON
  if (!saJson) {
    throw new Error('GCS_SERVICE_ACCOUNT_JSON env var not set')
  }

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
  const gcsPath = `${PREFIX}/${relativePath}`

  const file = storage.bucket(BUCKET).file(gcsPath)
  await file.save(fileBuffer, {
    contentType,
    resumable: false,
  })

  const publicUrl = `https://storage.googleapis.com/${BUCKET}/${gcsPath}`
  return { url: publicUrl, path: gcsPath }
}

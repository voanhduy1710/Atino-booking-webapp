export const GCS_BUCKET = process.env.GCS_BUCKET ?? 'atino-media'
export const GCS_PREFIX = process.env.GCS_PREFIX ?? 'duy_booking_images'

export function buildGcsPath(relativePath: string): string {
  return `${GCS_PREFIX}/${relativePath}`
}

export function buildGcsPublicUrl(path: string): string {
  if (path.startsWith('https://')) return path
  const fullPath = path.startsWith(`${GCS_PREFIX}/`) ? path : buildGcsPath(path)
  return `https://storage.googleapis.com/${GCS_BUCKET}/${fullPath}`
}

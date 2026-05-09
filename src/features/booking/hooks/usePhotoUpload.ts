import { useRef, useCallback, useState } from 'react'

export interface UploadedFileEntry {
  file: File
  /** The full GCS path, e.g. duy_booking_images/temp/{sessionId}/slip_0_1.jpg */
  tempPath: string
  /** Public GCS URL — https://storage.googleapis.com/atino-media/{tempPath} */
  publicUrl: string
  status: 'uploading' | 'done' | 'error'
  progress: number
  errorMsg?: string
}

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
const MAX_MB = 10

// In production: nginx proxies /api/* → Express on port 3001 (same origin)
// In local dev:  VITE_API_URL=http://localhost:3001 overrides the base
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const GCS_UPLOAD_URL = `${API_BASE}/api/upload/gcs`

export function usePhotoUpload(sessionId: string, supplierCode = 'NCC') {
  const [files, setFiles] = useState<UploadedFileEntry[]>([])
  const countRef = useRef(0)

  const validate = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) return 'Chỉ chấp nhận jpg, png, pdf'
    if (file.size > MAX_MB * 1024 * 1024) return `Tệp vượt quá ${MAX_MB}MB`
    return null
  }

  const upload = useCallback(
    async (file: File, _prefix: string): Promise<string | null> => {
      const validationError = validate(file)
      if (validationError) return null

      countRef.current += 1
      const ext = file.name.split('.').pop() ?? 'jpg'
      // e.g. temp/{sessionId}/GC01_1.jpg  or  temp/{sessionId}/GC01_2_vat.jpg
      const relativePath = `temp/${sessionId}/${supplierCode}_${countRef.current}.${ext}`

      const entry: UploadedFileEntry = {
        file,
        tempPath: relativePath,
        publicUrl: '',
        status: 'uploading',
        progress: 0,
      }
      setFiles((prev) => [...prev, entry])

      try {
        const form = new FormData()
        form.append('file', file)
        form.append('path', relativePath)

        const res = await fetch(GCS_UPLOAD_URL, {
          method: 'POST',
          body: form,
        })

        const result = await res.json() as { url?: string; error?: string }

        if (!res.ok || !result.url) {
          throw new Error(result.error ?? 'Upload thất bại')
        }

        setFiles((prev) =>
          prev.map((f) =>
            f.tempPath === relativePath
              ? { ...f, publicUrl: result.url!, status: 'done', progress: 100 }
              : f
          )
        )
        return relativePath
      } catch (err) {
        const msg = (err as Error).message
        setFiles((prev) =>
          prev.map((f) =>
            f.tempPath === relativePath ? { ...f, status: 'error', errorMsg: msg } : f
          )
        )
        return null
      }
    },
    [sessionId]
  )

  const remove = useCallback((tempPath: string) => {
    // Remove from local state only — GCS temp files are cleaned up server-side
    setFiles((prev) => prev.filter((f) => f.tempPath !== tempPath))
  }, [])

  const retry = useCallback(
    async (tempPath: string, prefix: string): Promise<string | null> => {
      const entry = files.find((f) => f.tempPath === tempPath)
      if (!entry) return null
      remove(tempPath)
      return upload(entry.file, prefix)
    },
    [files, remove, upload]
  )

  const isUploading = files.some((f) => f.status === 'uploading')
  const hasErrors = files.some((f) => f.status === 'error')

  return { files, upload, remove, retry, isUploading, hasErrors }
}

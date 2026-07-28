import { useCallback, useRef, useState } from 'react'
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_MB } from '@/shared/constants/uploads'
import { postFormWithProgress, postJson } from '@/shared/lib/apiClient'

export interface UploadedFileEntry {
  file: File
  /** The relative temp path under the configured GCS prefix. */
  tempPath: string
  /** Short-lived preview URL. */
  publicUrl: string
  status: 'uploading' | 'done' | 'error'
  progress: number
  errorMsg?: string
}

const GCS_UPLOAD_PATH = '/api/upload/gcs'

export function usePhotoUpload(_sessionId: string, _supplierCode = 'NCC') {
  void _sessionId
  void _supplierCode
  const [files, setFiles] = useState<UploadedFileEntry[]>([])
  const countRef = useRef(0)

  const validate = (file: File): string | null => {
    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.type)) return 'Chỉ chấp nhận jpg, png, pdf'
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `Tệp vượt quá ${MAX_UPLOAD_MB}MB`
    return null
  }

  const upload = useCallback(
    async (file: File, prefix: string): Promise<string | null> => {
      const validationError = validate(file)
      if (validationError) return null

      countRef.current += 1
      const relativePath = `upload-${prefix}-${countRef.current}`

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
        const result = await postFormWithProgress<{ url?: string; path?: string }>(
          GCS_UPLOAD_PATH,
          form,
          (progress) => setFiles((prev) => prev.map((item) =>
            item.tempPath === relativePath ? { ...item, progress } : item
          ))
        )
        if (!result.url || !result.path) throw new Error('Upload failed')

        setFiles((prev) =>
          prev.map((f) =>
            f.tempPath === relativePath
              ? { ...f, tempPath: result.path!, publicUrl: result.url!, status: 'done', progress: 100 }
              : f
          )
        )
        return result.path
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
    []
  )

  const remove = useCallback((tempPath: string) => {
    setFiles((prev) => prev.filter((f) => f.tempPath !== tempPath))
    if (!tempPath.startsWith('upload-')) {
      void postJson<{ ok: true }>(GCS_UPLOAD_PATH, { path: tempPath }, { method: 'DELETE' }).catch(() => {
        // Retention cleanup remains server-side; removal must not block form edits.
      })
    }
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

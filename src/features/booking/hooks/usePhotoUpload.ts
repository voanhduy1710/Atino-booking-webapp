import { useCallback, useRef, useState } from 'react'
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_MB } from '@/shared/constants/uploads'
import { apiUrl, postForm } from '@/shared/lib/apiClient'

export interface UploadedFileEntry {
  file: File
  /** The relative temp path under the configured GCS prefix. */
  tempPath: string
  /** Public GCS URL. */
  publicUrl: string
  status: 'uploading' | 'done' | 'error'
  progress: number
  errorMsg?: string
}

const GCS_UPLOAD_PATH = '/api/upload/gcs'

export function usePhotoUpload(sessionId: string, supplierCode = 'NCC') {
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
      const ext = file.name.split('.').pop() ?? 'jpg'
      const relativePath = `temp/${sessionId}/${supplierCode}_${prefix}_${countRef.current}.${ext}`

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

        console.log('[upload] POST', apiUrl(GCS_UPLOAD_PATH), { path: relativePath, size: file.size, type: file.type })
        const result = await postForm<{ url?: string }>(GCS_UPLOAD_PATH, form)
        if (!result.url) throw new Error('Upload thất bại')

        setFiles((prev) =>
          prev.map((f) =>
            f.tempPath === relativePath
              ? { ...f, publicUrl: result.url!, status: 'done', progress: 100 }
              : f
          )
        )
        console.log('[upload] success -> tempPath:', relativePath)
        return relativePath
      } catch (err) {
        const msg = (err as Error).message
        console.error('[upload] error for', relativePath, ':', msg)
        setFiles((prev) =>
          prev.map((f) =>
            f.tempPath === relativePath ? { ...f, status: 'error', errorMsg: msg } : f
          )
        )
        return null
      }
    },
    [sessionId, supplierCode]
  )

  const remove = useCallback((tempPath: string) => {
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

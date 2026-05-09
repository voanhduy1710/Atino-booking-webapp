import { useRef, useCallback, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'

export interface UploadedFileEntry {
  file: File
  tempPath: string
  status: 'uploading' | 'done' | 'error'
  progress: number
  errorMsg?: string
}

const BUCKET = 'booking-attachments'
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
const MAX_MB = 10

export function usePhotoUpload(sessionId: string) {
  const [files, setFiles] = useState<UploadedFileEntry[]>([])
  const countRef = useRef(0)

  const validate = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) return 'Chỉ chấp nhận jpg, png, pdf'
    if (file.size > MAX_MB * 1024 * 1024) return `Tệp vượt quá ${MAX_MB}MB`
    return null
  }

  const upload = useCallback(
    async (file: File, prefix: string): Promise<string | null> => {
      const validationError = validate(file)
      if (validationError) return null

      countRef.current += 1
      const ext = file.name.split('.').pop() ?? 'jpg'
      const tempPath = `temp/${sessionId}/${prefix}_${countRef.current}.${ext}`

      const entry: UploadedFileEntry = { file, tempPath, status: 'uploading', progress: 0 }
      setFiles((prev) => [...prev, entry])

      const { error } = await supabase.storage.from(BUCKET).upload(tempPath, file, {
        upsert: false,
        cacheControl: '3600',
      })

      if (error) {
        setFiles((prev) =>
          prev.map((f) =>
            f.tempPath === tempPath ? { ...f, status: 'error', errorMsg: error.message } : f
          )
        )
        return null
      }

      setFiles((prev) =>
        prev.map((f) => (f.tempPath === tempPath ? { ...f, status: 'done', progress: 100 } : f))
      )

      return tempPath
    },
    [sessionId]
  )

  const remove = useCallback((tempPath: string) => {
    setFiles((prev) => prev.filter((f) => f.tempPath !== tempPath))
    void supabase.storage.from(BUCKET).remove([tempPath])
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

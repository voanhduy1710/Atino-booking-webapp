import { useCallback, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'

export interface UploadedFile {
  name: string
  storagePath: string
  url: string
  size: number
  status: 'uploading' | 'done' | 'error'
  error?: string
}

interface UseFileUploadOptions {
  bucket: string
  maxSizeMb?: number
  maxFiles?: number
  allowedTypes?: string[]
}

const DEFAULT_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

export function useFileUpload({
  bucket,
  maxSizeMb = 10,
  maxFiles = 10,
  allowedTypes = DEFAULT_ALLOWED_TYPES,
}: UseFileUploadOptions) {
  const [files, setFiles] = useState<UploadedFile[]>([])

  const uploadFile = useCallback(
    async (file: File, pathPrefix: string): Promise<UploadedFile | null> => {
      // Validate type
      if (!allowedTypes.includes(file.type)) {
        return null
      }

      // Validate size
      if (file.size > maxSizeMb * 1024 * 1024) {
        return null
      }

      const ext = file.name.split('.').pop() ?? 'jpg'
      const storagePath = `${pathPrefix}_${Date.now()}.${ext}`

      const entry: UploadedFile = {
        name: file.name,
        storagePath,
        url: '',
        size: file.size,
        status: 'uploading',
      }

      setFiles((prev) => [...prev, entry])

      const { error } = await supabase.storage.from(bucket).upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

      if (error) {
        setFiles((prev) =>
          prev.map((f) =>
            f.storagePath === storagePath
              ? { ...f, status: 'error', error: error.message }
              : f
          )
        )
        return null
      }

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath)

      const done: UploadedFile = { ...entry, url: urlData.publicUrl, status: 'done' }
      setFiles((prev) =>
        prev.map((f) => (f.storagePath === storagePath ? done : f))
      )

      return done
    },
    [bucket, maxSizeMb, allowedTypes]
  )

  const removeFile = useCallback((storagePath: string) => {
    setFiles((prev) => prev.filter((f) => f.storagePath !== storagePath))
  }, [])

  const clearFiles = useCallback(() => {
    setFiles([])
  }, [])

  const canAddMore = files.filter((f) => f.status !== 'error').length < maxFiles
  const allDone = files.length > 0 && files.every((f) => f.status === 'done')
  const hasErrors = files.some((f) => f.status === 'error')
  const isUploading = files.some((f) => f.status === 'uploading')

  return { files, uploadFile, removeFile, clearFiles, canAddMore, allDone, hasErrors, isUploading }
}

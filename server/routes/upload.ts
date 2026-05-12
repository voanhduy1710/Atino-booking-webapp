/**
 * server/routes/upload.ts
 * POST /api/upload/gcs
 *
 * Migrated from supabase/functions/gcs-upload/index.ts
 * Accepts multipart/form-data with:
 *   - file: the image/PDF file
 *   - path: relative path, e.g. "temp/{sessionId}/GC01_1.jpg"
 */

import { Router, Request, Response } from 'express'
import multer from 'multer'
import { uploadToGCS } from '../lib/gcs.js'

const router = Router()

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
const MAX_MB = 10

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Loại tệp không hợp lệ'))
    }
  },
})

router.post(
  '/',
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    const file = req.file
    const path = req.body.path as string | undefined

    if (!file || !path) {
      res.status(400).json({ error: 'Missing file or path' })
      return
    }

    try {
      const result = await uploadToGCS(file.buffer, file.mimetype, path)
      res.json({ url: result.url, path: result.path })
    } catch (err) {
      const msg = (err as Error).message ?? String(err)
      console.error('[upload] GCS error:', err)
      res.status(500).json({ error: msg })
    }
  }
)

export default router

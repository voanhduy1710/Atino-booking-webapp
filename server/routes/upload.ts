import { randomUUID } from 'crypto'
import { Router, Request, Response } from 'express'
import multer from 'multer'
import { deleteFromGCS, normalizeObjectPath, uploadToGCS } from '../lib/gcs.js'
import { GCS_PREFIX } from '../config/storage.js'
import { requireAuth } from '../lib/httpAuth.js'
import { logger } from '../lib/logger.js'
import { getSupabase } from '../lib/supabase.js'

const router = Router()
const MAX_MB = 10
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 } })

function detectedType(buffer: Buffer): { mime: string; extension: string } | null {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return { mime: 'image/jpeg', extension: 'jpg' }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', extension: 'png' }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return { mime: 'application/pdf', extension: 'pdf' }
  return null
}

function ownerPrefix(sub: string): string {
  return `${GCS_PREFIX}/uploads/${sub.replace(/[^a-zA-Z0-9_-]/g, '_')}/`
}

async function cleanupExpiredUploads(limit: number): Promise<number> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('pending_uploads')
    .select('path')
    .lt('expires_at', new Date().toISOString())
    .limit(limit)
  if (error) throw error
  let removed = 0
  for (const row of data ?? []) {
    await deleteFromGCS(row.path)
    const deletion = await supabase.from('pending_uploads').delete().eq('path', row.path)
    if (deletion.error) throw deletion.error
    removed += 1
  }
  return removed
}

router.post('/', requireAuth(), upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'Missing file' })
    return
  }
  const type = detectedType(file.buffer)
  if (!type) {
    res.status(400).json({ error: 'Only JPEG, PNG, and PDF files are allowed' })
    return
  }
  const user = (req as Request & { user: { sub: string } }).user
  const objectPath = `uploads/${user.sub.replace(/[^a-zA-Z0-9_-]/g, '_')}/${randomUUID()}.${type.extension}`
  try {
    const result = await uploadToGCS(file.buffer, type.mime, objectPath)
    const { error: pendingError } = await getSupabase().from('pending_uploads').insert({
      path: result.path,
      owner_sub: user.sub,
    } as never)
    if (pendingError) {
      await deleteFromGCS(result.path)
      throw pendingError
    }
    void cleanupExpiredUploads(10).catch((cleanupError) => {
      logger.errorObj('opportunistic upload cleanup failed', cleanupError, { id: req.id })
    })
    logger.info('upload complete', { id: req.id, user: user.sub, size: file.size, mime: type.mime })
    res.status(201).json({ url: result.url, path: result.path })
  } catch (err) {
    logger.errorObj('upload failed', err, { id: req.id })
    res.status(500).json({ error: 'Upload failed' })
  }
})

router.delete('/', requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const user = (req as Request & { user: { sub: string } }).user
  try {
    const path = normalizeObjectPath(String(req.body?.path ?? ''))
    if (!path.startsWith(ownerPrefix(user.sub))) {
      res.status(403).json({ error: 'File is not owned by current user' })
      return
    }
    const supabase = getSupabase()
    const pending = await supabase
      .from('pending_uploads')
      .select('path')
      .eq('path', path)
      .eq('owner_sub', user.sub)
      .maybeSingle()
    if (pending.error) throw pending.error
    if (!pending.data) {
      res.status(409).json({ error: 'File is attached to a submitted booking' })
      return
    }
    await deleteFromGCS(path)
    const { error: deleteRecordError } = await supabase.from('pending_uploads').delete().eq('path', path)
    if (deleteRecordError) throw deleteRecordError
    logger.info('upload removed', { id: req.id, user: user.sub })
    res.json({ ok: true })
  } catch (err) {
    logger.errorObj('upload removal failed', err, { id: req.id })
    res.status(400).json({ error: 'Unable to remove upload' })
  }
})

router.post('/cleanup', requireAuth(['admin']), async (req: Request, res: Response): Promise<void> => {
  try {
    const removed = await cleanupExpiredUploads(100)
    res.json({ removed })
  } catch (err) {
    logger.errorObj('pending upload cleanup failed', err, { id: req.id })
    res.status(500).json({ error: 'Upload cleanup failed' })
  }
})

export default router

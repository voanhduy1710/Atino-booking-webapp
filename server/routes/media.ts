import { Router } from 'express'
import { GCS_BUCKET, GCS_PREFIX } from '../config/storage.js'
import { resilientFetch } from '../lib/resilientFetch.js'

const router = Router()
const MAX_PDF_BYTES = 10 * 1024 * 1024

function isAllowedSignedPdfUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    const allowedPrefix = `/${GCS_BUCKET}/${GCS_PREFIX}/`
    const signature = url.searchParams.get('X-Goog-Signature')
    const expiry = Number(url.searchParams.get('X-Goog-Expires'))
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'storage.googleapis.com' ||
      !url.pathname.startsWith(allowedPrefix) ||
      !url.pathname.toLowerCase().endsWith('.pdf') ||
      !signature ||
      !Number.isFinite(expiry) ||
      expiry < 1 ||
      expiry > 15 * 60
    ) return null
    return url
  } catch {
    return null
  }
}

router.get('/pdf', async (req, res, next) => {
  const url = typeof req.query.url === 'string' ? isAllowedSignedPdfUrl(req.query.url) : null
  if (!url) {
    res.status(400).json({ error: 'Invalid PDF URL' })
    return
  }

  try {
    const upstream = await resilientFetch(url, {
      method: 'GET',
      redirect: 'error',
      timeoutMs: 20_000,
      circuitKey: 'google-storage-media',
    })
    if (!upstream.ok) {
      res.status(upstream.status === 404 ? 404 : 502).json({ error: 'PDF unavailable' })
      return
    }
    const contentType = upstream.headers.get('content-type') ?? ''
    const length = Number(upstream.headers.get('content-length') ?? 0)
    if (!contentType.toLowerCase().includes('application/pdf') || length > MAX_PDF_BYTES) {
      res.status(415).json({ error: 'Invalid PDF content' })
      return
    }
    const data = Buffer.from(await upstream.arrayBuffer())
    if (data.length > MAX_PDF_BYTES) {
      res.status(413).json({ error: 'PDF is too large' })
      return
    }
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Length', data.length)
    res.send(data)
  } catch (error) {
    next(error)
  }
})

export default router

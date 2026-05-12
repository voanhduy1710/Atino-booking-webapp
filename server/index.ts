/**
 * server/index.ts
 * Express backend — runs on port 3001.
 * nginx proxies /api/* here; the React SPA is served separately.
 *
 * Routes:
 *   POST /api/upload/gcs       — GCS photo upload
 *   POST /api/booking/finalize — create booking + items + notify reviewer
 */

// Load .env (no-op if vars already set by the environment/Docker)
import { config } from 'dotenv'
config()

import express from 'express'
import cors from 'cors'
import uploadRouter from './routes/upload.js'
import bookingRouter from './routes/booking.js'

const app = express()
const PORT = 3001

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors())
app.use(express.json({
  verify: (_req, _res, buf) => {
    // Log bad control chars (anything < 0x20 except tab/LF/CR) so we can find the source
    const badBytes: { pos: number; hex: string }[] = []
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i]
      if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) {
        badBytes.push({ pos: i, hex: b.toString(16).padStart(2, '0') })
      }
    }
    if (badBytes.length > 0) {
      console.error('[body] BAD CONTROL CHARS:', JSON.stringify(badBytes))
      const firstPos = badBytes[0].pos
      const start = Math.max(0, firstPos - 40)
      const end = Math.min(buf.length, firstPos + 40)
      console.error('[body] context:', JSON.stringify(buf.slice(start, end).toString('utf8')))
    }
  }
}))
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`)
  next()
})

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/upload/gcs', uploadRouter)
app.use('/api/booking/finalize', bookingRouter)

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Express running on port ${PORT}`)
})

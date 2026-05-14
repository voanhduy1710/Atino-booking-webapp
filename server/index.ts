/**
 * server/index.ts
 * Express backend — runs on port 3001.
 *
 * Routes:
 *   POST /api/upload/gcs       — GCS photo upload
 *   POST /api/booking/finalize — create booking + items + notify reviewer
 */

import { config } from 'dotenv'
config()

import express from 'express'
import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import { randomUUID } from 'crypto'
import uploadRouter from './routes/upload.js'
import bookingRouter from './routes/booking.js'
import productProcessRouter from './routes/productProcess.js'

declare module 'express-serve-static-core' {
  interface Request {
    id: string
    startMs: number
  }
}

const app = express()
const PORT = 3001

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors())
app.use(express.json({
  verify: (_req, _res, buf) => {
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
  },
}))

// ── Request logger ─────────────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  req.id = randomUUID().slice(0, 8)
  req.startMs = Date.now()
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
    ?? req.socket.remoteAddress ?? '?'
  const len = req.headers['content-length'] ? ` body=${req.headers['content-length']}b` : ''
  console.log(`[req:${req.id}] → ${req.method} ${req.path}${len} ip=${ip}`)
  res.on('finish', () => {
    const ms = Date.now() - req.startMs
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'OK'
    console.log(`[req:${req.id}] ← ${res.statusCode} ${level} ${ms}ms`)
  })
  next()
})

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/upload/gcs', uploadRouter)
app.use('/api/booking/finalize', bookingRouter)
app.use('/api/product-process', productProcessRouter)

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() })
})

// ── Global error handler ───────────────────────────────────────────────────
const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  void next
  console.error(`[req:${req.id}] UNHANDLED ${err.name}: ${err.message}`)
  if (err.stack) console.error(err.stack)
  res.status(500).json({ error: err.message })
}

app.use(errorHandler)

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Express running on port ${PORT}`)
  console.log(`[server] NODE_ENV=${process.env.NODE_ENV ?? 'development'}`)
  console.log(`[server] SUPABASE_URL=${process.env.SUPABASE_URL ? 'set' : 'MISSING'}`)
  console.log(`[server] SUPABASE_SERVICE_ROLE_KEY=${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING'}`)
  console.log(`[server] GCS_SERVICE_ACCOUNT_JSON=${process.env.GCS_SERVICE_ACCOUNT_JSON ? 'set' : 'MISSING'}`)
})

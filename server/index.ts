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
app.use(express.json())
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

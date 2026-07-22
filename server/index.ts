import { config } from 'dotenv'
config()

import express from 'express'
import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import { randomUUID } from 'crypto'
import path from 'path'
import uploadRouter from './routes/upload.js'
import bookingRouter from './routes/booking.js'
import productProcessRouter from './routes/productProcess.js'
import nhanhRouter from './routes/nhanh.js'
import authRouter from './routes/auth.js'
import accountsRouter from './routes/accounts.js'
import reviewerRouter from './routes/reviewer.js'
import receiverRouter from './routes/receiver.js'
import amendmentsRouter from './routes/amendments.js'
import adminResourcesRouter from './routes/adminResources.js'
import notificationsRouter from './routes/notifications.js'
import { logger } from './lib/logger.js'

declare module 'express-serve-static-core' {
  interface Request {
    id: string
    startMs: number
  }
}

const app = express()
const PORT = Number(process.env.PORT ?? 3001)
const isProduction = process.env.NODE_ENV === 'production'

function getClientIp(req: Request): string {
  const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
  return forwarded || req.socket.remoteAddress || '?'
}

function getClientPort(req: Request): string {
  const forwardedPort = req.headers['x-forwarded-port']
  if (typeof forwardedPort === 'string' && forwardedPort.trim()) return forwardedPort.trim()
  if (Array.isArray(forwardedPort) && forwardedPort[0]) return forwardedPort[0]
  return req.socket.remotePort ? String(req.socket.remotePort) : ''
}

function getStatusText(statusCode: number): string {
  if (statusCode >= 500) return 'ERROR'
  if (statusCode >= 400) return 'WARN'
  return 'OK'
}

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
      const firstPos = badBytes[0].pos
      const start = Math.max(0, firstPos - 40)
      const end = Math.min(buf.length, firstPos + 40)
      logger.warn('body contains control characters', {
        badBytes,
        context: buf.slice(start, end).toString('utf8'),
      })
    }
  },
}))

app.use((req: Request, res: Response, next: NextFunction) => {
  req.id = randomUUID().slice(0, 8)
  req.startMs = Date.now()
  const ip = getClientIp(req)
  const port = getClientPort(req)
  const client = port ? `${ip}:${port}` : ip
  const httpVersion = `HTTP/${req.httpVersion}`
  const requestTarget = req.originalUrl || req.url
  res.on('finish', () => {
    const ms = Date.now() - req.startMs
    const statusText = getStatusText(res.statusCode)
    if (!isProduction || ms > 500) {
      logger.debug('request completed', { id: req.id, method: req.method, path: req.path, statusCode: res.statusCode, ms })
    }
    logger.info('http access', { id: req.id, client, method: req.method, requestTarget, httpVersion, statusCode: res.statusCode, statusText, ms })
  })
  next()
})

app.use('/api/upload/gcs', uploadRouter)
app.use('/api/booking/finalize', bookingRouter)
app.use('/api/product-process', productProcessRouter)
app.use('/api/nhanh', nhanhRouter)
app.use('/api/auth', authRouter)
app.use('/api/accounts', accountsRouter)
app.use('/api/reviewer', reviewerRouter)
app.use('/api/receiver', receiverRouter)
app.use('/api/amendments', amendmentsRouter)
app.use('/api/admin-resources', adminResourcesRouter)
app.use('/api/notifications', notificationsRouter)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() })
})

const frontendDir = path.resolve(process.cwd(), 'dist')
app.use(express.static(frontendDir))
app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'))
})

const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  void next
  logger.errorObj('unhandled request error', err, { id: req.id })
  res.status(500).json({ error: isProduction ? 'Internal server error' : err.message })
}

app.use(errorHandler)

app.listen(PORT, () => {
  logger.info('Express server started', { port: PORT, nodeEnv: process.env.NODE_ENV ?? 'development' })
  for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GCS_SERVICE_ACCOUNT_JSON']) {
    if (!process.env[name]) logger.warn('required environment variable missing', { name })
  }
})

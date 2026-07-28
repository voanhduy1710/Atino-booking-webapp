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
import publicBookingRouter from './routes/publicBooking.js'
import mediaRouter from './routes/media.js'
import { logger } from './lib/logger.js'
import { getSupabase } from './lib/supabase.js'

declare module 'express-serve-static-core' {
  interface Request {
    id: string
    startMs: number
  }
}

const app = express()
const PORT = Number(process.env.PORT ?? 3001)
const isProduction = process.env.NODE_ENV === 'production'
if (isProduction) app.set('trust proxy', 1)
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)
const requestBuckets = new Map<string, { count: number; resetAt: number }>()

function rateLimit(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.baseUrl || req.path}:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`
    const now = Date.now()
    if (requestBuckets.size > 10_000) {
      for (const [bucketKey, value] of requestBuckets) {
        if (value.resetAt <= now) requestBuckets.delete(bucketKey)
      }
    }
    const current = requestBuckets.get(key)
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current
    bucket.count += 1
    requestBuckets.set(key, bucket)
    if (bucket.count > limit) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000))
      res.status(429).json({ error: 'Too many requests' })
      return
    }
    next()
  }
}

function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || '?'
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

app.disable('x-powered-by')
app.use(cors({
  origin(origin, callback) {
    if (!origin || (!isProduction && allowedOrigins.length === 0) || allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error('Origin is not allowed'))
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  credentials: true,
}))
app.use(express.json({ limit: '1mb' }))
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(), microphone=()')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://storage.googleapis.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  )
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
})

app.use((req: Request, res: Response, next: NextFunction) => {
  req.id = randomUUID().slice(0, 8)
  req.startMs = Date.now()
  const ip = getClientIp(req)
  const port = getClientPort(req)
  const client = port ? `${ip}:${port}` : ip
  const httpVersion = `HTTP/${req.httpVersion}`
  res.on('finish', () => {
    const ms = Date.now() - req.startMs
    const statusText = getStatusText(res.statusCode)
    if (!isProduction || ms > 500) {
      logger.debug('request completed', { id: req.id, method: req.method, path: req.path, statusCode: res.statusCode, ms })
    }
    logger.info('http access', { id: req.id, client, method: req.method, path: req.path, httpVersion, statusCode: res.statusCode, statusText, ms })
  })
  next()
})

app.use('/api/auth/login', rateLimit(10, 15 * 60 * 1000))
app.use('/api/upload/gcs', rateLimit(20, 15 * 60 * 1000), uploadRouter)
app.use('/api/booking/finalize', bookingRouter)
app.use('/api/product-process', rateLimit(120, 15 * 60 * 1000), productProcessRouter)
app.use('/api/nhanh', rateLimit(60, 15 * 60 * 1000), nhanhRouter)
app.use('/api/auth', authRouter)
app.use('/api/accounts', accountsRouter)
app.use('/api/reviewer', reviewerRouter)
app.use('/api/receiver', receiverRouter)
app.use('/api/amendments', amendmentsRouter)
app.use('/api/admin-resources', adminResourcesRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/public-bookings', rateLimit(60, 15 * 60 * 1000), publicBookingRouter)
app.use('/api/media', rateLimit(60, 15 * 60 * 1000), mediaRouter)

app.get('/api/health', async (_req, res) => {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AUTH_JWT_SECRET']
  const missing = required.filter((name) => !process.env[name])
  if (!process.env.STAFF_USERS_B64 && !process.env.STAFF_USERS && (!process.env.VITE_STAFF_USERS || isProduction)) missing.push('STAFF_USERS')
  if (!process.env.GCS_SERVICE_ACCOUNT_JSON_B64 && !process.env.GCS_SERVICE_ACCOUNT_JSON) missing.push('GCS_SERVICE_ACCOUNT_JSON')
  if (isProduction && process.env.AUTH_SESSION_STORE_DISABLED === 'true') missing.push('AUTH_SESSION_STORE')
  if (isProduction && missing.length > 0) {
    res.status(503).json({ status: 'not_ready', reason: 'configuration' })
    return
  }

  try {
    const supabase = getSupabase()
    const { error } = await supabase
      .from('bookings')
      .select('id, client_session_id, booking_items(total_quantity)')
      .limit(0)
    if (error) throw error
    const sessionCheck = await supabase.from('auth_sessions').select('jti').limit(0)
    if (sessionCheck.error) throw sessionCheck.error
    const schemaVersion = await supabase
      .from('app_schema_version')
      .select('version')
      .eq('singleton', true)
      .single()
    if (schemaVersion.error || Number(schemaVersion.data?.version) < 20260727005000) {
      throw schemaVersion.error ?? new Error('Database schema is out of date')
    }
    res.json({ status: 'ok', ts: new Date().toISOString() })
  } catch {
    res.status(503).json({ status: 'not_ready', reason: 'database_schema' })
  }
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
  for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AUTH_JWT_SECRET']) {
    if (!process.env[name]) logger.warn('required environment variable missing', { name })
  }
})

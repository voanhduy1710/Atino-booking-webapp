type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
}

const configuredLevel = (process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug')).toLowerCase()
const currentLevel: LogLevel = configuredLevel in LEVEL_ORDER ? configuredLevel as LogLevel : 'info'
const isProduction = process.env.NODE_ENV === 'production'

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel] && currentLevel !== 'silent'
}

function serializeMeta(meta: Record<string, unknown> | undefined): string {
  if (!meta) return ''
  const safe = Object.fromEntries(
    Object.entries(meta).map(([key, value]) => {
      if (/token|key|secret|password|authorization/i.test(key)) return [key, '[redacted]']
      if (isProduction && /path|url|account|supplier|booking/i.test(key)) return [key, '[redacted]']
      return [key, value]
    })
  )
  return ` ${JSON.stringify(safe)}`
}

function write(level: Exclude<LogLevel, 'silent'>, message: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return
  const line = `${level.toUpperCase()}: ${message}${serializeMeta(meta)}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
  errorObj: (message: string, error: unknown, meta?: Record<string, unknown>) => {
    const err = error as { name?: string; message?: string; stack?: string }
    write('error', message, {
      ...meta,
      errorName: err.name ?? 'Error',
      errorMessage: err.message ?? String(error),
      ...(isProduction ? {} : { stack: err.stack }),
    })
  },
}

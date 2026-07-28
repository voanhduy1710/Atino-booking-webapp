import type { JWTPayload } from './jwt.js'
import { logger } from './logger.js'
import { getSupabase } from './supabase.js'

let warnedMissingSessionTable = false

function disabled(): boolean {
  return process.env.AUTH_SESSION_STORE_DISABLED === 'true'
}

function canBypassMissingTable(error: unknown): boolean {
  if (process.env.NODE_ENV === 'production') return false
  const candidate = error as { code?: string; message?: string }
  const message = candidate.message ?? ''
  return candidate.code === 'PGRST205' || message.includes("public.auth_sessions")
}

function handleMissingTable(error: unknown): boolean {
  if (!canBypassMissingTable(error)) return false
  if (!warnedMissingSessionTable) {
    warnedMissingSessionTable = true
    logger.warn('auth_sessions migration is missing; development session-store bypass is active')
  }
  return true
}

export async function registerSession(payload: JWTPayload): Promise<void> {
  if (disabled()) return
  const { error } = await getSupabase().from('auth_sessions').insert({
    jti: payload.jti,
    subject: payload.sub,
    expires_at: new Date(payload.exp * 1000).toISOString(),
  } as never)
  if (error && !handleMissingTable(error)) throw error
}

export async function isSessionActive(payload: JWTPayload): Promise<boolean> {
  if (disabled()) return true
  const { data, error } = await getSupabase()
    .from('auth_sessions')
    .select('jti')
    .eq('jti', payload.jti)
    .eq('subject', payload.sub)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) {
    if (handleMissingTable(error)) return true
    throw error
  }
  return Boolean(data)
}

export async function revokeSession(payload: JWTPayload): Promise<void> {
  if (disabled()) return
  const { error } = await getSupabase()
    .from('auth_sessions')
    .update({ revoked_at: new Date().toISOString() } as never)
    .eq('jti', payload.jti)
    .eq('subject', payload.sub)
  if (error && !handleMissingTable(error)) throw error
}

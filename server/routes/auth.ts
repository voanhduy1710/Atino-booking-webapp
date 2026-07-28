import { Router, type Response } from 'express'
import { z } from 'zod'
import { issueJWT, verifyJWT } from '../lib/jwt.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { getSupabase } from '../lib/supabase.js'
import { registerSession, revokeSession } from '../lib/sessionStore.js'
import { authenticatedUser } from '../lib/httpAuth.js'
import { isAppRole, type AppRole } from '../config/capabilities.js'

const router = Router()
const SESSION_TTL_SECONDS = 8 * 60 * 60

interface StaffUser {
  username: string
  password_hash: string
  role: AppRole
}

const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(256),
})
const registerSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  username: z.string().trim().min(3).max(100),
  password: z.string().min(8).max(256),
})

export function getStaffUsers(): StaffUser[] {
  const raw = process.env.STAFF_USERS_B64
    ? Buffer.from(process.env.STAFF_USERS_B64, 'base64').toString('utf8')
    : (process.env.STAFF_USERS ?? (process.env.NODE_ENV !== 'production' ? process.env.VITE_STAFF_USERS : undefined))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((user): user is StaffUser => {
      if (!user || typeof user !== 'object') return false
      const candidate = user as Record<string, unknown>
      return typeof candidate.username === 'string' &&
        typeof candidate.password_hash === 'string' &&
        isAppRole(candidate.role) &&
        candidate.role !== 'supplier'
    })
  } catch {
    return []
  }
}

function setSessionCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `atino_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`
  )
}

async function loginResponse(res: Response, claims: {
  sub: string
  username: string
  role: AppRole
  supplier_id?: string
  supplier_account_id?: string
}) {
  const token = issueJWT(claims, SESSION_TTL_SECONDS)
  const payload = verifyJWT(token)
  if (!payload) throw new Error('Could not issue session')
  await registerSession(payload)
  setSessionCookie(res, token)
  return res.json({ role: claims.role, user: { ...claims, exp: payload.exp } })
}

router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid credentials' })
    const { username, password } = parsed.data
    const staffUser = getStaffUsers().find((user) => user.username === username)
    if (staffUser) {
      const verification = await verifyPassword(password, staffUser.password_hash)
      if (!verification.valid) return res.status(401).json({ error: 'Invalid credentials' })
      return loginResponse(res, {
        sub: `staff:${staffUser.username}`,
        username: staffUser.username,
        role: staffUser.role,
      })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('supplier_accounts')
      .select('id, username, password_hash, status, supplier_id')
      .eq('username', username)
      .maybeSingle()
    if (error) throw error
    if (!data) return res.status(401).json({ error: 'Invalid credentials' })
    const account = data as { id: string; username: string; password_hash: string; status: string; supplier_id: string | null }
    const verification = await verifyPassword(password, account.password_hash)
    if (!verification.valid) return res.status(401).json({ error: 'Invalid credentials' })
    if (account.status !== 'active') return res.status(403).json({ error: 'Account is not approved' })
    if (verification.needsUpgrade) {
      const upgradedHash = await hashPassword(password)
      const { error: upgradeError } = await supabase
        .from('supplier_accounts')
        .update({ password_hash: upgradedHash } as never)
        .eq('id', account.id)
        .eq('password_hash', account.password_hash)
      if (upgradeError) throw upgradeError
    }
    return loginResponse(res, {
      sub: `supplier:${account.id}`,
      username: account.username,
      role: 'supplier',
      supplier_id: account.supplier_id ?? undefined,
      supplier_account_id: account.id,
    })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', async (req, res, next) => {
  try {
    const payload = authenticatedUser(req)
    if (payload) await revokeSession(payload)
  } catch (error) {
    next(error)
    return
  }
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `atino_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`)
  res.json({ ok: true })
})

router.post('/register-supplier', async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid registration data' })
    const { full_name: fullName, username, password } = parsed.data
    const passwordHash = await hashPassword(password)
    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('register_supplier', {
      p_username: username,
      p_password_hash: passwordHash,
      p_full_name: fullName,
    } as never)
    if (error) throw error
    const result = data as { error?: string } | null
    if (result?.error) return res.status(400).json({ error: result.error })
    return res.json({ message: 'Registration submitted. Await administrator approval.' })
  } catch (err) {
    next(err)
  }
})

export default router

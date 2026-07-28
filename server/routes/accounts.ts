import { Router } from 'express'
import { requireAuth, usernameOf, type AuthedRequest } from '../lib/httpAuth.js'
import { hashPassword } from '../lib/password.js'
import { getSupabase } from '../lib/supabase.js'
import { revokeSessionsForSubject } from '../lib/sessionStore.js'
import { CAPABILITY_ROLES } from '../config/capabilities.js'
import { decryptActualPassword, encryptActualPassword } from '../lib/accountPasswordVault.js'

const router = Router()

router.use(requireAuth([...CAPABILITY_ROLES.manageAccounts]))

async function audit(req: AuthedRequest, action: string, accountId: string): Promise<void> {
  const { error } = await getSupabase().from('account_audit_events').insert({
    actor: usernameOf(req.user), action, account_id: accountId,
  } as never)
  if (error) throw error
}

router.get('/', async (req, res, next) => {
  try {
    const status = String(req.query.status ?? 'all')
    if (!['all', 'pending', 'active', 'disabled', 'deleted', 'rejected'].includes(status)) {
      res.status(400).json({ error: 'Invalid account status' })
      return
    }
    let query = getSupabase()
      .from('supplier_accounts')
      .select('id, username, full_name, supplier_code_requested, supplier_id, status, created_at, suppliers(name)')
      .order('created_at', { ascending: false })
    if (status === 'all') query = query.neq('status', 'deleted')
    else query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    res.json({ accounts: data ?? [] })
  } catch (err) {
    next(err)
  }
})

router.get('/suppliers', async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from('suppliers')
      .select('id, code, name, active')
      .eq('active', true)
      .order('code')
    if (error) throw error
    res.json({ suppliers: data ?? [] })
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const username = String(req.body?.username ?? '').trim()
    const fullName = String(req.body?.full_name ?? '').trim()
    const password = String(req.body?.password ?? '')
    const supplierId = String(req.body?.supplier_id ?? '').trim()
    if (!username || username.length < 3 || username.length > 100 || !fullName || fullName.length > 200 || password.length < 8 || password.length > 256 || !supplierId) {
      res.status(400).json({ error: 'Full name, username, supplier, and an 8+ character password are required' })
      return
    }
    const supabase = getSupabase()
    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers').select('id, code').eq('id', supplierId).eq('active', true).maybeSingle()
    if (supplierError) throw supplierError
    if (!supplier) return res.status(400).json({ error: 'Supplier is not available' })
    const passwordHash = await hashPassword(password)
    const { data, error } = await supabase.from('supplier_accounts').insert({
      username, full_name: fullName, password_hash: passwordHash, password_ciphertext: encryptActualPassword(password), supplier_id: supplierId,
      supplier_code_requested: supplier.code, status: 'active',
    } as never).select('id, username, full_name, supplier_id, status, created_at').single()
    if ((error as { code?: string } | null)?.code === '23505') return res.status(409).json({ error: 'Username already exists' })
    if (error) throw error
    await audit(req as AuthedRequest, 'account.created', String((data as { id?: string } | null)?.id ?? ''))
    res.status(201).json({ account: data })
  } catch (err) {
    next(err)
  }
})

router.post('/:accountId/reset-password', async (req, res, next) => {
  try {
    const password = String(req.body?.password ?? '')
    if (password.length < 8 || password.length > 256) {
      res.status(400).json({ error: 'Password must contain 8 to 256 characters' })
      return
    }
    const passwordHash = await hashPassword(password)
    const supabase = getSupabase()
    const { error } = await supabase
      .from('supplier_accounts')
      .update({ password_hash: passwordHash, password_ciphertext: encryptActualPassword(password) } as never)
      .eq('id', req.params.accountId)
    if (error) throw error
    await revokeSessionsForSubject(`supplier:${req.params.accountId}`)
    await audit(req as unknown as AuthedRequest, 'account.password_reset', req.params.accountId)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.post('/:accountId/reveal-password', async (req, res, next) => {
  try {
    const { data, error } = await getSupabase().from('supplier_accounts')
      .select('id, password_ciphertext').eq('id', req.params.accountId).maybeSingle()
    if (error) throw error
    const ciphertext = (data as { password_ciphertext?: string | null } | null)?.password_ciphertext
    if (!ciphertext) return res.status(409).json({ error: 'Actual password is unavailable. Reset password to create encrypted reveal data.' })
    const actualPassword = decryptActualPassword(ciphertext)
    await audit(req as unknown as AuthedRequest, 'account.password_revealed', req.params.accountId)
    res.setHeader('Cache-Control', 'no-store, private, max-age=0')
    res.setHeader('Pragma', 'no-cache')
    res.json({ account_id: req.params.accountId, actual_password: actualPassword, expires_at: new Date(Date.now() + 30_000).toISOString() })
  } catch (err) { next(err) }
})

router.patch('/:accountId', async (req, res, next) => {
  try {
    const username = String(req.body?.username ?? '').trim()
    const fullName = String(req.body?.full_name ?? '').trim()
    const supplierId = String(req.body?.supplier_id ?? '').trim()
    const password = String(req.body?.password ?? '')
    if (username.length < 3 || username.length > 100 || !fullName || fullName.length > 200 || !supplierId || (password && (password.length < 8 || password.length > 256))) {
      return res.status(400).json({ error: 'Invalid account data' })
    }
    const supabase = getSupabase()
    const supplier = await supabase.from('suppliers').select('id, code').eq('id', supplierId).eq('active', true).maybeSingle()
    if (supplier.error) throw supplier.error
    if (!supplier.data) return res.status(400).json({ error: 'Supplier is not available' })
    const changes: Record<string, unknown> = { username, full_name: fullName, supplier_id: supplierId, supplier_code_requested: supplier.data.code }
    if (password) {
      changes.password_hash = await hashPassword(password)
      changes.password_ciphertext = encryptActualPassword(password)
    }
    const { error } = await supabase.from('supplier_accounts').update(changes as never).eq('id', req.params.accountId)
    if ((error as { code?: string } | null)?.code === '23505') return res.status(409).json({ error: 'Username already exists' })
    if (error) throw error
    if (password) await revokeSessionsForSubject(`supplier:${req.params.accountId}`)
    await audit(req as unknown as AuthedRequest, 'account.updated', req.params.accountId)
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.post('/:accountId/toggle-disabled', async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const current = await supabase.from('supplier_accounts').select('status').eq('id', req.params.accountId).maybeSingle()
    if (current.error) throw current.error
    if (!current.data) return res.status(404).json({ error: 'Account not found' })
    const nextStatus = current.data.status === 'disabled' ? 'active' : 'disabled'
    const { error } = await supabase.from('supplier_accounts').update({ status: nextStatus } as never).eq('id', req.params.accountId)
    if (error) throw error
    await revokeSessionsForSubject(`supplier:${req.params.accountId}`)
    await audit(req as unknown as AuthedRequest, `account.${nextStatus}`, req.params.accountId)
    res.json({ ok: true, status: nextStatus })
  } catch (err) { next(err) }
})

router.post('/import', async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body?.accounts) ? req.body.accounts.slice(0, 500) : []
    if (!rows.length) return res.status(400).json({ error: 'Excel file contains no accounts' })
    const supabase = getSupabase()
    const suppliers = await supabase.from('suppliers').select('id, code').eq('active', true)
    if (suppliers.error) throw suppliers.error
    const supplierByCode = new Map((suppliers.data ?? []).map((supplier) => [supplier.code.trim().toLowerCase(), supplier]))
    const normalized = (rows as Array<Record<string, unknown>>).map((raw, index) => ({
      row: index + 2,
      fullName: String(raw.full_name ?? '').trim(),
      username: String(raw.username ?? '').trim(),
      password: String(raw.password ?? ''),
      supplierCode: String(raw.supplier_code ?? '').trim(),
    }))
    const existingResult = await supabase.from('supplier_accounts').select('username').neq('status', 'deleted')
    if (existingResult.error) throw existingResult.error
    const existing = new Set((existingResult.data ?? []).map((account) => account.username.toLowerCase()))
    const occurrences = new Map<string, number>()
    for (const row of normalized) occurrences.set(row.username.toLowerCase(), (occurrences.get(row.username.toLowerCase()) ?? 0) + 1)
    const validationErrors: string[] = []
    for (const row of normalized) {
      if (!row.fullName) validationErrors.push(`Dòng ${row.row}: Lỗi Họ tên bị trống`)
      if (row.username.length < 3) validationErrors.push(`Dòng ${row.row}: Lỗi username phải có ít nhất 3 ký tự`)
      if (row.password.length < 8) validationErrors.push(`Dòng ${row.row}: Lỗi mật khẩu không đủ 8 ký tự`)
      if (!supplierByCode.has(row.supplierCode.toLowerCase())) validationErrors.push(`Dòng ${row.row}: Lỗi Mã NCC không tồn tại (${row.supplierCode || 'trống'})`)
      if (existing.has(row.username.toLowerCase())) validationErrors.push(`Dòng ${row.row}: Lỗi username đã tồn tại (${row.username})`)
      if ((occurrences.get(row.username.toLowerCase()) ?? 0) > 1) validationErrors.push(`Dòng ${row.row}: Lỗi username bị trùng trong file (${row.username})`)
    }
    if (validationErrors.length) return res.status(400).json({ error: validationErrors.join('\n') })
    const inserts: Array<Record<string, unknown>> = []
    for (const row of normalized) {
      const supplier = supplierByCode.get(row.supplierCode.toLowerCase())!
      inserts.push({ full_name: row.fullName, username: row.username, password_hash: await hashPassword(row.password), password_ciphertext: encryptActualPassword(row.password), supplier_id: supplier.id, supplier_code_requested: supplier.code, status: 'active' })
    }
    const { data, error } = await supabase.from('supplier_accounts').insert(inserts as never).select('id')
    if ((error as { code?: string } | null)?.code === '23505') return res.status(409).json({ error: 'Excel contains an existing or duplicate username' })
    if (error) throw error
    for (const account of (data ?? []) as Array<{ id: string }>) await audit(req as unknown as AuthedRequest, 'account.imported', account.id)
    res.status(201).json({ created: data?.length ?? 0 })
  } catch (err) { next(err) }
})

router.delete('/:accountId', async (req, res, next) => {
  try {
    await audit(req as unknown as AuthedRequest, 'account.deleted', req.params.accountId)
    const supabase = getSupabase()
    const { error } = await supabase.from('supplier_accounts').update({ status: 'deleted', password_ciphertext: null } as never).eq('id', req.params.accountId)
    if (error) throw error
    await revokeSessionsForSubject(`supplier:${req.params.accountId}`)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router

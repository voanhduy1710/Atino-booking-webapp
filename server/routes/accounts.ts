import { Router } from 'express'
import { requireAuth, usernameOf, type AuthedRequest } from '../lib/httpAuth.js'
import { hashPassword } from '../lib/password.js'
import { getSupabase } from '../lib/supabase.js'
import { revokeSessionsForSubject } from '../lib/sessionStore.js'
import { CAPABILITY_ROLES, isAppRole } from '../config/capabilities.js'
import { decryptActualPassword, encryptActualPassword } from '../lib/accountPasswordVault.js'

const router = Router()
const STAFF_ROLES = ['admin', 'warehouse_reviewer', 'warehouse_receiver', 'manager'] as const
type AccountKind = 'supplier' | 'staff'

router.use(requireAuth([...CAPABILITY_ROLES.manageAccounts]))

function accountKind(value: unknown): AccountKind {
  return value === 'staff' ? 'staff' : 'supplier'
}

function isStaffRole(value: unknown): value is typeof STAFF_ROLES[number] {
  return typeof value === 'string' && STAFF_ROLES.includes(value as typeof STAFF_ROLES[number])
}

function importRole(value: unknown): typeof STAFF_ROLES[number] | 'supplier' | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  const roles: Record<string, typeof STAFF_ROLES[number] | 'supplier'> = {
    admin: 'admin', 'quản trị viên': 'admin',
    warehouse_reviewer: 'warehouse_reviewer', 'nhân sự xác nhận booking': 'warehouse_reviewer', 'nhân viên xác nhận booking': 'warehouse_reviewer',
    warehouse_receiver: 'warehouse_receiver', 'nhân sự nhận hàng': 'warehouse_receiver', 'nhân viên nhận hàng': 'warehouse_receiver',
    manager: 'manager', 'quản lý': 'manager',
    supplier: 'supplier', 'nhà cung cấp': 'supplier',
  }
  return roles[normalized] ?? null
}

function validBaseAccount(username: string, fullName: string, password?: string): boolean {
  return username.length >= 3 && username.length <= 100 && fullName.length > 0 && fullName.length <= 200 && (!password || (password.length >= 8 && password.length <= 256))
}

async function audit(req: AuthedRequest, action: string, accountId: string, kind: AccountKind): Promise<void> {
  const { error } = await getSupabase().from('account_audit_events').insert({
    actor: usernameOf(req.user), action, account_id: accountId, account_kind: kind,
  } as never)
  if (error) throw error
}

async function usernameTaken(username: string, except?: { id: string; kind: AccountKind }): Promise<boolean> {
  const supabase = getSupabase()
  let suppliers = supabase.from('supplier_accounts').select('id').ilike('username', username).limit(1)
  let staff = supabase.from('staff_accounts').select('id').ilike('username', username).limit(1)
  if (except?.kind === 'supplier') suppliers = suppliers.neq('id', except.id)
  if (except?.kind === 'staff') staff = staff.neq('id', except.id)
  const [supplierResult, staffResult] = await Promise.all([suppliers, staff])
  if (supplierResult.error) throw supplierResult.error
  if (staffResult.error) throw staffResult.error
  return Boolean(supplierResult.data?.length || staffResult.data?.length)
}

async function activeSupplier(supplierId: string) {
  const result = await getSupabase().from('suppliers').select('id, code').eq('id', supplierId).eq('active', true).maybeSingle()
  if (result.error) throw result.error
  return result.data
}

router.get('/', async (req, res, next) => {
  try {
    const status = String(req.query.status ?? 'all')
    const role = String(req.query.role ?? 'all')
    const search = String(req.query.search ?? '').trim().toLowerCase()
    if (!['all', 'active', 'disabled', 'deleted'].includes(status) || (role !== 'all' && !isAppRole(role))) {
      res.status(400).json({ error: 'Invalid account filter' })
      return
    }
    const supabase = getSupabase()
    let supplierQuery = supabase.from('supplier_accounts').select('id, username, full_name, supplier_code_requested, supplier_id, status, created_at, suppliers(name)').order('created_at', { ascending: false })
    let staffQuery = supabase.from('staff_accounts').select('id, username, full_name, status, created_at, staff_account_roles(role)').order('created_at', { ascending: false })
    if (status === 'all') {
      supplierQuery = supplierQuery.neq('status', 'deleted')
      staffQuery = staffQuery.neq('status', 'deleted')
    } else {
      supplierQuery = supplierQuery.eq('status', status)
      staffQuery = staffQuery.eq('status', status)
    }
    const [supplierResult, staffResult] = await Promise.all([supplierQuery, staffQuery])
    if (supplierResult.error) throw supplierResult.error
    if (staffResult.error) throw staffResult.error
    const suppliers = (supplierResult.data ?? []).map((account: any) => ({ ...account, account_type: 'supplier' as const, role: 'supplier' as const }))
    const staff = (staffResult.data ?? []).map((account: any) => ({
      id: account.id, username: account.username, full_name: account.full_name, supplier_code_requested: null, supplier_id: null,
      status: account.status, created_at: account.created_at, suppliers: null, account_type: 'staff' as const,
      role: (Array.isArray(account.staff_account_roles) ? account.staff_account_roles[0] : account.staff_account_roles)?.role ?? 'manager',
    }))
    const accounts = [...suppliers, ...staff]
      .filter((account) => role === 'all' || account.role === role)
      .filter((account) => !search || account.username.toLowerCase().includes(search) || account.full_name.toLowerCase().includes(search))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    res.json({ accounts })
  } catch (err) { next(err) }
})

router.get('/suppliers', async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase().from('suppliers').select('id, code, name, active').eq('active', true).order('code')
    if (error) throw error
    res.json({ suppliers: data ?? [] })
  } catch (err) { next(err) }
})

router.post('/', async (req, res, next) => {
  try {
    const kind = accountKind(req.body?.account_type)
    const username = String(req.body?.username ?? '').trim()
    const fullName = String(req.body?.full_name ?? '').trim()
    const password = String(req.body?.password ?? '')
    const role = String(req.body?.role ?? '')
    const supplierId = String(req.body?.supplier_id ?? '').trim()
    if (!validBaseAccount(username, fullName, password) || password.length < 8 || (kind === 'staff' && !isStaffRole(role)) || (kind === 'supplier' && !supplierId)) {
      res.status(400).json({ error: 'Invalid account data' })
      return
    }
    if (await usernameTaken(username)) return res.status(409).json({ error: 'Username already exists' })
    const supabase = getSupabase()
    const passwordHash = await hashPassword(password)
    if (kind === 'staff') {
      const created = await supabase.from('staff_accounts').insert({ username, full_name: fullName, password_hash: passwordHash, password_ciphertext: encryptActualPassword(password), status: 'active' } as never).select('id, username, full_name, status, created_at').single()
      if (created.error || !created.data) throw created.error ?? new Error('Could not create staff account')
      const roleResult = await supabase.from('staff_account_roles').insert({ staff_account_id: (created.data as any).id, role } as never)
      if (roleResult.error) throw roleResult.error
      await audit(req as unknown as AuthedRequest, 'account.created', String((created.data as any).id), kind)
      res.status(201).json({ account: { ...created.data, account_type: kind, role } })
      return
    }
    const supplier = await activeSupplier(supplierId)
    if (!supplier) return res.status(400).json({ error: 'Supplier is not available' })
    const created = await supabase.from('supplier_accounts').insert({ username, full_name: fullName, password_hash: passwordHash, password_ciphertext: encryptActualPassword(password), supplier_id: supplier.id, supplier_code_requested: supplier.code, status: 'active' } as never).select('id, username, full_name, supplier_id, status, created_at').single()
    if (created.error || !created.data) throw created.error ?? new Error('Could not create supplier account')
    await audit(req as AuthedRequest, 'account.created', String((created.data as any).id), kind)
    res.status(201).json({ account: { ...created.data, account_type: kind, role: 'supplier' } })
  } catch (err) { next(err) }
})

router.post('/:accountId/reveal-password', async (req, res, next) => {
  try {
    const kind = accountKind(req.body?.account_type)
    const table = kind === 'staff' ? 'staff_accounts' : 'supplier_accounts'
    const { data, error } = await getSupabase().from(table).select('id, password_ciphertext').eq('id', req.params.accountId).maybeSingle()
    if (error) throw error
    const ciphertext = (data as { password_ciphertext?: string | null } | null)?.password_ciphertext
    if (!ciphertext) return res.status(409).json({ error: 'Actual password is unavailable. Reset password to create encrypted reveal data.' })
    await audit(req as unknown as AuthedRequest, 'account.password_revealed', req.params.accountId, kind)
    res.setHeader('Cache-Control', 'no-store, private, max-age=0')
    res.json({ account_id: req.params.accountId, actual_password: decryptActualPassword(ciphertext), expires_at: new Date(Date.now() + 30_000).toISOString() })
  } catch (err) { next(err) }
})

router.patch('/:accountId', async (req, res, next) => {
  try {
    const kind = accountKind(req.body?.account_type)
    const username = String(req.body?.username ?? '').trim()
    const fullName = String(req.body?.full_name ?? '').trim()
    const password = String(req.body?.password ?? '')
    const role = String(req.body?.role ?? '')
    const supplierId = String(req.body?.supplier_id ?? '').trim()
    if (!validBaseAccount(username, fullName, password) || (kind === 'staff' && !isStaffRole(role)) || (kind === 'supplier' && !supplierId)) return res.status(400).json({ error: 'Invalid account data' })
    if (await usernameTaken(username, { id: req.params.accountId, kind })) return res.status(409).json({ error: 'Username already exists' })
    const supabase = getSupabase()
    const changes: Record<string, unknown> = { username, full_name: fullName }
    if (password) { changes.password_hash = await hashPassword(password); changes.password_ciphertext = encryptActualPassword(password) }
    if (kind === 'staff') {
      const result = await supabase.from('staff_accounts').update(changes as never).eq('id', req.params.accountId)
      if (result.error) throw result.error
      const roleResult = await supabase.from('staff_account_roles').upsert({ staff_account_id: req.params.accountId, role } as never)
      if (roleResult.error) throw roleResult.error
    } else {
      const supplier = await activeSupplier(supplierId)
      if (!supplier) return res.status(400).json({ error: 'Supplier is not available' })
      changes.supplier_id = supplier.id; changes.supplier_code_requested = supplier.code
      const result = await supabase.from('supplier_accounts').update(changes as never).eq('id', req.params.accountId)
      if (result.error) throw result.error
    }
    if (password) await revokeSessionsForSubject(`${kind}:${req.params.accountId}`)
    await audit(req as unknown as AuthedRequest, 'account.updated', req.params.accountId, kind)
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.post('/:accountId/toggle-disabled', async (req, res, next) => {
  try {
    const kind = accountKind(req.body?.account_type)
    const table = kind === 'staff' ? 'staff_accounts' : 'supplier_accounts'
    const current = await getSupabase().from(table).select('status').eq('id', req.params.accountId).maybeSingle()
    if (current.error) throw current.error
    if (!current.data) return res.status(404).json({ error: 'Account not found' })
    const status = (current.data as { status: string }).status === 'disabled' ? 'active' : 'disabled'
    const updated = await getSupabase().from(table).update({ status } as never).eq('id', req.params.accountId)
    if (updated.error) throw updated.error
    await revokeSessionsForSubject(`${kind}:${req.params.accountId}`)
    await audit(req as unknown as AuthedRequest, `account.${status}`, req.params.accountId, kind)
    res.json({ ok: true, status })
  } catch (err) { next(err) }
})

router.post('/import', async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body?.accounts) ? req.body.accounts.slice(0, 500) : []
    if (!rows.length) return res.status(400).json({ error: 'Excel file contains no accounts' })
    const supabase = getSupabase()
    const supplierResult = await supabase.from('suppliers').select('id, code').eq('active', true)
    if (supplierResult.error) throw supplierResult.error
    const supplierByCode = new Map((supplierResult.data ?? []).map((supplier) => [supplier.code.trim().toLowerCase(), supplier]))
    const normalized = (rows as Array<Record<string, unknown>>).map((raw, index) => ({
      row: index + 2,
      fullName: String(raw.full_name ?? '').trim(),
      username: String(raw.username ?? '').trim(),
      password: String(raw.password ?? ''),
      supplierCode: String(raw.supplier_code ?? '').trim(),
      role: importRole(raw.role),
    }))
    const validationErrors: string[] = []
    const occurrences = new Map<string, number>()
    for (const row of normalized) occurrences.set(row.username.toLowerCase(), (occurrences.get(row.username.toLowerCase()) ?? 0) + 1)
    for (const row of normalized) {
      if (!validBaseAccount(row.username, row.fullName, row.password) || row.password.length < 8) validationErrors.push(`Dòng ${row.row}: Dữ liệu tài khoản không hợp lệ`)
      if (!row.role) validationErrors.push(`Dòng ${row.row}: Vai trò không hợp lệ`)
      if (row.role === 'supplier' && !supplierByCode.has(row.supplierCode.toLowerCase())) validationErrors.push(`Dòng ${row.row}: Mã NCC không tồn tại (${row.supplierCode || 'trống'})`)
      if ((occurrences.get(row.username.toLowerCase()) ?? 0) > 1) validationErrors.push(`Dòng ${row.row}: Username bị trùng trong file (${row.username})`)
      if (await usernameTaken(row.username)) validationErrors.push(`Dòng ${row.row}: Username đã tồn tại (${row.username})`)
    }
    if (validationErrors.length) return res.status(400).json({ error: validationErrors.join('\n') })
    const supplierInserts: Array<Record<string, unknown>> = []
    const staffInserts: Array<Record<string, unknown>> = []
    const staffRoles = new Map<string, typeof STAFF_ROLES[number]>()
    for (const row of normalized) {
      const values = { full_name: row.fullName, username: row.username, password_hash: await hashPassword(row.password), password_ciphertext: encryptActualPassword(row.password), status: 'active' }
      if (row.role === 'supplier') {
        const supplier = supplierByCode.get(row.supplierCode.toLowerCase())!
        supplierInserts.push({ ...values, supplier_id: supplier.id, supplier_code_requested: supplier.code })
      } else if (row.role) {
        staffInserts.push(values)
        staffRoles.set(row.username, row.role)
      }
    }
    let created = 0
    if (supplierInserts.length) {
      const result = await supabase.from('supplier_accounts').insert(supplierInserts as never).select('id')
      if (result.error) throw result.error
      for (const account of (result.data ?? []) as Array<{ id: string }>) await audit(req as AuthedRequest, 'account.imported', account.id, 'supplier')
      created += result.data?.length ?? 0
    }
    if (staffInserts.length) {
      const result = await supabase.from('staff_accounts').insert(staffInserts as never).select('id, username')
      if (result.error) throw result.error
      const roleRows = ((result.data ?? []) as Array<{ id: string; username: string }>).map((account) => ({ staff_account_id: account.id, role: staffRoles.get(account.username)! }))
      const roleResult = await supabase.from('staff_account_roles').insert(roleRows as never)
      if (roleResult.error) throw roleResult.error
      for (const account of (result.data ?? []) as Array<{ id: string }>) await audit(req as AuthedRequest, 'account.imported', account.id, 'staff')
      created += result.data?.length ?? 0
    }
    res.status(201).json({ created })
  } catch (err) { next(err) }
})

router.delete('/:accountId', async (req, res, next) => {
  try {
    const kind = accountKind(req.body?.account_type)
    const table = kind === 'staff' ? 'staff_accounts' : 'supplier_accounts'
    const result = await getSupabase().from(table).update({ status: 'deleted', password_ciphertext: null } as never).eq('id', req.params.accountId)
    if (result.error) throw result.error
    await revokeSessionsForSubject(`${kind}:${req.params.accountId}`)
    await audit(req as unknown as AuthedRequest, 'account.deleted', req.params.accountId, kind)
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router

import { Router } from 'express'
import { requireAuth } from '../lib/httpAuth.js'
import { hashPassword } from '../lib/password.js'
import { getSupabase } from '../lib/supabase.js'
import { CAPABILITY_ROLES } from '../config/capabilities.js'

const router = Router()

router.use(requireAuth([...CAPABILITY_ROLES.manageAccounts]))

router.get('/', async (req, res, next) => {
  try {
    const status = String(req.query.status ?? 'all')
    if (!['all', 'pending', 'active', 'rejected'].includes(status)) {
      res.status(400).json({ error: 'Invalid account status' })
      return
    }
    let query = getSupabase()
      .from('supplier_accounts')
      .select('id, username, full_name, supplier_code_requested, supplier_id, status, created_at, suppliers(name)')
      .order('created_at', { ascending: false })
    if (status !== 'all') query = query.eq('status', status)
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

router.post('/:accountId/approve', async (req, res, next) => {
  try {
    const supplierId = String(req.body?.supplier_id ?? '').trim()
    if (!supplierId) {
      res.status(400).json({ error: 'Supplier is required' })
      return
    }
    const supabase = getSupabase()
    const { error } = await supabase.rpc('approve_supplier_account', {
      p_account_id: req.params.accountId,
      p_supplier_id: supplierId,
    } as never)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.post('/:accountId/reject', async (req, res, next) => {
  try {
    const reason = String(req.body?.reason ?? '').trim()
    if (!reason) {
      res.status(400).json({ error: 'Reason is required' })
      return
    }
    const supabase = getSupabase()
    const { error } = await supabase.rpc('reject_supplier_account', {
      p_account_id: req.params.accountId,
      p_reason: reason,
    } as never)
    if (error) throw error
    res.json({ ok: true })
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
      .update({ password_hash: passwordHash } as never)
      .eq('id', req.params.accountId)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.delete('/:accountId', async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { error } = await supabase.from('supplier_accounts').delete().eq('id', req.params.accountId)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router

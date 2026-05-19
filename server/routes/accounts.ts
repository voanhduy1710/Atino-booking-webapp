import { Router } from 'express'
import { requireAuth } from '../lib/httpAuth.js'
import { getSupabase } from '../lib/supabase.js'

const router = Router()

router.use(requireAuth(['admin']))

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
    const passwordHash = String(req.body?.password_hash ?? '').trim()
    const plaintextPassword = String(req.body?.plaintext_password ?? '').trim()
    if (!passwordHash || !plaintextPassword) {
      res.status(400).json({ error: 'Password is required' })
      return
    }
    const supabase = getSupabase()
    const { error } = await supabase.rpc('admin_reset_supplier_password', {
      p_account_id: req.params.accountId,
      p_password_hash: passwordHash,
      p_plaintext_password: plaintextPassword,
    } as never)
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

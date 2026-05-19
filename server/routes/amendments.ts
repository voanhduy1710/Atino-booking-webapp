import { Router } from 'express'
import { requireAuth, type AuthedRequest, usernameOf } from '../lib/httpAuth.js'
import { getSupabase } from '../lib/supabase.js'

const router = Router()

router.post('/bookings/:bookingId/request', requireAuth(['supplier']), async (req, res, next) => {
  try {
    const user = (req as unknown as AuthedRequest).user
    if (!user.supplier_account_id) {
      res.status(403).json({ error: 'Supplier account is required' })
      return
    }

    const type = String(req.body?.type ?? '').trim()
    const note = String(req.body?.note ?? '').trim()
    if (!type || !note) {
      res.status(400).json({ error: 'Type and note are required' })
      return
    }

    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('request_booking_amendment', {
      p_booking_id: req.params.bookingId,
      p_supplier_account_id: user.supplier_account_id,
      p_type: type,
      p_note: note,
      p_proposed_changes: req.body?.proposed_changes ?? null,
    } as never)
    if (error) throw error
    const result = data as { error?: string } | null
    if (result?.error) {
      res.status(400).json({ error: result.error })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.post('/:amendmentId/resolve', requireAuth(['admin', 'manager', 'warehouse_reviewer']), async (req, res, next) => {
  try {
    const decision = String(req.body?.decision ?? '').trim()
    const note = String(req.body?.note ?? '').trim()
    if (!['approved', 'denied'].includes(decision)) {
      res.status(400).json({ error: 'Decision is invalid' })
      return
    }
    if (decision === 'denied' && !note) {
      res.status(400).json({ error: 'Reason is required' })
      return
    }

    const supabase = getSupabase()
    const username = usernameOf((req as unknown as AuthedRequest).user)
    const { error } = await supabase.rpc('resolve_booking_amendment', {
      p_amendment_id: req.params.amendmentId,
      p_reviewer_username: username,
      p_decision: decision,
      p_note: note,
    } as never)
    if (error) throw error

    const amendment = await supabase
      .from('booking_amendments')
      .select('booking_id, amendment_type, bookings(booking_code, supplier_account_id)')
      .eq('id', req.params.amendmentId)
      .single()
    const row = amendment.data as {
      booking_id?: string
      amendment_type?: string
      bookings?: { booking_code?: string; supplier_account_id?: string } | null
    } | null
    if (row?.bookings?.supplier_account_id && row.booking_id) {
      const typeLabel = row.amendment_type === 'recall' ? 'huỷ' : 'chỉnh sửa'
      const statusLabel = decision === 'approved' ? 'chấp thuận' : 'từ chối'
      await supabase.from('notifications').insert({
        recipient_type: 'supplier_account',
        recipient_id: row.bookings.supplier_account_id,
        event_type: decision === 'approved' ? 'amendment_approved' : 'amendment_denied',
        message: `Yêu cầu ${typeLabel} booking ${row.bookings.booking_code ?? ''} đã được ${statusLabel}.`,
        booking_id: row.booking_id,
      } as never)
    }

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router

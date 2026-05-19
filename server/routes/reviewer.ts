import { Router } from 'express'
import { requireAuth, type AuthedRequest, usernameOf } from '../lib/httpAuth.js'
import { getSupabase } from '../lib/supabase.js'

const router = Router()

router.use(requireAuth(['admin', 'manager', 'warehouse_reviewer']))

async function notifyForItemAction(
  itemId: string,
  eventType: 'booking_confirmed' | 'booking_rejected' | 'booking_returned',
  messageFor: (bookingCode: string) => string
): Promise<void> {
  const supabase = getSupabase()
  const item = await supabase.from('booking_items').select('booking_id').eq('id', itemId).single()
  if (item.error || !item.data?.booking_id) return

  const booking = await supabase
    .from('bookings')
    .select('id, booking_code, supplier_account_id')
    .eq('id', item.data.booking_id)
    .single()
  if (booking.error || !booking.data?.supplier_account_id) return

  await supabase.from('notifications').insert({
    recipient_type: 'supplier_account',
    recipient_id: booking.data.supplier_account_id,
    event_type: eventType,
    message: messageFor(booking.data.booking_code),
    booking_id: booking.data.id,
  } as never)
}

router.post('/items/:itemId/confirm', async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const username = usernameOf((req as unknown as AuthedRequest).user)
    const { error } = await supabase.rpc('confirm_booking_item', {
      p_item_id: req.params.itemId,
      p_reviewer_username: username,
    } as never)
    if (error) throw error
    await notifyForItemAction(req.params.itemId, 'booking_confirmed', (code) => `Đơn ${code} có sản phẩm đã được duyệt.`)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.post('/items/:itemId/reject', async (req, res, next) => {
  try {
    const reason = String(req.body?.reason ?? '').trim()
    if (!reason) {
      res.status(400).json({ error: 'Reason is required' })
      return
    }
    const supabase = getSupabase()
    const username = usernameOf((req as unknown as AuthedRequest).user)
    const { error } = await supabase.rpc('reject_booking_item', {
      p_item_id: req.params.itemId,
      p_reason: reason,
      p_reviewer_username: username,
    } as never)
    if (error) throw error
    await notifyForItemAction(req.params.itemId, 'booking_rejected', (code) => `Đơn ${code} có sản phẩm bị từ chối. Lý do: ${reason}`)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.post('/items/:itemId/return', async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const username = usernameOf((req as unknown as AuthedRequest).user)
    const { error } = await supabase.rpc('return_booking_item', {
      p_item_id: req.params.itemId,
      p_reason: req.body?.reason ?? null,
      p_reviewer_username: username,
    } as never)
    if (error) throw error
    await notifyForItemAction(req.params.itemId, 'booking_returned', (code) => `Đơn ${code} có sản phẩm bị trả hàng.`)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.post('/items/:itemId/revert', async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const username = usernameOf((req as unknown as AuthedRequest).user)
    const { data, error } = await supabase.rpc('revert_booking_item', {
      p_item_id: req.params.itemId,
      p_reviewer_username: username,
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

router.delete('/bookings/:bookingId', async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { error } = await supabase.rpc('admin_delete_booking', { p_booking_id: req.params.bookingId } as never)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.post('/bookings/:bookingId/draft-bill', async (req, res, next) => {
  try {
    const value = String(req.body?.nhanh_draft_bill_id ?? '').trim() || null
    const supabase = getSupabase()
    const { error } = await supabase
      .from('bookings')
      .update({ nhanh_draft_bill_id: value })
      .eq('id', req.params.bookingId)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router

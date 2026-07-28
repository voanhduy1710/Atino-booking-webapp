import { Router } from 'express'
import { requireAuth, type AuthedRequest } from '../lib/httpAuth.js'
import { getSupabase } from '../lib/supabase.js'

const router = Router()

router.use(requireAuth())

function recipientId(req: AuthedRequest): string | null {
  const user = req.user
  return user.role === 'supplier'
    ? (user.supplier_account_id ?? null)
    : (user.sub ?? user.username ?? null)
}

router.get('/', async (req, res, next) => {
  try {
    const id = recipientId(req as unknown as AuthedRequest)
    if (!id) {
      res.status(403).json({ error: 'Recipient is required' })
      return
    }
    const { data, error } = await getSupabase()
      .from('notifications')
      .select('id, recipient_type, recipient_id, event_type, message, booking_id, is_read, created_at')
      .eq('recipient_id', id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    res.json({ notifications: data ?? [] })
  } catch (err) {
    next(err)
  }
})

router.get('/unread-count', async (req, res, next) => {
  try {
    const id = recipientId(req as unknown as AuthedRequest)
    if (!id) {
      res.status(403).json({ error: 'Recipient is required' })
      return
    }
    const { count, error } = await getSupabase()
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', id)
      .eq('is_read', false)
    if (error) throw error
    res.json({ count: count ?? 0 })
  } catch (err) {
    next(err)
  }
})

router.get('/:notificationId/booking-link', async (req, res, next) => {
  try {
    const id = recipientId(req as unknown as AuthedRequest)
    if (!id) {
      res.status(403).json({ error: 'Recipient is required' })
      return
    }
    const { data, error } = await getSupabase()
      .from('notifications')
      .select('booking_id, bookings(booking_token)')
      .eq('id', req.params.notificationId)
      .eq('recipient_id', id)
      .single()
    if (error || !data) {
      res.status(404).json({ error: 'Notification not found' })
      return
    }
    const row = data as { bookings?: { booking_token?: string } | null }
    res.json({ booking_token: row.bookings?.booking_token ?? null })
  } catch (err) {
    next(err)
  }
})

router.post('/read', async (req, res, next) => {
  try {
    const id = recipientId(req as unknown as AuthedRequest)
    if (!id) {
      res.status(403).json({ error: 'Recipient is required' })
      return
    }

    const notificationId = String(req.body?.notification_id ?? '').trim()
    const supabase = getSupabase()
    const query = supabase.from('notifications').update({ is_read: true } as never)
    const result = notificationId === 'all'
      ? await query.eq('recipient_id', id).eq('is_read', false)
      : await query.eq('id', notificationId).eq('recipient_id', id)
    if (result.error) throw result.error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router

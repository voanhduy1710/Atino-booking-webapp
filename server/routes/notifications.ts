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

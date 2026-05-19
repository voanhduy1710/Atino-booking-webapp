import { Router } from 'express'
import { requireAuth, type AuthedRequest, usernameOf } from '../lib/httpAuth.js'
import { getSupabase } from '../lib/supabase.js'

const router = Router()

router.use(requireAuth(['admin', 'manager', 'warehouse_receiver']))

router.get('/bookings/:token', async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const token = req.params.token
    const { data, error } = await supabase
      .from('bookings')
      .select('*, suppliers!inner(name), warehouses!inner(name), booking_items(*)')
      .eq('booking_token', token)
      .single()
    if (error || !data) {
      res.status(404).json({ error: 'Không tìm thấy booking' })
      return
    }
    res.json({ booking: data })
  } catch (err) {
    next(err)
  }
})

router.post('/bookings/:token/receive', async (req, res, next) => {
  try {
    const quantities = req.body?.quantities
    if (!quantities || typeof quantities !== 'object') {
      res.status(400).json({ error: 'Quantities are required' })
      return
    }
    const supabase = getSupabase()
    const username = usernameOf((req as unknown as AuthedRequest).user)
    const { error } = await supabase.rpc('receive_booking', {
      p_booking_token: req.params.token,
      p_quantities: quantities,
      p_receiver_username: username,
    } as never)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router

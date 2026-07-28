import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthedRequest, usernameOf } from '../lib/httpAuth.js'
import { getSupabase } from '../lib/supabase.js'
import { CAPABILITY_ROLES } from '../config/capabilities.js'

const router = Router()
const tokenSchema = z.string().uuid()
const receiveSchema = z.object({
  quantities: z.record(z.string().uuid(), z.number().int().nonnegative().max(1_000_000)),
})

router.use(requireAuth([...CAPABILITY_ROLES.receiveBookings]))

router.get('/bookings/:token', async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const token = tokenSchema.safeParse(req.params.token)
    if (!token.success) {
      res.status(404).json({ error: 'Không tìm thấy booking' })
      return
    }
    const { data, error } = await supabase
      .from('bookings')
      .select('id, booking_code, booking_token, delivery_date, time_slot, status, ghi_chu, suppliers!inner(name), warehouses!inner(name), booking_items(id, product_code, process_code, delivery_round, is_final_round, quantity_booked, quantity_received, status)')
      .eq('booking_token', token.data)
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
    const token = tokenSchema.safeParse(req.params.token)
    const parsed = receiveSchema.safeParse(req.body)
    if (!token.success || !parsed.success) {
      res.status(400).json({ error: 'Quantities are required' })
      return
    }
    const supabase = getSupabase()
    const username = usernameOf((req as unknown as AuthedRequest).user)
    const { error } = await supabase.rpc('receive_booking', {
      p_booking_token: token.data,
      p_quantities: parsed.data.quantities,
      p_receiver_username: username,
    } as never)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router

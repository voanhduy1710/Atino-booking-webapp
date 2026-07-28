import { Router } from 'express'
import { z } from 'zod'
import { authenticatedUser } from '../lib/httpAuth.js'
import { getSupabase } from '../lib/supabase.js'
import { signBookingMedia } from '../lib/mediaDto.js'

const router = Router()
const tokenSchema = z.string().uuid()

router.get('/:token', async (req, res, next) => {
  try {
    const token = tokenSchema.safeParse(req.params.token)
    if (!token.success) {
      res.status(404).json({ error: 'Booking not found' })
      return
    }
    const { data, error } = await getSupabase()
      .from('bookings')
      .select(`
        id, booking_code, booking_token, supplier_account_id, delivery_date, time_slot, status,
        submitted_at, ghi_chu,
        suppliers(name, code),
        warehouses(name, code),
        booking_items(
          id, product_code, process_code, delivery_round, is_final_round,
          quantity_booked, quantity_received, status, vat_invoice_url,
          booking_item_photos(id, storage_path, photo_type)
        )
      `)
      .eq('booking_token', token.data)
      .single()
    if (error || !data) {
      res.status(404).json({ error: 'Booking not found' })
      return
    }

    const principal = authenticatedUser(req)
    const isOwner = principal?.role === 'supplier'
      && principal.supplier_account_id === data.supplier_account_id

    res.setHeader('Cache-Control', 'no-store')
    const signedBooking = await signBookingMedia(data as Record<string, any>)
    const { supplier_account_id: _supplierAccountId, ...publicBooking } = signedBooking
    void _supplierAccountId
    res.json({
      booking: {
        ...publicBooking,
        supplier_account_id: isOwner ? data.supplier_account_id : null,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router

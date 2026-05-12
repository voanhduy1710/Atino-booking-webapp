/**
 * server/routes/booking.ts
 * POST /api/booking/finalize
 *
 * Migrated from supabase/functions/finalize-booking/index.ts
 * Verifies supplier JWT, inserts bookings + items + photos, notifies reviewer.
 */

import { Router, Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { verifyJWT } from '../lib/jwt.js'

const router = Router()

const GCS_BUCKET = 'atino-media'
const GCS_PREFIX = 'duy_booking_images'

function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

interface PoItem {
  product_code: string
  process_code: string
  delivery_round: number
  is_final_round: boolean
  quantity_booked: number
  vat_temp_paths?: string[]
  slip_temp_paths?: string[]
}

interface FinalizeBody {
  warehouse_id: string
  time_slot: string
  ghi_chu?: string
  delivery_note: string
  session_id: string
  items: PoItem[]
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.authorization ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const token = authHeader.slice(7)
  const payload = verifyJWT(token)
  if (!payload || payload.role !== 'supplier') {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const supabase = getSupabase()

    // ── Verify account status ────────────────────────────────────────────────
    const { data: account } = await supabase
      .from('supplier_accounts')
      .select('status, supplier_id')
      .eq('id', payload.supplier_account_id)
      .single()

    if (!account || account.status !== 'active') {
      res.status(403).json({ error: 'Tài khoản chưa được kích hoạt' })
      return
    }

    const body = req.body as FinalizeBody

    // ── Insert booking ────────────────────────────────────────────────────────
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        supplier_account_id: payload.supplier_account_id,
        supplier_id: account.supplier_id,
        warehouse_id: body.warehouse_id,
        time_slot: body.time_slot,
        ghi_chu: body.ghi_chu ?? null,
        delivery_note: body.delivery_note,
      })
      .select('id, booking_code, booking_token, delivery_date')
      .single()

    if (bookingError || !booking) {
      console.error('[booking] insert error:', bookingError)
      res.status(500).json({ error: bookingError?.message ?? 'Lỗi tạo booking' })
      return
    }

    // ── Insert items + photos ─────────────────────────────────────────────────
    for (const item of body.items) {
      const { data: ins, error: ie } = await supabase
        .from('booking_items')
        .insert({
          booking_id: booking.id,
          product_code: item.product_code,
          process_code: item.process_code,
          delivery_round: item.delivery_round,
          is_final_round: item.is_final_round ?? false,
          quantity_booked: item.quantity_booked,
          vat_invoice_url: item.vat_temp_paths?.[0]
            ? `https://storage.googleapis.com/${GCS_BUCKET}/${GCS_PREFIX}/${item.vat_temp_paths[0]}`
            : null,
        })
        .select('id')
        .single()

      if (ie || !ins) {
        console.error('[booking] item insert error:', ie)
        continue
      }

      const photoPaths = [
        ...(item.slip_temp_paths ?? []).map((p) => ({ path: p, type: 'delivery_slip' as const })),
        ...(item.vat_temp_paths ?? []).map((p) => ({ path: p, type: 'vat_invoice' as const })),
      ]

      for (const { path, type } of photoPaths) {
        const url = path.startsWith('https://')
          ? path
          : `https://storage.googleapis.com/${GCS_BUCKET}/${GCS_PREFIX}/${path}`
        await supabase.from('booking_item_photos').insert({
          booking_item_id: ins.id,
          storage_path: url,
          photo_type: type,
        })
      }
    }

    // ── Notify all staff ──────────────────────────────────────────────────────
    const { data: sup } = await supabase
      .from('suppliers')
      .select('name')
      .eq('id', account.supplier_id)
      .single()

    const STAFF_RECIPIENTS = ['voanhduy1710', 'lethientinh', 'lethiendung', 'lethihong']
    const notificationMessage = `Có booking mới từ ${sup?.name ?? 'NCC'}: ${booking.booking_code}`

    await supabase.from('notifications').insert(
      STAFF_RECIPIENTS.map((username) => ({
        recipient_type: 'staff',
        recipient_id: username,
        event_type: 'booking_submitted',
        message: notificationMessage,
        booking_id: booking.id,
      }))
    )

    res.json({
      booking_code: booking.booking_code,
      booking_token: booking.booking_token,
      delivery_date: booking.delivery_date,
    })
  } catch (err) {
    const msg = (err as Error).message ?? String(err)
    console.error('[booking] error:', err)
    res.status(500).json({ error: msg })
  }
})

export default router

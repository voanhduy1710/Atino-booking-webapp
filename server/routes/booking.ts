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
import ws from 'ws'

const router = Router()

const GCS_BUCKET = 'atino-media'
const GCS_PREFIX = 'duy_booking_images'

function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key, { realtime: { transport: ws as any } })
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
  supplier_account_id?: string
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
  if (!payload || !['supplier', 'admin'].includes(payload.role)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  console.log(`[booking:${req.id}] auth OK role=${payload.role}`)

  try {
    const supabase = getSupabase()
    const body = req.body as FinalizeBody
    const supplierAccountId = payload.role === 'admin' ? body.supplier_account_id : payload.supplier_account_id
    console.log(`[booking:${req.id}] supplier_account_id=${supplierAccountId ?? 'none'}`)

    if (!supplierAccountId) {
      res.status(400).json({ error: 'Vui lòng chọn tài khoản nhà cung cấp' })
      return
    }

    // ── Verify account status ────────────────────────────────────────────────
    const { data: account } = await supabase
      .from('supplier_accounts')
      .select('status, supplier_id')
      .eq('id', supplierAccountId)
      .single()

    if (!account || account.status !== 'active') {
      res.status(403).json({ error: 'Tài khoản chưa được kích hoạt' })
      return
    }
    if (!account.supplier_id) {
      res.status(400).json({ error: 'Tài khoản nhà cung cấp chưa được gán NCC' })
      return
    }
    console.log(`[booking:${req.id}] account verified supplier_id=${account.supplier_id} status=${account.status}`)

    // ── Insert booking ────────────────────────────────────────────────────────
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        supplier_account_id: supplierAccountId,
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
    console.log(`[booking:${req.id}] booking created code=${booking.booking_code} id=${booking.id}`)

    // ── Insert items + photos ─────────────────────────────────────────────────
    for (const item of body.items) {
      console.log(`[booking:${req.id}] item ${item.product_code}/${item.process_code} qty=${item.quantity_booked}`)
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
        console.error(`[booking:${req.id}] item insert FAILED ${item.product_code}/${item.process_code}: ${ie?.message}`)
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
    console.log(`[booking:${req.id}] notified ${STAFF_RECIPIENTS.length} staff`)
    console.log(`[booking:${req.id}] DONE code=${booking.booking_code}`)

    res.json({
      booking_code: booking.booking_code,
      booking_token: booking.booking_token,
      delivery_date: booking.delivery_date,
    })
  } catch (err) {
    const msg = (err as Error).message ?? String(err)
    console.error(`[booking:${req.id}] FATAL: ${(err as Error).message}`)
    if ((err as Error).stack) console.error((err as Error).stack)
    res.status(500).json({ error: msg })
  }
})

export default router

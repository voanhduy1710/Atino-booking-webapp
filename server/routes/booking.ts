import { Router, Request, Response } from 'express'
import { verifyJWT } from '../lib/jwt.js'
import { buildGcsPublicUrl } from '../config/storage.js'
import { getSupabase } from '../lib/supabase.js'

const router = Router()

const STAFF_RECIPIENTS = (process.env.STAFF_NOTIFICATION_RECIPIENTS ?? 'voanhduy1710,lethientinh,lethiendung,lethihong')
  .split(',')
  .map((recipient) => recipient.trim())
  .filter(Boolean)

const MAX_DAILY_TOTAL_QUANTITY = 20_000
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000

interface PoItem {
  product_code: string
  process_code: string
  warehouse_code?: string | null
  mau?: string | null
  delivery_round: number
  is_final_round: boolean
  quantity_booked?: number
  total_quantity?: number
  size_s_28?: number | null
  size_m_29?: number | null
  size_l_30?: number | null
  size_xl_31?: number | null
  size_2xl_32?: number | null
  size_3xl_33?: number | null
  vat_temp_paths?: string[]
  slip_temp_paths?: string[]
}

interface FinalizeBody {
  supplier_account_id?: string
  warehouse_id: string
  delivery_date: string
  time_slot: string
  ghi_chu?: string
  delivery_note: string
  session_id: string
  items: PoItem[]
}

function isoDateInICT(offsetDays: number): string {
  const now = new Date(Date.now() + ICT_OFFSET_MS)
  now.setUTCDate(now.getUTCDate() + offsetDays)
  return now.toISOString().slice(0, 10)
}

function deliveryWindow(): { minISO: string; maxISO: string } {
  const now = new Date(Date.now() + ICT_OFFSET_MS)
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes()
  const beforeOrAtCutoff = minutes <= (17 * 60 + 30)
  return {
    minISO: isoDateInICT(beforeOrAtCutoff ? 1 : 2),
    maxISO: isoDateInICT(beforeOrAtCutoff ? 3 : 4),
  }
}

function addISODateDays(dateISO: string, days: number): string {
  const date = new Date(`${dateISO}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function itemTotal(item: PoItem): number {
  const sizeTotal =
    Number(item.size_s_28 ?? 0) +
    Number(item.size_m_29 ?? 0) +
    Number(item.size_l_30 ?? 0) +
    Number(item.size_xl_31 ?? 0) +
    Number(item.size_2xl_32 ?? 0) +
    Number(item.size_3xl_33 ?? 0)
  return sizeTotal > 0 ? sizeTotal : Number(item.total_quantity ?? item.quantity_booked ?? 0)
}

function isMissingColumnError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string }
  const text = `${candidate.message ?? ''} ${candidate.details ?? ''}`.toLowerCase()
  return candidate.code === 'PGRST204' || text.includes('schema cache') || text.includes('does not exist') || text.includes('could not find the')
}

async function usedQuantityForDate(deliveryDate: string): Promise<number> {
  const supabase = getSupabase()
  const current = await supabase
    .from('bookings')
    .select('booking_items(total_quantity, quantity_booked)')
    .eq('delivery_date', deliveryDate)
    .neq('status', 'cancelled')
  if (!current.error) {
    return (current.data ?? []).reduce((sum: number, booking: any) => {
      return sum + (booking.booking_items ?? []).reduce((itemSum: number, item: any) => {
        return itemSum + Number(item.total_quantity ?? item.quantity_booked ?? 0)
      }, 0)
    }, 0)
  }
  if (!isMissingColumnError(current.error)) throw current.error

  const { data, error } = await supabase
    .from('bookings')
    .select('booking_items(quantity_booked)')
    .eq('delivery_date', deliveryDate)
    .neq('status', 'cancelled')
  if (error) throw error
  return (data ?? []).reduce((sum: number, booking: any) => {
    return sum + (booking.booking_items ?? []).reduce((itemSum: number, item: any) => {
      return itemSum + Number(item.quantity_booked ?? 0)
    }, 0)
  }, 0)
}

async function insertBookingItem(bookingId: string, item: PoItem, total: number) {
  const supabase = getSupabase()
  const fullPayload = {
    booking_id: bookingId,
    product_code: item.product_code,
    process_code: item.process_code,
    warehouse_code: item.warehouse_code ?? null,
    mau: item.mau ?? null,
    delivery_round: item.delivery_round,
    is_final_round: item.is_final_round ?? false,
    quantity_booked: total,
    total_quantity: total,
    size_s_28: Number(item.size_s_28 ?? 0),
    size_m_29: Number(item.size_m_29 ?? 0),
    size_l_30: Number(item.size_l_30 ?? 0),
    size_xl_31: Number(item.size_xl_31 ?? 0),
    size_2xl_32: Number(item.size_2xl_32 ?? 0),
    size_3xl_33: Number(item.size_3xl_33 ?? 0),
    vat_invoice_url: item.vat_temp_paths?.[0] ? buildGcsPublicUrl(item.vat_temp_paths[0]) : null,
  }

  const full = await supabase
    .from('booking_items')
    .insert(fullPayload)
    .select('id')
    .single()
  if (!full.error) return full
  if (!isMissingColumnError(full.error)) return full

  const legacyPayload = {
    booking_id: bookingId,
    product_code: item.product_code,
    process_code: item.process_code,
    delivery_round: item.delivery_round,
    is_final_round: item.is_final_round ?? false,
    quantity_booked: total,
    vat_invoice_url: item.vat_temp_paths?.[0] ? buildGcsPublicUrl(item.vat_temp_paths[0]) : null,
  }
  return supabase
    .from('booking_items')
    .insert(legacyPayload)
    .select('id')
    .single()
}

async function resolveCapacityDate(requestedDate: string, requestedTotal: number): Promise<string> {
  const { minISO, maxISO } = deliveryWindow()
  if (requestedDate < minISO || requestedDate > maxISO) {
    throw new Error(`Ngày giao hàng phải nằm trong khoảng ${minISO} đến ${maxISO}`)
  }

  let date = requestedDate
  while (date <= maxISO) {
    const used = await usedQuantityForDate(date)
    if (used + requestedTotal <= MAX_DAILY_TOTAL_QUANTITY) return date
    date = addISODateDays(date, 1)
  }
  throw new Error(`Tổng số lượng vượt ${MAX_DAILY_TOTAL_QUANTITY} trong tất cả ngày được phép`)
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
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
    if (!body.delivery_date) {
      res.status(400).json({ error: 'Vui lòng chọn ngày đăng ký giao hàng' })
      return
    }

    const { data: account } = await supabase
      .from('supplier_accounts')
      .select('status, supplier_id')
      .eq('id', supplierAccountId)
      .single()

    if (!account || account.status !== 'active') {
      res.status(403).json({ error: 'Tai khoan chua duoc kich hoat' })
      return
    }
    if (!account.supplier_id) {
      res.status(400).json({ error: 'Tai khoan nha cung cap chua duoc gan NCC' })
      return
    }

    const totalRequested = (body.items ?? []).reduce((sum, item) => sum + itemTotal(item), 0)
    const deliveryDate = await resolveCapacityDate(body.delivery_date, totalRequested)

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        supplier_account_id: supplierAccountId,
        supplier_id: account.supplier_id,
        warehouse_id: body.warehouse_id,
        delivery_date: deliveryDate,
        time_slot: body.time_slot,
        ghi_chu: body.ghi_chu ?? null,
        delivery_note: body.delivery_note,
      })
      .select('id, booking_code, booking_token, delivery_date')
      .single()

    if (bookingError || !booking) {
      console.error('[booking] insert error:', bookingError)
      res.status(500).json({ error: bookingError?.message ?? 'Loi tao booking' })
      return
    }

    for (const item of body.items) {
      const total = itemTotal(item)
      console.log(`[booking:${req.id}] item ${item.product_code}/${item.process_code} qty=${total}`)
      const { data: ins, error: ie } = await insertBookingItem(booking.id, item, total)

      if (ie || !ins) {
        console.error(`[booking:${req.id}] item insert FAILED ${item.product_code}/${item.process_code}: ${ie?.message}`)
        throw ie ?? new Error('Loi tao booking item')
      }

      const photoPaths = [
        ...(item.slip_temp_paths ?? []).map((p) => ({ path: p, type: 'delivery_slip' as const })),
        ...(item.vat_temp_paths ?? []).map((p) => ({ path: p, type: 'vat_invoice' as const })),
      ]

      for (const { path, type } of photoPaths) {
        const url = buildGcsPublicUrl(path)
        await supabase.from('booking_item_photos').insert({
          booking_item_id: ins.id,
          storage_path: url,
          photo_type: type,
        })
      }
    }

    const { data: sup } = await supabase
      .from('suppliers')
      .select('name')
      .eq('id', account.supplier_id)
      .single()

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
      requested_delivery_date: body.delivery_date,
      adjusted_delivery_date: deliveryDate !== body.delivery_date ? deliveryDate : null,
    })
  } catch (err) {
    const msg = (err as Error).message ?? String(err)
    console.error(`[booking:${req.id}] FATAL: ${msg}`)
    if ((err as Error).stack) console.error((err as Error).stack)
    res.status(500).json({ error: msg })
  }
})

export default router

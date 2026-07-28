import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthedRequest, usernameOf } from '../lib/httpAuth.js'
import { getSupabase } from '../lib/supabase.js'
import { signBookingMedia } from '../lib/mediaDto.js'
import { CAPABILITY_ROLES } from '../config/capabilities.js'

const router = Router()
const reportDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  })

async function legacyReport(dateFrom?: string, dateTo?: string) {
  let query = getSupabase()
    .from('bookings')
    .select('id, status, delivery_date, suppliers!inner(name), booking_items(id, status)')
    .order('delivery_date', { ascending: true })
    .limit(5000)
  if (dateFrom) query = query.gte('delivery_date', dateFrom)
  if (dateTo) query = query.lte('delivery_date', dateTo)
  const { data, error } = await query
  if (error) throw error

  const byStatus: Record<string, number> = {}
  const daily = new Map<string, { date: string; total: number; statuses: Record<string, number>; total_items: number; confirmed: number; rejected: number; pending: number }>()
  const suppliers = new Map<string, number>()
  let totalItems = 0

  for (const booking of (data ?? []) as unknown as Array<{ status: string; delivery_date: string; suppliers: Array<{ name: string }> | null; booking_items: Array<{ status: string }> | null }>) {
    const items = booking.booking_items ?? []
    const counts = {
      pending: items.filter((item) => item.status === 'pending').length,
      confirmed: items.filter((item) => item.status === 'confirmed').length,
      rejected: items.filter((item) => item.status === 'rejected').length,
      returned: items.filter((item) => item.status === 'returned').length,
    }
    let status = booking.status
    if (!['cancelled', 'received'].includes(status)) {
      if (items.length === 0 || counts.pending === items.length) status = 'pending'
      else if (counts.returned > 0) status = 'returned'
      else if (counts.confirmed === items.length) status = 'confirmed'
      else if (counts.rejected === items.length) status = 'rejected'
      else if (counts.confirmed > 0) status = 'partially_approved'
      else status = 'partially_rejected'
    }
    byStatus[status] = (byStatus[status] ?? 0) + 1
    totalItems += items.length
    const day = daily.get(booking.delivery_date) ?? {
      date: booking.delivery_date, total: 0, statuses: {}, total_items: 0, confirmed: 0, rejected: 0, pending: 0,
    }
    day.total += 1
    day.statuses[status] = (day.statuses[status] ?? 0) + 1
    day.total_items += items.length
    day.confirmed += counts.confirmed
    day.rejected += counts.rejected
    day.pending += counts.pending
    daily.set(booking.delivery_date, day)
    const supplierName = booking.suppliers?.[0]?.name ?? '—'
    suppliers.set(supplierName, (suppliers.get(supplierName) ?? 0) + 1)
  }

  return {
    total: data?.length ?? 0,
    total_items: totalItems,
    by_status: byStatus,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    suppliers: [...suppliers].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
  }
}

router.use(requireAuth([...CAPABILITY_ROLES.reviewBookings]))

router.get('/suppliers', async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase().from('suppliers').select('id, name').order('name')
    if (error) throw error
    res.json({ suppliers: data ?? [] })
  } catch (err) {
    next(err)
  }
})

router.get('/bookings', async (req, res, next) => {
  try {
    const dateFrom = String(req.query.date_from ?? '').trim()
    const dateTo = String(req.query.date_to ?? '').trim()
    const search = String(req.query.search ?? '').trim().slice(0, 100)
    const supplierId = String(req.query.supplier_id ?? '').trim()
    const status = String(req.query.status ?? '').trim()
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.page_size ?? '20'), 10) || 20))
    if (status && !['pending', 'confirmed', 'rejected', 'returned'].includes(status)) {
      res.status(400).json({ error: 'Invalid booking status' })
      return
    }
    const select = status
      ? 'id, booking_code, booking_token, supplier_account_id, delivery_date, time_slot, status, submitted_at, ghi_chu, nhanh_draft_bill_id, suppliers!inner(name, code), warehouses!inner(name), matching_items:booking_items!inner(status), booking_items(id, status, reject_reason, product_code, process_code, warehouse_code, mau, total_quantity, quantity_booked)'
      : 'id, booking_code, booking_token, supplier_account_id, delivery_date, time_slot, status, submitted_at, ghi_chu, nhanh_draft_bill_id, suppliers!inner(name, code), warehouses!inner(name), booking_items(id, status, reject_reason, product_code, process_code, warehouse_code, mau, total_quantity, quantity_booked)'
    let query = getSupabase()
      .from('bookings')
      .select(select, { count: 'exact' })
      .order('submitted_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (dateFrom) query = query.gte('delivery_date', dateFrom)
    if (dateTo) query = query.lte('delivery_date', dateTo)
    if (search) query = query.ilike('booking_code', `%${search.replace(/[%_]/g, '')}%`)
    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (status) query = query.eq('matching_items.status', status)
    const { data, error, count } = await query
    if (error) throw error
    res.json({ bookings: data ?? [], total: count ?? 0, page, page_size: pageSize })
  } catch (err) {
    next(err)
  }
})

router.get('/bookings/:bookingId', async (req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from('bookings')
      .select('id, booking_code, booking_token, supplier_account_id, supplier_id, warehouse_id, delivery_date, time_slot, status, submitted_at, ghi_chu, delivery_note, nhanh_draft_bill_id, suppliers(name, code), warehouses(name, code), booking_items(id, product_code, process_code, warehouse_code, mau, delivery_round, is_final_round, quantity_booked, total_quantity, quantity_received, size_s_28, size_m_29, size_l_30, size_xl_31, size_2xl_32, size_3xl_33, status, reject_reason, vat_invoice_url, booking_item_photos(id, storage_path, photo_type))')
      .eq('id', req.params.bookingId)
      .single()
    if (error || !data) {
      res.status(404).json({ error: 'Booking not found' })
      return
    }
    res.json({ booking: await signBookingMedia(data as Record<string, any>) })
  } catch (err) {
    next(err)
  }
})

router.get('/report', async (req, res, next) => {
  try {
    const parsed = z.object({
      date_from: reportDate.optional(),
      date_to: reportDate.optional(),
    }).safeParse({
      date_from: String(req.query.date_from ?? '').trim() || undefined,
      date_to: String(req.query.date_to ?? '').trim() || undefined,
    })
    if (!parsed.success || (parsed.data.date_from && parsed.data.date_to && parsed.data.date_from > parsed.data.date_to)) {
      res.status(400).json({ error: 'Invalid report date range' })
      return
    }
    const { data, error } = await getSupabase().rpc('get_booking_report', {
      p_date_from: parsed.data.date_from ?? null,
      p_date_to: parsed.data.date_to ?? null,
    } as never)
    if (error) {
      const message = (error as { message?: string }).message ?? ''
      const missingReportRpc = (error as { code?: string }).code === 'PGRST202' || message.includes('public.get_booking_report')
      if (process.env.NODE_ENV === 'production' || !missingReportRpc) throw error
      res.json(await legacyReport(parsed.data.date_from, parsed.data.date_to))
      return
    }
    res.json(data ?? {
      total: 0,
      total_items: 0,
      by_status: {},
      daily: [],
      suppliers: [],
    })
  } catch (err) {
    next(err)
  }
})

router.get('/admin-view', requireAuth(['admin']), async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from('bookings')
      .select('id, booking_code, booking_token, delivery_date, time_slot, status, submitted_at, ghi_chu, suppliers!inner(name), warehouses!inner(name), booking_items(status, reject_reason)')
      .order('submitted_at', { ascending: false })
      .limit(200)
    if (error) throw error
    res.json({ bookings: data ?? [] })
  } catch (err) {
    next(err)
  }
})

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

router.delete('/bookings/:bookingId', requireAuth(['admin']), async (req, res, next) => {
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

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthedRequest } from '../lib/httpAuth.js'
import { getSupabase } from '../lib/supabase.js'
import { logger } from '../lib/logger.js'
import { GCS_PREFIX } from '../config/storage.js'

const router = Router()

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

const STAFF_RECIPIENTS = (process.env.STAFF_NOTIFICATION_RECIPIENTS ?? 'voanhduy1710,lethientinh,lethiendung,lethihong')
  .split(',')
  .map((recipient) => recipient.trim())
  .filter(Boolean)

const MAX_DAILY_TOTAL_QUANTITY = 20_000
const DELIVERY_WINDOW_EXTENSION_THRESHOLD = 18_000
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000
const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/
const capacityCache = new Map<string, { expiresAt: number; values: Map<string, number> }>()

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
  size_4xl_34?: number | null
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

const TIME_SLOT_REQUIRED_MESSAGE = 'Vui lòng chọn khung giờ giao hàng (08:00–11:30 hoặc 13:30–17:00)'
const nonNegativeNumber = z.number().finite().int().nonnegative().max(1_000_000)
const bookingItemSchema = z.object({
  product_code: z.string().trim().min(1).max(100),
  process_code: z.string().trim().min(1).max(100),
  warehouse_code: z.string().trim().max(100).nullable().optional(),
  mau: z.string().trim().max(200).nullable().optional(),
  delivery_round: z.number().int().min(1).max(100),
  is_final_round: z.boolean().default(false),
  quantity_booked: nonNegativeNumber.optional(),
  total_quantity: nonNegativeNumber.optional(),
  size_s_28: nonNegativeNumber.nullable().optional(),
  size_m_29: nonNegativeNumber.nullable().optional(),
  size_l_30: nonNegativeNumber.nullable().optional(),
  size_xl_31: nonNegativeNumber.nullable().optional(),
  size_2xl_32: nonNegativeNumber.nullable().optional(),
  size_3xl_33: nonNegativeNumber.nullable().optional(),
  size_4xl_34: nonNegativeNumber.nullable().optional(),
  vat_temp_paths: z.array(z.string().regex(/^(?:[A-Za-z0-9_-]+\/)?uploads\/[A-Za-z0-9_/-]+\.(jpg|png|pdf)$/)).max(10).optional(),
  slip_temp_paths: z.array(z.string().regex(/^(?:[A-Za-z0-9_-]+\/)?uploads\/[A-Za-z0-9_/-]+\.(jpg|png|pdf)$/)).max(10).optional(),
})
export const finalizeSchema = z.object({
  supplier_account_id: z.string().uuid().optional(),
  warehouse_id: z.string().uuid(),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_slot: z.enum(['08-1130', '1330-17'], {
    errorMap: () => ({ message: TIME_SLOT_REQUIRED_MESSAGE }),
  }),
  ghi_chu: z.string().trim().max(2_000).nullable().optional(),
  delivery_note: z.string().trim().min(1).max(2_000),
  session_id: z.string().uuid(),
  items: z.array(bookingItemSchema).min(1).max(100),
}).superRefine((body, ctx) => {
  let requestedTotal = 0

  body.items.forEach((item, index) => {
    const total = itemTotal(item)
    requestedTotal += total
    if (!Number.isSafeInteger(total) || total <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Dòng ${index + 1}: Tổng số lượng phải lớn hơn 0`,
        path: ['items', index, 'total_quantity'],
      })
    }
  })

  if (requestedTotal > MAX_DAILY_TOTAL_QUANTITY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Tổng số lượng ${requestedTotal.toLocaleString('vi-VN')} vượt giới hạn ${MAX_DAILY_TOTAL_QUANTITY.toLocaleString('vi-VN')} sản phẩm cho một booking`,
      path: ['items'],
    })
  }
})

export function bookingRequestError(error: z.ZodError): string {
  const issue = error.issues[0]
  const field = issue?.path[0]
  if (field === 'time_slot') return TIME_SLOT_REQUIRED_MESSAGE
  if (issue?.code === z.ZodIssueCode.custom) return issue.message
  if (field === 'warehouse_id') return 'Vui lòng chọn kho nhận hàng'
  if (field === 'delivery_date') return 'Ngày giao hàng không hợp lệ'
  if (field === 'items') return 'Danh sách sản phẩm không hợp lệ'
  return 'Dữ liệu booking không hợp lệ'
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

function daysInclusive(minISO: string, maxISO: string): number {
  const min = new Date(`${minISO}T00:00:00.000Z`).getTime()
  const max = new Date(`${maxISO}T00:00:00.000Z`).getTime()
  return Math.floor((max - min) / 86_400_000) + 1
}

export function normalizeDeliveryDate(value: unknown): string {
  const date = String(value ?? '').trim()
  if (!ISO_DATE_ONLY_RE.test(date)) {
    throw new Error('Ngày giao hàng không hợp lệ')
  }

  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Ngày giao hàng không hợp lệ')
  }

  return date
}

function itemTotal(item: PoItem): number {
  const sizeTotal =
    Number(item.size_s_28 ?? 0) +
    Number(item.size_m_29 ?? 0) +
    Number(item.size_l_30 ?? 0) +
    Number(item.size_xl_31 ?? 0) +
    Number(item.size_2xl_32 ?? 0) +
    Number(item.size_3xl_33 ?? 0) +
    Number(item.size_4xl_34 ?? 0)
  return sizeTotal > 0 ? sizeTotal : Number(item.total_quantity ?? item.quantity_booked ?? 0)
}

function missingRpc(error: unknown, functionName: string): boolean {
  const candidate = error as { code?: string; message?: string }
  return candidate.code === 'PGRST202' || (candidate.message ?? '').includes(`public.${functionName}`)
}

async function legacyUsedQuantitiesForRange(dateFrom: string, dateTo: string): Promise<Map<string, number>> {
  const values = new Map<string, number>()
  for (let date = dateFrom; date <= dateTo; date = addISODateDays(date, 1)) values.set(date, 0)

  const { data, error } = await getSupabase()
    .from('bookings')
    .select('delivery_date, status, booking_items(status, total_quantity, quantity_booked)')
    .gte('delivery_date', dateFrom)
    .lte('delivery_date', dateTo)
  if (error) throw error

  for (const booking of (data ?? []) as Array<{ delivery_date: string; status: string; booking_items: Array<{ status: string; total_quantity: number | null; quantity_booked: number | null }> | null }>) {
    if (booking.status === 'cancelled') continue
    const used = (booking.booking_items ?? []).reduce((total, item) =>
      total + (['pending', 'confirmed'].includes(item.status) ? Number(item.total_quantity ?? item.quantity_booked ?? 0) : 0), 0)
    values.set(booking.delivery_date, (values.get(booking.delivery_date) ?? 0) + used)
  }
  return values
}

async function usedQuantitiesForRange(dateFrom: string, dateTo: string): Promise<Map<string, number>> {
  const key = `${dateFrom}:${dateTo}`
  const cached = capacityCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.values

  const { data, error } = await getSupabase().rpc('get_booking_capacity', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
  } as never)
  if (error) {
    if (process.env.NODE_ENV === 'production' || !missingRpc(error, 'get_booking_capacity')) throw error
    logger.warn('get_booking_capacity migration is missing; using development compatibility query')
    const values = await legacyUsedQuantitiesForRange(dateFrom, dateTo)
    capacityCache.set(key, { expiresAt: Date.now() + 15_000, values })
    return values
  }
  const values = new Map(
    ((data ?? []) as Array<{ delivery_date: string; used_quantity: number | string }>)
      .map((row) => [row.delivery_date, Number(row.used_quantity)] as const)
  )
  capacityCache.set(key, { expiresAt: Date.now() + 15_000, values })
  return values
}

async function usedQuantityForDate(deliveryDate: string): Promise<number> {
  return (await usedQuantitiesForRange(deliveryDate, deliveryDate)).get(deliveryDate) ?? 0
}

async function capacityWindow(requestedTotal: number): Promise<{
  minISO: string
  maxISO: string
  unavailableDates: string[]
}> {
  const { minISO, maxISO } = deliveryWindow()
  const targetUsableDays = daysInclusive(minISO, maxISO)
  const unavailableDates: string[] = []
  let usableDays = 0
  let date = minISO
  let maxResolvedISO = maxISO
  const capacityByDate = await usedQuantitiesForRange(minISO, addISODateDays(minISO, 29))

  for (let attempts = 0; usableDays < targetUsableDays && attempts < 30; attempts++) {
    const used = capacityByDate.get(date) ?? 0
    if (used >= DELIVERY_WINDOW_EXTENSION_THRESHOLD || used + requestedTotal > MAX_DAILY_TOTAL_QUANTITY) {
      unavailableDates.push(date)
    } else {
      usableDays += 1
    }
    maxResolvedISO = date
    date = addISODateDays(date, 1)
  }

  return { minISO, maxISO: maxResolvedISO, unavailableDates }
}

router.get('/supplier-accounts', requireAuth(['admin']), async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from('supplier_accounts')
      .select('id, username, full_name, supplier_id, suppliers!inner(name, code)')
      .eq('status', 'active')
      .not('supplier_id', 'is', null)
      .order('full_name')
    if (error) throw error
    res.json({
      accounts: (data ?? []).map((account: any) => ({
        id: account.id,
        username: account.username,
        full_name: account.full_name,
        supplier_id: account.supplier_id,
        supplier_name: account.suppliers?.name ?? '',
        supplier_code: account.suppliers?.code ?? '',
      })),
    })
  } catch (err) {
    next(err)
  }
})

router.get('/mine', requireAuth(['supplier']), async (req, res, next) => {
  try {
    const accountId = (req as unknown as AuthedRequest).user.supplier_account_id
    if (!accountId) {
      res.status(403).json({ error: 'Supplier account is required' })
      return
    }
    const { data, error } = await getSupabase()
      .from('bookings')
      .select('id, booking_code, booking_token, delivery_date, time_slot, status, submitted_at, ghi_chu, warehouses!inner(name, code), booking_items(id, status, reject_reason, total_quantity, quantity_booked)')
      .eq('supplier_account_id', accountId)
      .order('submitted_at', { ascending: false })
      .limit(100)
    if (error) throw error
    const bookings = (data ?? []).flatMap((booking: any) => {
      const items = booking.booking_items ?? []
      return [
        ['confirmed', items.filter((item: any) => item.status === 'confirmed')],
        ['rejected', items.filter((item: any) => item.status === 'rejected')],
        ['returned', items.filter((item: any) => item.status === 'returned')],
        ['pending', items.filter((item: any) => item.status === 'pending')],
      ].filter(([, groupItems]) => (groupItems as any[]).length > 0)
        .map(([status, groupItems]) => ({
          row_id: `${booking.id}-${status}`,
          id: booking.id,
          booking_code: booking.booking_code,
          booking_token: booking.booking_token,
          delivery_date: booking.delivery_date,
          time_slot: booking.time_slot,
          status,
          ghi_chu: booking.ghi_chu,
          reject_reasons: (groupItems as any[]).map((item) => item.reject_reason).filter(Boolean).join('; '),
          submitted_at: booking.submitted_at,
          warehouse_name: booking.warehouses?.name ?? '',
          warehouse_code: booking.warehouses?.code ?? '',
          item_count: (groupItems as any[]).length,
          total_quantity: (groupItems as any[]).reduce((sum, item) => sum + Number(item.total_quantity ?? item.quantity_booked ?? 0), 0),
        }))
    })
    res.json({ bookings })
  } catch (err) {
    next(err)
  }
})

router.get('/capacity', requireAuth(['supplier', 'admin']), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.query.delivery_date) {
      res.status(400).json({ error: 'Vui lòng chọn ngày đăng ký giao hàng' })
      return
    }

    const deliveryDate = normalizeDeliveryDate(req.query.delivery_date)
    const usedQuantity = await usedQuantityForDate(deliveryDate)
    res.json({
      delivery_date: deliveryDate,
      used_quantity: usedQuantity,
      max_quantity: MAX_DAILY_TOTAL_QUANTITY,
      remaining_quantity: Math.max(0, MAX_DAILY_TOTAL_QUANTITY - usedQuantity),
    })
  } catch (err) {
    logger.errorObj('capacity lookup failed', err, { id: req.id })
    res.status(500).json({ error: 'Capacity lookup failed' })
  }
})

router.get('/capacity-window', requireAuth(['supplier', 'admin']), async (req: Request, res: Response): Promise<void> => {
  try {
    const requestedTotal = Math.max(0, Number(req.query.requested_total ?? 0))
    const selectedDate = req.query.delivery_date ? normalizeDeliveryDate(req.query.delivery_date) : ''
    const window = await capacityWindow(requestedTotal)
    const maxISO = selectedDate && selectedDate >= window.minISO && selectedDate > window.maxISO
      ? selectedDate
      : window.maxISO
    res.json({
      min_iso: window.minISO,
      max_iso: maxISO,
      unavailable_dates: window.unavailableDates,
      max_quantity: MAX_DAILY_TOTAL_QUANTITY,
    })
  } catch (err) {
    logger.errorObj('capacity window lookup failed', err, { id: req.id })
    res.status(500).json({ error: 'Capacity lookup failed' })
  }
})

router.post('/', requireAuth(['supplier', 'admin']), async (req: Request, res: Response): Promise<void> => {
  const payload = (req as AuthedRequest).user
  logger.debug('booking auth ok', { id: req.id, role: payload.role })

  try {
    const supabase = getSupabase()
    const parsedBody = finalizeSchema.safeParse(req.body)
    if (!parsedBody.success) {
      res.status(400).json({ error: bookingRequestError(parsedBody.error) })
      return
    }
    const body = parsedBody.data as FinalizeBody
    const uploadOwnerPrefix = `uploads/${payload.sub.replace(/[^a-zA-Z0-9_-]/g, '_')}/`
    const attachmentPaths = body.items.flatMap((item) => [...(item.vat_temp_paths ?? []), ...(item.slip_temp_paths ?? [])])
    if (attachmentPaths.some((path) =>
      !path.startsWith(uploadOwnerPrefix) && !path.startsWith(`${GCS_PREFIX}/${uploadOwnerPrefix}`)
    )) {
      res.status(403).json({ error: 'Attachment does not belong to the authenticated user' })
      return
    }
    const supplierAccountId = payload.role === 'admin' ? body.supplier_account_id : payload.supplier_account_id
    logger.debug('booking supplier account resolved', { id: req.id, hasSupplierAccountId: Boolean(supplierAccountId) })

    if (!supplierAccountId) {
      res.status(400).json({ error: 'Vui lòng chọn tài khoản nhà cung cấp' })
      return
    }
    if (!body.delivery_date) {
      res.status(400).json({ error: 'Vui lòng chọn ngày đăng ký giao hàng' })
      return
    }
    const requestedDeliveryDate = normalizeDeliveryDate(body.delivery_date)

    const totalRequested = (body.items ?? []).reduce((sum, item) => sum + itemTotal(item), 0)
    if (!Number.isFinite(totalRequested) || totalRequested <= 0) {
      res.status(400).json({ error: 'Tổng số lượng booking phải lớn hơn 0' })
      return
    }
    if (totalRequested > MAX_DAILY_TOTAL_QUANTITY) {
      res.status(400).json({
        error: `Tổng số lượng ${totalRequested.toLocaleString('vi-VN')} vượt giới hạn ${MAX_DAILY_TOTAL_QUANTITY.toLocaleString('vi-VN')} sản phẩm cho một booking`,
      })
      return
    }
    const allowedWindow = await capacityWindow(totalRequested)
    if (requestedDeliveryDate < allowedWindow.minISO || requestedDeliveryDate > allowedWindow.maxISO) {
      res.status(400).json({ error: 'Delivery date is outside the allowed booking window' })
      return
    }
    const atomicItems = body.items.map((item) => {
      const vatPaths = item.vat_temp_paths ?? []
      return {
        ...item,
        total_quantity: itemTotal(item),
        vat_invoice_url: vatPaths[0] ?? null,
        photos: [
          ...(item.slip_temp_paths ?? []).map((path) => ({
            storage_path: path,
            photo_type: 'delivery_slip',
          })),
          ...vatPaths.map((path) => ({
            storage_path: path,
            photo_type: 'vat_invoice',
          })),
        ],
      }
    })

    const { data, error } = await supabase.rpc('create_booking_atomic_v2', {
      p_supplier_account_id: supplierAccountId,
      p_warehouse_id: body.warehouse_id,
      p_delivery_date: requestedDeliveryDate,
      p_time_slot: body.time_slot,
      p_ghi_chu: body.ghi_chu ?? null,
      p_delivery_note: body.delivery_note,
      p_client_session_id: body.session_id,
      p_items: atomicItems,
      p_staff_recipients: STAFF_RECIPIENTS,
    } as never)
    if (error) {
      const message = error.message ?? 'Booking creation failed'
      if (message.includes('capacity exceeded')) {
        res.status(409).json({ error: 'Ngày này đã hết công suất. Vui lòng chọn ngày khác.' })
        return
      }
      if (message.includes('invalid requested quantity')) {
        res.status(400).json({
          error: `Tổng số lượng booking phải từ 1 đến ${MAX_DAILY_TOTAL_QUANTITY.toLocaleString('vi-VN')} sản phẩm`,
        })
        return
      }
      if (message.includes('not active')) {
        res.status(403).json({ error: 'Tài khoản nhà cung cấp chưa được kích hoạt' })
        return
      }
      throw error
    }
    const booking = data as {
      booking_code: string
      booking_token: string
      delivery_date: string
      idempotent_replay: boolean
    }
    capacityCache.clear()

    res.json({
      booking_code: booking.booking_code,
      booking_token: booking.booking_token,
      delivery_date: booking.delivery_date,
      requested_delivery_date: requestedDeliveryDate,
      adjusted_delivery_date: null,
      idempotent_replay: booking.idempotent_replay,
    })
  } catch (err) {
    logger.errorObj('booking finalize failed', err, { id: req.id })
    res.status(500).json({ error: 'Booking creation failed' })
  }
})

export default router

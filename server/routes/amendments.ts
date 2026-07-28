import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthedRequest, usernameOf } from '../lib/httpAuth.js'
import { getSupabase } from '../lib/supabase.js'
import { CAPABILITY_ROLES } from '../config/capabilities.js'

const router = Router()
const uuidSchema = z.string().uuid()
const amendmentRequestSchema = z.object({
  type: z.enum(['update', 'recall']),
  note: z.string().trim().min(1).max(2_000),
  proposed_changes: z.record(z.unknown()).nullable().optional(),
})
const resolutionSchema = z.object({
  decision: z.enum(['approved', 'denied']),
  note: z.string().trim().max(2_000).default(''),
})

router.get('/bookings/:bookingId/latest', requireAuth(['supplier']), async (req, res, next) => {
  try {
    if (!uuidSchema.safeParse(req.params.bookingId).success) {
      res.status(404).json({ error: 'Booking not found' })
      return
    }
    const user = (req as unknown as AuthedRequest).user
    const booking = await getSupabase()
      .from('bookings')
      .select('id')
      .eq('id', req.params.bookingId)
      .eq('supplier_account_id', user.supplier_account_id ?? '')
      .maybeSingle()
    if (booking.error) throw booking.error
    if (!booking.data) {
      res.status(404).json({ error: 'Booking not found' })
      return
    }
    const { data, error } = await getSupabase()
      .from('booking_amendments')
      .select('id, amendment_type, request_note, proposed_changes, status, reviewer_note, created_at')
      .eq('booking_id', req.params.bookingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    res.json({ amendment: data ?? null })
  } catch (err) {
    next(err)
  }
})

router.get('/bookings/:bookingId/pending', requireAuth([...CAPABILITY_ROLES.reviewBookings]), async (req, res, next) => {
  try {
    if (!uuidSchema.safeParse(req.params.bookingId).success) {
      res.status(404).json({ error: 'Booking not found' })
      return
    }
    const { data, error } = await getSupabase()
      .from('booking_amendments')
      .select('id, amendment_type, request_note, proposed_changes, status, reviewer_note, created_at')
      .eq('booking_id', req.params.bookingId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    res.json({ amendment: data ?? null })
  } catch (err) {
    next(err)
  }
})

router.post('/bookings/:bookingId/request', requireAuth(['supplier']), async (req, res, next) => {
  try {
    const user = (req as unknown as AuthedRequest).user
    if (!user.supplier_account_id) {
      res.status(403).json({ error: 'Supplier account is required' })
      return
    }

    const parsed = amendmentRequestSchema.safeParse(req.body)
    if (!uuidSchema.safeParse(req.params.bookingId).success || !parsed.success) {
      res.status(400).json({ error: 'Invalid amendment request' })
      return
    }

    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('request_booking_amendment', {
      p_booking_id: req.params.bookingId,
      p_supplier_account_id: user.supplier_account_id,
      p_type: parsed.data.type,
      p_note: parsed.data.note,
      p_proposed_changes: parsed.data.proposed_changes ?? null,
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

router.post('/:amendmentId/resolve', requireAuth([...CAPABILITY_ROLES.reviewBookings]), async (req, res, next) => {
  try {
    const parsed = resolutionSchema.safeParse(req.body)
    if (!uuidSchema.safeParse(req.params.amendmentId).success || !parsed.success) {
      res.status(400).json({ error: 'Decision is invalid' })
      return
    }
    const { decision, note } = parsed.data
    if (decision === 'denied' && !note) {
      res.status(400).json({ error: 'Reason is required' })
      return
    }

    const supabase = getSupabase()
    const username = usernameOf((req as unknown as AuthedRequest).user)
    const { error } = await supabase.rpc('resolve_booking_amendment', {
      p_amendment_id: req.params.amendmentId,
      p_reviewer_username: username,
      p_decision: decision,
      p_note: note,
    } as never)
    if (error) throw error

    const amendment = await supabase
      .from('booking_amendments')
      .select('booking_id, amendment_type, bookings(booking_code, supplier_account_id)')
      .eq('id', req.params.amendmentId)
      .single()
    const row = amendment.data as {
      booking_id?: string
      amendment_type?: string
      bookings?: { booking_code?: string; supplier_account_id?: string } | null
    } | null
    if (row?.bookings?.supplier_account_id && row.booking_id) {
      const typeLabel = row.amendment_type === 'recall' ? 'huỷ' : 'chỉnh sửa'
      const statusLabel = decision === 'approved' ? 'chấp thuận' : 'từ chối'
      await supabase.from('notifications').insert({
        recipient_type: 'supplier_account',
        recipient_id: row.bookings.supplier_account_id,
        event_type: decision === 'approved' ? 'amendment_approved' : 'amendment_denied',
        message: `Yêu cầu ${typeLabel} booking ${row.bookings.booking_code ?? ''} đã được ${statusLabel}.`,
        booking_id: row.booking_id,
      } as never)
    }

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router

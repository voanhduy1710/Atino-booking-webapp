import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config()

type Args = Record<string, string | boolean>

type StageResult = {
  stage: string
  ok: boolean
  expected?: string
  actual?: string
  details?: unknown
}

const ICT_OFFSET_MS = 7 * 60 * 60 * 1000
const API_BASE = String(process.env.DEBUG_API_BASE ?? process.env.VITE_API_URL ?? 'http://localhost:3001')
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function parseArgs(): Args {
  return process.argv.slice(2).reduce<Args>((acc, arg) => {
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, ...rest] = arg.slice(2).split('=')
      acc[key] = rest.join('=')
    } else if (arg.startsWith('--')) {
      acc[arg.slice(2)] = true
    }
    return acc
  }, {})
}

function isoDateInICT(offsetDays: number): string {
  const now = new Date(Date.now() + ICT_OFFSET_MS)
  now.setUTCDate(now.getUTCDate() + offsetDays)
  return now.toISOString().slice(0, 10)
}

function formatLocalDate(date: Date | null): string {
  if (!date) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseLocalDate(dateStr: string): Date | null {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function tokenFor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
}

function apiUrl(path: string): string {
  return `${API_BASE.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

function pushStage(results: StageResult[], stage: StageResult): void {
  results.push(stage)
  const icon = stage.ok ? 'OK ' : 'BAD'
  console.log(`${icon} ${stage.stage}`)
  if (stage.expected !== undefined || stage.actual !== undefined) {
    console.log(`    expected: ${stage.expected ?? '-'}`)
    console.log(`    actual:   ${stage.actual ?? '-'}`)
  }
  if (stage.details !== undefined) {
    console.log(`    details:  ${JSON.stringify(stage.details, null, 2)}`)
  }
}

async function getJson(path: string, token: string): Promise<any> {
  const res = await fetch(apiUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await res.text()
  const json = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`)
  return json
}

async function postJson(path: string, token: string, body: unknown): Promise<any> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  const json = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`)
  return json
}

async function main() {
  const args = parseArgs()
  const requestedDate = String(args.date ?? isoDateInICT(2))
  const quantity = Number(args.quantity ?? 1)
  const runFinalize = Boolean(args.finalize)
  const cleanup = args.cleanup !== false && args.cleanup !== 'false'
  const results: StageResult[] = []

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env')
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: supplierAccount, error: accountError } = args['supplier-account-id']
    ? await supabase
      .from('supplier_accounts')
      .select('id, username, role, supplier_id, status')
      .eq('id', args['supplier-account-id'])
      .single()
    : await supabase
      .from('supplier_accounts')
      .select('id, username, supplier_id, status')
      .eq('status', 'active')
      .not('supplier_id', 'is', null)
      .limit(1)
      .single()
  if (accountError || !supplierAccount) throw accountError ?? new Error('No active supplier account found')

  const { data: warehouse, error: warehouseError } = args['warehouse-id']
    ? await supabase.from('warehouses').select('id, code, name').eq('id', args['warehouse-id']).single()
    : await supabase.from('warehouses').select('id, code, name').eq('active', true).limit(1).single()
  if (warehouseError || !warehouse) throw warehouseError ?? new Error('No active warehouse found')

  const token = String(args.token ?? tokenFor({
    role: 'supplier',
    username: supplierAccount.username ?? 'debug-supplier',
    supplier_account_id: supplierAccount.id,
    supplier_id: supplierAccount.supplier_id,
  }))

  const frontendRoundTrip = formatLocalDate(parseLocalDate(requestedDate))
  pushStage(results, {
    stage: 'input -> frontend date picker round trip',
    ok: frontendRoundTrip === requestedDate,
    expected: requestedDate,
    actual: frontendRoundTrip,
  })

  const payload = {
    warehouse_id: warehouse.id,
    delivery_date: frontendRoundTrip,
    time_slot: '07-09',
    ghi_chu: 'debug booking date stage test',
    delivery_note: 'debug',
    session_id: `debug-${Date.now()}`,
    items: [{
      product_code: 'DEBUG_PRODUCT',
      process_code: `DEBUG_${Date.now()}`,
      warehouse_code: warehouse.code ?? 'DEBUG_WH',
      mau: 'DEBUG',
      delivery_round: 2,
      is_final_round: false,
      quantity_booked: quantity,
      total_quantity: quantity,
      size_s_28: quantity,
      size_m_29: 0,
      size_l_30: 0,
      size_xl_31: 0,
      size_2xl_32: 0,
      size_3xl_33: 0,
      vat_temp_paths: [],
      slip_temp_paths: [],
    }],
  }
  pushStage(results, {
    stage: 'frontend payload',
    ok: payload.delivery_date === requestedDate,
    expected: requestedDate,
    actual: payload.delivery_date,
    details: { apiBase: API_BASE, warehouse: warehouse.name, supplier_account_id: supplierAccount.id },
  })

  const capacity = await getJson(`/api/booking/finalize/capacity?delivery_date=${encodeURIComponent(requestedDate)}`, token)
  pushStage(results, {
    stage: 'GET /capacity echoes date',
    ok: capacity.delivery_date === requestedDate,
    expected: requestedDate,
    actual: capacity.delivery_date,
    details: capacity,
  })

  const capacityWindow = await getJson(
    `/api/booking/finalize/capacity-window?requested_total=${encodeURIComponent(quantity)}&delivery_date=${encodeURIComponent(requestedDate)}`,
    token
  )
  pushStage(results, {
    stage: 'GET /capacity-window keeps selected date inside UI window',
    ok: requestedDate >= capacityWindow.min_iso && requestedDate <= capacityWindow.max_iso,
    expected: `${capacityWindow.min_iso} <= ${requestedDate} <= ${capacityWindow.max_iso}`,
    actual: `${capacityWindow.min_iso} <= ${requestedDate} <= ${capacityWindow.max_iso}`,
    details: capacityWindow,
  })

  if (!runFinalize) {
    console.log('\nDry run complete. Pass --finalize to create a real booking and verify DB persistence.')
    return
  }

  const finalize = await postJson('/api/booking/finalize', token, payload)
  pushStage(results, {
    stage: 'POST /finalize response',
    ok: finalize.delivery_date === requestedDate && finalize.requested_delivery_date === requestedDate,
    expected: requestedDate,
    actual: finalize.delivery_date,
    details: finalize,
  })

  const { data: persisted, error: persistedError } = await supabase
    .from('bookings')
    .select('id, booking_code, booking_token, delivery_date, status')
    .eq('booking_token', finalize.booking_token)
    .single()
  if (persistedError || !persisted) throw persistedError ?? new Error('Created booking not found')

  pushStage(results, {
    stage: 'Supabase persisted row',
    ok: persisted.delivery_date === requestedDate,
    expected: requestedDate,
    actual: persisted.delivery_date,
    details: persisted,
  })

  if (cleanup) {
    const { error: cleanupError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', persisted.id)
    pushStage(results, {
      stage: 'cleanup marks debug booking cancelled',
      ok: !cleanupError,
      details: cleanupError ? { message: cleanupError.message } : { booking_id: persisted.id },
    })
  }

  const failed = results.filter((result) => !result.ok)
  if (failed.length > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

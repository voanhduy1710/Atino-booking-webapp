import { Router, Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const router = Router()

const LARK_BASE_URL = 'https://open.larksuite.com/open-apis'
const LARK_APP_TOKEN = 'At3fbwyI5a1Ps1srOpxlhkfqgVf'
const LARK_TABLE_ID = 'tblBWiFNkTKezuoY'
const LARK_VIEW_ID = 'vewd1Ee0kY'
const LARK_FIELD_PRODUCT = 'Tên SP'
const LARK_FIELD_ORDER = 'Mã đơn'

function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key, { realtime: { transport: ws as any } })
}

async function getLarkTenantToken() {
  if (process.env.LARK_TENANT_ACCESS_TOKEN) return process.env.LARK_TENANT_ACCESS_TOKEN

  const appId = process.env.LARK_APP_ID
  const appSecret = process.env.LARK_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error('LARK_TENANT_ACCESS_TOKEN or LARK_APP_ID/LARK_APP_SECRET not set')
  }

  const res = await fetch(`${LARK_BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })
  const json = await res.json() as { code?: number; msg?: string; tenant_access_token?: string }
  if (!res.ok || json.code !== 0 || !json.tenant_access_token) {
    throw new Error(`Lark token failed: ${json.msg ?? res.statusText}`)
  }
  return json.tenant_access_token
}

function cellToText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
  if (Array.isArray(value)) return value.map(cellToText).filter(Boolean).join(' ').trim()
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.text === 'string') return record.text.trim()
    if (typeof record.name === 'string') return record.name.trim()
    if (typeof record.value === 'string' || typeof record.value === 'number') return String(record.value).trim()
  }
  return ''
}

function distinctRows(rows: Array<{ lark_record_id: string; product_name: string; order_code: string }>) {
  const seen = new Set<string>()
  const distinct: Array<{ lark_record_id: string; product_name: string; order_code: string }> = []

  for (const row of rows) {
    const key = `${row.product_name.trim().toLowerCase()}\u0000${row.order_code.trim().toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    distinct.push(row)
  }

  return distinct
}

async function fetchLarkRows() {
  const token = await getLarkTenantToken()
  const rows: Array<{ lark_record_id: string; product_name: string; order_code: string }> = []
  let pageToken = ''

  do {
    const url = new URL(`${LARK_BASE_URL}/bitable/v1/apps/${LARK_APP_TOKEN}/tables/${LARK_TABLE_ID}/records`)
    url.searchParams.set('view_id', LARK_VIEW_ID)
    url.searchParams.set('page_size', '100')
    url.searchParams.set('field_names', JSON.stringify([LARK_FIELD_PRODUCT, LARK_FIELD_ORDER]))
    if (pageToken) url.searchParams.set('page_token', pageToken)

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
    const json = await res.json() as {
      code?: number
      msg?: string
      data?: {
        has_more?: boolean
        page_token?: string
        items?: Array<{ record_id?: string; id?: string; fields?: Record<string, unknown> }>
      }
    }

    if (!res.ok || json.code !== 0) {
      throw new Error(`Lark records failed: ${json.msg ?? res.statusText}`)
    }

    for (const item of json.data?.items ?? []) {
      const recordId = item.record_id ?? item.id
      const productName = cellToText(item.fields?.[LARK_FIELD_PRODUCT])
      const orderCode = cellToText(item.fields?.[LARK_FIELD_ORDER])
      if (recordId && productName && orderCode) {
        rows.push({ lark_record_id: recordId, product_name: productName, order_code: orderCode })
      }
    }

    pageToken = json.data?.has_more ? (json.data.page_token ?? '') : ''
  } while (pageToken)

  return distinctRows(rows)
}

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('product_process_catalog')
      .select('id, product_name, order_code, last_synced_at')
      .eq('active', true)
      .order('product_name', { ascending: true })
      .order('order_code', { ascending: true })
    if (error) throw error
    res.json({ items: data ?? [] })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/sync', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await fetchLarkRows()
    const supabase = getSupabase()

    const { error: deactivateError } = await supabase
      .from('product_process_catalog')
      .update({ active: false, updated_at: new Date().toISOString() })
      .neq('lark_record_id', '')
    if (deactivateError) throw deactivateError

    if (rows.length > 0) {
      const now = new Date().toISOString()
      const { error: upsertError } = await supabase
        .from('product_process_catalog')
        .upsert(
          rows.map((row) => ({ ...row, active: true, last_synced_at: now, updated_at: now })),
          { onConflict: 'lark_record_id' }
        )
      if (upsertError) throw upsertError
    }

    res.json({ synced: rows.length, ts: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  const envPath = path.join(root, '.env')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnv()

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const strict = process.argv.includes('--strict')

if (!supabaseUrl || !apiKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/VITE_SUPABASE_ANON_KEY')
  process.exit(2)
}

const requiredSelects = [
  {
    table: 'booking_items',
    select: 'id,total_quantity,warehouse_code,mau,size_s_28,size_m_29,size_l_30,size_xl_31,size_2xl_32,size_3xl_33,reviewed_at',
  },
  {
    table: 'product_process_catalog',
    select: 'id,warehouse_code,mau,order_date,total_quantity,size_s_28,size_m_29,size_l_30,size_xl_31,size_2xl_32,size_3xl_33',
  },
  {
    table: 'bookings',
    select: 'id,nhanh_draft_bill_id,booking_code,booking_token,delivery_date,status',
  },
  {
    table: 'booking_item_photos',
    select: 'id,photo_type,storage_path',
  },
]

async function checkSelect({ table, select }) {
  const url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`
  const res = await fetch(url, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  })
  const text = await res.text()
  return {
    table,
    ok: res.ok,
    status: res.status,
    select,
    error: res.ok ? null : text,
  }
}

const results = []
for (const item of requiredSelects) {
  results.push(await checkSelect(item))
}

const report = {
  generated_at: new Date().toISOString(),
  supabase_url: supabaseUrl,
  used_key: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : 'anon',
  results,
  notes: [
    'This script is read-only. It validates required columns by issuing PostgREST select queries.',
    'Enum and policy audits still need Supabase MCP or SQL access for full fidelity.',
  ],
}

console.log(JSON.stringify(report, null, 2))

if (strict && results.some((result) => !result.ok)) process.exitCode = 1

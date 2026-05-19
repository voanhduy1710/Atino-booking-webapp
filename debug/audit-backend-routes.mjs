import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  const envPath = path.join(root, '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
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

const baseUrl = (process.env.DEBUG_API_BASE_URL || process.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '')
const token = process.env.DEBUG_AUTH_TOKEN || ''
const deliveryDate = process.env.DEBUG_DELIVERY_DATE || new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
const strict = process.argv.includes('--strict')

async function request(name, pathName, init = {}) {
  const started = Date.now()
  try {
    const res = await fetch(`${baseUrl}${pathName}`, init)
    const text = await res.text()
    return {
      name,
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      body: text.slice(0, 500),
    }
  } catch (error) {
    return {
      name,
      ok: false,
      status: 0,
      ms: Date.now() - started,
      error: error.message,
    }
  }
}

const checks = []
checks.push(await request('health', '/api/health'))
checks.push(await request('product_process_list', '/api/product-process'))

if (token) {
  checks.push(await request(
    'booking_capacity',
    `/api/booking/finalize/capacity?delivery_date=${encodeURIComponent(deliveryDate)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  ))
  checks.push(await request(
    'booking_capacity_window',
    `/api/booking/finalize/capacity-window?requested_total=1&delivery_date=${encodeURIComponent(deliveryDate)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  ))
} else {
  checks.push({
    name: 'authenticated_booking_routes',
    ok: null,
    skipped: true,
    reason: 'Set DEBUG_AUTH_TOKEN to test authenticated booking capacity routes.',
  })
}

const report = {
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  checks,
}

console.log(JSON.stringify(report, null, 2))

if (strict && checks.some((check) => check.ok === false)) process.exitCode = 1

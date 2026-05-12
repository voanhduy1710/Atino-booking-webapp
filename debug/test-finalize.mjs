/**
 * debug/test-finalize.mjs
 * Tests POST /api/booking/finalize against the deployed service.
 *
 * Usage:
 *   node debug/test-finalize.mjs [baseUrl] [token]
 *
 * token: copy Bearer token from browser Network tab (Authorization header)
 */

const BASE_URL = process.argv[2] ?? 'https://atino-booking-webapp-verwwjpm5q-as.a.run.app'
const TOKEN = process.argv[3] ?? ''
const ENDPOINT = `${BASE_URL}/api/booking/finalize`

if (!TOKEN) {
  console.error('Usage: node debug/test-finalize.mjs <baseUrl> <bearer-token>')
  console.error('  Get token from browser Network tab → Authorization header (strip "Bearer ")')
  process.exit(1)
}

const body = {
  warehouse_id: '00000000-0000-0000-0000-000000000001', // will fail DB lookup — that's ok, we want auth+DB errors
  time_slot: '07-09',
  ghi_chu: null,
  delivery_note: 'test',
  session_id: 'debug-session',
  items: [
    {
      product_code: 'TEST001',
      process_code: 'QT001',
      delivery_round: 1,
      is_final_round: false,
      quantity_booked: 1,
      vat_temp_paths: ['temp/debug/fake.png'],
      slip_temp_paths: ['temp/debug/fake2.png'],
    },
  ],
}

console.log('Target:', ENDPOINT)
console.log('Token (first 40 chars):', TOKEN.slice(0, 40) + '...')
console.log()

try {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  console.log('Status:', res.status)
  console.log('Body:', text)

  if (res.ok) {
    console.log('\n✅ Finalize succeeded')
  } else {
    console.log('\n❌ Finalize failed')
    try { console.log('Error:', JSON.parse(text).error) } catch {}
  }
} catch (err) {
  console.error('Fetch error:', err.message)
}

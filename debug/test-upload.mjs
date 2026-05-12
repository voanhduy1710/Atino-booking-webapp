/**
 * debug/test-upload.mjs
 * Tests POST /api/upload/gcs against the deployed service.
 *
 * Usage:
 *   node debug/test-upload.mjs
 *   node debug/test-upload.mjs https://your-other-url.run.app
 */

// FormData and Blob are global in Node 22

const BASE_URL = process.argv[2] ?? 'https://atino-booking-webapp-verwwjpm5q-as.a.run.app'
const ENDPOINT = `${BASE_URL}/api/upload/gcs`

// Create a minimal 1x1 white PNG in memory (no file needed)
const PNG_1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
  '2e0000000c4944415408d7636060600000000400016dd4a10000000049454e44ae426082',
  'hex'
)

const testPath = `temp/debug-test/${Date.now()}_test.png`

console.log('Target:', ENDPOINT)
console.log('Path:  ', testPath)
console.log()

const form = new FormData()
form.append('file', new Blob([PNG_1x1], { type: 'image/png' }), 'test.png')
form.append('path', testPath)

try {
  const res = await fetch(ENDPOINT, { method: 'POST', body: form })
  const text = await res.text()

  console.log('Status:', res.status)
  console.log('Headers:')
  for (const [k, v] of res.headers) console.log(`  ${k}: ${v}`)
  console.log()
  console.log('Body:', text)

  if (res.ok) {
    console.log('\n✅ Upload succeeded')
  } else {
    console.log('\n❌ Upload failed')
    try {
      const json = JSON.parse(text)
      console.log('Error:', json.error)
    } catch {}
  }
} catch (err) {
  console.error('Fetch error:', err.message)
}

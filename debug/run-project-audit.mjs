import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const strict = process.argv.includes('--strict')

const scripts = [
  'debug/audit-codebase.mjs',
  'debug/audit-supabase-schema.mjs',
  'debug/audit-backend-routes.mjs',
]

const results = []

for (const script of scripts) {
  const args = [script]
  if (strict) args.push('--strict')
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })
  results.push({ script, status: result.status ?? 0 })
}

const failed = results.filter((result) => result.status !== 0)
if (failed.length > 0) {
  console.error(`Project audit completed with ${failed.length} failing script(s).`)
  process.exitCode = 1
} else {
  console.log('Project audit completed.')
}

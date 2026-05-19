import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const strict = process.argv.includes('--strict')

const skipDirs = new Set(['.git', 'node_modules', 'dist', 'dist-server', 'build', '.code-review-graph'])
const textExts = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.sql', '.ps1', '.py'])

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) walk(path.join(dir, entry.name), files)
    } else {
      const file = path.join(dir, entry.name)
      if (textExts.has(path.extname(file))) files.push(file)
    }
  }
  return files
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function linesWith(files, regex) {
  const hits = []
  for (const file of files) {
    const content = read(file)
    content.split(/\r?\n/).forEach((line, index) => {
      if (regex.test(line)) hits.push({ file: rel(file), line: index + 1, text: line.trim() })
      regex.lastIndex = 0
    })
  }
  return hits
}

const files = walk(root)
const srcFiles = files.filter((file) => rel(file).startsWith('src/'))
const appFiles = files.filter((file) => {
  const relative = rel(file)
  return /^(src|server|vite\.config\.ts)/.test(relative) && relative !== 'server/lib/logger.ts'
})
const debugFiles = files.filter((file) => rel(file).startsWith('debug/'))
const activeEdgeReferenceFiles = files.filter((file) =>
  /^(src|server|debug|deploy|deploy_test|deploy_local|vite\.config\.ts|package\.json)/.test(rel(file)) &&
  rel(file) !== 'debug/audit-codebase.mjs'
)
const hardcodedKeyFiles = debugFiles.filter((file) => rel(file) !== 'debug/audit-codebase.mjs')

const checks = [
  {
    name: 'frontend_direct_rpc_calls',
    severity: 'critical',
    hits: linesWith(srcFiles, /supabase\.rpc\s*\(|\.rpc\s*\(/g),
    recommendation: 'Move workflow mutations to backend API routes.',
  },
  {
    name: 'frontend_direct_table_writes',
    severity: 'critical',
    hits: linesWith(srcFiles, /\.from\([^)]*\)\s*\.\s*(insert|update|delete|upsert)\s*\(/g),
    recommendation: 'Move browser table mutations to backend API routes before tightening RLS.',
  },
  {
    name: 'edge_function_references',
    severity: 'high',
    hits: linesWith(activeEdgeReferenceFiles, /functions\/v1|finalize-booking|gcs-upload/g),
    recommendation: 'Remove active Edge Function references after backend routes are verified.',
  },
  {
    name: 'console_or_debugger_in_app',
    severity: 'medium',
    hits: linesWith(appFiles, /console\.|debugger/g),
    recommendation: 'Use server logger or dev-only logging.',
  },
  {
    name: 'hardcoded_supabase_jwt_like_keys_in_debug',
    severity: 'high',
    hits: linesWith(hardcodedKeyFiles, /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/g),
    recommendation: 'Read keys from .env instead of committing them in debug scripts.',
  },
]

const largeFiles = files
  .map((file) => ({ file: rel(file), lines: read(file).split(/\r?\n/).length }))
  .filter((entry) => /^(src|server)\//.test(entry.file) && entry.lines >= 250)
  .sort((a, b) => b.lines - a.lines)

const expectedFiles = [
  'server/lib/logger.ts',
  'server/routes/booking.ts',
  'server/routes/upload.ts',
  'server/routes/productProcess.ts',
  'server/routes/nhanh.ts',
  'supabase/migrations/20260519143000_repair_backend_owned_schema.sql',
]

const missingExpectedFiles = expectedFiles.filter((file) => !fs.existsSync(path.join(root, file)))

const report = {
  generated_at: new Date().toISOString(),
  root,
  checks: checks.map((check) => ({
    ...check,
    count: check.hits.length,
    hits: check.hits.slice(0, 50),
    truncated: check.hits.length > 50,
  })),
  large_files: largeFiles,
  missing_expected_files: missingExpectedFiles,
}

console.log(JSON.stringify(report, null, 2))

const criticalFailures = checks.some((check) => check.severity === 'critical' && check.hits.length > 0) || missingExpectedFiles.length > 0
if (strict && criticalFailures) process.exitCode = 1

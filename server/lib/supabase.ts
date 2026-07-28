import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'

let client: SupabaseClient | null = null

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

function requestHost(input: FetchInput): string {
  const value = typeof input === 'string' || input instanceof URL ? input : input.url
  try {
    return new URL(value).host
  } catch {
    return 'configured Supabase host'
  }
}

async function supabaseFetch(input: FetchInput, init?: FetchInit): Promise<Response> {
  try {
    const timeout = AbortSignal.timeout(15_000)
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
    return await fetch(input, { ...init, signal })
  } catch (error) {
    const cause = error instanceof Error ? error : undefined
    const code = (cause?.cause as { code?: string } | undefined)?.code
    const detail = code ? `${code}: ${cause?.message ?? 'fetch failed'}` : (cause?.message ?? 'fetch failed')
    throw new Error(`Supabase request failed for ${requestHost(input)} (${detail})`, { cause: error })
  }
}

export function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  client ??= createClient(url, key, {
    global: { fetch: supabaseFetch },
    realtime: { transport: ws as any },
  })
  return client
}

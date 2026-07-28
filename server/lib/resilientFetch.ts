const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
const circuits = new Map<string, { failures: number; openUntil: number }>()

export interface ResilientFetchOptions extends RequestInit {
  timeoutMs?: number
  retries?: number
  retryUnsafe?: boolean
  circuitKey?: string
}

function retryDelay(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers.get('retry-after')
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    return Math.min(2_000, Number(retryAfter) * 1_000)
  }
  return Math.min(2_000, 150 * (2 ** attempt) + Math.floor(Math.random() * 100))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function recordFailure(key: string): void {
  const current = circuits.get(key) ?? { failures: 0, openUntil: 0 }
  current.failures += 1
  if (current.failures >= 5) {
    current.openUntil = Date.now() + 30_000
    current.failures = 0
  }
  circuits.set(key, current)
}

export async function resilientFetch(
  input: string | URL,
  options: ResilientFetchOptions = {}
): Promise<Response> {
  const {
    timeoutMs = 15_000,
    retries = 2,
    retryUnsafe = false,
    circuitKey = new URL(String(input)).origin,
    ...init
  } = options
  const circuit = circuits.get(circuitKey)
  if (circuit?.openUntil && circuit.openUntil > Date.now()) {
    throw new Error('Upstream temporarily unavailable')
  }

  const method = String(init.method ?? 'GET').toUpperCase()
  const canRetry = retryUnsafe || ['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(method)
  const maxAttempts = canRetry ? retries + 1 : 1
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response: Response | null = null
    try {
      response = await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) })
      if (!RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts - 1) {
        if (RETRYABLE_STATUS.has(response.status)) recordFailure(circuitKey)
        else circuits.delete(circuitKey)
        return response
      }
      await response.body?.cancel()
    } catch (error) {
      lastError = error
      if (attempt === maxAttempts - 1) {
        recordFailure(circuitKey)
        throw error
      }
    }
    await sleep(retryDelay(response, attempt))
  }

  recordFailure(circuitKey)
  throw lastError instanceof Error ? lastError : new Error('Upstream request failed')
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import { resilientFetch } from './resilientFetch.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resilientFetch', () => {
  it('retries bounded transient failures for safe requests', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await resilientFetch('https://retry-test.invalid/data', { retries: 1 })

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry unsafe methods unless explicitly enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('busy', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await resilientFetch('https://post-test.invalid/data', {
      method: 'POST',
      retries: 2,
    })

    expect(response.status).toBe(503)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('opens a short circuit after repeated upstream failures', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    const options = { retries: 0, circuitKey: 'circuit-test' }

    for (let index = 0; index < 5; index += 1) {
      await expect(resilientFetch('https://circuit-test.invalid/data', options)).rejects.toThrow('offline')
    }
    await expect(resilientFetch('https://circuit-test.invalid/data', options))
      .rejects.toThrow('Upstream temporarily unavailable')
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
})

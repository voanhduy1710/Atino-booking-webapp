const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

export async function getJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    method: init.method ?? 'GET',
  })
  const result = await res.json() as T & { error?: string }
  if (!res.ok) throw new Error(result.error ?? 'Có lỗi xảy ra')
  return result
}

export async function postJson<T>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    method: init.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    body: body === undefined ? init.body : JSON.stringify(body),
  })
  const result = await res.json() as T & { error?: string }
  if (!res.ok) throw new Error(result.error ?? 'Có lỗi xảy ra')
  return result
}

export async function postForm<T>(path: string, form: FormData, init: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    method: init.method ?? 'POST',
    body: form,
  })
  const result = await res.json() as T & { error?: string }
  if (!res.ok) throw new Error(result.error ?? 'Có lỗi xảy ra')
  return result
}

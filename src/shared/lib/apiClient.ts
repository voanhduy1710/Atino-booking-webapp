const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const JWT_KEY = 'atino_jwt'

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

async function readJsonResponse<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text()
  if (!text) return {} as T & { error?: string }

  try {
    return JSON.parse(text) as T & { error?: string }
  } catch {
    const contentType = res.headers.get('content-type') ?? 'unknown'
    console.warn('API returned non-JSON response', {
      status: res.status,
      url: res.url,
      contentType,
      preview: text.slice(0, 160),
    })

    if (res.status === 404) {
      throw new Error('Không tìm thấy API trên máy chủ triển khai')
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error('Máy chủ API chưa sẵn sàng hoặc đang bị lỗi')
    }
    throw new Error(`Máy chủ trả về phản hồi không hợp lệ (HTTP ${res.status})`)
  }
}

export async function getJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof localStorage === 'undefined' ? null : localStorage.getItem(JWT_KEY)
  const res = await fetch(apiUrl(path), {
    ...init,
    method: init.method ?? 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  const result = await readJsonResponse<T>(res)
  if (!res.ok) throw new Error(result.error ?? 'Có lỗi xảy ra')
  return result
}

export async function postJson<T>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const token = typeof localStorage === 'undefined' ? null : localStorage.getItem(JWT_KEY)
  const res = await fetch(apiUrl(path), {
    ...init,
    method: init.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
    body: body === undefined ? init.body : JSON.stringify(body),
  })
  const result = await readJsonResponse<T>(res)
  if (!res.ok) throw new Error(result.error ?? 'Có lỗi xảy ra')
  return result
}

export async function postForm<T>(path: string, form: FormData, init: RequestInit = {}): Promise<T> {
  const token = typeof localStorage === 'undefined' ? null : localStorage.getItem(JWT_KEY)
  const res = await fetch(apiUrl(path), {
    ...init,
    method: init.method ?? 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
    body: form,
  })
  const result = await readJsonResponse<T>(res)
  if (!res.ok) throw new Error(result.error ?? 'Có lỗi xảy ra')
  return result
}

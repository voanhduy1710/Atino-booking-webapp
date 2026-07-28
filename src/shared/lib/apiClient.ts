const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

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
  const res = await fetch(apiUrl(path), {
    ...init,
    method: init.method ?? 'GET',
    headers: {
      ...(init.headers ?? {}),
    },
    credentials: 'include',
    signal: init.signal ?? AbortSignal.timeout(20_000),
  })
  const result = await readJsonResponse<T>(res)
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
    credentials: 'include',
    signal: init.signal ?? AbortSignal.timeout(20_000),
    body: body === undefined ? init.body : JSON.stringify(body),
  })
  const result = await readJsonResponse<T>(res)
  if (!res.ok) throw new Error(result.error ?? 'Có lỗi xảy ra')
  return result
}

export function postFormWithProgress<T>(
  path: string,
  form: FormData,
  onProgress: (percent: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', apiUrl(path))
    request.withCredentials = true
    request.timeout = 60_000
    request.responseType = 'json'
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    })
    request.addEventListener('load', () => {
      const result = request.response as (T & { error?: string }) | null
      if (request.status >= 200 && request.status < 300 && result) resolve(result)
      else reject(new Error(result?.error ?? 'Có lỗi xảy ra'))
    })
    request.addEventListener('error', () => reject(new Error('Mạng bị gián đoạn khi tải tệp')))
    request.addEventListener('timeout', () => reject(new Error('Tải tệp quá thời gian cho phép')))
    request.addEventListener('abort', () => reject(new Error('Đã hủy tải tệp')))
    request.send(form)
  })
}

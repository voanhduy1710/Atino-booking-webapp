import { postJson } from '@/shared/lib/apiClient'

export interface Session {
  username: string
  role: string
  allowedRoutes?: string[]
  supplier_id?: string
  supplier_account_id?: string
}

export interface LoginResponse {
  token: string
  role: string
}

export interface RegisterResponse {
  message: string
}

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function encodeToken(session: Session): string {
  return btoa(JSON.stringify(session))
}

export function decodeToken(token: string): Session | null {
  try {
    return JSON.parse(atob(token)) as Session
  } catch {
    return null
  }
}

export async function loginApi(username: string, password: string): Promise<LoginResponse> {
  const passwordHash = await sha256(password)
  const result = await postJson<{ session: Session; role: string }>('/api/auth/login', {
    username,
    password_hash: passwordHash,
  })
  return { token: encodeToken(result.session), role: result.role }
}

export async function registerSupplierApi(payload: {
  full_name: string
  username: string
  password: string
}): Promise<RegisterResponse> {
  const passwordHash = await sha256(payload.password)
  return postJson<RegisterResponse>('/api/auth/register-supplier', {
    full_name: payload.full_name,
    username: payload.username,
    password_hash: passwordHash,
    password: payload.password,
  })
}

export async function approveSupplierApi(
  supplierAccountId: string,
  supplierId: string
): Promise<void> {
  await postJson<{ ok: true }>(`/api/accounts/${supplierAccountId}/approve`, {
    supplier_id: supplierId,
  })
}

export async function rejectSupplierApi(
  supplierAccountId: string,
  reason: string
): Promise<void> {
  await postJson<{ ok: true }>(`/api/accounts/${supplierAccountId}/reject`, { reason })
}

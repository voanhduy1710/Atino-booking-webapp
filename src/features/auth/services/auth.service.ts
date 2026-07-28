import { postJson } from '@/shared/lib/apiClient'
import type { UserRole } from '@/shared/types/domain'

export interface LoginResponse {
  role: UserRole
  user: {
    sub: string
    username: string
    role: UserRole
    supplier_id?: string
    supplier_account_id?: string
    exp: number
  }
}

export interface RegisterResponse {
  message: string
}

export async function loginApi(username: string, password: string): Promise<LoginResponse> {
  return postJson<LoginResponse>('/api/auth/login', { username, password })
}

export async function registerSupplierApi(payload: { full_name: string; username: string; password: string }): Promise<RegisterResponse> {
  return postJson<RegisterResponse>('/api/auth/register-supplier', {
    full_name: payload.full_name,
    username: payload.username,
    password: payload.password,
  })
}

export async function approveSupplierApi(supplierAccountId: string, supplierId: string): Promise<void> {
  await postJson<{ ok: true }>(`/api/accounts/${supplierAccountId}/approve`, { supplier_id: supplierId })
}

export async function rejectSupplierApi(supplierAccountId: string, reason: string): Promise<void> {
  await postJson<{ ok: true }>(`/api/accounts/${supplierAccountId}/reject`, { reason })
}

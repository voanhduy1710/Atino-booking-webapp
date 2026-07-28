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

export async function loginApi(username: string, password: string): Promise<LoginResponse> {
  return postJson<LoginResponse>('/api/auth/login', { username, password })
}

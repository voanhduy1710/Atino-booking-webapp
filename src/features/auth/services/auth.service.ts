/**
 * auth.service.ts
 *
 * Auth flow — NO Edge Function required:
 *   Staff  (4 accounts) → validated client-side against VITE_STAFF_USERS env var
 *   Supplier accounts   → validated via Supabase RPC (login_supplier DB function)
 */

import { supabase } from '@/shared/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────

interface StaffUser {
  username: string
  password_hash: string // SHA-256 hex
  role: string
  allowedRoutes: string[]
}

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

// ── Helpers ────────────────────────────────────────────────────────────────────

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Encode a session as a base64 token (stored in localStorage). */
function encodeToken(session: Session): string {
  return btoa(JSON.stringify(session))
}

/** Decode a token back to a session object. Returns null if invalid. */
export function decodeToken(token: string): Session | null {
  try {
    return JSON.parse(atob(token)) as Session
  } catch {
    return null
  }
}

// ── Staff accounts from env ────────────────────────────────────────────────────

function getStaffUsers(): StaffUser[] {
  const raw = import.meta.env.VITE_STAFF_USERS as string | undefined
  if (!raw) return []
  try {
    return JSON.parse(raw) as StaffUser[]
  } catch {
    console.warn('[auth] VITE_STAFF_USERS is not valid JSON')
    return []
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Login.
 * 1. Checks staff accounts from VITE_STAFF_USERS env var.
 * 2. Falls back to supplier_accounts table via RPC.
 */
export async function loginApi(
  username: string,
  password: string
): Promise<LoginResponse> {
  const hash = await sha256(password)

  // 1. Staff check (client-side, from .env)
  const staffUsers = getStaffUsers()
  const staffUser = staffUsers.find((u) => u.username === username)
  if (staffUser) {
    if (staffUser.password_hash !== hash) {
      throw new Error('Sai tên đăng nhập hoặc mật khẩu')
    }
    const session: Session = {
      username: staffUser.username,
      role: staffUser.role,
      allowedRoutes: staffUser.allowedRoutes,
    }
    const token = encodeToken(session)
    return { token, role: staffUser.role }
  }

  // 2. Supplier check (DB RPC)
  const { data, error } = await supabase.rpc('login_supplier', {
    p_username: username,
    p_password_hash: hash,
  } as any)

  if (error) throw new Error('Lỗi hệ thống, vui lòng thử lại')

  // RPC returns null if username not found or password wrong
  if (!data) throw new Error('Sai tên đăng nhập hoặc mật khẩu')

  const acc = data as {
    id: string
    username: string
    status: string
    supplier_id: string | null
  }

  if (acc.status === 'pending') {
    throw new Error('Tài khoản đang chờ admin xác nhận')
  }
  if (acc.status === 'rejected') {
    throw new Error('Tài khoản đã bị từ chối')
  }

  const session: Session = {
    username: acc.username,
    role: 'supplier',
    supplier_id: acc.supplier_id ?? undefined,
    supplier_account_id: acc.id,
  }
  const token = encodeToken(session)
  return { token, role: 'supplier' }
}

/**
 * Register a new supplier account.
 * Calls register_supplier RPC (SECURITY DEFINER — bypasses RLS).
 */
export async function registerSupplierApi(payload: {
  full_name: string
  username: string
  password: string
}): Promise<RegisterResponse> {
  const hash = await sha256(payload.password)

  const { data, error } = await supabase.rpc('register_supplier', {
    p_username: payload.username,
    p_password_hash: hash,
    p_full_name: payload.full_name,
    p_password: payload.password,
  } as any)

  if (error) throw new Error('Lỗi hệ thống, vui lòng thử lại')

  const result = data as { error?: string; success?: boolean }
  if (result?.error) {
    // The RPC returns ASCII-only strings — map to proper Vietnamese with diacritics
    const RPC_ERROR_MAP: Record<string, string> = {
      'Ten dang nhap da ton tai': 'Tên đăng nhập đã tồn tại',
      'Vui long dien day du thong tin': 'Vui lòng điền đầy đủ thông tin',
      'Loi he thong': 'Lỗi hệ thống, vui lòng thử lại',
    }
    throw new Error(RPC_ERROR_MAP[result.error] ?? result.error)
  }

  return { message: 'Đăng ký thành công. Vui lòng chờ admin xác nhận.' }
}

/**
 * Approve a supplier account (admin action).
 * Calls approve_supplier_account RPC.
 */
export async function approveSupplierApi(
  supplierAccountId: string,
  supplierId: string
): Promise<void> {
  const { error } = await supabase.rpc('approve_supplier_account', {
    p_account_id: supplierAccountId,
    p_supplier_id: supplierId || null,
  } as any)
  if (error) throw new Error('Không thể phê duyệt tài khoản: ' + error.message)
}

/**
 * Reject a supplier account (admin action).
 * Calls reject_supplier_account RPC.
 */
export async function rejectSupplierApi(
  supplierAccountId: string,
  reason: string
): Promise<void> {
  const { error } = await supabase.rpc('reject_supplier_account', {
    p_account_id: supplierAccountId,
    p_reason: reason,
  } as any)
  if (error) throw new Error('Không thể từ chối tài khoản: ' + error.message)
}

import { useState, useEffect, lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Navbar } from '@/shared/components/Navbar'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { formatDateTimeDisplay } from '@/shared/lib/dateUtils'
import { approveSupplierApi, rejectSupplierApi } from '@/features/auth/services/auth.service'
import type { SupplierAccount, AccountStatus } from '@/shared/types/domain'
import type { NavTab } from '@/shared/components/Navbar'

const ReviewerPage = lazy(() => import('@/features/warehouse/reviewer/index'))
const ManagerPage = lazy(() => import('@/features/manager/index'))
const ReportPage = lazy(() => import('@/features/admin/ReportPage'))

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

type AdminTab = 'accounts' | 'warehouses' | 'suppliers' | 'reviewbookings' | 'manageviews' | 'report'
type ManageViewsTab = 'reviewer' | 'manager'

const ADMIN_TABS: NavTab[] = [
  { id: 'accounts',       label: 'Tài khoản NCC',    href: '/admin/accounts' },
  { id: 'warehouses',     label: 'Kho hàng',          href: '/admin/warehouses' },
  { id: 'suppliers',      label: 'Nhà cung cấp',      href: '/admin/suppliers' },
  { id: 'reviewbookings', label: 'Xác nhận booking',  href: '/admin/reviewbookings' },
  { id: 'manageviews',    label: 'Manage views',       href: '/admin/manageviews' },
  { id: 'report',         label: 'Báo cáo',            href: '/admin/report' },
]

const VALID_TABS: AdminTab[] = ['accounts', 'warehouses', 'suppliers', 'reviewbookings', 'manageviews', 'report']

interface Supplier { id: string; code: string; name: string; active: boolean }
interface Warehouse { id: string; code: string; name: string; active: boolean }
interface SupplierAccountWithPw extends SupplierAccount { password?: string }

function LinkBtn({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs underline ${danger ? 'text-[#CC0000] hover:text-[#990000]' : 'text-[#888888] hover:text-black'}`}
    >
      {children}
    </button>
  )
}

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)

export default function AdminPage() {
  const { pathname } = useLocation()

  const activeTab: AdminTab = (() => {
    for (const t of VALID_TABS) {
      if (pathname.includes(`/admin/${t}`)) return t
    }
    return 'accounts'
  })()

  // Accounts
  const [selectedAccount, setSelectedAccount] = useState<SupplierAccountWithPw | null>(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'all'>('pending')
  const [revealedPws, setRevealedPws] = useState<Set<string>>(new Set())

  // Password reset modal
  const [pwAccountId, setPwAccountId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)

  // Manageviews internal sub-tab
  const [manageViewsTab, setManageViewsTab] = useState<ManageViewsTab>('reviewer')

  // Warehouse add/edit
  const [addingWarehouse, setAddingWarehouse] = useState(false)
  const [newWhCode, setNewWhCode] = useState('')
  const [newWhName, setNewWhName] = useState('')
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null)
  const [editWhName, setEditWhName] = useState('')

  // Supplier add/edit
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [newSpCode, setNewSpCode] = useState('')
  const [newSpName, setNewSpName] = useState('')
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [editSpCode, setEditSpCode] = useState('')
  const [editSpName, setEditSpName] = useState('')

  const queryClient = useQueryClient()

  useEffect(() => { document.title = 'Admin — Atino' }, [])

  const togglePwReveal = (id: string) =>
    setRevealedPws(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['admin-accounts', statusFilter],
    queryFn: async () => {
      let q = supabase
        .from('supplier_accounts')
        .select('*, suppliers(name)')
        .order('created_at', { ascending: false })
      if (statusFilter !== 'all') q = q.eq('status', statusFilter)
      const { data, error } = await q
      if (error) throw error
      return data as SupplierAccountWithPw[]
    },
    enabled: activeTab === 'accounts',
  })

  const { data: warehouses = [] } = useQuery({
    queryKey: ['admin-warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('*').order('code')
      if (error) throw error
      return data as Warehouse[]
    },
    enabled: activeTab === 'warehouses',
  })

  const { data: suppliers = [] } = useQuery({
    queryKey: ['admin-suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('*').order('code')
      if (error) throw error
      return data as Supplier[]
    },
  })

  useEffect(() => {
    if (!selectedAccount) { setSelectedSupplierId(''); return }
    const match = suppliers.find((s) => s.code === selectedAccount.supplier_code_requested)
    setSelectedSupplierId(match?.id ?? '')
  }, [selectedAccount, suppliers])

  // ── Mutations ────────────────────────────────────────────────────────────────

  const approveMutation = useMutation({
    mutationFn: ({ accountId, supplierId }: { accountId: string; supplierId: string }) =>
      approveSupplierApi(accountId, supplierId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      setSelectedAccount(null)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ accountId, reason }: { accountId: string; reason: string }) =>
      rejectSupplierApi(accountId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      setSelectedAccount(null)
      setRejectReason('')
    },
  })

  const addWarehouseMutation = useMutation({
    mutationFn: async ({ code, name }: { code: string; name: string }) => {
      const { error } = await supabase.from('warehouses').insert({ code: code.trim().toUpperCase(), name: name.trim(), active: true })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-warehouses'] })
      setAddingWarehouse(false); setNewWhCode(''); setNewWhName('')
    },
  })

  const editWarehouseMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('warehouses').update({ name: name.trim() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-warehouses'] })
      setEditingWarehouse(null)
    },
  })

  const addSupplierMutation = useMutation({
    mutationFn: async ({ code, name }: { code: string; name: string }) => {
      const { error } = await supabase.from('suppliers').insert({ code: code.trim().toUpperCase(), name: name.trim(), active: true })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-suppliers'] })
      setAddingSupplier(false); setNewSpCode(''); setNewSpName('')
    },
  })

  const editSupplierMutation = useMutation({
    mutationFn: async ({ id, code, name }: { id: string; code: string; name: string }) => {
      const { error } = await supabase.from('suppliers').update({ code: code.trim().toUpperCase(), name: name.trim() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-suppliers'] })
      setEditingSupplier(null)
    },
  })

  const deleteAccountMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('supplier_accounts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-accounts'] }),
  })

  const deleteWarehouseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('warehouses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-warehouses'] }),
  })

  const deleteSupplierMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('suppliers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-suppliers'] }),
  })

  const confirmDelete = (label: string, onConfirm: () => void) => {
    if (window.confirm(`Xóa ${label}? Hành động này không thể hoàn tác.`)) onConfirm()
  }

  const handlePasswordReset = async () => {
    if (!pwAccountId || !newPassword.trim()) return
    setPwSaving(true); setPwError(null)
    try {
      const plaintext = newPassword.trim()
      const hash = await sha256(plaintext)
      const { error } = await supabase.rpc('admin_reset_supplier_password' as any, {
        p_account_id: pwAccountId,
        p_password_hash: hash,
        p_plaintext_password: plaintext,
      } as any)
      if (error) throw error
      setPwAccountId(null); setNewPassword('')
      void queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
    } catch (err) {
      setPwError((err as Error).message)
    } finally {
      setPwSaving(false)
    }
  }

  // ── Status helpers ────────────────────────────────────────────────────────────

  const STATUS_COLORS: Record<AccountStatus, string> = {
    pending: 'status-pending',
    active: 'status-confirmed',
    rejected: 'status-rejected',
  }
  const STATUS_LABELS: Record<AccountStatus, string> = {
    pending: 'Chờ xác nhận',
    active: 'Đang hoạt động',
    rejected: 'Đã từ chối',
  }

  const FILTER_OPTIONS: { value: AccountStatus | 'all'; label: string }[] = [
    { value: 'pending',  label: 'Chờ xác nhận' },
    { value: 'active',   label: 'Đang hoạt động' },
    { value: 'rejected', label: 'Đã từ chối' },
    { value: 'all',      label: 'Tất cả' },
  ]

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F5]">
      <Navbar tabs={ADMIN_TABS} activeTab={activeTab} />

      {/* Reviewer view */}
      {activeTab === 'reviewbookings' && (
        <Suspense fallback={<div className="flex justify-center py-16"><LoadingSpinner /></div>}>
          <ReviewerPage embedded canDelete />
        </Suspense>
      )}

      {/* Report */}
      {activeTab === 'report' && (
        <Suspense fallback={<div className="flex justify-center py-16"><LoadingSpinner /></div>}>
          <ReportPage />
        </Suspense>
      )}

      {/* Manageviews — sub-tab switcher */}
      {activeTab === 'manageviews' && (
        <div className="flex flex-col flex-1">
          <div className="flex justify-end border-b border-[#E0E0E0] bg-white px-4">
            {(['reviewer', 'manager'] as ManageViewsTab[]).map((t) => {
              const labels: Record<ManageViewsTab, string> = {
                reviewer: 'Reviewer',
                manager: 'Manager',
              }
              return (
                <button
                  key={t}
                  onClick={() => setManageViewsTab(t)}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    manageViewsTab === t ? 'bg-black text-white' : 'text-[#888888] hover:text-black'
                  }`}
                >
                  {labels[t]}
                </button>
              )
            })}
          </div>
          <Suspense fallback={<div className="flex justify-center py-16"><LoadingSpinner /></div>}>
            {manageViewsTab === 'reviewer' && <ReviewerPage embedded />}
            {manageViewsTab === 'manager' && <ManagerPage embedded />}
          </Suspense>
        </div>
      )}

      {/* Data tabs */}
      {(activeTab === 'accounts' || activeTab === 'warehouses' || activeTab === 'suppliers') && (
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">

          {/* ── Accounts ── */}
          {activeTab === 'accounts' && (
            <>
              <div className="flex gap-2 mb-4 flex-wrap">
                {FILTER_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setStatusFilter(value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      statusFilter === value
                        ? 'bg-black text-white border-black'
                        : 'bg-white border-[#E0E0E0] text-[#888888] hover:border-black hover:text-black'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {accountsLoading ? <LoadingSpinner className="mx-auto" /> : (
                <div className="overflow-x-auto bg-white border border-[#E0E0E0] rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#F5F5F5]">
                        <th className="table-header">Họ tên</th>
                        <th className="table-header">Username</th>
                        <th className="table-header">Mật khẩu</th>
                        <th className="table-header">Mã NCC</th>
                        <th className="table-header">Đăng ký lúc</th>
                        <th className="table-header">Trạng thái</th>
                        <th className="table-header w-32">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((a) => (
                        <tr key={a.id} className="border-t border-[#E0E0E0]">
                          <td className="table-cell">{a.full_name}</td>
                          <td className="table-cell font-mono">{a.username}</td>
                          <td className="table-cell">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-sm">
                                {revealedPws.has(a.id)
                                  ? (a.password
                                      ? a.password
                                      : <span className="text-[#BBBBBB] text-xs not-italic">Chưa có</span>)
                                  : '●●●●●●'}
                              </span>
                              <button
                                type="button"
                                onClick={() => togglePwReveal(a.id)}
                                className="text-[#888888] hover:text-black transition-colors flex-shrink-0"
                                aria-label={revealedPws.has(a.id) ? 'Ẩn' : 'Hiện'}
                              >
                                {revealedPws.has(a.id) ? <EyeOffIcon /> : <EyeIcon />}
                              </button>
                            </div>
                          </td>
                          <td className="table-cell font-mono font-medium">
                            {a.supplier_code_requested ?? <span className="text-[#BBBBBB]">—</span>}
                          </td>
                          <td className="table-cell text-xs">{formatDateTimeDisplay(a.created_at)}</td>
                          <td className="table-cell">
                            <span className={STATUS_COLORS[a.status]}>{STATUS_LABELS[a.status]}</span>
                          </td>
                          <td className="table-cell">
                            <div className="flex gap-2 flex-wrap">
                              {a.status === 'pending' && (
                                <LinkBtn onClick={() => setSelectedAccount(a)}>Xét duyệt</LinkBtn>
                              )}
                              <LinkBtn onClick={() => { setPwAccountId(a.id); setNewPassword(''); setPwError(null) }}>
                                Đặt lại MK
                              </LinkBtn>
                              <LinkBtn danger onClick={() => confirmDelete(`tài khoản "${a.username}"`, () => deleteAccountMutation.mutate(a.id))}>
                                Xóa
                              </LinkBtn>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {accounts.length === 0 && (
                        <tr><td colSpan={7} className="table-cell text-center text-[#888888] py-8">Không có dữ liệu</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Warehouses ── */}
          {activeTab === 'warehouses' && (
            <div>
              <div className="flex justify-end mb-3">
                <button onClick={() => { setAddingWarehouse(true); setNewWhCode(''); setNewWhName('') }} className="btn-green">
                  + Thêm kho
                </button>
              </div>
              <div className="overflow-x-auto bg-white border border-[#E0E0E0] rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F5F5F5]">
                      <th className="table-header">Mã kho</th>
                      <th className="table-header">Tên kho</th>
                      <th className="table-header">Trạng thái</th>
                      <th className="table-header w-32">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warehouses.map((w) => (
                      <tr key={w.id} className="border-t border-[#E0E0E0]">
                        <td className="table-cell font-mono">{w.code}</td>
                        <td className="table-cell">
                          {editingWarehouse?.id === w.id ? (
                            <input autoFocus value={editWhName} onChange={(e) => setEditWhName(e.target.value)} className="input-field py-1 text-xs" />
                          ) : w.name}
                        </td>
                        <td className="table-cell">
                          {w.active ? <span className="status-confirmed">Hoạt động</span> : <span className="status-rejected">Ngừng</span>}
                        </td>
                        <td className="table-cell">
                          <div className="flex gap-3">
                            {editingWarehouse?.id === w.id ? (
                              <>
                                <LinkBtn onClick={() => editWarehouseMutation.mutate({ id: w.id, name: editWhName })}>{editWarehouseMutation.isPending ? 'Lưu...' : 'Lưu'}</LinkBtn>
                                <LinkBtn onClick={() => setEditingWarehouse(null)}>Hủy</LinkBtn>
                              </>
                            ) : (
                              <>
                                <LinkBtn onClick={() => { setEditingWarehouse(w); setEditWhName(w.name) }}>Sửa</LinkBtn>
                                <LinkBtn danger onClick={() => confirmDelete(`kho "${w.name}"`, () => deleteWarehouseMutation.mutate(w.id))}>Xóa</LinkBtn>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}

                    {addingWarehouse && (
                      <tr className="border-t border-[#E0E0E0] bg-[#FAFAFA]">
                        <td className="table-cell"><input autoFocus value={newWhCode} onChange={(e) => setNewWhCode(e.target.value.toUpperCase())} placeholder="VD: THL" className="input-field py-1 text-xs font-mono w-28" /></td>
                        <td className="table-cell"><input value={newWhName} onChange={(e) => setNewWhName(e.target.value)} placeholder="Tên kho..." className="input-field py-1 text-xs" /></td>
                        <td className="table-cell text-[#888888] text-xs">Hoạt động</td>
                        <td className="table-cell">
                          <div className="flex gap-3">
                            <LinkBtn onClick={() => addWarehouseMutation.mutate({ code: newWhCode, name: newWhName })}>{addWarehouseMutation.isPending ? 'Lưu...' : 'Lưu'}</LinkBtn>
                            <LinkBtn onClick={() => setAddingWarehouse(false)}>Hủy</LinkBtn>
                          </div>
                          {addWarehouseMutation.isError && <p className="text-xs text-[#CC0000] mt-1">{(addWarehouseMutation.error as Error).message}</p>}
                        </td>
                      </tr>
                    )}
                    {warehouses.length === 0 && !addingWarehouse && (
                      <tr><td colSpan={4} className="table-cell text-center text-[#888888] py-8">Không có dữ liệu</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Suppliers ── */}
          {activeTab === 'suppliers' && (
            <div>
              <div className="flex justify-end mb-3">
                <button onClick={() => { setAddingSupplier(true); setNewSpCode(''); setNewSpName('') }} className="btn-green">
                  + Thêm NCC
                </button>
              </div>
              <div className="overflow-x-auto bg-white border border-[#E0E0E0] rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F5F5F5]">
                      <th className="table-header">Mã NCC</th>
                      <th className="table-header">Tên NCC</th>
                      <th className="table-header">Trạng thái</th>
                      <th className="table-header w-32">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s) => (
                      <tr key={s.id} className="border-t border-[#E0E0E0]">
                        <td className="table-cell font-mono">
                          {editingSupplier?.id === s.id ? (
                            <input autoFocus value={editSpCode} onChange={(e) => setEditSpCode(e.target.value.toUpperCase())} className="input-field py-1 text-xs font-mono w-28" />
                          ) : s.code}
                        </td>
                        <td className="table-cell">
                          {editingSupplier?.id === s.id ? (
                            <input value={editSpName} onChange={(e) => setEditSpName(e.target.value)} className="input-field py-1 text-xs" />
                          ) : s.name}
                        </td>
                        <td className="table-cell">
                          {s.active ? <span className="status-confirmed">Hoạt động</span> : <span className="status-rejected">Ngừng</span>}
                        </td>
                        <td className="table-cell">
                          <div className="flex gap-3">
                            {editingSupplier?.id === s.id ? (
                              <>
                                <LinkBtn onClick={() => editSupplierMutation.mutate({ id: s.id, code: editSpCode, name: editSpName })}>{editSupplierMutation.isPending ? 'Lưu...' : 'Lưu'}</LinkBtn>
                                <LinkBtn onClick={() => setEditingSupplier(null)}>Hủy</LinkBtn>
                              </>
                            ) : (
                              <>
                                <LinkBtn onClick={() => { setEditingSupplier(s); setEditSpCode(s.code); setEditSpName(s.name) }}>Sửa</LinkBtn>
                                <LinkBtn danger onClick={() => confirmDelete(`NCC "${s.name}"`, () => deleteSupplierMutation.mutate(s.id))}>Xóa</LinkBtn>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}

                    {addingSupplier && (
                      <tr className="border-t border-[#E0E0E0] bg-[#FAFAFA]">
                        <td className="table-cell"><input autoFocus value={newSpCode} onChange={(e) => setNewSpCode(e.target.value.toUpperCase())} placeholder="VD: GC01" className="input-field py-1 text-xs font-mono w-28" /></td>
                        <td className="table-cell"><input value={newSpName} onChange={(e) => setNewSpName(e.target.value)} placeholder="Tên nhà cung cấp..." className="input-field py-1 text-xs" /></td>
                        <td className="table-cell text-[#888888] text-xs">Hoạt động</td>
                        <td className="table-cell">
                          <div className="flex gap-3">
                            <LinkBtn onClick={() => addSupplierMutation.mutate({ code: newSpCode, name: newSpName })}>{addSupplierMutation.isPending ? 'Lưu...' : 'Lưu'}</LinkBtn>
                            <LinkBtn onClick={() => setAddingSupplier(false)}>Hủy</LinkBtn>
                          </div>
                          {addSupplierMutation.isError && <p className="text-xs text-[#CC0000] mt-1">{(addSupplierMutation.error as Error).message}</p>}
                        </td>
                      </tr>
                    )}
                    {suppliers.length === 0 && !addingSupplier && (
                      <tr><td colSpan={4} className="table-cell text-center text-[#888888] py-8">Không có dữ liệu</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Approve modal ── */}
          <Modal
            isOpen={!!selectedAccount}
            onClose={() => { setSelectedAccount(null); setRejectReason('') }}
            title="Xét duyệt tài khoản"
            size="md"
          >
            {selectedAccount && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-[#888888]">Họ tên</p><p className="font-medium">{selectedAccount.full_name}</p></div>
                  <div><p className="text-xs text-[#888888]">Username</p><p className="font-mono">{selectedAccount.username}</p></div>
                  <div>
                    <p className="text-xs text-[#888888]">Mã NCC yêu cầu</p>
                    <p className="font-mono font-bold">{selectedAccount.supplier_code_requested ?? <span className="text-[#BBBBBB]">Chưa có</span>}</p>
                  </div>
                  <div><p className="text-xs text-[#888888]">Đăng ký lúc</p><p>{formatDateTimeDisplay(selectedAccount.created_at)}</p></div>
                </div>

                <div>
                  <label className="text-xs text-[#888888] block mb-1">
                    Liên kết Nhà cung cấp <span className="text-[#CC0000]">*</span>
                  </label>
                  <select value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(e.target.value)} className="input-field">
                    <option value="">— Chọn NCC —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>[{s.code}] {s.name}</option>
                    ))}
                  </select>
                </div>

                <Button
                  variant="success"
                  fullWidth
                  loading={approveMutation.isPending}
                  disabled={!selectedSupplierId}
                  onClick={() => {
                    if (!selectedSupplierId) return
                    approveMutation.mutate({ accountId: selectedAccount.id, supplierId: selectedSupplierId })
                  }}
                >
                  Phê duyệt
                </Button>

                {approveMutation.isError && (
                  <p className="text-xs text-[#CC0000]">{(approveMutation.error as Error).message}</p>
                )}

                <div>
                  <p className="text-sm font-medium mb-2 text-[#CC0000]">Hoặc từ chối:</p>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    className="input-field resize-none mb-2"
                    placeholder="Lý do từ chối..."
                  />
                  <Button
                    variant="danger-outline"
                    fullWidth
                    loading={rejectMutation.isPending}
                    disabled={!rejectReason.trim()}
                    onClick={() => rejectMutation.mutate({ accountId: selectedAccount.id, reason: rejectReason })}
                  >
                    Từ chối tài khoản
                  </Button>
                </div>
              </div>
            )}
          </Modal>

          {/* ── Reset password modal ── */}
          <Modal
            isOpen={!!pwAccountId}
            onClose={() => { setPwAccountId(null); setNewPassword(''); setPwError(null) }}
            title="Đặt lại mật khẩu"
            size="sm"
          >
            <div className="space-y-4">
              <p className="text-sm text-[#888888]">Nhập mật khẩu mới:</p>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mật khẩu mới..."
                className="input-field"
                autoFocus
              />
              {pwError && <p className="text-xs text-[#CC0000]">{pwError}</p>}
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setPwAccountId(null)} className="flex-1">Hủy</Button>
                <Button
                  variant="success"
                  loading={pwSaving}
                  disabled={!newPassword.trim()}
                  onClick={() => void handlePasswordReset()}
                  className="flex-1"
                >
                  Lưu
                </Button>
              </div>
            </div>
          </Modal>

        </main>
      )}
    </div>
  )
}

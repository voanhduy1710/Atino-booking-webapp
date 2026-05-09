import { useState, useEffect, lazy, Suspense } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Navbar } from '@/shared/components/Navbar'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { formatDateTimeDisplay } from '@/shared/lib/dateUtils'
import { approveSupplierApi, rejectSupplierApi } from '@/features/auth/services/auth.service'
import type { SupplierAccount, AccountStatus } from '@/shared/types/domain'

const ReviewerPage = lazy(() => import('@/features/warehouse/reviewer/index'))
const ReceiverPage = lazy(() => import('@/features/warehouse/receiver/index'))
const ManagerPage = lazy(() => import('@/features/manager/index'))

type Tab = 'accounts' | 'warehouses' | 'suppliers'
type ViewAs = null | 'reviewer' | 'receiver' | 'manager'

interface Supplier { id: string; code: string; name: string; active: boolean }
interface Warehouse { id: string; code: string; name: string; active: boolean }

// ── tiny helpers ──────────────────────────────────────────────────────────────
function GreenBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} className="btn-green">
      {children}
    </button>
  )
}

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

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('accounts')
  const [viewAs, setViewAs] = useState<ViewAs>(null)

  // Approve modal
  const [selectedAccount, setSelectedAccount] = useState<SupplierAccount | null>(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'all'>('pending')

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
  const [editSpName, setEditSpName] = useState('')

  const queryClient = useQueryClient()

  useEffect(() => { document.title = 'Admin — Atino' }, [])

  // ── Queries ─────────────────────────────────────────────────────────────────

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
      return data as SupplierAccount[]
    },
    enabled: tab === 'accounts',
  })

  const { data: warehouses = [] } = useQuery({
    queryKey: ['admin-warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('*').order('code')
      if (error) throw error
      return data as Warehouse[]
    },
    enabled: tab === 'warehouses',
  })

  // Always fetch — also needed for approve modal dropdown
  const { data: suppliers = [] } = useQuery({
    queryKey: ['admin-suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('*').order('code')
      if (error) throw error
      return data as Supplier[]
    },
  })

  // Pre-select matching supplier when approve modal opens
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

  // Warehouse mutations
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

  const toggleWarehouseActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('warehouses').update({ active: !active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-warehouses'] }),
  })

  // Supplier mutations
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
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('suppliers').update({ name: name.trim() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-suppliers'] })
      setEditingSupplier(null)
    },
  })

  const toggleSupplierActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('suppliers').update({ active: !active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-suppliers'] }),
  })

  // ── Status helpers ───────────────────────────────────────────────────────────

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

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F5]">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Quản trị hệ thống</h1>

          {/* View as quick-switch */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#888888] mr-1">Xem với vai trò:</span>
            {(['reviewer', 'receiver', 'manager'] as ViewAs[]).map((role) => (
              <button
                key={role as string}
                onClick={() => setViewAs(viewAs === role ? null : role)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  viewAs === role
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-[#888888] border-[#E0E0E0] hover:border-black hover:text-black'
                }`}
              >
                {role === 'reviewer' ? '🔍 Reviewer' : role === 'receiver' ? '🏭 Receiver' : '📊 Manager'}
              </button>
            ))}
            {viewAs && (
              <button
                onClick={() => setViewAs(null)}
                className="text-xs text-[#888888] hover:text-black underline ml-1"
              >
                ← Admin
              </button>
            )}
          </div>
        </div>

        {/* ── Embedded role view ── */}
        {viewAs && (
          <div className="mb-6 border border-[#E0E0E0] rounded-lg overflow-hidden">
            <div className="bg-[#F5F5F5] px-4 py-2 border-b border-[#E0E0E0] flex items-center justify-between">
              <span className="text-xs font-medium text-[#888888] uppercase tracking-wider">
                Đang xem: /{viewAs}
              </span>
              <button onClick={() => setViewAs(null)} className="text-[#888888] hover:text-black text-lg">
                ×
              </button>
            </div>
            <div className="overflow-y-auto max-h-[70vh]">
              <Suspense fallback={<div className="flex justify-center py-16"><LoadingSpinner /></div>}>
                {viewAs === 'reviewer' && <ReviewerPage />}
                {viewAs === 'receiver' && <ReceiverPage />}
                {viewAs === 'manager' && <ManagerPage />}
              </Suspense>
            </div>
          </div>
        )}

        {/* ── Admin data tabs (hidden when viewing a role) ── */}
        {!viewAs && (
          <>
        {/* Tabs */}
        <div className="flex border-b border-[#E0E0E0] mb-6">
          {([['accounts', 'Tài khoản NCC'], ['warehouses', 'Kho hàng'], ['suppliers', 'Nhà cung cấp']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? 'border-black text-black' : 'border-transparent text-[#888888] hover:text-black'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Accounts tab ── */}
        {tab === 'accounts' && (
          <>
            <div className="flex gap-2 mb-4">
              {(['pending', 'active', 'rejected', 'all'] as (AccountStatus | 'all')[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    statusFilter === s ? 'bg-black text-white border-black' : 'bg-white border-[#E0E0E0] text-[#888888] hover:border-black hover:text-black'
                  }`}
                >
                  {s === 'all' ? 'Tất cả' : STATUS_LABELS[s]}
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
                      <th className="table-header">Mã NCC</th>
                      <th className="table-header">Đăng ký lúc</th>
                      <th className="table-header">Trạng thái</th>
                      <th className="table-header w-24">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.id} className="border-t border-[#E0E0E0]">
                        <td className="table-cell">{a.full_name}</td>
                        <td className="table-cell font-mono">{a.username}</td>
                        <td className="table-cell font-mono font-medium">
                          {a.supplier_code_requested ?? <span className="text-[#BBBBBB]">—</span>}
                        </td>
                        <td className="table-cell">{formatDateTimeDisplay(a.created_at)}</td>
                        <td className="table-cell">
                          <span className={STATUS_COLORS[a.status]}>{STATUS_LABELS[a.status]}</span>
                        </td>
                        <td className="table-cell">
                          {a.status === 'pending' && (
                            <button
                              onClick={() => setSelectedAccount(a)}
                              className="text-xs text-[#888888] hover:text-black underline"
                            >
                              Xét duyệt
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {accounts.length === 0 && (
                      <tr><td colSpan={6} className="table-cell text-center text-[#888888] py-8">Không có dữ liệu</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Warehouses tab ── */}
        {tab === 'warehouses' && (
          <div>
            <div className="flex justify-end mb-3">
              <GreenBtn onClick={() => { setAddingWarehouse(true); setNewWhCode(''); setNewWhName('') }}>
                + Thêm kho
              </GreenBtn>
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
                          <input
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus
                            value={editWhName}
                            onChange={(e) => setEditWhName(e.target.value)}
                            className="input-field py-1 text-xs"
                          />
                        ) : w.name}
                      </td>
                      <td className="table-cell">
                        {w.active
                          ? <span className="status-confirmed">Hoạt động</span>
                          : <span className="status-rejected">Ngừng</span>}
                      </td>
                      <td className="table-cell">
                        <div className="flex gap-3">
                          {editingWarehouse?.id === w.id ? (
                            <>
                              <LinkBtn onClick={() => editWarehouseMutation.mutate({ id: w.id, name: editWhName })}>
                                {editWarehouseMutation.isPending ? 'Lưu...' : 'Lưu'}
                              </LinkBtn>
                              <LinkBtn onClick={() => setEditingWarehouse(null)}>Hủy</LinkBtn>
                            </>
                          ) : (
                            <>
                              <LinkBtn onClick={() => { setEditingWarehouse(w); setEditWhName(w.name) }}>Sửa</LinkBtn>
                              <LinkBtn
                                danger={w.active}
                                onClick={() => toggleWarehouseActive.mutate({ id: w.id, active: w.active })}
                              >
                                {w.active ? 'Ngừng' : 'Kích hoạt'}
                              </LinkBtn>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* Inline add row */}
                  {addingWarehouse && (
                    <tr className="border-t border-[#E0E0E0] bg-[#FAFAFA]">
                      <td className="table-cell">
                        <input
                          // eslint-disable-next-line jsx-a11y/no-autofocus
                          autoFocus
                          value={newWhCode}
                          onChange={(e) => setNewWhCode(e.target.value.toUpperCase())}
                          placeholder="VD: THL"
                          className="input-field py-1 text-xs font-mono w-28"
                        />
                      </td>
                      <td className="table-cell">
                        <input
                          value={newWhName}
                          onChange={(e) => setNewWhName(e.target.value)}
                          placeholder="Tên kho..."
                          className="input-field py-1 text-xs"
                        />
                      </td>
                      <td className="table-cell text-[#888888] text-xs">Hoạt động</td>
                      <td className="table-cell">
                        <div className="flex gap-3">
                          <LinkBtn
                            onClick={() => addWarehouseMutation.mutate({ code: newWhCode, name: newWhName })}
                          >
                            {addWarehouseMutation.isPending ? 'Lưu...' : 'Lưu'}
                          </LinkBtn>
                          <LinkBtn onClick={() => setAddingWarehouse(false)}>Hủy</LinkBtn>
                        </div>
                        {addWarehouseMutation.isError && (
                          <p className="text-xs text-[#CC0000] mt-1">{(addWarehouseMutation.error as Error).message}</p>
                        )}
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

        {/* ── Suppliers tab ── */}
        {tab === 'suppliers' && (
          <div>
            <div className="flex justify-end mb-3">
              <GreenBtn onClick={() => { setAddingSupplier(true); setNewSpCode(''); setNewSpName('') }}>
                + Thêm NCC
              </GreenBtn>
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
                      <td className="table-cell font-mono">{s.code}</td>
                      <td className="table-cell">
                        {editingSupplier?.id === s.id ? (
                          <input
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus
                            value={editSpName}
                            onChange={(e) => setEditSpName(e.target.value)}
                            className="input-field py-1 text-xs"
                          />
                        ) : s.name}
                      </td>
                      <td className="table-cell">
                        {s.active
                          ? <span className="status-confirmed">Hoạt động</span>
                          : <span className="status-rejected">Ngừng</span>}
                      </td>
                      <td className="table-cell">
                        <div className="flex gap-3">
                          {editingSupplier?.id === s.id ? (
                            <>
                              <LinkBtn onClick={() => editSupplierMutation.mutate({ id: s.id, name: editSpName })}>
                                {editSupplierMutation.isPending ? 'Lưu...' : 'Lưu'}
                              </LinkBtn>
                              <LinkBtn onClick={() => setEditingSupplier(null)}>Hủy</LinkBtn>
                            </>
                          ) : (
                            <>
                              <LinkBtn onClick={() => { setEditingSupplier(s); setEditSpName(s.name) }}>Sửa</LinkBtn>
                              <LinkBtn
                                danger={s.active}
                                onClick={() => toggleSupplierActive.mutate({ id: s.id, active: s.active })}
                              >
                                {s.active ? 'Ngừng' : 'Kích hoạt'}
                              </LinkBtn>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* Inline add row */}
                  {addingSupplier && (
                    <tr className="border-t border-[#E0E0E0] bg-[#FAFAFA]">
                      <td className="table-cell">
                        <input
                          // eslint-disable-next-line jsx-a11y/no-autofocus
                          autoFocus
                          value={newSpCode}
                          onChange={(e) => setNewSpCode(e.target.value.toUpperCase())}
                          placeholder="VD: GC01"
                          className="input-field py-1 text-xs font-mono w-28"
                        />
                      </td>
                      <td className="table-cell">
                        <input
                          value={newSpName}
                          onChange={(e) => setNewSpName(e.target.value)}
                          placeholder="Tên nhà cung cấp..."
                          className="input-field py-1 text-xs"
                        />
                      </td>
                      <td className="table-cell text-[#888888] text-xs">Hoạt động</td>
                      <td className="table-cell">
                        <div className="flex gap-3">
                          <LinkBtn
                            onClick={() => addSupplierMutation.mutate({ code: newSpCode, name: newSpName })}
                          >
                            {addSupplierMutation.isPending ? 'Lưu...' : 'Lưu'}
                          </LinkBtn>
                          <LinkBtn onClick={() => setAddingSupplier(false)}>Hủy</LinkBtn>
                        </div>
                        {addSupplierMutation.isError && (
                          <p className="text-xs text-[#CC0000] mt-1">{(addSupplierMutation.error as Error).message}</p>
                        )}
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
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="input-field"
                >
                  <option value="">— Chọn NCC —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>[{s.code}] {s.name}</option>
                  ))}
                </select>
                {suppliers.length === 0 && (
                  <p className="text-xs text-[#888888] mt-1">
                    Chưa có NCC nào. Thêm NCC trong tab &quot;Nhà cung cấp&quot; trước.
                  </p>
                )}
              </div>

              <Button
                fullWidth
                loading={approveMutation.isPending}
                disabled={!selectedSupplierId}
                onClick={() => {
                  if (!selectedSupplierId) return
                  approveMutation.mutate({ accountId: selectedAccount.id, supplierId: selectedSupplierId })
                }}
              >
                ✅ Phê duyệt
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
                  ❌ Từ chối tài khoản
                </Button>
              </div>
            </div>
          )}
        </Modal>

      </> )} {/* end !viewAs */}

      </main>
    </div>
  )
}


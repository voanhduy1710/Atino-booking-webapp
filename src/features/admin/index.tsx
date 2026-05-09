import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Navbar } from '@/shared/components/Navbar'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { formatDateTimeDisplay } from '@/shared/lib/dateUtils'
import { approveSupplierApi, rejectSupplierApi } from '@/features/auth/services/auth.service'
import type { SupplierAccount, AccountStatus } from '@/shared/types/domain'

type Tab = 'accounts' | 'warehouses' | 'suppliers'

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('accounts')
  const [selectedAccount, setSelectedAccount] = useState<SupplierAccount | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'all'>('pending')
  const queryClient = useQueryClient()

  useEffect(() => { document.title = 'Admin — Atino' }, [])

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
      return data
    },
    enabled: tab === 'warehouses',
  })

  const { data: suppliers = [] } = useQuery({
    queryKey: ['admin-suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('*').order('code')
      if (error) throw error
      return data
    },
    enabled: tab === 'suppliers',
  })

  const approveMutation = useMutation({
    mutationFn: async ({ accountId, supplierId }: { accountId: string; supplierId: string }) => {
      await approveSupplierApi(accountId, supplierId)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      setSelectedAccount(null)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async ({ accountId, reason }: { accountId: string; reason: string }) => {
      await rejectSupplierApi(accountId, reason)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      setSelectedAccount(null)
      setRejectReason('')
    },
  })

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

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F5]">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <h1 className="text-xl font-bold mb-6">Quản trị hệ thống</h1>

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

        {/* Accounts tab */}
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
                      <th className="table-header">Mã NCC yêu cầu</th>
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
                        <td className="table-cell font-mono">{a.supplier_code_requested ?? <span className="text-[#BBBBBB]">—</span>}</td>
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

        {/* Warehouses tab */}
        {tab === 'warehouses' && (
          <div className="overflow-x-auto bg-white border border-[#E0E0E0] rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F5F5F5]">
                  <th className="table-header">Mã kho</th>
                  <th className="table-header">Tên kho</th>
                  <th className="table-header">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((w: any) => (
                  <tr key={w.id} className="border-t border-[#E0E0E0]">
                    <td className="table-cell font-mono">{w.code}</td>
                    <td className="table-cell">{w.name}</td>
                    <td className="table-cell">{w.active ? <span className="status-confirmed">Hoạt động</span> : <span className="status-rejected">Ngừng</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Suppliers tab */}
        {tab === 'suppliers' && (
          <div className="overflow-x-auto bg-white border border-[#E0E0E0] rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F5F5F5]">
                  <th className="table-header">Mã NCC</th>
                  <th className="table-header">Tên NCC</th>
                  <th className="table-header">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s: any) => (
                  <tr key={s.id} className="border-t border-[#E0E0E0]">
                    <td className="table-cell font-mono">{s.code}</td>
                    <td className="table-cell">{s.name}</td>
                    <td className="table-cell">{s.active ? <span className="status-confirmed">Hoạt động</span> : <span className="status-rejected">Ngừng</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Approve modal */}
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
              <div><p className="text-xs text-[#888888]">Mã NCC yêu cầu</p><p className="font-mono font-bold">{selectedAccount.supplier_code_requested ?? <span className="text-[#BBBBBB]">Chưa có</span>}</p></div>
              <div><p className="text-xs text-[#888888]">Đăng ký lúc</p><p>{formatDateTimeDisplay(selectedAccount.created_at)}</p></div>
            </div>

            {/* Approve: need to pick the actual supplier_id */}
            <div className="flex gap-3">
              <Button
                fullWidth
                loading={approveMutation.isPending}
                onClick={() => {
                  // For simplicity, approve with supplier_code_requested — lookup supplier_id
                  supabase
                    .from('suppliers')
                    .select('id')
                    .eq('code', selectedAccount.supplier_code_requested)
                    .single()
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .then(({ data }: { data: any }) => {
                      if (!data) { alert('Không tìm thấy NCC với mã ' + selectedAccount.supplier_code_requested); return }
                      approveMutation.mutate({ accountId: selectedAccount.id, supplierId: data.id as string })
                    })
                }}
              >
                ✅ Phê duyệt
              </Button>
            </div>

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
    </div>
  )
}

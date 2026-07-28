import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { approveSupplierApi, rejectSupplierApi } from '@/features/auth/services/auth.service'
import { Button } from '@/shared/components/Button'
import { LinkBtn } from '@/shared/components/LinkBtn'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { Modal } from '@/shared/components/Modal'
import { ACCOUNT_STATUS_CLASSES, ACCOUNT_STATUS_FILTER_OPTIONS, ACCOUNT_STATUS_LABELS } from '@/shared/constants/status'
import { getJson, postJson } from '@/shared/lib/apiClient'
import { formatDateTimeDisplay } from '@/shared/lib/dateUtils'
import type { AccountStatus, Supplier, SupplierAccount } from '@/shared/types/domain'

interface Props {
  accountsQueryKey?: string
  suppliersQueryKey?: string
}

export function AccountManagement({
  accountsQueryKey = 'accounts',
  suppliersQueryKey = 'suppliers',
}: Props) {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'all'>('pending')
  const [selectedAccount, setSelectedAccount] = useState<SupplierAccount | null>(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [pwAccountId, setPwAccountId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: [accountsQueryKey, statusFilter],
    queryFn: async () => {
      const result = await getJson<{ accounts: SupplierAccount[] }>(`/api/accounts?status=${encodeURIComponent(statusFilter)}`)
      return result.accounts
    },
  })

  const { data: suppliers = [] } = useQuery({
    queryKey: [suppliersQueryKey],
    queryFn: async () => {
      const result = await getJson<{ suppliers: Supplier[] }>('/api/accounts/suppliers')
      return result.suppliers
    },
  })

  useEffect(() => {
    if (!selectedAccount) {
      setSelectedSupplierId('')
      return
    }
    const match = suppliers.find((s) => s.code === selectedAccount.supplier_code_requested)
    setSelectedSupplierId(match?.id ?? '')
  }, [selectedAccount, suppliers])

  const approveMutation = useMutation({
    mutationFn: ({ accountId, supplierId }: { accountId: string; supplierId: string }) =>
      approveSupplierApi(accountId, supplierId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [accountsQueryKey] })
      setSelectedAccount(null)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ accountId, reason }: { accountId: string; reason: string }) =>
      rejectSupplierApi(accountId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [accountsQueryKey] })
      setSelectedAccount(null)
      setRejectReason('')
    },
  })

  const deleteAccountMutation = useMutation({
    mutationFn: async (id: string) => {
      await postJson<{ ok: true }>(`/api/accounts/${id}`, undefined, { method: 'DELETE' })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [accountsQueryKey] }),
  })

  const handlePasswordReset = async () => {
    if (!pwAccountId || !newPassword.trim()) return
    setPwSaving(true)
    setPwError(null)
    try {
      await postJson<{ ok: true }>(`/api/accounts/${pwAccountId}/reset-password`, {
        password: newPassword,
      })
      setPwAccountId(null)
      setNewPassword('')
      void queryClient.invalidateQueries({ queryKey: [accountsQueryKey] })
    } catch (err) {
      setPwError((err as Error).message)
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <>
      <div className="flex gap-2 mb-4 flex-wrap">
        {ACCOUNT_STATUS_FILTER_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${statusFilter === value ? 'bg-[#80417A] text-white border-[#80417A] font-bold' : 'bg-white border-[#ecdbe8] text-[#888888] hover:border-[#80417A] hover:text-black'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingSpinner className="mx-auto" /> : (
        <div className="overflow-x-auto bg-white border border-[#ecdbe8] rounded-lg">
          <table className="hidden w-full text-sm sm:table">
            <thead>
              <tr className="bg-[#F5F5F5]">
                <th className="table-header">Họ tên</th>
                <th className="table-header">Username</th>
                <th className="table-header">Mã NCC</th>
                <th className="table-header">Đăng ký lúc</th>
                <th className="table-header">Trạng thái</th>
                <th className="table-header w-32">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-[#ecdbe8]">
                  <td className="table-cell">{a.full_name}</td>
                  <td className="table-cell font-mono">{a.username}</td>
                  <td className="table-cell font-mono font-medium">{a.supplier_code_requested ?? <span className="text-[#BBBBBB]">—</span>}</td>
                  <td className="table-cell text-xs">{formatDateTimeDisplay(a.created_at)}</td>
                  <td className="table-cell"><span className={ACCOUNT_STATUS_CLASSES[a.status]}>{ACCOUNT_STATUS_LABELS[a.status]}</span></td>
                  <td className="table-cell">
                    <div className="flex gap-2 flex-wrap">
                      {a.status === 'pending' && <LinkBtn onClick={() => setSelectedAccount(a)}>Xét duyệt</LinkBtn>}
                      <LinkBtn onClick={() => { setPwAccountId(a.id); setNewPassword(''); setPwError(null) }}>Đặt lại MK</LinkBtn>
                      <LinkBtn danger onClick={() => {
                        if (window.confirm(`Xóa tài khoản "${a.username}"? Không thể hoàn tác.`)) deleteAccountMutation.mutate(a.id)
                      }}>Xóa</LinkBtn>
                    </div>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr><td colSpan={6} className="table-cell text-center text-[#888888] py-8">Không có dữ liệu</td></tr>
              )}
            </tbody>
          </table>
          <div className="divide-y divide-[#ecdbe8] sm:hidden">
            {accounts.map((account) => (
              <article key={account.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{account.full_name}</p>
                    <p className="truncate font-mono text-xs text-[#555555]">{account.username}</p>
                  </div>
                  <span className={ACCOUNT_STATUS_CLASSES[account.status]}>{ACCOUNT_STATUS_LABELS[account.status]}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div><dt className="text-[#888888]">Mã NCC</dt><dd className="font-mono">{account.supplier_code_requested ?? '—'}</dd></div>
                  <div><dt className="text-[#888888]">Đăng ký</dt><dd>{formatDateTimeDisplay(account.created_at)}</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  {account.status === 'pending' && <button type="button" className="min-h-11 rounded border border-[#80417A] px-3 text-sm text-[#80417A]" onClick={() => setSelectedAccount(account)}>Xét duyệt</button>}
                  <button type="button" className="min-h-11 rounded border border-[#d5c0d5] px-3 text-sm" onClick={() => { setPwAccountId(account.id); setNewPassword(''); setPwError(null) }}>Đặt lại MK</button>
                  <button type="button" className="min-h-11 rounded border border-[#CC0000] px-3 text-sm text-[#CC0000]" onClick={() => {
                    if (window.confirm(`Xóa tài khoản "${account.username}"? Không thể hoàn tác.`)) deleteAccountMutation.mutate(account.id)
                  }}>Xóa</button>
                </div>
              </article>
            ))}
            {accounts.length === 0 && <p className="p-8 text-center text-sm text-[#888888]">Không có dữ liệu</p>}
          </div>
        </div>
      )}

      <Modal isOpen={!!selectedAccount} onClose={() => { setSelectedAccount(null); setRejectReason('') }} title="Xét duyệt tài khoản" size="md">
        {selectedAccount && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-[#888888]">Họ tên</p><p className="font-medium">{selectedAccount.full_name}</p></div>
              <div><p className="text-xs text-[#888888]">Username</p><p className="font-mono">{selectedAccount.username}</p></div>
              <div><p className="text-xs text-[#888888]">Mã NCC yêu cầu</p><p className="font-mono font-bold">{selectedAccount.supplier_code_requested ?? <span className="text-[#BBBBBB]">Chưa có</span>}</p></div>
              <div><p className="text-xs text-[#888888]">Đăng ký lúc</p><p>{formatDateTimeDisplay(selectedAccount.created_at)}</p></div>
            </div>
            <div>
              <label className="text-xs text-[#888888] block mb-1">Liên kết Nhà cung cấp <span className="text-[#CC0000]">*</span></label>
              <select value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(e.target.value)} className="input-field">
                <option value="">— Chọn NCC —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>[{s.code}] {s.name}</option>)}
              </select>
            </div>
            <Button variant="success" fullWidth loading={approveMutation.isPending} disabled={!selectedSupplierId} onClick={() => {
              if (!selectedSupplierId) return
              approveMutation.mutate({ accountId: selectedAccount.id, supplierId: selectedSupplierId })
            }}>Phê duyệt</Button>
            {approveMutation.isError && <p className="text-xs text-[#CC0000]">{(approveMutation.error as Error).message}</p>}
            <div>
              <p className="text-sm font-medium mb-2 text-[#CC0000]">Hoặc từ chối:</p>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} className="input-field resize-none mb-2" placeholder="Lý do từ chối..." />
              <Button variant="danger-outline" fullWidth loading={rejectMutation.isPending} disabled={!rejectReason.trim()} onClick={() => rejectMutation.mutate({ accountId: selectedAccount.id, reason: rejectReason })}>Từ chối tài khoản</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!pwAccountId} onClose={() => { setPwAccountId(null); setNewPassword(''); setPwError(null) }} title="Đặt lại mật khẩu" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#888888]">Nhập mật khẩu mới:</p>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Mật khẩu mới..."
            className="input-field"
            autoFocus
          />
          {pwError && <p className="text-xs text-[#CC0000]">{pwError}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setPwAccountId(null)} className="flex-1">Hủy</Button>
            <Button variant="success" loading={pwSaving} disabled={newPassword.length < 8} onClick={() => void handlePasswordReset()} className="flex-1">Lưu</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

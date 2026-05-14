import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Navbar } from '@/shared/components/Navbar'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { formatDateTimeDisplay } from '@/shared/lib/dateUtils'
import { approveSupplierApi, rejectSupplierApi } from '@/features/auth/services/auth.service'
import type { SupplierAccount, AccountStatus } from '@/shared/types/domain'
import { ROLE_TABS } from '@/shared/config/navTabs'
import { getCurrentUser } from '@/shared/lib/auth'

interface Supplier { id: string; code: string; name: string; active: boolean }
interface SupplierAccountWithPw extends SupplierAccount { password?: string }

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
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

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const STATUS_COLORS: Record<AccountStatus, string> = {
  pending: 'status-pending',
  active: 'status-confirmed',
  rejected: 'status-rejected',
}
const STATUS_LABELS: Record<AccountStatus, string> = {
  pending: 'Chá» xÃ¡c nháº­n',
  active: 'Äang hoáº¡t Ä‘á»™ng',
  rejected: 'ÄÃ£ tá»« chá»‘i',
}
const FILTER_OPTIONS: { value: AccountStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'Chá» xÃ¡c nháº­n' },
  { value: 'active', label: 'Äang hoáº¡t Ä‘á»™ng' },
  { value: 'rejected', label: 'ÄÃ£ tá»« chá»‘i' },
  { value: 'all', label: 'Táº¥t cáº£' },
]

export default function AccountsPage() {
  const user = getCurrentUser()
  const tabs = user ? (ROLE_TABS[user.role] ?? []) : []
  const queryClient = useQueryClient()

  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'all'>('pending')
  const [selectedAccount, setSelectedAccount] = useState<SupplierAccountWithPw | null>(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [revealedPws, setRevealedPws] = useState<Set<string>>(new Set())
  const [pwAccountId, setPwAccountId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)

  useEffect(() => { document.title = 'TÃ i khoáº£n â€” Atino' }, [])

  const togglePwReveal = (id: string) =>
    setRevealedPws(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts', statusFilter],
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
  })

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
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

  const approveMutation = useMutation({
    mutationFn: ({ accountId, supplierId }: { accountId: string; supplierId: string }) =>
      approveSupplierApi(accountId, supplierId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setSelectedAccount(null)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ accountId, reason }: { accountId: string; reason: string }) =>
      rejectSupplierApi(accountId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setSelectedAccount(null); setRejectReason('')
    },
  })

  const deleteAccountMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('supplier_accounts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  })

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
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
    } catch (err) {
      setPwError((err as Error).message)
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={tabs} activeTab="accounts" />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <div className="flex gap-2 mb-4 flex-wrap">
          {FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${statusFilter === value
                  ? 'bg-[#80417A] text-white border-[#80417A] font-bold'
                  : 'bg-white border-[#ecdbe8] text-[#888888] hover:border-[#80417A] hover:text-black'
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {accountsLoading ? <LoadingSpinner className="mx-auto" /> : (
          <div className="overflow-x-auto bg-white border border-[#ecdbe8] rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F5F5F5]">
                  <th className="table-header">Há» tÃªn</th>
                  <th className="table-header">Username</th>
                  <th className="table-header">Máº­t kháº©u</th>
                  <th className="table-header">MÃ£ NCC</th>
                  <th className="table-header">ÄÄƒng kÃ½ lÃºc</th>
                  <th className="table-header">Tráº¡ng thÃ¡i</th>
                  <th className="table-header w-32">Thao tÃ¡c</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-t border-[#ecdbe8]">
                    <td className="table-cell">{a.full_name}</td>
                    <td className="table-cell font-mono">{a.username}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm">
                          {revealedPws.has(a.id)
                            ? (a.password ? a.password : <span className="text-[#BBBBBB] text-xs not-italic">ChÆ°a cÃ³</span>)
                            : 'â—â—â—â—â—â—'}
                        </span>
                        <button
                          type="button"
                          onClick={() => togglePwReveal(a.id)}
                          className="text-[#888888] hover:text-black transition-colors flex-shrink-0"
                          aria-label={revealedPws.has(a.id) ? 'áº¨n' : 'Hiá»‡n'}
                        >
                          {revealedPws.has(a.id) ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                      </div>
                    </td>
                    <td className="table-cell font-mono font-medium">
                      {a.supplier_code_requested ?? <span className="text-[#BBBBBB]">â€”</span>}
                    </td>
                    <td className="table-cell text-xs">{formatDateTimeDisplay(a.created_at)}</td>
                    <td className="table-cell">
                      <span className={STATUS_COLORS[a.status]}>{STATUS_LABELS[a.status]}</span>
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-2 flex-wrap">
                        {a.status === 'pending' && (
                          <LinkBtn onClick={() => setSelectedAccount(a)}>XÃ©t duyá»‡t</LinkBtn>
                        )}
                        <LinkBtn onClick={() => { setPwAccountId(a.id); setNewPassword(''); setPwError(null) }}>
                          Äáº·t láº¡i MK
                        </LinkBtn>
                        <LinkBtn danger onClick={() => {
                          if (window.confirm(`XÃ³a tÃ i khoáº£n "${a.username}"? KhÃ´ng thá»ƒ hoÃ n tÃ¡c.`)) deleteAccountMutation.mutate(a.id)
                        }}>
                          XÃ³a
                        </LinkBtn>
                      </div>
                    </td>
                  </tr>
                ))}
                {accounts.length === 0 && (
                  <tr><td colSpan={7} className="table-cell text-center text-[#888888] py-8">KhÃ´ng cÃ³ dá»¯ liá»‡u</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Approve modal */}
        <Modal
          isOpen={!!selectedAccount}
          onClose={() => { setSelectedAccount(null); setRejectReason('') }}
          title="XÃ©t duyá»‡t tÃ i khoáº£n"
          size="md"
        >
          {selectedAccount && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-[#888888]">Há» tÃªn</p><p className="font-medium">{selectedAccount.full_name}</p></div>
                <div><p className="text-xs text-[#888888]">Username</p><p className="font-mono">{selectedAccount.username}</p></div>
                <div>
                  <p className="text-xs text-[#888888]">MÃ£ NCC yÃªu cáº§u</p>
                  <p className="font-mono font-bold">{selectedAccount.supplier_code_requested ?? <span className="text-[#BBBBBB]">ChÆ°a cÃ³</span>}</p>
                </div>
                <div><p className="text-xs text-[#888888]">ÄÄƒng kÃ½ lÃºc</p><p>{formatDateTimeDisplay(selectedAccount.created_at)}</p></div>
              </div>
              <div>
                <label className="text-xs text-[#888888] block mb-1">
                  LiÃªn káº¿t NhÃ  cung cáº¥p <span className="text-[#CC0000]">*</span>
                </label>
                <select value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(e.target.value)} className="input-field">
                  <option value="">â€” Chá»n NCC â€”</option>
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
                PhÃª duyá»‡t
              </Button>
              {approveMutation.isError && (
                <p className="text-xs text-[#CC0000]">{(approveMutation.error as Error).message}</p>
              )}
              <div>
                <p className="text-sm font-medium mb-2 text-[#CC0000]">Hoáº·c tá»« chá»‘i:</p>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                  className="input-field resize-none mb-2"
                  placeholder="LÃ½ do tá»« chá»‘i..."
                />
                <Button
                  variant="danger-outline"
                  fullWidth
                  loading={rejectMutation.isPending}
                  disabled={!rejectReason.trim()}
                  onClick={() => rejectMutation.mutate({ accountId: selectedAccount.id, reason: rejectReason })}
                >
                  Tá»« chá»‘i tÃ i khoáº£n
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Reset password modal */}
        <Modal
          isOpen={!!pwAccountId}
          onClose={() => { setPwAccountId(null); setNewPassword(''); setPwError(null) }}
          title="Äáº·t láº¡i máº­t kháº©u"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-[#888888]">Nháº­p máº­t kháº©u má»›i:</p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Máº­t kháº©u má»›i..."
              className="input-field"
              autoFocus
            />
            {pwError && <p className="text-xs text-[#CC0000]">{pwError}</p>}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setPwAccountId(null)} className="flex-1">Há»§y</Button>
              <Button
                variant="success"
                loading={pwSaving}
                disabled={!newPassword.trim()}
                onClick={() => void handlePasswordReset()}
                className="flex-1"
              >
                LÆ°u
              </Button>
            </div>
          </div>
        </Modal>
      </main>
    </div>
  )
}

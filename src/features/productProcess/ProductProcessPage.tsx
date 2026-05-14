import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navbar } from '@/shared/components/Navbar'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { supabase } from '@/shared/lib/supabase'
import { ROLE_TABS } from '@/shared/config/navTabs'
import { getCurrentUser } from '@/shared/lib/auth'
import { formatDateTimeDisplay } from '@/shared/lib/dateUtils'
import { pageMainClass } from '@/shared/config/pageLayout'
import type { ProductProcessCatalog } from '@/shared/types/domain'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

export default function ProductProcessPage() {
  const user = getCurrentUser()
  const tabs = user ? (ROLE_TABS[user.role] ?? []) : []
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [syncError, setSyncError] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['product-process-catalog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_process_catalog')
        .select('*')
        .eq('active', true)
        .order('product_name', { ascending: true })
        .order('order_code', { ascending: true })
      if (error) throw error
      return (data ?? []) as ProductProcessCatalog[]
    },
  })

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      row.product_name.toLowerCase().includes(q) ||
      row.order_code.toLowerCase().includes(q)
    )
  }, [rows, search])

  const lastSync = rows
    .map((row) => row.last_synced_at)
    .sort()
    .at(-1)

  const handleRefresh = async () => {
    setIsSyncing(true)
    setSyncError('')
    try {
      const res = await fetch(`${API_BASE}/api/product-process/sync`, { method: 'POST' })
      const result = await res.json() as { error?: string }
      if (!res.ok) throw new Error(result.error ?? 'Không thể đồng bộ dữ liệu')
      await queryClient.invalidateQueries({ queryKey: ['product-process-catalog'] })
    } catch (err) {
      setSyncError((err as Error).message)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={tabs} activeTab="product-process" />

      <main className={pageMainClass('productProcess')}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">Danh mục Mã SP / Mã QT</h1>
            <p className="text-xs text-[#888888] mt-1">
              {lastSync ? `Đồng bộ lần cuối: ${formatDateTimeDisplay(lastSync)}` : 'Chưa có dữ liệu đồng bộ'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field text-sm py-1.5 w-64"
              placeholder="Tìm Tên SP hoặc Mã đơn..."
            />
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={isSyncing}
              className="btn-primary text-sm py-2 disabled:opacity-50"
            >
              {isSyncing ? 'Đang đồng bộ...' : 'Làm mới'}
            </button>
          </div>
        </div>

        {syncError && (
          <div className="mb-3 border border-[#CC0000] bg-white text-[#CC0000] rounded p-3 text-sm">
            {syncError}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
        ) : (
          <div className="overflow-hidden bg-white border border-[#ecdbe8] rounded-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-sm data-table">
                <thead>
                  <tr>
                    <th className="table-header w-16">STT</th>
                    <th className="table-header">Tên SP</th>
                    <th className="table-header">Mã đơn</th>
                    <th className="table-header w-44">Thời gian đồng bộ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => (
                    <tr key={row.id}>
                      <td className="table-cell text-center text-[#888888]">{index + 1}</td>
                      <td className="table-cell font-medium">{row.product_name}</td>
                      <td className="table-cell font-mono">{row.order_code}</td>
                      <td className="table-cell text-xs text-[#888888]">{formatDateTimeDisplay(row.last_synced_at)}</td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td className="table-cell text-center text-[#888888] py-10" colSpan={4}>
                        Không có dữ liệu
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

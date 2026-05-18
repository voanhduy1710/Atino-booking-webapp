import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navbar } from '@/shared/components/Navbar'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { ROLE_TABS } from '@/shared/config/navTabs'
import { getCurrentUser } from '@/shared/lib/auth'
import { formatDateDisplay, formatDateTimeDisplay } from '@/shared/lib/dateUtils'
import { pageMainClass } from '@/shared/config/pageLayout'
import { getJson, postJson } from '@/shared/lib/apiClient'
import type { ProductProcessCatalog } from '@/shared/types/domain'

function displayQuantity(value: number | null | undefined): string {
  return value ? String(value) : ''
}

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
      const result = await getJson<{ items: ProductProcessCatalog[] }>('/api/product-process')
      return result.items ?? []
    },
  })

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      row.product_name.toLowerCase().includes(q) ||
      row.order_code.toLowerCase().includes(q) ||
      (row.warehouse_code ?? '').toLowerCase().includes(q) ||
      (row.mau ?? '').toLowerCase().includes(q) ||
      (row.order_date ?? '').toLowerCase().includes(q)
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
      await postJson('/api/product-process/sync')
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
            <h1 className="text-xl font-bold">Danh mục Tên SP / Mã đơn</h1>
            <p className="text-xs text-[#888888] mt-1">
              {lastSync ? `Đồng bộ lần cuối: ${formatDateTimeDisplay(lastSync)}` : 'Chưa có dữ liệu đồng bộ'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field text-sm py-1.5 w-64"
              placeholder="Tìm Tên SP, Mã đơn, Mã kho hoặc Màu..."
            />
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={isSyncing}
              className="btn-primary inline-flex items-center gap-2 text-sm py-2 disabled:opacity-50"
            >
              <span aria-hidden="true" className={isSyncing ? 'animate-spin' : ''}>↻</span>
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
                    <th className="table-header">Mã kho</th>
                    <th className="table-header">Màu</th>
                    <th className="table-header">Ngày đặt</th>
                    <th className="table-header text-right">Tổng số lượng</th>
                    <th className="table-header text-right">S/28</th>
                    <th className="table-header text-right">M/29</th>
                    <th className="table-header text-right">L/30</th>
                    <th className="table-header text-right">XL/31</th>
                    <th className="table-header text-right">2XL/32</th>
                    <th className="table-header text-right">3XL/33</th>
                    <th className="table-header w-44">Thời gian đồng bộ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => (
                    <tr key={row.id}>
                      <td className="table-cell text-center text-[#888888]">{index + 1}</td>
                      <td className="table-cell font-medium">{row.product_name}</td>
                      <td className="table-cell font-mono">{row.order_code}</td>
                      <td className="table-cell font-mono">{row.warehouse_code ?? '—'}</td>
                      <td className="table-cell">{row.mau ?? '—'}</td>
                      <td className="table-cell">{row.order_date ? formatDateDisplay(row.order_date) : '—'}</td>
                      <td className="table-cell text-right">{displayQuantity(row.total_quantity)}</td>
                      <td className="table-cell text-right">{displayQuantity(row.size_s_28)}</td>
                      <td className="table-cell text-right">{displayQuantity(row.size_m_29)}</td>
                      <td className="table-cell text-right">{displayQuantity(row.size_l_30)}</td>
                      <td className="table-cell text-right">{displayQuantity(row.size_xl_31)}</td>
                      <td className="table-cell text-right">{displayQuantity(row.size_2xl_32)}</td>
                      <td className="table-cell text-right">{displayQuantity(row.size_3xl_33)}</td>
                      <td className="table-cell text-xs text-[#888888]">{formatDateTimeDisplay(row.last_synced_at)}</td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td className="table-cell text-center text-[#888888] py-10" colSpan={14}>
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

import { useState, useEffect, lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Navbar } from '@/shared/components/Navbar'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import type { NavTab } from '@/shared/components/Navbar'

const ReviewerPage = lazy(() => import('@/features/warehouse/ReviewerPage'))
const ReportPage = lazy(() => import('@/features/admin/ReportPage'))

type ManagerTab = 'reviewer' | 'warehouses' | 'suppliers' | 'report'

const VALID_MANAGER_TABS: ManagerTab[] = ['reviewer', 'warehouses', 'suppliers', 'report']

const MANAGER_TABS: NavTab[] = [
  { id: 'reviewer', label: 'XÃ¡c nháº­n booking', href: '/manager/reviewer' },
  { id: 'warehouses', label: 'Kho hÃ ng', href: '/manager/warehouses' },
  { id: 'suppliers', label: 'NhÃ  cung cáº¥p', href: '/manager/suppliers' },
  { id: 'report', label: 'BÃ¡o cÃ¡o', href: '/manager/report' },
]

interface Supplier { id: string; code: string; name: string; active: boolean }
interface Warehouse { id: string; code: string; name: string; active: boolean }

function LinkBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-xs underline text-[#888888] hover:text-black"
    >
      {children}
    </button>
  )
}

interface Props {
  embedded?: boolean
}

export default function ManagerPage({ embedded = false }: Props) {
  const { pathname } = useLocation()
  const [internalTab, setInternalTab] = useState<ManagerTab>('reviewer')

  const activeTab: ManagerTab = embedded
    ? internalTab
    : (() => {
      for (const t of VALID_MANAGER_TABS) {
        if (pathname.includes(`/manager/${t}`)) return t
      }
      return 'reviewer'
    })()

  // Warehouse edit
  const [addingWarehouse, setAddingWarehouse] = useState(false)
  const [newWhCode, setNewWhCode] = useState('')
  const [newWhName, setNewWhName] = useState('')
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null)
  const [editWhName, setEditWhName] = useState('')

  // Supplier edit
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [newSpCode, setNewSpCode] = useState('')
  const [newSpName, setNewSpName] = useState('')
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [editSpCode, setEditSpCode] = useState('')
  const [editSpName, setEditSpName] = useState('')

  const queryClient = useQueryClient()

  useEffect(() => {
    if (!embedded) document.title = 'Quáº£n lÃ½ â€” Atino'
  }, [embedded])

  // â”€â”€ Queries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const { data: warehouses = [] } = useQuery({
    queryKey: ['manager-warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('*').order('code')
      if (error) throw error
      return data as Warehouse[]
    },
    enabled: activeTab === 'warehouses',
  })

  const { data: suppliers = [] } = useQuery({
    queryKey: ['manager-suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('*').order('code')
      if (error) throw error
      return data as Supplier[]
    },
    enabled: activeTab === 'suppliers',
  })

  // â”€â”€ Mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const addWarehouseMutation = useMutation({
    mutationFn: async ({ code, name }: { code: string; name: string }) => {
      const { error } = await supabase.from('warehouses').insert({ code: code.trim().toUpperCase(), name: name.trim(), active: true } as any)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['manager-warehouses'] })
      setAddingWarehouse(false); setNewWhCode(''); setNewWhName('')
    },
  })

  const editWarehouseMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await (supabase.from('warehouses') as any).update({ name: name.trim() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['manager-warehouses'] })
      setEditingWarehouse(null)
    },
  })

  const addSupplierMutation = useMutation({
    mutationFn: async ({ code, name }: { code: string; name: string }) => {
      const { error } = await supabase.from('suppliers').insert({ code: code.trim().toUpperCase(), name: name.trim(), active: true } as any)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['manager-suppliers'] })
      setAddingSupplier(false); setNewSpCode(''); setNewSpName('')
    },
  })

  const editSupplierMutation = useMutation({
    mutationFn: async ({ id, code, name }: { id: string; code: string; name: string }) => {
      const { error } = await (supabase.from('suppliers') as any).update({ code: code.trim().toUpperCase(), name: name.trim() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['manager-suppliers'] })
      setEditingSupplier(null)
    },
  })

  // â”€â”€ Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const warehousesContent = (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
      <div className="flex justify-end mb-3">
        <button onClick={() => { setAddingWarehouse(true); setNewWhCode(''); setNewWhName('') }} className="btn-green">
          + ThÃªm kho
        </button>
      </div>
      <div className="overflow-x-auto bg-white border border-[#ecdbe8] rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F5F5F5]">
              <th className="table-header">MÃ£ kho</th>
              <th className="table-header">TÃªn kho</th>
              <th className="table-header">Tráº¡ng thÃ¡i</th>
              <th className="table-header w-32">Thao tÃ¡c</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.map((w) => (
              <tr key={w.id} className="border-t border-[#ecdbe8]">
                <td className="table-cell font-mono">{w.code}</td>
                <td className="table-cell">
                  {editingWarehouse?.id === w.id ? (
                    <input autoFocus value={editWhName} onChange={(e) => setEditWhName(e.target.value)} className="input-field py-1 text-xs" />
                  ) : w.name}
                </td>
                <td className="table-cell">
                  {w.active ? <span className="status-confirmed">Hoáº¡t Ä‘á»™ng</span> : <span className="status-rejected">Ngá»«ng</span>}
                </td>
                <td className="table-cell">
                  <div className="flex gap-3">
                    {editingWarehouse?.id === w.id ? (
                      <>
                        <LinkBtn onClick={() => editWarehouseMutation.mutate({ id: w.id, name: editWhName })}>{editWarehouseMutation.isPending ? 'LÆ°u...' : 'LÆ°u'}</LinkBtn>
                        <LinkBtn onClick={() => setEditingWarehouse(null)}>Há»§y</LinkBtn>
                      </>
                    ) : (
                      <LinkBtn onClick={() => { setEditingWarehouse(w); setEditWhName(w.name) }}>Sá»­a</LinkBtn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {addingWarehouse && (
              <tr className="border-t border-[#ecdbe8] bg-[#FAFAFA]">
                <td className="table-cell"><input autoFocus value={newWhCode} onChange={(e) => setNewWhCode(e.target.value.toUpperCase())} placeholder="VD: THL" className="input-field py-1 text-xs font-mono w-28" /></td>
                <td className="table-cell"><input value={newWhName} onChange={(e) => setNewWhName(e.target.value)} placeholder="TÃªn kho..." className="input-field py-1 text-xs" /></td>
                <td className="table-cell text-[#888888] text-xs">Hoáº¡t Ä‘á»™ng</td>
                <td className="table-cell">
                  <div className="flex gap-3">
                    <LinkBtn onClick={() => addWarehouseMutation.mutate({ code: newWhCode, name: newWhName })}>{addWarehouseMutation.isPending ? 'LÆ°u...' : 'LÆ°u'}</LinkBtn>
                    <LinkBtn onClick={() => setAddingWarehouse(false)}>Há»§y</LinkBtn>
                  </div>
                </td>
              </tr>
            )}
            {warehouses.length === 0 && !addingWarehouse && (
              <tr><td colSpan={4} className="table-cell text-center text-[#888888] py-8">KhÃ´ng cÃ³ dá»¯ liá»‡u</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )

  const suppliersContent = (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
      <div className="flex justify-end mb-3">
        <button onClick={() => { setAddingSupplier(true); setNewSpCode(''); setNewSpName('') }} className="btn-green">
          + ThÃªm NCC
        </button>
      </div>
      <div className="overflow-x-auto bg-white border border-[#ecdbe8] rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F5F5F5]">
              <th className="table-header">MÃ£ NCC</th>
              <th className="table-header">TÃªn NCC</th>
              <th className="table-header">Tráº¡ng thÃ¡i</th>
              <th className="table-header w-32">Thao tÃ¡c</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-t border-[#ecdbe8]">
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
                  {s.active ? <span className="status-confirmed">Hoáº¡t Ä‘á»™ng</span> : <span className="status-rejected">Ngá»«ng</span>}
                </td>
                <td className="table-cell">
                  <div className="flex gap-3">
                    {editingSupplier?.id === s.id ? (
                      <>
                        <LinkBtn onClick={() => editSupplierMutation.mutate({ id: s.id, code: editSpCode, name: editSpName })}>{editSupplierMutation.isPending ? 'LÆ°u...' : 'LÆ°u'}</LinkBtn>
                        <LinkBtn onClick={() => setEditingSupplier(null)}>Há»§y</LinkBtn>
                      </>
                    ) : (
                      <LinkBtn onClick={() => { setEditingSupplier(s); setEditSpCode(s.code); setEditSpName(s.name) }}>Sá»­a</LinkBtn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {addingSupplier && (
              <tr className="border-t border-[#ecdbe8] bg-[#FAFAFA]">
                <td className="table-cell"><input autoFocus value={newSpCode} onChange={(e) => setNewSpCode(e.target.value.toUpperCase())} placeholder="VD: GC01" className="input-field py-1 text-xs font-mono w-28" /></td>
                <td className="table-cell"><input value={newSpName} onChange={(e) => setNewSpName(e.target.value)} placeholder="TÃªn nhÃ  cung cáº¥p..." className="input-field py-1 text-xs" /></td>
                <td className="table-cell text-[#888888] text-xs">Hoáº¡t Ä‘á»™ng</td>
                <td className="table-cell">
                  <div className="flex gap-3">
                    <LinkBtn onClick={() => addSupplierMutation.mutate({ code: newSpCode, name: newSpName })}>{addSupplierMutation.isPending ? 'LÆ°u...' : 'LÆ°u'}</LinkBtn>
                    <LinkBtn onClick={() => setAddingSupplier(false)}>Há»§y</LinkBtn>
                  </div>
                </td>
              </tr>
            )}
            {suppliers.length === 0 && !addingSupplier && (
              <tr><td colSpan={4} className="table-cell text-center text-[#888888] py-8">KhÃ´ng cÃ³ dá»¯ liá»‡u</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )

  const tabContent = (
    <>
      {activeTab === 'reviewer' && (
        <Suspense fallback={<div className="flex justify-center py-16"><LoadingSpinner /></div>}>
          <ReviewerPage embedded />
        </Suspense>
      )}
      {activeTab === 'warehouses' && warehousesContent}
      {activeTab === 'suppliers' && suppliersContent}
      {activeTab === 'report' && (
        <Suspense fallback={<div className="flex justify-center py-16"><LoadingSpinner /></div>}>
          <ReportPage />
        </Suspense>
      )}
    </>
  )

  if (embedded) {
    return (
      <div className="flex flex-col bg-[#fdf8ff]">
        <div className="flex border-b border-[#d5c0d5] bg-white px-4 shadow-sm">
          {MANAGER_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setInternalTab(t.id as ManagerTab)}
              className={`px-4 py-3 text-sm font-medium transition-colors ${activeTab === t.id ? 'bg-[#bf2ef0] text-white font-bold' : 'text-[#514253] font-bold hover:bg-[#f1ebf4] hover:text-[#bf2ef0]'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tabContent}
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fdf8ff]">
      <Navbar tabs={MANAGER_TABS} activeTab={activeTab} />
      {tabContent}
    </div>
  )
}

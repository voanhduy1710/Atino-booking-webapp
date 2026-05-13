import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Navbar } from '@/shared/components/Navbar'
import { getCurrentUser } from '@/shared/lib/auth'
import { ROLE_TABS } from '@/shared/config/navTabs'

interface Warehouse { id: string; code: string; name: string; active: boolean }

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

export default function WarehousesPage({ embedded = false }: { embedded?: boolean }) {
  const user = getCurrentUser()
  const canDelete = user?.role === 'admin'
  const tabs = user ? (ROLE_TABS[user.role] ?? []) : []
  const queryClient = useQueryClient()

  const [adding, setAdding] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [editName, setEditName] = useState('')

  useEffect(() => { document.title = 'Kho hÃ ng â€” Atino' }, [])

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('*').order('code')
      if (error) throw error
      return data as Warehouse[]
    },
  })

  const addMutation = useMutation({
    mutationFn: async ({ code, name }: { code: string; name: string }) => {
      const { error } = await supabase.from('warehouses').insert({ code: code.trim().toUpperCase(), name: name.trim(), active: true } as any)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      setAdding(false); setNewCode(''); setNewName('')
    },
  })

  const editMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await (supabase.from('warehouses') as any).update({ name: name.trim() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      setEditing(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('warehouses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['warehouses'] }),
  })

  const mainContent = (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <div className="flex justify-end mb-3">
          <button onClick={() => { setAdding(true); setNewCode(''); setNewName('') }} className="btn-green">
            + ThÃªm kho
          </button>
        </div>
        <div className="overflow-x-auto bg-white border border-[#E0E0E0] rounded-lg">
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
                <tr key={w.id} className="border-t border-[#E0E0E0]">
                  <td className="table-cell font-mono">{w.code}</td>
                  <td className="table-cell">
                    {editing?.id === w.id ? (
                      <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} className="input-field py-1 text-xs" />
                    ) : w.name}
                  </td>
                  <td className="table-cell">
                    {w.active ? <span className="status-confirmed">Hoáº¡t Ä‘á»™ng</span> : <span className="status-rejected">Ngá»«ng</span>}
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-3">
                      {editing?.id === w.id ? (
                        <>
                          <LinkBtn onClick={() => editMutation.mutate({ id: w.id, name: editName })}>
                            {editMutation.isPending ? 'LÆ°u...' : 'LÆ°u'}
                          </LinkBtn>
                          <LinkBtn onClick={() => setEditing(null)}>Há»§y</LinkBtn>
                        </>
                      ) : (
                        <>
                          <LinkBtn onClick={() => { setEditing(w); setEditName(w.name) }}>Sá»­a</LinkBtn>
                          {canDelete && (
                            <LinkBtn danger onClick={() => {
                              if (window.confirm(`XÃ³a kho "${w.name}"? KhÃ´ng thá»ƒ hoÃ n tÃ¡c.`)) deleteMutation.mutate(w.id)
                            }}>
                              XÃ³a
                            </LinkBtn>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {adding && (
                <tr className="border-t border-[#E0E0E0] bg-[#FAFAFA]">
                  <td className="table-cell">
                    <input autoFocus value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="VD: THL" className="input-field py-1 text-xs font-mono w-28" />
                  </td>
                  <td className="table-cell">
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="TÃªn kho..." className="input-field py-1 text-xs" />
                  </td>
                  <td className="table-cell text-[#888888] text-xs">Hoáº¡t Ä‘á»™ng</td>
                  <td className="table-cell">
                    <div className="flex gap-3">
                      <LinkBtn onClick={() => addMutation.mutate({ code: newCode, name: newName })}>
                        {addMutation.isPending ? 'LÆ°u...' : 'LÆ°u'}
                      </LinkBtn>
                      <LinkBtn onClick={() => setAdding(false)}>Há»§y</LinkBtn>
                    </div>
                    {addMutation.isError && (
                      <p className="text-xs text-[#CC0000] mt-1">{(addMutation.error as Error).message}</p>
                    )}
                  </td>
                </tr>
              )}
              {warehouses.length === 0 && !adding && (
                <tr><td colSpan={4} className="table-cell text-center text-[#888888] py-8">KhÃ´ng cÃ³ dá»¯ liá»‡u</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
  )

  if (embedded) return mainContent
  return (
    <div className="min-h-screen flex flex-col bg-[#FFF5FF]">
      <Navbar tabs={tabs} activeTab="warehouses" />
      {mainContent}
    </div>
  )
}

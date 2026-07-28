import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LinkBtn } from '@/shared/components/LinkBtn'
import { postJson } from '@/shared/lib/apiClient'
import { supabase } from '@/shared/lib/supabase'
import type { Warehouse } from '@/shared/types/domain'

interface Props {
  canDelete?: boolean
  canManage?: boolean
  queryKey?: string
}

export function WarehouseTable({ canDelete = false, canManage = canDelete, queryKey = 'warehouses' }: Props) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [editName, setEditName] = useState('')

  const { data: warehouses = [] } = useQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('id, code, name, active').order('code')
      if (error) throw error
      return data as Warehouse[]
    },
  })

  const addMutation = useMutation({
    mutationFn: async ({ code, name }: { code: string; name: string }) => {
      await postJson<{ ok: true }>('/api/admin-resources/warehouses', { code, name })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [queryKey] })
      setAdding(false)
      setNewCode('')
      setNewName('')
    },
  })

  const editMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await postJson<{ ok: true }>(`/api/admin-resources/warehouses/${id}`, { name }, { method: 'PUT' })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [queryKey] })
      setEditing(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await postJson<{ ok: true }>(`/api/admin-resources/warehouses/${id}`, undefined, { method: 'DELETE' })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [queryKey] }),
  })

  return (
    <>
      {canManage && <div className="flex justify-end mb-3">
        <button type="button" onClick={() => { setAdding(true); setNewCode(''); setNewName('') }} className="btn-green">+ Thêm kho</button>
      </div>}
      <div className="overflow-x-auto bg-white border border-[#ecdbe8] rounded-lg">
        <table className="hidden w-full text-sm sm:table">
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
              <tr key={w.id} className="border-t border-[#ecdbe8]">
                <td className="table-cell font-mono">{w.code}</td>
                <td className="table-cell">
                  {editing?.id === w.id
                    ? <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} className="input-field py-1 text-xs" />
                    : w.name}
                </td>
                <td className="table-cell">
                  {w.active ? <span className="status-confirmed">Hoạt động</span> : <span className="status-rejected">Ngừng</span>}
                </td>
                <td className="table-cell">
                  <div className="flex gap-3">
                    {editing?.id === w.id ? (
                      <>
                        <LinkBtn onClick={() => editMutation.mutate({ id: w.id, name: editName })}>{editMutation.isPending ? 'Lưu...' : 'Lưu'}</LinkBtn>
                        <LinkBtn onClick={() => setEditing(null)}>Hủy</LinkBtn>
                      </>
                    ) : (
                      <>
                        {canManage && <LinkBtn onClick={() => { setEditing(w); setEditName(w.name) }}>Sửa</LinkBtn>}
                        {canDelete && (
                          <LinkBtn danger onClick={() => {
                            if (window.confirm(`Xóa kho "${w.name}"? Không thể hoàn tác.`)) deleteMutation.mutate(w.id)
                          }}>Xóa</LinkBtn>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {adding && (
              <tr className="border-t border-[#ecdbe8] bg-[#FAFAFA]">
                <td className="table-cell"><input autoFocus value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="VD: THL" className="input-field py-1 text-xs font-mono w-28" /></td>
                <td className="table-cell"><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tên kho..." className="input-field py-1 text-xs" /></td>
                <td className="table-cell text-[#888888] text-xs">Hoạt động</td>
                <td className="table-cell">
                  <div className="flex gap-3">
                    <LinkBtn onClick={() => addMutation.mutate({ code: newCode, name: newName })}>{addMutation.isPending ? 'Lưu...' : 'Lưu'}</LinkBtn>
                    <LinkBtn onClick={() => setAdding(false)}>Hủy</LinkBtn>
                  </div>
                  {addMutation.isError && <p className="text-xs text-[#CC0000] mt-1">{(addMutation.error as Error).message}</p>}
                </td>
              </tr>
            )}
            {warehouses.length === 0 && !adding && (
              <tr><td colSpan={4} className="table-cell text-center text-[#888888] py-8">Không có dữ liệu</td></tr>
            )}
          </tbody>
        </table>
        <div className="divide-y divide-[#ecdbe8] sm:hidden">
          {adding && (
            <div className="space-y-2 p-4">
              <input value={newCode} onChange={(event) => setNewCode(event.target.value.toUpperCase())} placeholder="Mã kho" className="input-field font-mono" />
              <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Tên kho" className="input-field" />
              <div className="flex gap-2">
                <button type="button" className="min-h-11 rounded bg-[#1a7a3e] px-3 text-sm text-white" onClick={() => addMutation.mutate({ code: newCode, name: newName })}>Lưu</button>
                <button type="button" className="min-h-11 rounded border border-[#d5c0d5] px-3 text-sm" onClick={() => setAdding(false)}>Hủy</button>
              </div>
            </div>
          )}
          {warehouses.map((warehouse) => (
            <article key={warehouse.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-medium">{warehouse.name}</p><p className="font-mono text-xs text-[#555555]">{warehouse.code}</p></div>
                {warehouse.active ? <span className="status-confirmed">Hoạt động</span> : <span className="status-rejected">Ngừng</span>}
              </div>
              {canManage && (
                editing?.id === warehouse.id ? (
                  <div className="mt-3 space-y-2">
                    <input value={editName} onChange={(event) => setEditName(event.target.value)} className="input-field" aria-label="Tên kho" />
                    <div className="flex gap-2">
                      <button type="button" className="min-h-11 rounded bg-[#1a7a3e] px-3 text-sm text-white" onClick={() => editMutation.mutate({ id: warehouse.id, name: editName })}>Lưu</button>
                      <button type="button" className="min-h-11 rounded border border-[#d5c0d5] px-3 text-sm" onClick={() => setEditing(null)}>Hủy</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button type="button" className="min-h-11 rounded border border-[#d5c0d5] px-3 text-sm" onClick={() => { setEditing(warehouse); setEditName(warehouse.name) }}>Sửa</button>
                    {canDelete && <button type="button" className="min-h-11 rounded border border-[#CC0000] px-3 text-sm text-[#CC0000]" onClick={() => {
                      if (window.confirm(`Xóa kho "${warehouse.name}"? Không thể hoàn tác.`)) deleteMutation.mutate(warehouse.id)
                    }}>Xóa</button>}
                  </div>
                )
              )}
            </article>
          ))}
          {warehouses.length === 0 && <p className="p-8 text-center text-sm text-[#888888]">Không có dữ liệu</p>}
        </div>
      </div>
    </>
  )
}

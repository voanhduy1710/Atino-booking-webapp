import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LinkBtn } from '@/shared/components/LinkBtn'
import { postJson } from '@/shared/lib/apiClient'
import { supabase } from '@/shared/lib/supabase'
import type { Supplier } from '@/shared/types/domain'

interface Props {
  canDelete?: boolean
  queryKey?: string
}

export function SupplierTable({ canDelete = false, queryKey = 'suppliers' }: Props) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')

  const { data: suppliers = [] } = useQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('*').order('code')
      if (error) throw error
      return data as Supplier[]
    },
  })

  const addMutation = useMutation({
    mutationFn: async ({ code, name }: { code: string; name: string }) => {
      await postJson<{ ok: true }>('/api/admin-resources/suppliers', { code, name })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [queryKey] })
      setAdding(false)
      setNewCode('')
      setNewName('')
    },
  })

  const editMutation = useMutation({
    mutationFn: async ({ id, code, name }: { id: string; code: string; name: string }) => {
      await postJson<{ ok: true }>(`/api/admin-resources/suppliers/${id}`, { code, name }, { method: 'PUT' })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [queryKey] })
      setEditing(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await postJson<{ ok: true }>(`/api/admin-resources/suppliers/${id}`, undefined, { method: 'DELETE' })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [queryKey] }),
  })

  return (
    <>
      <div className="flex justify-end mb-3">
        <button type="button" onClick={() => { setAdding(true); setNewCode(''); setNewName('') }} className="btn-green">+ Thêm NCC</button>
      </div>
      <div className="overflow-x-auto bg-white border border-[#ecdbe8] rounded-lg">
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
              <tr key={s.id} className="border-t border-[#ecdbe8]">
                <td className="table-cell font-mono">
                  {editing?.id === s.id
                    ? <input autoFocus value={editCode} onChange={(e) => setEditCode(e.target.value.toUpperCase())} className="input-field py-1 text-xs font-mono w-28" />
                    : s.code}
                </td>
                <td className="table-cell">
                  {editing?.id === s.id
                    ? <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input-field py-1 text-xs" />
                    : s.name}
                </td>
                <td className="table-cell">
                  {s.active ? <span className="status-confirmed">Hoạt động</span> : <span className="status-rejected">Ngừng</span>}
                </td>
                <td className="table-cell">
                  <div className="flex gap-3">
                    {editing?.id === s.id ? (
                      <>
                        <LinkBtn onClick={() => editMutation.mutate({ id: s.id, code: editCode, name: editName })}>{editMutation.isPending ? 'Lưu...' : 'Lưu'}</LinkBtn>
                        <LinkBtn onClick={() => setEditing(null)}>Hủy</LinkBtn>
                      </>
                    ) : (
                      <>
                        <LinkBtn onClick={() => { setEditing(s); setEditCode(s.code); setEditName(s.name) }}>Sửa</LinkBtn>
                        {canDelete && (
                          <LinkBtn danger onClick={() => {
                            if (window.confirm(`Xóa NCC "${s.name}"? Không thể hoàn tác.`)) deleteMutation.mutate(s.id)
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
                <td className="table-cell"><input autoFocus value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="VD: GC01" className="input-field py-1 text-xs font-mono w-28" /></td>
                <td className="table-cell"><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tên nhà cung cấp..." className="input-field py-1 text-xs" /></td>
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
            {suppliers.length === 0 && !adding && (
              <tr><td colSpan={4} className="table-cell text-center text-[#888888] py-8">Không có dữ liệu</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

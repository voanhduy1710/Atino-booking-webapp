import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { getCurrentUser } from '@/shared/lib/auth'
import type { Warehouse, Supplier } from '@/shared/types/domain'

export interface ActiveSupplierAccountOption {
  id: string
  username: string
  full_name: string
  supplier_id: string
  supplier_name: string
  supplier_code: string
}

export function useWarehouses() {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('active', true)
        .order('code')
      if (error) throw error
      return data as Warehouse[]
    },
  })
}

export function useSupplierInfo() {
  const user = getCurrentUser()
  return useQuery({
    queryKey: ['supplier', user?.supplier_id],
    queryFn: async () => {
      if (!user?.supplier_id) return null
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', user.supplier_id)
        .single()
      if (error) throw error
      return data as Supplier
    },
    enabled: !!user?.supplier_id,
  })
}

export function useActiveSupplierAccounts(enabled = true) {
  return useQuery({
    queryKey: ['active-supplier-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_accounts')
        .select('id, username, full_name, supplier_id, suppliers!inner(name, code)')
        .eq('status', 'active')
        .not('supplier_id', 'is', null)
        .order('full_name')
      if (error) throw error
      return ((data ?? []) as any[]).map((account) => ({
        id: account.id,
        username: account.username,
        full_name: account.full_name,
        supplier_id: account.supplier_id,
        supplier_name: account.suppliers?.name ?? '',
        supplier_code: account.suppliers?.code ?? '',
      })) as ActiveSupplierAccountOption[]
    },
    enabled,
  })
}

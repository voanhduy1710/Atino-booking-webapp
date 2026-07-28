import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { getCurrentUser } from '@/shared/lib/auth'
import { getJson } from '@/shared/lib/apiClient'
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
        .select('id, code, name, active')
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
        .select('id, code, name, active')
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
      const result = await getJson<{ accounts: ActiveSupplierAccountOption[] }>('/api/booking/finalize/supplier-accounts')
      return result.accounts
    },
    enabled,
  })
}

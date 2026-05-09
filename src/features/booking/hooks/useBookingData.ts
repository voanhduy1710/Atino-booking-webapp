import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { getCurrentUser } from '@/shared/lib/auth'
import type { Warehouse, Supplier } from '@/shared/types/domain'

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

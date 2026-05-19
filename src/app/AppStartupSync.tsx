import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { postJson } from '@/shared/lib/apiClient'
import {
  fetchProductProcessCatalog,
  PRODUCT_PROCESS_CATALOG_QUERY_KEY,
} from '@/features/productProcess/api'
import type { ProductProcessCatalog } from '@/shared/types/domain'

let hasRequestedProductProcessSync = false

export function AppStartupSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (hasRequestedProductProcessSync) return
    hasRequestedProductProcessSync = true

    const runSync = async () => {
      window.dispatchEvent(new CustomEvent('product-process-sync:start'))
      await queryClient.fetchQuery({
        queryKey: PRODUCT_PROCESS_CATALOG_QUERY_KEY,
        queryFn: fetchProductProcessCatalog,
        staleTime: 0,
      }).catch(() => {
        // Continue to the sync attempt; it may succeed even if the cached read failed.
      })

      try {
        const result = await postJson<{ items?: ProductProcessCatalog[] }>('/api/product-process/sync')
        if (result.items) {
          queryClient.setQueryData(PRODUCT_PROCESS_CATALOG_QUERY_KEY, result.items)
        }
        await queryClient.invalidateQueries({
          queryKey: PRODUCT_PROCESS_CATALOG_QUERY_KEY,
          refetchType: 'active',
        })
      } catch {
        // Startup sync is opportunistic; pages still render cached Supabase data.
      } finally {
        window.dispatchEvent(new CustomEvent('product-process-sync:end'))
      }
    }

    void runSync()
  }, [queryClient])

  return null
}

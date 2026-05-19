import { getJson } from '@/shared/lib/apiClient'
import type { ProductProcessCatalog } from '@/shared/types/domain'

export const PRODUCT_PROCESS_CATALOG_QUERY_KEY = ['product-process-catalog'] as const

export async function fetchProductProcessCatalog(): Promise<ProductProcessCatalog[]> {
  const result = await getJson<{ items: ProductProcessCatalog[] }>('/api/product-process')
  return result.items ?? []
}

import { getJson } from '@/shared/lib/apiClient'
import type { ProductProcessCatalog } from '@/shared/types/domain'

export const PRODUCT_PROCESS_CATALOG_QUERY_KEY = ['product-process-catalog'] as const

export async function fetchProductProcessCatalog(): Promise<ProductProcessCatalog[]> {
  const result = await getJson<{ items: ProductProcessCatalog[] }>('/api/product-process')
  return result.items ?? []
}

export async function fetchProductProcessPage(page: number, pageSize: number, search: string): Promise<{
  items: ProductProcessCatalog[]
  total: number
}> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (search) params.set('search', search)
  return getJson<{ items: ProductProcessCatalog[]; total: number }>(`/api/product-process?${params}`)
}

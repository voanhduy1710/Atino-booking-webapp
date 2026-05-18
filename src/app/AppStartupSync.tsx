import { useEffect } from 'react'
import { apiUrl } from '@/shared/lib/apiClient'

let hasRequestedProductProcessSync = false

export function AppStartupSync() {
  useEffect(() => {
    if (hasRequestedProductProcessSync) return
    hasRequestedProductProcessSync = true

    fetch(apiUrl('/api/product-process/sync'), { method: 'POST' }).catch(() => {
      // Startup sync is opportunistic; pages still render cached Supabase data.
    })
  }, [])

  return null
}

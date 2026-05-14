import { useEffect } from 'react'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
let hasRequestedProductProcessSync = false

export function AppStartupSync() {
  useEffect(() => {
    if (hasRequestedProductProcessSync) return
    hasRequestedProductProcessSync = true

    fetch(`${API_BASE}/api/product-process/sync`, { method: 'POST' }).catch(() => {
      // Startup sync is opportunistic; pages still render cached Supabase data.
    })
  }, [])

  return null
}

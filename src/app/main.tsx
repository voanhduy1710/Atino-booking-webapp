import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import { Providers } from '@/app/providers'
import { AppRoutes } from '@/app/routes'
import { AppStartupSync } from '@/app/AppStartupSync'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <Providers>
      <AppStartupSync />
      <AppRoutes />
    </Providers>
  </StrictMode>
)

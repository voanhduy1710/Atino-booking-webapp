import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import type { ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

function devLog(message: string): void {
  process.stdout.write(`${message}\n`)
}

const devTimingPlugin = {
  name: 'dev-timing',
  configureServer(server: ViteDevServer) {
    server.middlewares.use('/dev-timing', (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        res.statusCode = 204
        res.end()
        return
      }

      let body = ''
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString()
      })
      req.on('end', () => {
        try {
          const { event, ms } = JSON.parse(body) as { event?: string; ms?: number }
          if (event && typeof ms === 'number') devLog(`[CLICK] ${event} | ${ms}ms`)
        } catch {
          // Ignore malformed dev timing payloads.
        }
        res.statusCode = 204
        res.end()
      })
    })
  },
}

export default defineConfig({
  plugins: [react(), devTimingPlugin],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (_proxyReq, req) => {
            const trackedReq = req as IncomingMessage & {
              _proxyStart?: number
              _proxyMethod?: string
              _proxyUrl?: string
            }
            trackedReq._proxyStart = Date.now()
            trackedReq._proxyMethod = req.method
            trackedReq._proxyUrl = req.url
          })
          proxy.on('proxyRes', (proxyRes, req) => {
            const trackedReq = req as IncomingMessage & {
              _proxyStart?: number
              _proxyMethod?: string
              _proxyUrl?: string
            }
            const ms = Date.now() - (trackedReq._proxyStart ?? Date.now())
            const method = trackedReq._proxyMethod ?? req.method ?? '?'
            const url = trackedReq._proxyUrl ?? req.url ?? ''
            devLog(`[FE->BE] ${method} ${url} -> ${proxyRes.statusCode} [${ms}ms]`)
          })
          proxy.on('error', (_err, req) => {
            const trackedReq = req as IncomingMessage & { _proxyUrl?: string }
            const url = trackedReq._proxyUrl ?? req.url ?? ''
            devLog(`[FE->BE] ERROR ${url}`)
          })
        },
      },
    },
  },
})


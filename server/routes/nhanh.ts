import { Router, Request, Response } from 'express'
import { normalizeDraftRows, type NhanhDraftRow } from '../etl/nhanhDraftInfo.js'
import { fetchProductAttributes } from '../etl/nhanhProductAttributes.js'

const router = Router()

interface EnrichedNhanhProductRow extends NhanhDraftRow {
  color: string
  size: string
}

class NhanhConfigError extends Error {
  status = 503
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new NhanhConfigError('Chưa cấu hình kết nối Nhanh. Vui lòng thiết lập NHANH_APP_ID, NHANH_BUSINESS_ID và NHANH_ACCESS_TOKEN trên backend.')
  return value
}

async function enrichRows(rows: NhanhDraftRow[]): Promise<EnrichedNhanhProductRow[]> {
  const attributesByProductId = await fetchProductAttributes(rows.map((row) => row.product_id))
  return rows.map((row) => {
    const attrs = attributesByProductId.get(String(row.product_id))
    return {
      ...row,
      color: attrs?.color ?? '',
      size: attrs?.size ?? '',
    }
  })
}

router.post('/draft-products', async (req: Request, res: Response): Promise<void> => {
  try {
    const billId = String(req.body?.billId ?? '').trim()
    if (!billId) {
      res.status(400).json({ error: 'Id phiếu nháp là bắt buộc' })
      return
    }

    const appId = requiredEnv('NHANH_APP_ID')
    const businessId = requiredEnv('NHANH_BUSINESS_ID')
    const accessToken = requiredEnv('NHANH_ACCESS_TOKEN')
    const url = new URL('https://pos.open.nhanh.vn/v3.0/bill/draftproducts')
    url.searchParams.set('appId', appId)
    url.searchParams.set('businessId', businessId)

    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filters: { billIds: Number.isFinite(Number(billId)) ? Number(billId) : billId },
        paginator: { size: 100 },
        dataOptions: {},
      }),
    })
    const json = await upstream.json() as { message?: string; code?: string | number; data?: unknown[] }
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: json?.message ?? upstream.statusText })
      return
    }

    const rows = await enrichRows(normalizeDraftRows(json))
    res.json({ billId, rows, rawCode: json?.code ?? null })
  } catch (err) {
    if (err instanceof NhanhConfigError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router

import { Router, Request, Response } from 'express'

const router = Router()

interface NhanhProductRow {
  billId: number | string
  product_id: number | string
  product_name: string
  required_quantity: number
  required_description: string
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

function normalizeRows(json: any): NhanhProductRow[] {
  return (json?.data ?? []).map((row: any) => ({
    billId: row.billId,
    product_id: row.product?.id ?? '',
    product_name: row.product?.name ?? '',
    required_quantity: Number(row.required?.quantity ?? 0),
    required_description: row.required?.description ?? '',
  }))
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
    const json = await upstream.json()
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: json?.message ?? upstream.statusText })
      return
    }

    res.json({ billId, rows: normalizeRows(json), rawCode: json?.code ?? null })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router

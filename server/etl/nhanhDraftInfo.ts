export interface NhanhDraftRow {
  billId: number | string
  product_id: number | string
  product_name: string
  required_quantity: number
  required_description: string
}

interface NhanhDraftApiRow {
  billId?: number | string
  product?: {
    id?: number | string
    name?: string
  }
  required?: {
    quantity?: number | string
    description?: string
  }
}

interface NhanhDraftApiResponse {
  data?: unknown[]
}

export function normalizeDraftRows(json: NhanhDraftApiResponse): NhanhDraftRow[] {
  return (json.data ?? []).map((entry) => {
    const row = entry as NhanhDraftApiRow
    return {
    billId: row.billId ?? '',
    product_id: row.product?.id ?? '',
    product_name: row.product?.name ?? '',
    required_quantity: Number(row.required?.quantity ?? 0),
    required_description: row.required?.description ?? '',
    }
  })
}

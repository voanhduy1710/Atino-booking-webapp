import { resilientFetch } from '../lib/resilientFetch.js'

const SIZE_ATTRIBUTE_ID = 217118
const COLOR_ATTRIBUTE_ID = 1239859

export interface NhanhProductAttributes {
  color: string
  size: string
}

interface NhanhCredentialSet {
  appId: string
  businessId: string
  accessToken: string
}

interface NhanhProductAttribute {
  id?: number
  name?: string
  value?: string
}

interface NhanhProduct {
  id?: number | string
  attributes?: NhanhProductAttribute[]
}

interface NhanhProductListResponse {
  data?: NhanhProduct[] | Record<string, NhanhProduct>
}

function productListCredentials(): NhanhCredentialSet {
  return {
    appId: process.env.NHANH_PRODUCT_APP_ID || process.env.NHANH_APP_ID || '',
    businessId: process.env.NHANH_PRODUCT_BUSINESS_ID || process.env.NHANH_BUSINESS_ID || '',
    accessToken: process.env.NHANH_PRODUCT_ACCESS_TOKEN || process.env.NHANH_ACCESS_TOKEN || '',
  }
}

function normalizeProducts(data: NhanhProductListResponse['data']): NhanhProduct[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') return Object.values(data)
  return []
}

function normalizeAttributeName(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
}

function isSizeAttribute(attr: NhanhProductAttribute): boolean {
  const name = normalizeAttributeName(attr.name)
  return name.includes('size') || name.includes('kich') || name.includes('co')
}

function isColorAttribute(attr: NhanhProductAttribute): boolean {
  const name = normalizeAttributeName(attr.name)
  return name.includes('color') || name.includes('mau')
}

function extractAttributes(product: NhanhProduct): NhanhProductAttributes {
  const attrs = product.attributes ?? []
  const sizeAttr = attrs.find((attr) => attr.id === SIZE_ATTRIBUTE_ID)
    ?? attrs.find(isSizeAttribute)
  const colorAttr = attrs.find((attr) => attr.id === COLOR_ATTRIBUTE_ID)
    ?? attrs.find(isColorAttribute)
  return {
    size: sizeAttr?.value ?? '',
    color: colorAttr?.value ?? '',
  }
}

export async function fetchProductAttributes(productIds: Array<number | string>): Promise<Map<string, NhanhProductAttributes>> {
  const ids = [...new Set(productIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))]
  const result = new Map<string, NhanhProductAttributes>()
  if (ids.length === 0) return result

  const { appId, businessId, accessToken } = productListCredentials()
  if (!appId || !businessId || !accessToken) return result

  const url = new URL('https://pos.open.nhanh.vn/v3.0/product/list')
  url.searchParams.set('appId', appId)
  url.searchParams.set('businessId', businessId)

  const upstream = await resilientFetch(url, {
    method: 'POST',
    headers: {
      Authorization: accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filters: { ids },
      paginator: { size: Math.max(100, ids.length) },
    }),
    timeoutMs: 10_000,
    retryUnsafe: true,
    circuitKey: 'nhanh',
  })
  const json = await upstream.json() as NhanhProductListResponse & { message?: string }
  if (!upstream.ok) throw new Error(json.message ?? upstream.statusText)

  for (const product of normalizeProducts(json.data)) {
    if (product.id === undefined || product.id === null) continue
    result.set(String(product.id), extractAttributes(product))
  }
  return result
}

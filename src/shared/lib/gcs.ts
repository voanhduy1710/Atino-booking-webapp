export const GCS_BASE = 'https://storage.googleapis.com/atino-media'

export const resolvePhotoUrl = (path: string): string =>
  path.startsWith('http') ? path : `${GCS_BASE}/${path}`

export interface PhotoEntry { src: string; label: string }

interface BookingItemLike {
  vat_invoice_url?: string | null
  booking_item_photos?: Array<{ storage_path: string; photo_type: string }>
}

export function buildPhotoList(item: BookingItemLike): PhotoEntry[] {
  const photos: PhotoEntry[] = []
  const vatPhotos = (item.booking_item_photos ?? []).filter((p) => p.photo_type === 'vat_invoice')
  if (vatPhotos.length > 0) {
    for (const p of vatPhotos) photos.push({ src: resolvePhotoUrl(p.storage_path), label: 'Hóa đơn VAT' })
  } else if (item.vat_invoice_url) {
    photos.push({ src: item.vat_invoice_url, label: 'Hóa đơn VAT' })
  }
  for (const p of item.booking_item_photos ?? []) {
    if (p.photo_type === 'vat_invoice') continue
    photos.push({
      src: resolvePhotoUrl(p.storage_path),
      label: p.photo_type === 'delivery_slip' ? 'Phiếu giao' : 'Chênh lệch',
    })
  }
  return photos
}

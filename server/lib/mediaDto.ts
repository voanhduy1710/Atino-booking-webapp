import { getSignedReadUrl } from './gcs.js'

async function signedUrl(path: unknown): Promise<string | null> {
  if (typeof path !== 'string' || !path) return null
  try {
    return await getSignedReadUrl(path)
  } catch {
    return null
  }
}

export async function signBookingMedia<T extends Record<string, any>>(booking: T): Promise<T> {
  const items = await Promise.all((booking.booking_items ?? []).map(async (item: Record<string, any>) => ({
    ...item,
    vat_invoice_url: await signedUrl(item.vat_invoice_url),
    booking_item_photos: await Promise.all((item.booking_item_photos ?? []).map(async (photo: Record<string, any>) => ({
      ...photo,
      storage_path: await signedUrl(photo.storage_path),
    }))),
  })))
  return { ...booking, booking_items: items }
}

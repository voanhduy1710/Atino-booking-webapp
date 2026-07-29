export type PageWidthKey = 'defaultWide' | 'bookingNew' | 'productProcess'

export const PAGE_WIDTH_CLASS: Record<PageWidthKey, string> = {
  defaultWide: 'lg:w-[80vw]',
  bookingNew: 'lg:w-[80vw]',
  productProcess: 'lg:w-[69vw]',
}

export function pageMainClass(width: PageWidthKey) {
  return `flex-1 ${PAGE_WIDTH_CLASS[width]} max-w-none mx-auto w-full px-4 py-6`
}

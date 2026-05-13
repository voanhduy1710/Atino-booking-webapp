export const isPdfAttachment = (src: string): boolean => {
  try {
    const pathname = new URL(src, window.location.origin).pathname.toLowerCase()
    return pathname.endsWith('.pdf')
  } catch {
    return src.split(/[?#]/, 1)[0].toLowerCase().endsWith('.pdf')
  }
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { isPdfAttachment } from '@/shared/lib/attachments'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface Props {
  src: string
  onClose: () => void
}

const MIN_ZOOM = 0.6
const MAX_ZOOM = 1.8
const ZOOM_STEP = 0.2

function attachmentName(src: string) {
  try {
    const pathname = new URL(src, window.location.origin).pathname
    return decodeURIComponent(pathname.split('/').pop() || 'PDF attachment')
  } catch {
    return 'PDF attachment'
  }
}

function PdfLoading() {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-white/70">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white" />
      Loading PDF...
    </div>
  )
}

function PdfError() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-red-300/30 bg-red-950/30 px-6 py-8 text-center text-sm text-red-100">
      <span className="text-2xl">!</span>
      <p className="font-semibold">Unable to preview this PDF</p>
      <p className="text-red-100/75">Please download the document and try opening it locally.</p>
    </div>
  )
}

function pdfProxyUrl(src: string) {
  return `/api/media/pdf?url=${encodeURIComponent(src)}`
}

export function Lightbox({ src, onClose }: Props) {
  const isPdf = isPdfAttachment(src)
  const fileName = useMemo(() => attachmentName(src), [src])
  const pdfSource = useMemo(() => isPdf ? pdfProxyUrl(src) : src, [isPdf, src])
  const viewerRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [viewerWidth, setViewerWidth] = useState(0)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])

  useEffect(() => {
    setNumPages(0)
    setPageNumber(1)
    setZoom(1)
  }, [src])

  useEffect(() => {
    if (!isPdf || !viewerRef.current) return
    const container = viewerRef.current
    const resizeObserver = new ResizeObserver(([entry]) => setViewerWidth(entry.contentRect.width))
    resizeObserver.observe(container)
    setViewerWidth(container.clientWidth)
    return () => resizeObserver.disconnect()
  }, [isPdf])

  const fitWidth = Math.max(280, Math.min(viewerWidth - 32, 980))
  const pageWidth = Math.round(fitWidth * zoom)
  const canGoPrevious = pageNumber > 1
  const canGoNext = numPages > 0 && pageNumber < numPages

  return (
    <div
      data-lightbox-root
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#120b12]/90 p-3 backdrop-blur-sm sm:p-5"
      onClick={onClose}
    >
      {isPdf ? (
        <section
          className="flex h-[min(92vh,960px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#211823] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
          role="dialog"
          aria-modal="true"
          aria-label="PDF preview"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.06] px-3 py-2.5 backdrop-blur-xl sm:px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-400/15 text-[11px] font-bold text-red-200 ring-1 ring-red-300/20">PDF</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{fileName}</p>
                <p className="text-xs text-white/50">Document preview</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <div className="flex items-center rounded-lg border border-white/10 bg-black/15 p-0.5">
                <button type="button" onClick={() => setPageNumber((page) => page - 1)} disabled={!canGoPrevious} className="rounded-md px-2 py-1.5 text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30">Previous</button>
                <span className="min-w-24 px-1 text-center tabular-nums text-white/70">Page {pageNumber} of {numPages || '—'}</span>
                <button type="button" onClick={() => setPageNumber((page) => page + 1)} disabled={!canGoNext} className="rounded-md px-2 py-1.5 text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30">Next</button>
              </div>
              <div className="flex items-center rounded-lg border border-white/10 bg-black/15 p-0.5">
                <button type="button" onClick={() => setZoom((value) => Math.max(MIN_ZOOM, Number((value - ZOOM_STEP).toFixed(1))))} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out" className="grid h-7 w-7 place-items-center rounded-md text-base text-white/85 transition hover:bg-white/10 disabled:opacity-30">−</button>
                <button type="button" onClick={() => setZoom(1)} className="rounded-md px-2 py-1.5 text-white/85 transition hover:bg-white/10">Fit</button>
                <button type="button" onClick={() => setZoom((value) => Math.min(MAX_ZOOM, Number((value + ZOOM_STEP).toFixed(1))))} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in" className="grid h-7 w-7 place-items-center rounded-md text-base text-white/85 transition hover:bg-white/10 disabled:opacity-30">+</button>
              </div>
              <a href={src} download className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-white transition hover:bg-white/20" title="Download PDF">Download</a>
              <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-xl leading-none text-white/85 transition hover:bg-white/10" aria-label="Close preview">×</button>
            </div>
          </header>
          <div ref={viewerRef} className="min-h-0 flex-1 overflow-auto bg-[#110b12] p-4 sm:p-6">
            <div className="flex min-h-full min-w-max items-start justify-center">
              <Document
                file={pdfSource}
                onLoadSuccess={({ numPages: loadedPages }) => {
                  setNumPages(loadedPages)
                  setPageNumber((page) => Math.min(page, loadedPages))
                }}
                loading={<PdfLoading />}
                error={<PdfError />}
              >
                <Page
                  pageNumber={pageNumber}
                  width={pageWidth}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                  loading={<PdfLoading />}
                  error={<PdfError />}
                  className="overflow-hidden rounded-sm bg-white shadow-[0_10px_35px_rgba(0,0,0,0.55)]"
                />
              </Document>
            </div>
          </div>
        </section>
      ) : (
        <div className="relative max-h-full max-w-full" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="absolute -right-3 -top-3 grid h-9 w-9 place-items-center rounded-full bg-white text-2xl leading-none text-[#6b2e65] shadow hover:bg-[#f5eaf4]" onClick={onClose} aria-label="Close preview">×</button>
          <img src={src} alt="" className="max-h-[92vh] max-w-full rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  )
}

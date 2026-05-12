import { useEffect } from 'react'

interface Props {
  src: string
  onClose: () => void
}

export function Lightbox({ src, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])

  return (
    <div
      data-lightbox-root
      className="fixed inset-0 bg-black/85 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white text-3xl font-bold leading-none hover:opacity-70"
        onClick={onClose}
      >
        ×
      </button>
      <img
        src={src}
        alt=""
        className="max-w-full max-h-full object-contain rounded shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

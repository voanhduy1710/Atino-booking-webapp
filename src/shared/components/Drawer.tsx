import { useEffect } from 'react'
import type { ReactNode } from 'react'

interface Props {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: string
}

export function Drawer({ isOpen, onClose, title, children, width = 'max-w-2xl' }: Props) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={`fixed right-0 top-0 h-full z-50 bg-white border-l border-[#E0E0E0] shadow-xl flex flex-col transition-transform duration-300 w-full ${width} ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E0E0E0] flex-shrink-0">
          <h2 id="drawer-title" className="text-base font-bold">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-[#888888] hover:text-black transition-colors text-2xl leading-none"
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>
      </div>
    </>
  )
}

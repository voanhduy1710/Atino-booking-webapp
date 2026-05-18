import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ProductProcessCatalog } from '@/shared/types/domain'

interface Props {
  placeholder: string
  selectedId: string
  options: ProductProcessCatalog[]
  getLabel: (option: ProductProcessCatalog) => string
  onSelect: (id: string) => void
  error?: boolean
  inputClassName?: string
}

export function ProductProcessCombobox({ placeholder, selectedId, options, getLabel, onSelect, error, inputClassName = '' }: Props) {
  const selected = options.find((option) => option.id === selectedId)
  const [query, setQuery] = useState(selected ? getLabel(selected) : '')
  const [isOpen, setIsOpen] = useState(false)
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (selected) setQuery(getLabel(selected))
  }, [selectedId, selected, getLabel])

  const closeMenu = () => {
    setIsOpen(false)
    setMenuRect(null)
  }

  const openMenu = () => {
    setMenuRect(inputRef.current?.getBoundingClientRect() ?? null)
    setIsOpen(true)
  }

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        closeMenu()
        setQuery(selected ? getLabel(selected) : '')
      }
    }
    const handleScrollOrResize = () => {
      if (isOpen) setMenuRect(inputRef.current?.getBoundingClientRect() ?? null)
    }
    document.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [selected, getLabel, isOpen])

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 30)
    return options
      .filter((option) =>
        option.product_name.toLowerCase().includes(q) ||
        option.order_code.toLowerCase().includes(q)
      )
      .slice(0, 30)
  }, [options, query])

  const menuWidth = menuRect ? Math.min(360, window.innerWidth - 16) : 0
  const menuLeft = menuRect ? Math.max(8, Math.min(menuRect.left, window.innerWidth - menuWidth - 8)) : 0

  return (
    <div ref={rootRef} className="relative min-w-0 w-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => {
          const value = event.target.value
          setQuery(value)
          openMenu()
          if (selectedId || !value) onSelect('')
        }}
        onFocus={openMenu}
        className={`input-field text-sm ${inputClassName} ${error ? 'input-field-error' : ''}`}
        placeholder={placeholder}
        autoComplete="off"
      />
      {isOpen && menuRect && createPortal(
        <div
          className="fixed z-[1000] max-h-80 overflow-auto rounded border border-[#d5c0d5] bg-white shadow-lg"
          style={{
            left: menuLeft,
            top: menuRect.bottom + 4,
            width: Math.max(menuRect.width, menuWidth),
          }}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`block w-full px-3 py-2 text-left text-xs hover:bg-[#f1ebf4] ${option.id === selectedId ? 'bg-[#fdf8ff] font-semibold' : ''
                  }`}
                onMouseDown={(event) => {
                  event.preventDefault()
                  onSelect(option.id)
                  setQuery(getLabel(option))
                  closeMenu()
                }}
              >
                <span className="block truncate">{getLabel(option)}</span>
                <span className="block truncate text-[#888888]">
                  {option.product_name} · {option.order_code}
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-[#888888]">Không có kết quả</div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

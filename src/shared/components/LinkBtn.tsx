import type { ReactNode } from 'react'

interface Props {
  onClick: () => void
  danger?: boolean
  children: ReactNode
}

export function LinkBtn({ onClick, danger, children }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs underline ${danger ? 'text-[#CC0000] hover:text-[#990000]' : 'text-[#888888] hover:text-black'}`}
    >
      {children}
    </button>
  )
}

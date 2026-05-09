import type { ButtonHTMLAttributes } from 'react'
import { LoadingSpinner } from './LoadingSpinner'

type Variant = 'primary' | 'outline' | 'danger-outline' | 'ghost'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  fullWidth?: boolean
}

const variantClass: Record<Variant, string> = {
  primary: 'btn-primary',
  outline: 'btn-outline',
  'danger-outline': 'btn-danger-outline',
  ghost: 'inline-flex items-center justify-center px-4 py-2 text-sm text-[#888888] hover:text-black transition-colors',
}

export function Button({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  className = '',
  ...props
}: Props) {
  return (
    <button
      className={`${variantClass[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoadingSpinner size="sm" className="mr-2" /> : null}
      {children}
    </button>
  )
}

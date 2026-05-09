interface Props {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-3',
}

export function LoadingSpinner({ size = 'md', className = '' }: Props) {
  return (
    <div
      role="status"
      aria-label="Đang tải..."
      className={`${sizeMap[size]} border-[#E0E0E0] border-t-black rounded-full animate-spin ${className}`}
    />
  )
}

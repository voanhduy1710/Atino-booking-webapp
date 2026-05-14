import { isPdfAttachment } from '@/shared/lib/attachments'

interface Props {
  src: string
  label: string
  onClick: () => void
  className?: string
}

export function AttachmentThumbnail({ src, label, onClick, className = 'w-12 h-12' }: Props) {
  const isPdf = isPdfAttachment(src)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex-shrink-0 overflow-hidden rounded border border-[#ecdbe8] bg-white hover:border-black transition-colors ${className}`}
      title={label}
      aria-label={label}
    >
      {isPdf ? (
        <span className="flex h-full w-full items-center justify-center bg-[#F5F5F5] text-[10px] font-bold text-[#666666]">
          PDF
        </span>
      ) : (
        <img src={src} alt={label} className="h-full w-full object-cover" />
      )}
      <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
    </button>
  )
}

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
      className={`group relative flex-shrink-0 overflow-hidden rounded border border-[#ecdbe8] bg-white hover:border-[#80417A] transition-colors ${className}`}
      title={label}
      aria-label={label}
    >
      {isPdf ? (
        <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-[#fff8f8] text-[#b42318]">
          <span className="rounded bg-[#fde4e4] px-1 py-px text-[10px] font-bold leading-tight">PDF</span>
          <span className="text-[8px] font-medium leading-tight opacity-75">Xem</span>
        </span>
      ) : (
        <img src={src} alt={label} className="h-full w-full object-cover" />
      )}
      <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
    </button>
  )
}

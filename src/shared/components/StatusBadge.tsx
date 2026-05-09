import type { ReactNode } from 'react'
import type { BookingStatus } from '@/shared/types/domain'

const statusConfig: Record<BookingStatus, { label: string; className: string }> = {
  pending: { label: 'Đang chờ xác nhận', className: 'status-pending' },
  confirmed: { label: 'Đã xác nhận', className: 'status-confirmed' },
  rejected: { label: 'Đã từ chối', className: 'status-rejected' },
  received: { label: 'Đã nhận hàng', className: 'status-confirmed' },
}

interface Props {
  status: BookingStatus
  children?: ReactNode
}

export function StatusBadge({ status, children }: Props) {
  const config = statusConfig[status]
  return (
    <span className={config.className}>
      {children ?? config.label}
    </span>
  )
}

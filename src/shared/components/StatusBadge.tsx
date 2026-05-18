import type { ReactNode } from 'react'
import { BOOKING_STATUS_CLASSES, BOOKING_STATUS_LABELS } from '@/shared/constants/status'
import type { BookingStatus } from '@/shared/types/domain'

interface Props {
  status: BookingStatus
  children?: ReactNode
}

export function StatusBadge({ status, children }: Props) {
  return (
    <span className={BOOKING_STATUS_CLASSES[status]}>
      {children ?? BOOKING_STATUS_LABELS[status]}
    </span>
  )
}

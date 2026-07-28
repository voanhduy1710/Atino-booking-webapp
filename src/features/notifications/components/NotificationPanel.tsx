import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications, useMarkRead } from '@/features/notifications/hooks/useNotifications'
import { relativeTime } from '@/shared/lib/dateUtils'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { getJson } from '@/shared/lib/apiClient'

interface Props {
  isOpen: boolean
  onClose: () => void
}

const EVENT_ICONS: Record<string, string> = {
  booking_submitted: '📦',
  booking_confirmed: '✅',
  booking_rejected: '❌',
  booking_received: '🏭',
  account_pending: '⏳',
  account_approved: '✅',
  account_rejected: '❌',
  amendment_requested: '🖍',
  amendment_approved: '✅',
  amendment_denied: '❌',
  discrepancy_recorded: '⚠️',
}

export function NotificationPanel({ isOpen, onClose }: Props) {
  const navigate = useNavigate()
  const { data: notifications = [], isLoading } = useNotifications()
  const markRead = useMarkRead()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>('button')?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const focusable = [...panel.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.hasAttribute('disabled'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [isOpen, onClose])

  const handleMarkAllRead = () => {
    markRead.mutate('all')
  }

  const handleNotificationClick = async (id: string, bookingId: string | null) => {
    markRead.mutate(id)
    if (bookingId) {
      const result = await getJson<{ booking_token: string | null }>(`/api/notifications/${id}/booking-link`)
      navigate(`/booking/${result.booking_token ?? bookingId}`)
    }
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        ref={panelRef}
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 h-full z-50 bg-white border-l border-[#ecdbe8] w-full max-w-sm flex flex-col transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        role="dialog"
        aria-modal="true"
        aria-label="Thông báo"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#ecdbe8]">
          <h2 className="font-bold text-sm">Thông báo</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleMarkAllRead}
              className="min-h-11 text-xs text-[#888888] hover:text-black transition-colors"
              id="mark-all-read"
            >
              Đánh dấu tất cả đã đọc
            </button>
            <button
              onClick={onClose}
              className="min-h-11 min-w-11 text-[#888888] hover:text-black transition-colors text-xl"
              aria-label="Đóng"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <LoadingSpinner />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-[#888888] text-sm">
              <span className="text-2xl mb-2">🔔</span>
              Chưa có thông báo
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => void handleNotificationClick(n.id, n.booking_id)}
                className={`w-full text-left px-4 py-3 border-b border-[#ecdbe8] hover:bg-[#F5F5F5] transition-colors flex gap-3 items-start ${!n.is_read ? 'bg-[#F9F9F9]' : ''
                  }`}
              >
                <span className="text-lg flex-shrink-0 mt-0.5">
                  {EVENT_ICONS[n.event_type] ?? '📢'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${!n.is_read ? 'font-medium' : 'text-[#888888]'}`}>
                    {n.message}
                  </p>
                  <p className="text-xs text-[#888888] mt-0.5">
                    {relativeTime(n.created_at)}
                  </p>
                </div>
                {!n.is_read && (
                  <span className="w-2 h-2 rounded-full bg-black flex-shrink-0 mt-1.5" aria-hidden="true" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </>
  )
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCurrentUser } from '@/shared/lib/auth'
import { getJson, postJson } from '@/shared/lib/apiClient'
import type { Notification } from '@/shared/types/domain'

export function useNotifications() {
  const user = getCurrentUser()
  const recipientId = user?.role === 'supplier' ? user.supplier_account_id : (user?.sub ?? user?.username)

  return useQuery({
    queryKey: ['notifications', recipientId],
    queryFn: async () => {
      if (!recipientId) return []
      const result = await getJson<{ notifications: Notification[] }>('/api/notifications')
      return result.notifications
    },
    enabled: !!recipientId,
    refetchInterval: 60_000,
  })
}

export function useUnreadCount() {
  const user = getCurrentUser()
  const recipientId = user?.role === 'supplier' ? user.supplier_account_id : (user?.sub ?? user?.username)

  return useQuery({
    queryKey: ['notifications-unread', recipientId],
    queryFn: async () => {
      if (!recipientId) return 0
      const result = await getJson<{ count: number }>('/api/notifications/unread-count')
      return result.count
    },
    enabled: !!recipientId,
    refetchInterval: 60_000,
  })
}

export function useMarkRead() {
  const queryClient = useQueryClient()
  const user = getCurrentUser()
  const recipientId = user?.role === 'supplier' ? user.supplier_account_id : (user?.sub ?? user?.username)

  return useMutation({
    mutationFn: async (notificationId: string | 'all') => {
      if (!recipientId) return
      await postJson<{ ok: true }>('/api/notifications/read', { notification_id: notificationId })
    },

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
    },
  })
}


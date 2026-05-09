import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { getCurrentUser } from '@/shared/lib/auth'
import type { Notification } from '@/shared/types/domain'

export function useNotifications() {
  const user = getCurrentUser()
  const recipientId = user?.role === 'supplier' ? user.supplier_account_id : user?.sub

  return useQuery({
    queryKey: ['notifications', recipientId],
    queryFn: async () => {
      if (!recipientId) return []
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', recipientId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as Notification[]
    },
    enabled: !!recipientId,
    refetchInterval: 60_000,
  })
}

export function useUnreadCount() {
  const user = getCurrentUser()
  const recipientId = user?.role === 'supplier' ? user.supplier_account_id : user?.sub

  return useQuery({
    queryKey: ['notifications-unread', recipientId],
    queryFn: async () => {
      if (!recipientId) return 0
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', recipientId)
        .eq('is_read', false)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!recipientId,
    refetchInterval: 60_000,
  })
}

export function useMarkRead() {
  const queryClient = useQueryClient()
  const user = getCurrentUser()
  const recipientId = user?.role === 'supplier' ? user.supplier_account_id : user?.sub

  return useMutation({
    mutationFn: async (notificationId: string | 'all') => {
      if (!recipientId) return
      // supabase stub schema types 'notifications' as never — cast to bypass
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any
      if (notificationId === 'all') {
        await sb.from('notifications').update({ is_read: true }).eq('recipient_id', recipientId).eq('is_read', false)
      } else {
        await sb.from('notifications').update({ is_read: true }).eq('id', notificationId)
      }
    },

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
    },
  })
}

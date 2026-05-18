import { AccountManagement } from '@/features/accounts/AccountManagement'

export function AccountsTab() {
  return <AccountManagement accountsQueryKey="admin-accounts" suppliersQueryKey="admin-suppliers" />
}

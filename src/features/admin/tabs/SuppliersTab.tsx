import { SupplierTable } from '@/features/adminResources/SupplierTable'

export function SuppliersTab() {
  return <SupplierTable canDelete queryKey="admin-suppliers" />
}

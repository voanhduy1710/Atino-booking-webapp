import { WarehouseTable } from '@/features/adminResources/WarehouseTable'

export function WarehousesTab() {
  return <WarehouseTable canDelete queryKey="admin-warehouses" />
}

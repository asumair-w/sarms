/**
 * Inventory & Equipment – categories, status, seed data.
 */

export const INVENTORY_CATEGORIES = [
  { id: 'supplies', label: 'Supplies' },
  { id: 'packaging', label: 'Packaging' },
  { id: 'ppe', label: 'PPE' },
  { id: 'tools', label: 'Tools' },
  { id: 'other', label: 'Other' },
]

export const INVENTORY_STATUS = {
  NORMAL: 'normal',
  LOW: 'low',
  CRITICAL: 'critical',
}

export const EQUIPMENT_STATUS = {
  ACTIVE: 'active',
  UNDER_MAINTENANCE: 'under_maintenance',
  OUT_OF_SERVICE: 'out_of_service',
}

export const EQUIPMENT_STATUS_LABELS = {
  [EQUIPMENT_STATUS.ACTIVE]: 'Active',
  [EQUIPMENT_STATUS.UNDER_MAINTENANCE]: 'Under Maintenance',
  [EQUIPMENT_STATUS.OUT_OF_SERVICE]: 'Out of Service',
}

export function getInitialInventory() {
  const ts = (daysAgo, hoursAgo = 0) => new Date(Date.now() - daysAgo * 86400000 - hoursAgo * 3600000).toISOString()
  return [
    { id: 'inv1', name: 'Fertilizer', category: 'supplies', quantity: 1500, unit: 'kg', minQty: 500, warningQty: 1000, lastUpdated: ts(1, 10) },
    { id: 'inv2', name: 'Seeds', category: 'supplies', quantity: 7200, unit: 'units', minQty: 2000, warningQty: 5000, lastUpdated: ts(1, 3) },
    { id: 'inv3', name: 'Pesticide', category: 'supplies', quantity: 250, unit: 'liters', minQty: 100, warningQty: 200, lastUpdated: ts(1, 8) },
    { id: 'inv4', name: 'Packaging (Large box)', category: 'packaging', quantity: 3000, unit: 'Large box', minQty: 500, warningQty: 1500, lastUpdated: ts(0, 5) },
    { id: 'inv5', name: 'Safety Gloves', category: 'ppe', quantity: 50, unit: 'pairs', minQty: 100, warningQty: 150, lastUpdated: ts(0, 3) },
    { id: 'inv6', name: 'Cleaning solution', category: 'supplies', quantity: 8, unit: 'liters', minQty: 10, warningQty: 15, lastUpdated: ts(0, 1) },
    { id: 'inv7', name: 'Seed bags', category: 'supplies', quantity: 25, unit: 'boxes', minQty: 20, warningQty: 30, lastUpdated: ts(1) },
    { id: 'inv8', name: 'Safety goggles', category: 'ppe', quantity: 85, unit: 'pairs', minQty: 50, warningQty: 70, lastUpdated: ts(2) },
    { id: 'inv9', name: 'Packaging (Small box)', category: 'packaging', quantity: 5200, unit: 'units', minQty: 1000, warningQty: 3000, lastUpdated: ts(0, 6) },
    { id: 'inv10', name: 'Irrigation tubing', category: 'supplies', quantity: 1200, unit: 'meters', minQty: 500, warningQty: 800, lastUpdated: ts(3) },
    { id: 'inv11', name: 'Spray nozzles', category: 'tools', quantity: 45, unit: 'units', minQty: 30, warningQty: 40, lastUpdated: ts(5) },
    { id: 'inv12', name: 'Harvest trays', category: 'packaging', quantity: 18, unit: 'units', minQty: 50, warningQty: 80, lastUpdated: ts(0, 2) },
  ]
}

export function getInitialEquipment() {
  const d = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)
  return [
    { id: 'eq1', name: 'Harvester A', category: 'Machinery', zone: 'A', status: EQUIPMENT_STATUS.ACTIVE, lastInspection: d(30) },
    { id: 'eq2', name: 'Conveyor B2', category: 'Conveyor', zone: 'B', status: EQUIPMENT_STATUS.UNDER_MAINTENANCE, lastInspection: d(14) },
    { id: 'eq3', name: 'Cooling unit C1', category: 'Cooling', zone: 'C', status: EQUIPMENT_STATUS.OUT_OF_SERVICE, lastInspection: d(60) },
    { id: 'eq4', name: 'Harvester B', category: 'Machinery', zone: 'B', status: EQUIPMENT_STATUS.ACTIVE, lastInspection: d(7) },
    { id: 'eq5', name: 'Irrigation pump D1', category: 'Pump', zone: 'D', status: EQUIPMENT_STATUS.ACTIVE, lastInspection: d(21) },
    { id: 'eq6', name: 'Conveyor A1', category: 'Conveyor', zone: 'A', status: EQUIPMENT_STATUS.ACTIVE, lastInspection: d(5) },
    { id: 'eq7', name: 'Sorting line C2', category: 'Conveyor', zone: 'C', status: EQUIPMENT_STATUS.UNDER_MAINTENANCE, lastInspection: d(3) },
    { id: 'eq8', name: 'Packaging machine', category: 'Machinery', zone: 'Inventory', status: EQUIPMENT_STATUS.ACTIVE, lastInspection: d(14) },
  ]
}

/** Movement reasons for audit trail */
export const INVENTORY_MOVEMENT_REASON = {
  ITEM_ADDED: 'Item Added',
  MANUAL_UPDATE: 'Manual Update',
  RESTOCK: 'Restock',
  MAINTENANCE_USAGE: 'Maintenance Usage',
  ADJUSTMENT: 'Adjustment',
}

/** Compute status from quantity vs thresholds. */
export function getInventoryStatus(item) {
  if (item.quantity <= (item.minQty ?? 0)) return INVENTORY_STATUS.CRITICAL
  if (item.quantity <= (item.warningQty ?? item.minQty ?? 0)) return INVENTORY_STATUS.LOW
  return INVENTORY_STATUS.NORMAL
}

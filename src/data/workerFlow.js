/**
 * Worker flow: departments and tasks.
 * Icons use Heroicons keys (see components/HeroIcons.jsx).
 */

export const DEPARTMENTS = [
  { id: 'farming', labelEn: 'Farming', labelAr: 'زراعة', icon: 'sun' },
  { id: 'maintenance', labelEn: 'Maintenance', labelAr: 'صيانة', icon: 'wrench-simple' },
]

/** Inventory zone: post-harvest execution only. Not in DEPARTMENTS so department step is skipped when zone is Inventory. */
export const INVENTORY_DEPARTMENT = { id: 'inventory', labelEn: 'Inventory', labelAr: 'المخزون', icon: 'cube' }

/** Tasks shown when worker selects zone Inventory (no department step). */
export const INVENTORY_TASKS = [
  { id: 'receive_move_storage', labelEn: 'Receive & Move to Storage', labelAr: 'استلام ونقل إلى المستودع', icon: 'list-bullet' },
  { id: 'packing_preparing', labelEn: 'Packing / Preparing', labelAr: 'تجهيز وتغليف', icon: 'list-bullet' },
]

export const TASKS_BY_DEPARTMENT = {
  farming: [
    { id: 'irrigation', labelEn: 'Irrigation', labelAr: 'ري', icon: 'list-bullet' },
    { id: 'harvesting', labelEn: 'Harvesting', labelAr: 'حصاد', icon: 'list-bullet' },
    { id: 'plant_care', labelEn: 'Plant Care', labelAr: 'العناية بالنبات', icon: 'list-bullet' },
    { id: 'planting_transplanting', labelEn: 'Planting / Transplanting', labelAr: 'زراعة / نقل الشتلات', icon: 'list-bullet' },
    { id: 'spraying_treatment', labelEn: 'Spraying / Treatment', labelAr: 'الرش / المعالجة', icon: 'list-bullet' },
    { id: 'monitoring', labelEn: 'Monitoring', labelAr: 'المراقبة', icon: 'list-bullet' },
  ],
  maintenance: [
    { id: 'inspection', labelEn: 'Inspection', labelAr: 'التفتيش', icon: 'list-bullet' },
    { id: 'testing', labelEn: 'Testing', labelAr: 'الاختبار', icon: 'list-bullet' },
    { id: 'repair', labelEn: 'Repair', labelAr: 'الإصلاح', icon: 'list-bullet' },
    { id: 'preventive_maintenance', labelEn: 'Preventive Maintenance', labelAr: 'الصيانة الوقائية', icon: 'list-bullet' },
  ],
}

export function getDepartment(id) {
  if (id === 'inventory') return INVENTORY_DEPARTMENT
  return DEPARTMENTS.find((d) => d.id === id)
}

export const ZONES = [
  { id: 'a', labelEn: 'A', labelAr: 'أ', icon: 'squares-2x2' },
  { id: 'b', labelEn: 'B', labelAr: 'ب', icon: 'squares-2x2' },
  { id: 'c', labelEn: 'C', labelAr: 'ج', icon: 'squares-2x2' },
  { id: 'd', labelEn: 'D', labelAr: 'د', icon: 'squares-2x2' },
  { id: 'inventory', labelEn: 'Inventory', labelAr: 'المخزون', icon: 'cube' },
]

/** Zones for store: same as ZONES with .label for engineer UI (Zone A, Zone B, …). */
export function getInitialZones() {
  return ZONES.map((z) => ({
    ...z,
    label: z.id === 'inventory' ? 'Inventory' : `Zone ${z.labelEn}`,
  }))
}

export function getTasksForDepartment(departmentId) {
  if (departmentId === 'inventory') return INVENTORY_TASKS
  return TASKS_BY_DEPARTMENT[departmentId] ?? []
}

/** Find a task by id across all departments and inventory (for display in Assign Task / reports). */
export function getTaskById(taskId) {
  if (!taskId) return null
  const inInventory = INVENTORY_TASKS.find((t) => t.id === taskId)
  if (inInventory) return inInventory
  for (const tasks of Object.values(TASKS_BY_DEPARTMENT)) {
    const found = tasks.find((t) => t.id === taskId)
    if (found) return found
  }
  return null
}

export function getZone(id, zonesList) {
  if (zonesList && Array.isArray(zonesList)) return zonesList.find((z) => z.id === id) ?? null
  return ZONES.find((z) => z.id === id) ?? null
}

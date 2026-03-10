/**
 * Register & Manage Workers: roles, departments, seed data.
 */

export const ROLE_OPTIONS = [
  { value: 'worker', label: 'Worker' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'admin', label: 'Admin' },
]

export const DEPARTMENT_OPTIONS = [
  { value: 'farming', label: 'Farming' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'inventory', label: 'Inventory' },
]

/** Available skill tags for workers. */
export const SKILL_OPTIONS = [
  'Harvesting',
  'Irrigation',
  'Machine Repair',
  'Inspection',
  'Plant Care',
  'Packing',
  'Storage',
  'Spraying / Treatment',
  'Monitoring',
  'Preventive Maintenance',
  'Testing',
  'Quality Check',
]

/**
 * Minimal seed: 15 workers + 1 engineer + 1 admin.
 * Used when storage is empty (e.g. after "Clear all data") so you can test and add data yourself.
 */
const MINIMAL_SEED_WORKERS_RAW = [
  { id: '1', employeeId: 'w1', fullName: 'عامل ١', phone: '+966 50 111 2222', email: 'worker1@sarms.local', nationality: 'Saudi', role: 'worker', department: 'farming', status: 'active', tempPassword: 'w1', createdAt: new Date().toISOString(), skills: [] },
  { id: '2', employeeId: 'w2', fullName: 'عامل ٢', phone: '+966 54 777 8888', email: 'worker2@sarms.local', nationality: 'Saudi', role: 'worker', department: 'farming', status: 'active', tempPassword: 'w2', createdAt: new Date().toISOString(), skills: [] },
  { id: '3', employeeId: 'w3', fullName: 'عامل ٣', phone: '+966 55 999 0000', email: 'worker3@sarms.local', nationality: 'Saudi', role: 'worker', department: 'farming', status: 'active', tempPassword: 'w3', createdAt: new Date().toISOString(), skills: [] },
  { id: '4', employeeId: 'w4', fullName: 'عامل ٤', phone: '+966 56 111 3333', email: 'worker4@sarms.local', nationality: 'Saudi', role: 'worker', department: 'maintenance', status: 'active', tempPassword: 'w4', createdAt: new Date().toISOString(), skills: [] },
  { id: '5', employeeId: 'w5', fullName: 'عامل ٥', phone: '+966 57 444 5555', email: 'worker5@sarms.local', nationality: 'Saudi', role: 'worker', department: 'maintenance', status: 'active', tempPassword: 'w5', createdAt: new Date().toISOString(), skills: [] },
  { id: '6', employeeId: 'w6', fullName: 'عامل ٦', phone: '+966 53 111 4444', email: 'worker6@sarms.local', nationality: 'Saudi', role: 'worker', department: 'inventory', status: 'active', tempPassword: 'w6', createdAt: new Date().toISOString(), skills: [] },
  { id: '7', employeeId: 'w7', fullName: 'عامل ٧', phone: '+966 55 333 6666', email: 'worker7@sarms.local', nationality: 'Saudi', role: 'worker', department: 'farming', status: 'active', tempPassword: 'w7', createdAt: new Date().toISOString(), skills: [] },
  { id: '8', employeeId: 'w8', fullName: 'عامل ٨', phone: '+966 56 444 7777', email: 'worker8@sarms.local', nationality: 'Saudi', role: 'worker', department: 'farming', status: 'active', tempPassword: 'w8', createdAt: new Date().toISOString(), skills: [] },
  { id: '9', employeeId: 'w9', fullName: 'عامل ٩', phone: '+966 57 555 8888', email: 'worker9@sarms.local', nationality: 'Saudi', role: 'worker', department: 'inventory', status: 'active', tempPassword: 'w9', createdAt: new Date().toISOString(), skills: [] },
  { id: '10', employeeId: 'w10', fullName: 'عامل ١٠', phone: '+966 58 666 9999', email: 'worker10@sarms.local', nationality: 'Saudi', role: 'worker', department: 'maintenance', status: 'active', tempPassword: 'w10', createdAt: new Date().toISOString(), skills: [] },
  { id: '11', employeeId: 'w11', fullName: 'عامل ١١', phone: '+966 50 222 3333', email: 'worker11@sarms.local', nationality: 'Saudi', role: 'worker', department: 'farming', status: 'active', tempPassword: 'w11', createdAt: new Date().toISOString(), skills: [] },
  { id: '12', employeeId: 'w12', fullName: 'عامل ١٢', phone: '+966 51 333 4444', email: 'worker12@sarms.local', nationality: 'Saudi', role: 'worker', department: 'maintenance', status: 'active', tempPassword: 'w12', createdAt: new Date().toISOString(), skills: [] },
  { id: '13', employeeId: 'w13', fullName: 'عامل ١٣', phone: '+966 52 444 5555', email: 'worker13@sarms.local', nationality: 'Saudi', role: 'worker', department: 'inventory', status: 'active', tempPassword: 'w13', createdAt: new Date().toISOString(), skills: [] },
  { id: '14', employeeId: 'w14', fullName: 'عامل ١٤', phone: '+966 53 555 6666', email: 'worker14@sarms.local', nationality: 'Saudi', role: 'worker', department: 'farming', status: 'active', tempPassword: 'w14', createdAt: new Date().toISOString(), skills: [] },
  { id: '15', employeeId: 'w15', fullName: 'عامل ١٥', phone: '+966 54 666 7777', email: 'worker15@sarms.local', nationality: 'Saudi', role: 'worker', department: 'maintenance', status: 'active', tempPassword: 'w15', createdAt: new Date().toISOString(), skills: [] },
  { id: '16', employeeId: 'e1', fullName: 'المهندس', phone: '+966 50 333 4444', email: 'engineer1@sarms.local', nationality: 'Saudi', role: 'engineer', department: 'maintenance', status: 'active', tempPassword: 'e1', createdAt: new Date().toISOString(), skills: [] },
  { id: '17', employeeId: 'a1', fullName: 'المدير', phone: '+966 50 555 6666', email: 'admin1@sarms.local', nationality: 'Saudi', role: 'admin', department: 'farming', status: 'active', tempPassword: 'a1', createdAt: new Date().toISOString(), skills: [] },
]

/** Returns 15 workers + 1 engineer + 1 admin for empty storage (clean start for testing). */
export function getMinimalWorkers() {
  return MINIMAL_SEED_WORKERS_RAW.map((w) => ({ ...w, skills: Array.isArray(w.skills) ? w.skills : [] }))
}

/** Seed workers with optional skills array (default empty). */
const SEED_WORKERS_RAW = [
  { id: '1', employeeId: 'w1', fullName: 'Worker One', phone: '+966 50 111 2222', email: 'worker1@sarms.local', nationality: 'Saudi', role: 'worker', department: 'farming', status: 'active', tempPassword: 'w1', createdAt: new Date().toISOString(), skills: ['Harvesting', 'Irrigation', 'Monitoring'] },
  { id: '2', employeeId: 'w2', fullName: 'Ahmed Hassan', phone: '+966 54 777 8888', email: 'ahmed@sarms.local', nationality: 'Egyptian', role: 'worker', department: 'farming', status: 'active', tempPassword: 'w2', createdAt: new Date().toISOString(), skills: ['Harvesting', 'Plant Care'] },
  { id: '3', employeeId: 'w3', fullName: 'Fatima Ali', phone: '+966 55 999 0000', email: 'fatima@sarms.local', nationality: 'Saudi', role: 'worker', department: 'farming', status: 'active', tempPassword: 'w3', createdAt: new Date().toISOString(), skills: ['Irrigation', 'Spraying / Treatment'] },
  { id: '4', employeeId: 'w4', fullName: 'Omar Khalid', phone: '+966 56 111 3333', email: 'omar@sarms.local', nationality: 'Jordanian', role: 'worker', department: 'maintenance', status: 'active', tempPassword: 'w4', createdAt: new Date().toISOString(), skills: ['Machine Repair', 'Inspection'] },
  { id: '5', employeeId: 'w5', fullName: 'Sara Mohammed', phone: '+966 57 444 5555', email: 'sara@sarms.local', nationality: 'Saudi', role: 'worker', department: 'maintenance', status: 'active', tempPassword: 'w5', createdAt: new Date().toISOString(), skills: ['Packing', 'Storage', 'Preventive Maintenance'] },
  { id: '6', employeeId: 'w6', fullName: 'Khalid Mansour', phone: '+966 53 111 4444', email: 'khalid@sarms.local', nationality: 'Egyptian', role: 'worker', department: 'inventory', status: 'active', tempPassword: 'w6', createdAt: new Date().toISOString(), skills: ['Storage', 'Packing', 'Quality Check'] },
  { id: '7', employeeId: 'w7', fullName: 'Noura Salem', phone: '+966 55 333 6666', email: 'noura@sarms.local', nationality: 'Saudi', role: 'worker', department: 'farming', status: 'inactive', tempPassword: 'w7', createdAt: new Date().toISOString(), skills: ['Harvesting'] },
  { id: '8', employeeId: 'w8', fullName: 'Rashid Al-Otaibi', phone: '+966 56 444 7777', email: 'rashid@sarms.local', nationality: 'Saudi', role: 'worker', department: 'farming', status: 'active', tempPassword: 'w8', createdAt: new Date().toISOString(), skills: ['Monitoring', 'Plant Care'] },
  { id: '9', employeeId: 'w9', fullName: 'Layla Hassan', phone: '+966 57 555 8888', email: 'layla@sarms.local', nationality: 'Jordanian', role: 'worker', department: 'inventory', status: 'active', tempPassword: 'w9', createdAt: new Date().toISOString(), skills: ['Packing', 'Storage'] },
  { id: '10', employeeId: 'w10', fullName: 'Faisal Al-Qahtani', phone: '+966 58 666 9999', email: 'faisal@sarms.local', nationality: 'Saudi', role: 'worker', department: 'maintenance', status: 'active', tempPassword: 'w10', createdAt: new Date().toISOString(), skills: ['Machine Repair', 'Testing'] },
  { id: '11', employeeId: 'e1', fullName: 'Engineer One', phone: '+966 50 333 4444', email: 'engineer1@sarms.local', nationality: 'Saudi', role: 'engineer', department: 'maintenance', status: 'active', tempPassword: 'e1', createdAt: new Date().toISOString(), skills: ['Inspection', 'Quality Check'] },
  { id: '12', employeeId: 'e2', fullName: 'Engineer Two', phone: '+966 58 666 7777', email: 'engineer2@sarms.local', nationality: 'Saudi', role: 'engineer', department: 'maintenance', status: 'active', tempPassword: 'e2', createdAt: new Date().toISOString(), skills: ['Preventive Maintenance', 'Testing'] },
  { id: '13', employeeId: 'e3', fullName: 'Maha Al-Dosari', phone: '+966 51 222 3333', email: 'maha@sarms.local', nationality: 'Saudi', role: 'engineer', department: 'farming', status: 'active', tempPassword: 'e3', createdAt: new Date().toISOString(), skills: ['Monitoring', 'Quality Check'] },
  { id: '14', employeeId: 'e4', fullName: 'Tariq Ibrahim', phone: '+966 52 444 5555', email: 'tariq@sarms.local', nationality: 'Egyptian', role: 'engineer', department: 'inventory', status: 'active', tempPassword: 'e4', createdAt: new Date().toISOString(), skills: ['Storage', 'Quality Check'] },
  { id: '15', employeeId: 'e5', fullName: 'Huda Mohammed', phone: '+966 53 666 7777', email: 'huda@sarms.local', nationality: 'Saudi', role: 'engineer', department: 'farming', status: 'active', tempPassword: 'e5', createdAt: new Date().toISOString(), skills: ['Irrigation', 'Plant Care'] },
  { id: '16', employeeId: 'e6', fullName: 'Karim Hassan', phone: '+966 54 888 9999', email: 'karim@sarms.local', nationality: 'Jordanian', role: 'engineer', department: 'maintenance', status: 'active', tempPassword: 'e6', createdAt: new Date().toISOString(), skills: ['Machine Repair', 'Inspection'] },
  { id: '17', employeeId: 'e7', fullName: 'Nadia Salem', phone: '+966 55 111 2222', email: 'nadia@sarms.local', nationality: 'Saudi', role: 'engineer', department: 'inventory', status: 'inactive', tempPassword: 'e7', createdAt: new Date().toISOString(), skills: [] },
  { id: '18', employeeId: 'e8', fullName: 'Bilal Ahmed', phone: '+966 56 333 4444', email: 'bilal@sarms.local', nationality: 'Egyptian', role: 'engineer', department: 'farming', status: 'active', tempPassword: 'e8', createdAt: new Date().toISOString(), skills: ['Monitoring'] },
  { id: '19', employeeId: 'e9', fullName: 'Reem Al-Ghamdi', phone: '+966 57 555 6666', email: 'reem@sarms.local', nationality: 'Saudi', role: 'engineer', department: 'maintenance', status: 'active', tempPassword: 'e9', createdAt: new Date().toISOString(), skills: ['Preventive Maintenance', 'Testing'] },
  { id: '20', employeeId: 'e10', fullName: 'Waleed Omar', phone: '+966 58 777 8888', email: 'waleed@sarms.local', nationality: 'Jordanian', role: 'engineer', department: 'inventory', status: 'active', tempPassword: 'e10', createdAt: new Date().toISOString(), skills: ['Storage', 'Quality Check'] },
  { id: '21', employeeId: 'a1', fullName: 'Admin One', phone: '+966 50 555 6666', email: 'admin1@sarms.local', nationality: 'Saudi', role: 'admin', department: 'farming', status: 'active', tempPassword: 'a1', createdAt: new Date().toISOString(), skills: [] },
  { id: '32', employeeId: 'a2', fullName: 'Admin Two', phone: '+966 59 888 9999', email: 'admin2@sarms.local', nationality: 'Saudi', role: 'admin', department: 'farming', status: 'active', tempPassword: 'a2', createdAt: new Date().toISOString(), skills: [] },
]

export const SEED_WORKERS = SEED_WORKERS_RAW.map((w) => ({ ...w, skills: Array.isArray(w.skills) ? w.skills : [] }))

const ROLE_PREFIX = { worker: 'W', engineer: 'E', admin: 'A' }

/** Generate next employee ID by role (e.g. w11, e11, t11). */
export function generateEmployeeId(role, existingWorkers) {
  if (!existingWorkers || !Array.isArray(existingWorkers)) return 'w1'
  const prefix = ROLE_PREFIX[role] ?? 'W'
  const prefixLower = prefix.toLowerCase()
  const sameRole = existingWorkers.filter((w) => w.employeeId && typeof w.employeeId === 'string' && w.employeeId.toLowerCase().startsWith(prefixLower))
  const nums = sameRole.map((w) => {
    const id = w.employeeId.toLowerCase()
    if (!id.startsWith(prefixLower)) return 0
    const numStr = id.slice(prefixLower.length)
    const num = parseInt(numStr, 10)
    return !Number.isNaN(num) && num > 0 ? num : 0
  }).filter((n) => n > 0)
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `${prefixLower}${next}`
}

/** Generate a random temporary password (8 chars). */
export function generateTempPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/** QR code image URL for employee ID (external API, no npm dep). */
export function getQRCodeUrl(employeeId, size = 200) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(employeeId)}`
}

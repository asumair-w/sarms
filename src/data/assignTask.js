/**
 * Assign Task – zones, task types, statuses, priorities, and task store helpers.
 */

export const TASK_STATUS = {
  PENDING_APPROVAL: 'pending_approval',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
}

export const TASK_STATUS_LABELS = {
  [TASK_STATUS.PENDING_APPROVAL]: 'Pending',
  [TASK_STATUS.IN_PROGRESS]: 'In Progress',
  [TASK_STATUS.COMPLETED]: 'Completed',
  [TASK_STATUS.REJECTED]: 'Rejected',
  approved: 'Pending',
}

export const TASK_TYPES = [
  { id: 'farming', label: 'Farming' },
  { id: 'maintenance', label: 'Maintenance' },
]

export const PRIORITY_OPTIONS = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
]

export const ZONES = [
  { id: 'a', label: 'Zone A' },
  { id: 'b', label: 'Zone B' },
  { id: 'c', label: 'Zone C' },
  { id: 'd', label: 'Zone D' },
  { id: 'inventory', label: 'Inventory' },
]

/** Grid size for zone layout (rows × cols). */
export const GRID_ROWS = 6
export const GRID_COLS = 8

/** Greenhouse overview: left side rows 1–20, right side rows 21–40 (one merged cell per row). */
export const OVERVIEW_LEFT_ROWS = 20
export const OVERVIEW_RIGHT_ROWS = 20
export const OVERVIEW_TOTAL_ROWS = 40

/** Generate a short task ID for display. */
export function generateTaskId() {
  return `T${Date.now().toString(36).toUpperCase().slice(-6)}`
}

/** Default tasks for demo (in-memory; can be replaced by API). */
export function getInitialTasks() {
  const now = new Date().toISOString()
  const yesterday = new Date(Date.now() - 86400000).toISOString()
  const hourAgo = new Date(Date.now() - 3600000).toISOString()
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString()
  return [
    /* Zone A – Left: completed, in progress, pending */
    { id: 'T001A1', zoneId: 'a', batchId: '1', taskType: 'farming', departmentId: 'farming', taskId: 'harvesting', workerIds: ['1'], priority: 'high', estimatedMinutes: 120, notes: 'Harvest rows 1–5', status: TASK_STATUS.COMPLETED, gridRow: 1, gridCol: 1, gridSide: 'left', createdAt: yesterday },
    { id: 'T002A2', zoneId: 'a', batchId: '1', taskType: 'farming', departmentId: 'farming', taskId: 'irrigation', workerIds: ['1', '4'], priority: 'medium', estimatedMinutes: 60, notes: '', status: TASK_STATUS.COMPLETED, gridRow: 2, gridCol: 1, gridSide: 'left', createdAt: yesterday },
    { id: 'T003A3', zoneId: 'a', batchId: '1', taskType: 'maintenance', departmentId: 'maintenance', taskId: 'inspection', workerIds: ['1'], priority: 'medium', estimatedMinutes: 45, notes: 'In progress', status: TASK_STATUS.IN_PROGRESS, gridRow: 3, gridCol: 1, gridSide: 'left', createdAt: hourAgo },
    { id: 'T004A4', zoneId: 'a', batchId: '1', taskType: 'farming', departmentId: 'farming', taskId: 'harvesting', workerIds: ['5'], priority: 'low', estimatedMinutes: 30, notes: '', status: TASK_STATUS.IN_PROGRESS, gridRow: 4, gridCol: 2, gridSide: 'left', createdAt: hourAgo },
    { id: 'T005A5', zoneId: 'a', batchId: '1', taskType: 'farming', departmentId: 'farming', taskId: 'plant_care', workerIds: ['4'], priority: 'high', estimatedMinutes: 90, notes: 'Pending', status: TASK_STATUS.PENDING_APPROVAL, gridRow: 5, gridCol: 1, gridSide: 'left', createdAt: now, flagged: true },
    { id: 'T005B', zoneId: 'a', batchId: '1', taskType: 'farming', departmentId: 'farming', taskId: 'harvesting', workerIds: ['6'], priority: 'medium', estimatedMinutes: 75, notes: 'Rows 6–10', status: TASK_STATUS.PENDING_APPROVAL, gridRow: 6, gridCol: 2, gridSide: 'left', createdAt: twoDaysAgo },
    /* Zone A – Right */
    { id: 'T006A6', zoneId: 'a', batchId: '1', taskType: 'farming', departmentId: 'farming', taskId: 'harvesting', workerIds: ['1'], priority: 'medium', estimatedMinutes: 60, notes: '', status: TASK_STATUS.COMPLETED, gridRow: 1, gridCol: 1, gridSide: 'right', createdAt: yesterday },
    { id: 'T007A7', zoneId: 'a', batchId: '1', taskType: 'farming', departmentId: 'farming', taskId: 'monitoring', workerIds: ['4'], priority: 'medium', estimatedMinutes: 60, notes: '', status: TASK_STATUS.COMPLETED, gridRow: 2, gridCol: 1, gridSide: 'right', createdAt: yesterday },
    { id: 'T008A8', zoneId: 'a', batchId: '1', taskType: 'farming', departmentId: 'farming', taskId: 'harvesting', workerIds: ['1', '4'], priority: 'medium', estimatedMinutes: 60, notes: '', status: TASK_STATUS.COMPLETED, gridRow: 3, gridCol: 1, gridSide: 'right', createdAt: yesterday },
    { id: 'T009A9', zoneId: 'a', batchId: '1', taskType: 'maintenance', departmentId: 'maintenance', taskId: 'repair', workerIds: ['7'], priority: 'low', estimatedMinutes: 40, notes: '', status: TASK_STATUS.IN_PROGRESS, gridRow: 10, gridCol: 2, gridSide: 'right', createdAt: hourAgo },
    { id: 'T009C', zoneId: 'a', batchId: '1', taskType: 'farming', departmentId: 'farming', taskId: 'spraying_treatment', workerIds: ['5'], priority: 'low', estimatedMinutes: 45, notes: 'Spot check', status: TASK_STATUS.PENDING_APPROVAL, gridRow: 15, gridCol: 1, gridSide: 'right', createdAt: now },
    /* Zone B */
    { id: 'T010B1', zoneId: 'b', batchId: '1', taskType: 'farming', departmentId: 'farming', taskId: 'monitoring', workerIds: ['5'], priority: 'low', estimatedMinutes: 45, notes: 'Quality check', status: TASK_STATUS.PENDING_APPROVAL, gridRow: 2, gridCol: 1, gridSide: 'left', createdAt: now },
    { id: 'T011B2', zoneId: 'b', batchId: '1', taskType: 'maintenance', departmentId: 'maintenance', taskId: 'inspection', workerIds: ['6'], priority: 'medium', estimatedMinutes: 60, notes: '', status: TASK_STATUS.COMPLETED, gridRow: 1, gridCol: 1, gridSide: 'left', createdAt: yesterday },
    { id: 'T011B3', zoneId: 'b', batchId: '1', taskType: 'maintenance', departmentId: 'maintenance', taskId: 'repair', workerIds: ['7'], priority: 'high', estimatedMinutes: 90, notes: 'Conveyor B2', status: TASK_STATUS.IN_PROGRESS, gridRow: 3, gridCol: 2, gridSide: 'left', createdAt: hourAgo, flagged: true },
    { id: 'T011B4', zoneId: 'b', batchId: '1', taskType: 'farming', departmentId: 'farming', taskId: 'harvesting', workerIds: ['1', '4'], priority: 'medium', estimatedMinutes: 120, notes: 'Harvest Zone B', status: TASK_STATUS.COMPLETED, gridRow: 4, gridCol: 1, gridSide: 'right', createdAt: twoDaysAgo },
    /* Zone C */
    { id: 'T012C1', zoneId: 'c', batchId: '1', taskType: 'farming', departmentId: 'farming', taskId: 'harvesting', workerIds: ['4'], priority: 'high', estimatedMinutes: 120, notes: '', status: TASK_STATUS.IN_PROGRESS, gridRow: 7, gridCol: 3, gridSide: 'right', createdAt: hourAgo },
    { id: 'T012C2', zoneId: 'c', batchId: '1', taskType: 'farming', departmentId: 'farming', taskId: 'irrigation', workerIds: ['5'], priority: 'medium', estimatedMinutes: 50, notes: 'Cooling unit area', status: TASK_STATUS.COMPLETED, gridRow: 1, gridCol: 1, gridSide: 'left', createdAt: yesterday },
    { id: 'T012C3', zoneId: 'c', batchId: '1', taskType: 'maintenance', departmentId: 'maintenance', taskId: 'testing', workerIds: ['6'], priority: 'low', estimatedMinutes: 30, notes: '', status: TASK_STATUS.PENDING_APPROVAL, gridRow: 5, gridCol: 2, gridSide: 'left', createdAt: now },
    /* Zone D */
    { id: 'T013D1', zoneId: 'd', batchId: '1', taskType: 'farming', departmentId: 'farming', taskId: 'harvesting', workerIds: ['1', '4', '6'], priority: 'high', estimatedMinutes: 150, notes: 'Full zone harvest', status: TASK_STATUS.IN_PROGRESS, gridRow: 8, gridCol: 2, gridSide: 'left', createdAt: hourAgo },
    { id: 'T013D2', zoneId: 'd', batchId: '1', taskType: 'maintenance', departmentId: 'maintenance', taskId: 'preventive_maintenance', workerIds: ['7'], priority: 'medium', estimatedMinutes: 60, notes: '', status: TASK_STATUS.PENDING_APPROVAL, gridRow: 2, gridCol: 1, gridSide: 'right', createdAt: now },
    /* Inventory zone */
    { id: 'T014I1', zoneId: 'inventory', batchId: '1', taskType: 'farming', departmentId: 'inventory', taskId: 'receive_move_storage', workerIds: ['6'], priority: 'medium', estimatedMinutes: 45, notes: 'Stock count', status: TASK_STATUS.COMPLETED, gridRow: 1, gridCol: 1, gridSide: 'left', createdAt: yesterday },
    { id: 'T014I2', zoneId: 'inventory', batchId: '1', taskType: 'farming', departmentId: 'inventory', taskId: 'packing_preparing', workerIds: ['5'], priority: 'low', estimatedMinutes: 30, notes: 'Packaging audit', status: TASK_STATUS.PENDING_APPROVAL, gridRow: 3, gridCol: 2, gridSide: 'left', createdAt: now },
    { id: 'T015X1', zoneId: 'a', batchId: '1', taskType: 'farming', departmentId: 'farming', taskId: 'harvesting', workerIds: ['10'], priority: 'medium', estimatedMinutes: 60, notes: '', status: TASK_STATUS.COMPLETED, gridRow: 5, gridCol: 1, gridSide: 'left', createdAt: yesterday },
    { id: 'T015X2', zoneId: 'b', batchId: '1', taskType: 'maintenance', departmentId: 'maintenance', taskId: 'repair', workerIds: ['11'], priority: 'high', estimatedMinutes: 90, notes: '', status: TASK_STATUS.COMPLETED, gridRow: 2, gridCol: 1, gridSide: 'left', createdAt: twoDaysAgo },
    { id: 'T015X3', zoneId: 'inventory', batchId: '1', taskType: 'farming', departmentId: 'inventory', taskId: 'receive_move_storage', workerIds: ['10', '14'], priority: 'low', estimatedMinutes: 40, notes: '', status: TASK_STATUS.COMPLETED, gridRow: 2, gridCol: 1, gridSide: 'left', createdAt: yesterday },
    { id: 'T015X4', zoneId: 'a', batchId: '1', taskType: 'farming', departmentId: 'farming', taskId: 'monitoring', workerIds: ['13'], priority: 'medium', estimatedMinutes: 45, notes: '', status: TASK_STATUS.COMPLETED, gridRow: 6, gridCol: 2, gridSide: 'left', createdAt: twoDaysAgo },
  ]
}

/** Demo records for Reports & Analytics (production, quality, inventory, fault). */
export function getInitialRecords() {
  const d = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString()
  return [
    { id: 'R1', recordType: 'production', worker: 'Worker One', department: 'Farming', task: 'Harvesting', zone: 'Zone A', lines: '1 – 20', linesArea: '1–20', quantity: 120, unit: 'kg', dateTime: d(0), createdAt: d(0), duration: 95, startTime: d(0), notes: 'Harvest rows 1–20 complete' },
    { id: 'R2', recordType: 'production', worker: 'Omar Khalid', department: 'Maintenance', task: 'Inspection', zone: 'Zone B', lines: '—', linesArea: '—', quantity: 1, unit: 'units', dateTime: d(0), createdAt: d(0), duration: 45, startTime: d(0), notes: 'Routine inspection Conveyor B2' },
    { id: 'R3', recordType: 'production', worker: 'Ahmed Hassan', department: 'Farming', task: 'Harvesting', zone: 'Zone A', lines: '5 – 15', linesArea: '5–15', quantity: 200, unit: 'kg', dateTime: d(0), createdAt: d(0), duration: 120, startTime: d(0), notes: '' },
    { id: 'R4', recordType: 'production', worker: 'Fatima Ali', department: 'Farming', task: 'Irrigation', zone: 'Zone C', lines: '1 – 10', linesArea: '1–10', quantity: 0, unit: 'kg', dateTime: d(0), createdAt: d(0), duration: 60, startTime: d(0), notes: 'Zone C irrigation cycle done' },
    { id: 'R5', recordType: 'production', worker: 'Sara Mohammed', department: 'Inventory', task: 'Packing / Preparing', zone: 'Inventory', lines: '—', linesArea: '—', quantity: 80, unit: 'boxes', dateTime: d(0), createdAt: d(0), duration: 55, startTime: d(0), notes: 'Lines 3–5 produce, packed for cold storage' },
    { id: 'R6', recordType: 'production', worker: 'Worker One', department: 'Farming', task: 'Harvesting', zone: 'Zone B', lines: '8 – 18', linesArea: '8–18', quantity: 180, unit: 'kg', dateTime: d(1), createdAt: d(1), duration: 110, startTime: d(1), notes: '' },
    { id: 'R7', recordType: 'production', worker: 'Omar Khalid', department: 'Maintenance', task: 'Repair', zone: 'Zone B', lines: '—', linesArea: '—', quantity: 0, unit: 'kg', dateTime: d(1), createdAt: d(1), duration: 70, startTime: d(1), notes: 'Conveyor belt adjustment' },
    { id: 'R8', recordType: 'production', worker: 'Ahmed Hassan', department: 'Farming', task: 'Harvesting', zone: 'Zone A', lines: '20 – 30', linesArea: '20–30', quantity: 220, unit: 'kg', dateTime: d(2), createdAt: d(2), duration: 135, startTime: d(2), notes: '' },
    { id: 'R9', recordType: 'production', worker: 'Fatima Ali', department: 'Inventory', task: 'Receive & Move to Storage', zone: 'Inventory', lines: '—', linesArea: '—', quantity: 0, unit: 'kg', dateTime: d(2), createdAt: d(2), duration: 40, startTime: d(2), notes: 'Received from Zone A harvest, moved to cold room' },
    { id: 'R10', recordType: 'production', worker: 'Worker One', department: 'Farming', task: 'Plant Care', zone: 'Zone D', lines: '1 – 12', linesArea: '1–12', quantity: 0, unit: 'kg', dateTime: d(3), createdAt: d(3), duration: 90, startTime: d(3), notes: 'Foliage check and pruning' },
    { id: 'R11', recordType: 'production', worker: 'Sara Mohammed', department: 'Maintenance', task: 'Preventive Maintenance', zone: 'Zone C', lines: '—', linesArea: '—', quantity: 0, unit: 'kg', dateTime: d(5), createdAt: d(5), duration: 120, startTime: d(5), notes: 'Cooling unit C1 service' },
    { id: 'R12', recordType: 'production', worker: 'Ahmed Hassan', department: 'Farming', task: 'Harvesting', zone: 'Zone B', lines: '1 – 15', linesArea: '1–15', quantity: 165, unit: 'kg', dateTime: d(7), createdAt: d(7), duration: 100, startTime: d(7), notes: '' },
    { id: 'R13', recordType: 'production', worker: 'Omar Khalid', department: 'Farming', task: 'Spraying / Treatment', zone: 'Zone A', lines: '5 – 20', linesArea: '5–20', quantity: 0, unit: 'kg', dateTime: d(14), createdAt: d(14), duration: 75, startTime: d(14), notes: 'Fungicide application' },
    { id: 'R14', recordType: 'quality', worker: 'Engineer One', zone: 'Zone A', dateTime: d(0), createdAt: d(0), qualityOutcome: 'pass', notes: 'Spot check Zone A harvest' },
    { id: 'R15', recordType: 'quality', worker: 'Engineer One', zone: 'Zone B', dateTime: d(0), createdAt: d(0), qualityOutcome: 'pass', notes: '' },
    { id: 'R16', recordType: 'quality', worker: 'Engineer Two', zone: 'Zone A', dateTime: d(1), createdAt: d(1), qualityOutcome: 'conditional', notes: 'One batch held for recheck' },
    { id: 'R17', recordType: 'quality', worker: 'Engineer One', zone: 'Zone C', dateTime: d(2), createdAt: d(2), qualityOutcome: 'pass', notes: '' },
    { id: 'R18', recordType: 'quality', worker: 'Engineer Two', zone: 'Zone D', dateTime: d(3), createdAt: d(3), qualityOutcome: 'fail', notes: 'Temperature deviation in storage' },
    { id: 'R19', recordType: 'quality', worker: 'Engineer One', zone: 'Zone B', dateTime: d(5), createdAt: d(5), qualityOutcome: 'pass', notes: '' },
    { id: 'R20', recordType: 'quality', worker: 'Engineer Two', zone: 'Zone A', dateTime: d(7), createdAt: d(7), qualityOutcome: 'pass', notes: '' },
    { id: 'R21', recordType: 'inventory', worker: 'Fatima Ali', department: 'Inventory', task: 'Receive & Move to Storage', zone: 'Inventory', dateTime: d(1), createdAt: d(1), quantity: 150, unit: 'kg', notes: 'Received from Zone A lines 1–10, product type tomatoes' },
    { id: 'R22', recordType: 'fault_maintenance', worker: 'Omar Khalid', department: 'Maintenance', zone: 'Zone B', dateTime: d(0), createdAt: d(0), notes: 'Conveyor B2 belt slipping – repair logged', severity: 'high' },
    { id: 'R23', recordType: 'production', worker: 'Khalid Mansour', department: 'Inventory', task: 'Receive & Move to Storage', zone: 'Inventory', lines: '—', linesArea: '—', quantity: 90, unit: 'boxes', dateTime: d(0), createdAt: d(0), duration: 50, startTime: d(0), notes: '' },
    { id: 'R24', recordType: 'production', worker: 'Youssef Ahmed', department: 'Maintenance', task: 'Repair', zone: 'Zone B', lines: '—', linesArea: '—', quantity: 0, unit: 'kg', dateTime: d(1), createdAt: d(1), duration: 85, startTime: d(1), notes: 'Motor bearing replacement' },
    { id: 'R25', recordType: 'production', worker: 'Layla Hassan', department: 'Inventory', task: 'Packing / Preparing', zone: 'Inventory', lines: '—', linesArea: '—', quantity: 60, unit: 'boxes', dateTime: d(2), createdAt: d(2), duration: 45, startTime: d(2), notes: '' },
    { id: 'R26', recordType: 'production', worker: 'Rashid Al-Otaibi', department: 'Farming', task: 'Monitoring', zone: 'Zone A', lines: '1 – 25', linesArea: '1–25', quantity: 0, unit: 'kg', dateTime: d(3), createdAt: d(3), duration: 60, startTime: d(3), notes: 'Crop health check' },
    { id: 'R27', recordType: 'production', worker: 'Khalid Mansour', department: 'Inventory', task: 'Packing / Preparing', zone: 'Inventory', lines: '—', linesArea: '—', quantity: 45, unit: 'boxes', dateTime: d(5), createdAt: d(5), duration: 35, startTime: d(5), notes: '' },
  ]
}

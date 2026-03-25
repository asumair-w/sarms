/**
 * SARMS – Supabase schema adapter (production schema with columns + UUID + task_workers).
 * Maps between app state (camelCase) and DB rows (snake_case, ENUMs).
 */

import { supabase } from './supabase'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id)
}

function ensureUuid(id) {
  return id && isUuid(id) ? id : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null)
}

/** Generate next display code from prefix + number (e.g. EQ001, W002). */
function nextDisplayCode(prefix, existingCodes) {
  const nums = (existingCodes || []).map((c) => {
    const m = (c || '').toString().match(/^\D+(\d+)$/)
    return m ? parseInt(m[1], 10) : 0
  })
  const max = Math.max(0, ...nums)
  return prefix + String(max + 1).padStart(3, '0')
}

// ----- Workers -----
function fromDbWorker(r) {
  if (!r) return null
  return {
    id: r.id,
    code: r.code,
    employeeId: r.employee_id,
    fullName: r.full_name,
    phone: r.phone,
    email: r.email,
    nationality: r.nationality,
    role: r.role,
    department: r.department,
    status: r.status,
    tempPassword: r.temp_password,
    createdAt: r.created_at,
    skills: Array.isArray(r.skills) ? r.skills : (r.skills ? JSON.parse(r.skills) : []),
    ...(r.data && typeof r.data === 'object' ? r.data : {}),
  }
}

/**
 * Workers table → app-shaped list. Use when Supabase is the backend so UI matches the database
 * (localStorage `sarms-workers` may still hold old demo seeds until hydrate runs).
 * @returns {null|Array} null if fetch failed or no client; array (maybe empty) on success
 */
export async function fetchWorkersAppShaped() {
  if (!supabase) return null
  const { data, error } = await supabase.from('workers').select('*')
  if (error) {
    console.error('[SARMS][Supabase] error', 'fetchWorkersAppShaped', error)
    return null
  }
  return (data || []).map(fromDbWorker).filter(Boolean)
}

function toDbWorker(item) {
  const id = ensureUuid(item.id) || item.id
  return {
    id,
    code: item.code ?? null,
    employee_id: item.employeeId ?? item.employee_id ?? null,
    full_name: item.fullName ?? item.full_name ?? '',
    phone: item.phone ?? null,
    email: item.email ?? null,
    nationality: item.nationality ?? null,
    role: item.role ?? 'worker',
    department: item.department ?? 'farming',
    status: item.status ?? 'active',
    temp_password: item.tempPassword ?? item.temp_password ?? null,
    created_at: item.createdAt ?? item.created_at ?? null,
    skills: Array.isArray(item.skills) ? item.skills : [],
    data: {},
  }
}

// ----- Zones (TEXT id, no change) -----
function fromDbZone(r) {
  if (!r) return null
  return {
    id: r.id,
    labelEn: r.label_en,
    labelAr: r.label_ar,
    label: r.label,
    icon: r.icon,
    ...(r.data && typeof r.data === 'object' ? r.data : {}),
  }
}

function toDbZone(item) {
  return {
    id: item.id,
    label_en: item.labelEn ?? item.label_en ?? null,
    label_ar: item.labelAr ?? item.label_ar ?? null,
    label: item.label ?? null,
    icon: item.icon ?? null,
    data: {},
  }
}

const BATCHES_BY_ZONE_SETTINGS_KEY = 'sarms-batches-by-zone'
const DEFAULT_BATCH_BY_ZONE_SETTINGS_KEY = 'sarms-default-batch-by-zone'
const POWER_BI_SETTINGS_KEY = 'sarms-powerbi-url'

/** Zones + batch settings from `zones` + `settings`. */
export async function fetchZonesAndSettingsAppShaped() {
  if (!supabase) return null
  try {
    const { data: settingsRows, error: sErr } = await supabase.from('settings').select('key, value')
    if (sErr) {
      console.error('[SARMS][Supabase] error', 'fetchZonesAndSettingsAppShaped.settings', sErr)
      return null
    }
    const rows = settingsRows || []
    const batchesRow = rows.find((r) => r.key === BATCHES_BY_ZONE_SETTINGS_KEY)
    const defaultRow = rows.find((r) => r.key === DEFAULT_BATCH_BY_ZONE_SETTINGS_KEY)
    const powerBiRow = rows.find((r) => r.key === POWER_BI_SETTINGS_KEY)
    const batchesByZone = batchesRow && typeof batchesRow.value === 'object' ? batchesRow.value : {}
    const defaultBatchByZone = defaultRow && typeof defaultRow.value === 'object' ? defaultRow.value : {}
    const powerBiUrl =
      powerBiRow && typeof powerBiRow.value === 'object'
        ? powerBiRow.value.url || ''
        : powerBiRow && typeof powerBiRow.value === 'string'
          ? powerBiRow.value
          : ''

    const { data: zonesData, error: zErr } = await supabase.from('zones').select('*')
    if (zErr) {
      console.error('[SARMS][Supabase] error', 'fetchZonesAndSettingsAppShaped.zones', zErr)
      return null
    }
    const zones = (zonesData || []).map(fromDbZone).filter(Boolean)
    return { zones, batchesByZone, defaultBatchByZone, powerBiUrl }
  } catch (e) {
    console.error('[SARMS][Supabase] error', 'fetchZonesAndSettingsAppShaped', e)
    return null
  }
}

// ----- Tasks + task_workers -----
function fromDbTask(r, workerIds = []) {
  if (!r) return null
  return {
    id: r.id,
    code: r.code,
    zoneId: r.zone_id,
    batchId: r.batch_id,
    taskType: r.task_type,
    departmentId: r.department_id,
    taskId: r.task_id,
    priority: r.priority ?? 'medium',
    estimatedMinutes: r.estimated_minutes ?? null,
    notes: r.notes ?? null,
    status: r.status ?? 'pending_approval',
    gridRow: r.grid_row,
    gridCol: r.grid_col,
    gridSide: r.grid_side,
    flagged: Boolean(r.flagged),
    createdAt: r.created_at,
    ...(r.data && typeof r.data === 'object' ? r.data : {}),
    workerIds,
  }
}

/** DB enum task_type_enum — must match Supabase (see schema-consolidated.sql). */
function normalizeTaskTypeForDb(v) {
  const t = String(v ?? 'farming').toLowerCase()
  if (t === 'farming' || t === 'maintenance' || t === 'inventory') return t
  return 'farming'
}

function toDbTask(item) {
  // tasks.id in DB is TEXT (e.g. T001); do not coerce non-UUID strings to random UUIDs
  const rawId = item.id
  const id =
    rawId != null && String(rawId).trim() !== ''
      ? String(rawId)
      : typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `task-${Date.now()}`
  return {
    id,
    code: item.code ?? null,
    zone_id: item.zoneId ?? item.zone_id ?? '',
    batch_id: item.batchId ?? item.batch_id ?? '',
    task_type: normalizeTaskTypeForDb(item.taskType ?? item.task_type),
    department_id: item.departmentId ?? item.department_id ?? 'farming',
    task_id: item.taskId ?? item.task_id ?? '',
    priority: item.priority ?? 'medium',
    estimated_minutes: item.estimatedMinutes ?? item.estimated_minutes ?? null,
    notes: item.notes ?? null,
    status: item.status ?? 'pending_approval',
    grid_row: item.gridRow ?? item.grid_row ?? null,
    grid_col: item.gridCol ?? item.grid_col ?? null,
    grid_side: item.gridSide ?? item.grid_side ?? null,
    flagged: Boolean(item.flagged),
    created_at: item.createdAt ?? item.created_at ?? null,
    data: {},
  }
}

// ----- Sessions -----
function deriveSessionRowStatus(item) {
  if (item.finishedByWorkerAt || item.finishedAt) return 'finished_by_worker'
  const s = item.status
  if (s === 'assigned' || s === 'in_progress' || s === 'finished_by_worker' || s === 'closed') return s
  return 'in_progress'
}

function fromDbSession(r) {
  if (!r) return null
  const data = r.data && typeof r.data === 'object' ? r.data : {}
  return {
    ...data,
    id: data.clientId || r.id,
    code: r.code,
    taskId: r.task_id ?? data.taskId ?? null,
    workerId: r.worker_id,
    workerName: r.worker_name,
    department: r.department,
    departmentId: r.department_id,
    taskTypeId: r.task_type_id,
    task: r.task,
    zone: r.zone,
    zoneId: r.zone_id,
    linesArea: r.lines_area,
    startTime: r.start_time,
    expectedMinutes: r.expected_minutes ?? 60,
    status: r.status,
    flagged: Boolean(r.flagged),
    assignedByEngineer: r.assigned_by_engineer !== false,
    notes: Array.isArray(r.notes) ? r.notes : [],
    finishedByWorkerAt: r.finished_by_worker_at,
    closedAt: r.closed_at,
    workerNotes: r.worker_notes,
    imageData: r.image_data,
    assignedAt: r.assigned_at,
    completedAt: data.completedAt ?? null,
  }
}

function toDbSession(item) {
  const taskId = item.taskId ?? item.task_id
  const rawId = item.id
  /** Adapter sets DB UUID on item.id; _clientSessionKey preserves UI id (e.g. s-assign-…). */
  const clientSource = item._clientSessionKey != null ? item._clientSessionKey : rawId
  const id = isUuid(String(rawId))
    ? String(rawId)
    : typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : String(rawId)

  const clientId = clientSource != null && !isUuid(String(clientSource)) ? String(clientSource) : null
  const extras = {}
  const known = new Set([
    'id', 'code', '_clientSessionKey', 'workerId', 'worker_id', 'workerName', 'worker_name', 'department', 'departmentId', 'department_id',
    'taskTypeId', 'task_type_id', 'task', 'zone', 'zoneId', 'zone_id', 'linesArea', 'lines_area',
    'startTime', 'start_time', 'expectedMinutes', 'expected_minutes', 'flagged', 'notes', 'taskId', 'task_id',
    'assignedByEngineer', 'assigned_by_engineer', 'status', 'finishedByWorkerAt', 'finished_by_worker_at',
    'closedAt', 'closed_at', 'workerNotes', 'worker_notes', 'imageData', 'image_data', 'completedAt', 'completed_at',
    'finishedAt', 'assignedAt', 'assigned_at',
  ])
  for (const [k, v] of Object.entries(item)) {
    if (known.has(k)) continue
    extras[k] = v
  }

  return {
    id,
    code: item.code ?? null,
    task_id: taskId,
    worker_id: item.workerId ?? item.worker_id,
    worker_name: item.workerName ?? item.worker_name ?? null,
    department: item.department ?? null,
    department_id: item.departmentId ?? item.department_id ?? 'farming',
    task_type_id: item.taskTypeId ?? item.task_type_id ?? 'farming',
    task: item.task ?? null,
    zone: item.zone ?? null,
    zone_id: item.zoneId ?? item.zone_id ?? '',
    lines_area: item.linesArea ?? item.lines_area ?? null,
    start_time: item.startTime ?? item.start_time,
    expected_minutes: item.expectedMinutes ?? item.expected_minutes ?? 60,
    status: deriveSessionRowStatus(item),
    finished_by_worker_at: item.finishedByWorkerAt ?? item.finished_by_worker_at ?? null,
    closed_at: item.closedAt ?? item.closed_at ?? null,
    assigned_by_engineer: item.assignedByEngineer !== false,
    assigned_at: item.assignedAt ?? item.assigned_at ?? null,
    flagged: Boolean(item.flagged),
    worker_notes: item.workerNotes ?? item.worker_notes ?? null,
    image_data: item.imageData ?? item.image_data ?? null,
    notes: Array.isArray(item.notes) ? item.notes : [],
    data: {
      ...extras,
      ...(clientId ? { clientId } : {}),
      completedAt: item.completedAt ?? null,
    },
  }
}

// ----- Records -----
function fromDbRecord(r) {
  if (!r) return null
  const data = r.data && typeof r.data === 'object' ? r.data : {}
  return {
    id: r.id,
    code: r.code,
    recordType: r.record_type,
    worker: r.worker,
    department: r.department,
    task: r.task,
    zone: r.zone,
    lines: r.lines,
    linesArea: r.lines_area,
    quantity: Number(r.quantity) || 0,
    unit: r.unit,
    dateTime: r.date_time,
    createdAt: r.created_at,
    duration: r.duration,
    startTime: r.start_time,
    notes: r.notes,
    qualityOutcome: r.quality_outcome,
    severity: r.severity,
    source: data.source,
    engineerNotes: data.engineerNotes,
    imageData: data.imageData,
    ...data,
  }
}

function toDbRecord(item) {
  const id = ensureUuid(item.id) || item.id
  return {
    id,
    code: item.code ?? null,
    record_type: item.recordType ?? item.record_type ?? 'production',
    worker: item.worker ?? null,
    department: item.department ?? null,
    task: item.task ?? null,
    zone: item.zone ?? null,
    lines: item.lines ?? null,
    lines_area: item.linesArea ?? item.lines_area ?? null,
    quantity: Number(item.quantity) || 0,
    unit: item.unit ?? null,
    date_time: item.dateTime ?? item.date_time ?? null,
    created_at: item.createdAt ?? item.created_at ?? null,
    duration: item.duration ?? null,
    start_time: item.startTime ?? item.start_time ?? null,
    notes: item.notes ?? null,
    quality_outcome: item.qualityOutcome ?? item.quality_outcome ?? null,
    severity: item.severity ?? null,
    data: {
      source: item.source ?? null,
      engineerNotes: item.engineerNotes ?? null,
      imageData: item.imageData ?? null,
    },
  }
}

// ----- Inventory -----
function fromDbInventory(r) {
  if (!r) return null
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    category: r.category,
    quantity: Number(r.quantity) || 0,
    unit: r.unit,
    minQty: r.min_qty != null ? Number(r.min_qty) : null,
    warningQty: r.warning_qty != null ? Number(r.warning_qty) : null,
    lastUpdated: r.last_updated,
    ...(r.data && typeof r.data === 'object' ? r.data : {}),
  }
}

function toDbInventory(item) {
  const id = ensureUuid(item.id) || item.id
  return {
    id,
    code: item.code ?? null,
    name: item.name ?? '',
    category: item.category ?? 'other',
    quantity: Number(item.quantity) || 0,
    unit: item.unit ?? '',
    min_qty: item.minQty ?? item.min_qty ?? null,
    warning_qty: item.warningQty ?? item.warning_qty ?? null,
    last_updated: item.lastUpdated ?? item.last_updated ?? null,
    data: {},
  }
}

// ----- Inventory movements -----
function fromDbInventoryMovement(r) {
  if (!r) return null
  const data = r.data && typeof r.data === 'object' ? r.data : {}
  return {
    id: r.id,
    code: r.code,
    itemId: r.item_id,
    old_quantity: r.old_quantity,
    new_quantity: r.new_quantity,
    reason: r.reason,
    movementType: r.movement_type,
    changed_by: r.changed_by,
    created_at: r.created_at,
    change_amount: data.change_amount,
    ...data,
  }
}

function toDbInventoryMovement(item) {
  const id = ensureUuid(item.id) || item.id
  return {
    id,
    code: item.code ?? null,
    item_id: item.itemId ?? item.item_id,
    old_quantity: Number(item.old_quantity) ?? 0,
    new_quantity: Number(item.new_quantity) ?? 0,
    reason: item.reason ?? null,
    movement_type: item.movementType ?? item.movement_type ?? null,
    changed_by: item.changed_by ?? null,
    created_at: item.created_at ?? item.createdAt ?? null,
    data: { change_amount: item.change_amount ?? (Number(item.new_quantity) - Number(item.old_quantity)) },
  }
}

// ----- Equipment -----
function fromDbEquipment(r) {
  if (!r) return null
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    category: r.category,
    zone: r.zone,
    status: r.status,
    lastInspection: r.last_inspection,
    ...(r.data && typeof r.data === 'object' ? r.data : {}),
  }
}

function toDbEquipment(item) {
  const id = ensureUuid(item.id) || item.id
  return {
    id,
    code: item.code ?? null,
    name: item.name ?? '',
    category: item.category ?? null,
    zone: item.zone ?? null,
    status: item.status ?? 'active',
    last_inspection: item.lastInspection ?? item.last_inspection ?? null,
    data: {},
  }
}

// ----- Faults -----
function fromDbFault(r) {
  if (!r) return null
  return {
    id: r.id,
    code: r.code,
    equipmentId: r.equipment_id,
    equipmentName: r.equipment_name,
    category: r.category,
    severity: r.severity,
    stopWork: Boolean(r.stop_work),
    description: r.description,
    createdAt: r.created_at,
    ...(r.data && typeof r.data === 'object' ? r.data : {}),
  }
}

function toDbFault(item) {
  const id = ensureUuid(item.id) || item.id
  return {
    id,
    code: item.code ?? null,
    equipment_id: item.equipmentId ?? item.equipment_id ?? null,
    equipment_name: item.equipmentName ?? item.equipment_name ?? null,
    category: item.category ?? 'other',
    severity: item.severity ?? 'medium',
    stop_work: Boolean(item.stopWork ?? item.stop_work),
    description: item.description ?? null,
    created_at: item.createdAt ?? item.created_at ?? null,
    data: {},
  }
}

// ----- Maintenance plans -----
function fromDbMaintenancePlan(r) {
  if (!r) return null
  return {
    id: r.id,
    code: r.code,
    equipmentId: r.equipment_id,
    equipmentName: r.equipment_name,
    plannedDate: r.planned_date,
    type: r.type,
    notes: r.notes,
    createdAt: r.created_at,
    ...(r.data && typeof r.data === 'object' ? r.data : {}),
  }
}

function toDbMaintenancePlan(item) {
  const id = ensureUuid(item.id) || item.id
  return {
    id,
    code: item.code ?? null,
    equipment_id: item.equipmentId ?? item.equipment_id,
    equipment_name: item.equipmentName ?? item.equipment_name ?? null,
    planned_date: item.plannedDate ?? item.planned_date,
    type: item.type ?? 'preventive',
    notes: item.notes ?? null,
    created_at: item.createdAt ?? item.created_at ?? null,
    data: {},
  }
}

// ----- Resolved tickets -----
function fromDbResolvedTicket(r) {
  if (!r) return null
  return {
    id: r.id,
    code: r.code,
    ticketType: r.ticket_type,
    faultId: r.fault_id,
    maintenancePlanId: r.maintenance_plan_id,
    resolvedAt: r.resolved_at,
    resolvedBy: r.resolved_by,
    notes: r.notes,
    summary: r.summary,
    createdAt: r.created_at,
    ...(r.data && typeof r.data === 'object' ? r.data : {}),
  }
}

function toDbResolvedTicket(item) {
  const id = ensureUuid(item.id) || item.id
  return {
    id,
    code: item.code ?? null,
    ticket_type: item.ticketType ?? item.ticket_type ?? 'fault',
    fault_id: item.faultId ?? item.fault_id ?? null,
    maintenance_plan_id: item.maintenancePlanId ?? item.maintenance_plan_id ?? null,
    resolved_at: item.resolvedAt ?? item.resolved_at ?? new Date().toISOString(),
    resolved_by: item.resolvedBy ?? item.resolved_by ?? null,
    notes: item.notes ?? null,
    summary: item.summary ?? null,
    created_at: item.createdAt ?? item.created_at ?? null,
    data: {},
  }
}

// ----- Fetch: build state from DB -----
const BATCHES_BY_ZONE_KEY = 'sarms-batches-by-zone'
const DEFAULT_BATCH_BY_ZONE_KEY = 'sarms-default-batch-by-zone'

export async function fetchSupabaseState() {
  if (!supabase) return null
  const out = {
    workers: [],
    zones: [],
    tasks: [],
    records: [],
    sessions: [],
    inventory: [],
    inventoryMovements: [],
    equipment: [],
    faults: [],
    maintenancePlans: [],
    resolvedTickets: [],
    batchesByZone: {},
    defaultBatchByZone: {},
  }

  try {
    // Settings
    const { data: settingsRows } = await supabase.from('settings').select('key, value')
    const rows = settingsRows || []
    const batchesRow = rows.find((r) => r.key === BATCHES_BY_ZONE_KEY)
    const defaultRow = rows.find((r) => r.key === DEFAULT_BATCH_BY_ZONE_KEY)
    out.batchesByZone = batchesRow && typeof batchesRow.value === 'object' ? batchesRow.value : {}
    out.defaultBatchByZone = defaultRow && typeof defaultRow.value === 'object' ? defaultRow.value : {}

    // Zones
    const { data: zonesData } = await supabase.from('zones').select('*')
    out.zones = (zonesData || []).map(fromDbZone).filter(Boolean)

    // Workers
    const { data: workersData } = await supabase.from('workers').select('*')
    out.workers = (workersData || []).map(fromDbWorker).filter(Boolean)

    // Task_workers: task_id -> [worker_id, ...]
    const { data: twData } = await supabase.from('task_workers').select('task_id, worker_id')
    const taskToWorkers = {}
    for (const row of twData || []) {
      if (!taskToWorkers[row.task_id]) taskToWorkers[row.task_id] = []
      taskToWorkers[row.task_id].push(row.worker_id)
    }

    // Tasks
    const { data: tasksData } = await supabase.from('tasks').select('*')
    out.tasks = (tasksData || []).map((r) => fromDbTask(r, taskToWorkers[r.id] || [])).filter(Boolean)

    // Sessions, records, inventory, inventory_movements, equipment, faults, maintenance_plans
    const { data: sessionsData } = await supabase.from('sessions').select('*')
    out.sessions = (sessionsData || []).map(fromDbSession).filter(Boolean)

    const { data: recordsData } = await supabase.from('records').select('*')
    const opsRecords = (recordsData || []).map(fromDbRecord).filter(Boolean)
    const { data: harvestLogData } = await supabase.from('harvest_log').select('*')
    const harvestRecords = (harvestLogData || []).map((r) => {
      const rec = fromDbRecord(r)
      if (rec) rec.source = 'harvest_form'
      return rec
    }).filter(Boolean)
    out.records = [...opsRecords, ...harvestRecords]

    const { data: invData } = await supabase.from('inventory').select('*')
    out.inventory = (invData || []).map(fromDbInventory).filter(Boolean)

    const { data: movData } = await supabase.from('inventory_movements').select('*')
    out.inventoryMovements = (movData || []).map(fromDbInventoryMovement).filter(Boolean)

    const { data: eqData } = await supabase.from('equipment').select('*')
    out.equipment = (eqData || []).map(fromDbEquipment).filter(Boolean)

    const { data: faultsData } = await supabase.from('faults').select('*')
    out.faults = (faultsData || []).map(fromDbFault).filter(Boolean)

    const { data: mpData } = await supabase.from('maintenance_plans').select('*')
    out.maintenancePlans = (mpData || []).map(fromDbMaintenancePlan).filter(Boolean)

    const { data: rtData } = await supabase.from('resolved_tickets').select('*')
    out.resolvedTickets = (rtData || []).map(fromDbResolvedTicket).filter(Boolean)

    return out
  } catch (e) {
    console.warn('fetchSupabaseState:', e)
    return null
  }
}

/** Build worker id map: legacy id -> uuid (for tasks/sessions that reference workers). */
function buildWorkerIdMap(workersList) {
  const map = {}
  for (const w of workersList || []) {
    if (w.id && isUuid(w.id)) map[w.id] = w.id
    if (w.employeeId && w.id) map[w.employeeId] = w.id
  }
  return map
}

/** Persist in order: workers first (to get UUIDs), then tasks/sessions (need worker UUIDs), then rest. */
export async function persistAllSupabase(state) {
  if (!supabase) return

  const workersList = state.workers || []
  const workerRows = workersList.map(toDbWorker)
  const workerIdMap = {}
  for (let i = 0; i < workersList.length; i++) {
    workerIdMap[workersList[i].id] = workerRows[i].id
    if (workersList[i].employeeId) workerIdMap[workersList[i].employeeId] = workerRows[i].id
  }

  try {
    // Workers (auto code: W001, W002…)
    await deleteAll('workers')
    if (workersList.length > 0) {
      const codes = []
      for (const row of workerRows) {
        if (!row.code) row.code = nextDisplayCode('W', codes)
        codes.push(row.code)
      }
      await supabase.from('workers').insert(workerRows)
    }

    // Tasks + task_workers (auto code: T001…)
    const { data: existingTw } = await supabase.from('task_workers').select('task_id')
    const taskIdsToDelete = [...new Set((existingTw || []).map((r) => r.task_id))]
    for (let i = 0; i < taskIdsToDelete.length; i += 100) {
      const chunk = taskIdsToDelete.slice(i, i + 100)
      await supabase.from('task_workers').delete().in('task_id', chunk)
    }
    await deleteAll('tasks')
    const tasksList = state.tasks || []
    if (tasksList.length > 0) {
      const taskRows = tasksList.map(toDbTask)
      const tCodes = []
      for (const row of taskRows) {
        if (!row.code) row.code = nextDisplayCode('T', tCodes)
        tCodes.push(row.code)
      }
      await supabase.from('tasks').insert(taskRows)
      const twRows = []
      for (let i = 0; i < tasksList.length; i++) {
        const task = tasksList[i]
        const taskId = taskRows[i].id
        const workerIds = task.workerIds || task.worker_ids || []
        for (const wid of workerIds) {
          const uuid = workerIdMap[wid] ?? (isUuid(wid) ? wid : null)
          if (uuid) twRows.push({ task_id: taskId, worker_id: uuid })
        }
      }
      if (twRows.length > 0) await supabase.from('task_workers').insert(twRows)
    }

    // Sessions (auto code: S001…)
    await deleteAll('sessions')
    const sessionsList = (state.sessions || []).filter((s) => s.taskId || s.task_id)
    if (sessionsList.length > 0) {
      const rows = sessionsList.map((s) => {
        const row = toDbSession(s)
        const mapped = workerIdMap[s.workerId ?? s.worker_id] ?? (isUuid(s.workerId ?? s.worker_id) ? s.workerId ?? s.worker_id : null)
        if (mapped) row.worker_id = mapped
        if (!row.task_id) return null
        return row
      }).filter(Boolean)
      const sCodes = []
      for (const row of rows) {
        if (!row.code) row.code = nextDisplayCode('S', sCodes)
        sCodes.push(row.code)
      }
      if (rows.length > 0) await supabase.from('sessions').insert(rows)
    }

    // Records (operations only) → records table (R001…)
    await deleteAll('records')
    const recordsList = state.records || []
    const opsList = recordsList.filter((r) => r.source !== 'harvest_form')
    if (opsList.length > 0) {
      const rows = opsList.map(toDbRecord)
      const rCodes = []
      for (const row of rows) {
        if (!row.code) row.code = nextDisplayCode('R', rCodes)
        rCodes.push(row.code)
      }
      await supabase.from('records').insert(rows)
    }

    // Harvest log only → harvest_log table (HL001…)
    await deleteAll('harvest_log')
    const harvestList = recordsList.filter((r) => r.source === 'harvest_form')
    if (harvestList.length > 0) {
      const rows = harvestList.map(toDbRecord)
      const hlCodes = []
      for (const row of rows) {
        if (!row.code) row.code = nextDisplayCode('HL', hlCodes)
        hlCodes.push(row.code)
      }
      await supabase.from('harvest_log').insert(rows)
    }

    await deleteAll('zones')
    const zonesList = state.zones || []
    if (zonesList.length > 0) {
      await supabase.from('zones').insert(zonesList.map(toDbZone))
    }

    await deleteAll('inventory')
    const invList = state.inventory || []
    const inventoryIdMap = {}
    if (invList.length > 0) {
      const invRows = invList.map(toDbInventory)
      const invCodes = []
      for (const row of invRows) {
        if (!row.code) row.code = nextDisplayCode('INV', invCodes)
        invCodes.push(row.code)
      }
      for (let i = 0; i < invList.length; i++) inventoryIdMap[invList[i].id] = invRows[i].id
      await supabase.from('inventory').insert(invRows)
    }

    await deleteAll('inventory_movements')
    const movList = state.inventoryMovements || []
    if (movList.length > 0) {
      const movRows = movList.map(toDbInventoryMovement)
      const imCodes = []
      for (const row of movRows) {
        if (!row.code) row.code = nextDisplayCode('IM', imCodes)
        imCodes.push(row.code)
      }
      for (const m of movRows) {
        const resolved = inventoryIdMap[m.item_id] ?? (isUuid(m.item_id) ? m.item_id : null)
        if (resolved) m.item_id = resolved
      }
      await supabase.from('inventory_movements').insert(movRows.filter((m) => m.item_id))
    }

    await deleteAll('equipment')
    const eqList = state.equipment || []
    const equipmentIdMap = {}
    if (eqList.length > 0) {
      const eqRows = eqList.map(toDbEquipment)
      const eqCodes = []
      for (const row of eqRows) {
        if (!row.code) row.code = nextDisplayCode('EQ', eqCodes)
        eqCodes.push(row.code)
      }
      for (let i = 0; i < eqList.length; i++) equipmentIdMap[eqList[i].id] = eqRows[i].id
      await supabase.from('equipment').insert(eqRows)
    }

    await deleteAll('faults')
    const faultsList = state.faults || []
    if (faultsList.length > 0) {
      const faultRows = faultsList.map(toDbFault)
      const fCodes = []
      for (const row of faultRows) {
        if (!row.code) row.code = nextDisplayCode('F', fCodes)
        fCodes.push(row.code)
      }
      for (const f of faultRows) {
        const resolved = equipmentIdMap[f.equipment_id] ?? (isUuid(f.equipment_id) ? f.equipment_id : null)
        if (resolved != null) f.equipment_id = resolved
      }
      await supabase.from('faults').insert(faultRows)
    }

    await deleteAll('maintenance_plans')
    const mpList = state.maintenancePlans || []
    if (mpList.length > 0) {
      const mpRows = mpList.map(toDbMaintenancePlan)
      const mpCodes = []
      for (const row of mpRows) {
        if (!row.code) row.code = nextDisplayCode('MP', mpCodes)
        mpCodes.push(row.code)
      }
      for (const p of mpRows) {
        const resolved = equipmentIdMap[p.equipment_id] ?? (isUuid(p.equipment_id) ? p.equipment_id : null)
        if (resolved) p.equipment_id = resolved
      }
      await supabase.from('maintenance_plans').insert(mpRows.filter((p) => p.equipment_id))
    }

    await deleteAll('resolved_tickets')
    const rtList = state.resolvedTickets || []
    if (rtList.length > 0) {
      const rtRows = rtList.map(toDbResolvedTicket)
      const rtCodes = []
      for (const row of rtRows) {
        if (!row.code) row.code = nextDisplayCode('RT', rtCodes)
        rtCodes.push(row.code)
      }
      await supabase.from('resolved_tickets').insert(rtRows)
    }
  } catch (e) {
    console.warn('persistAllSupabase:', e)
  }
}

async function deleteAll(table) {
  try {
    const pk = table === 'settings' ? 'key' : 'id'
    const { data: rows } = await supabase.from(table).select(pk)
    const keys = (rows || []).map((r) => r[pk]).filter((k) => k != null && k !== '')
    for (let i = 0; i < keys.length; i += 100) {
      const chunk = keys.slice(i, i + 100)
      await supabase.from(table).delete().in(pk, chunk)
    }
  } catch (e) {
    if (e?.code !== '42P01') console.warn(`deleteAll ${table}:`, e)
  }
}

export async function persistSetting(key, value) {
  if (!supabase) return
  try {
    await supabase.from('settings').upsert({ key, value: value || {} }, { onConflict: 'key' })
  } catch (e) {
    console.warn('persistSetting:', e)
  }
}

const ACTIVE_SESSION_KEY_PREFIX = 'sarms_active_session_'
const SESSION_ID_STORAGE_KEY = 'sarms-session-id'

/** Normalize user id for session key (one active session per user). */
function normalizedSessionKey(userId) {
  return ACTIVE_SESSION_KEY_PREFIX + String(userId ?? '').trim().toLowerCase()
}

/**
 * Call after successful login: generate a new session id, store in sessionStorage,
 * and persist to Supabase so other devices can be detected as "kicked".
 * Only runs when Supabase is configured. Returns a Promise so caller can await
 * before navigating (avoids kick on same device when switching user).
 */
export async function setActiveSessionForUser(userId) {
  if (!userId || !supabase) return
  const sessionId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(SESSION_ID_STORAGE_KEY, sessionId)
  } catch (_) {}
  const key = normalizedSessionKey(userId)
  const value = { sessionId, at: new Date().toISOString() }
  await persistSetting(key, value)
}

/**
 * Returns the current session id stored for this user in Supabase (or null).
 * Used to detect if this device was "kicked" by a login from another device.
 */
export async function getActiveSessionForUser(userId) {
  if (!userId || !supabase) return null
  try {
    const key = normalizedSessionKey(userId)
    const { data, error } = await supabase.from('settings').select('value').eq('key', key).maybeSingle()
    if (error || !data?.value?.sessionId) return null
    return data.value.sessionId
  } catch (e) {
    return null
  }
}

export { SESSION_ID_STORAGE_KEY }

/** Used by supabaseTasksAdapter (Phase 1+) — keeps UI task/worker shape stable. */
export {
  isUuid,
  ensureUuid,
  fromDbTask,
  toDbTask,
  fromDbZone,
  toDbZone,
  fromDbWorker,
  toDbWorker,
  fromDbSession,
  toDbSession,
}

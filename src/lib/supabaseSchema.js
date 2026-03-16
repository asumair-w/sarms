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

// ----- Workers -----
function fromDbWorker(r) {
  if (!r) return null
  return {
    id: r.id,
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

function toDbWorker(item) {
  const id = ensureUuid(item.id) || item.id
  return {
    id,
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

// ----- Tasks + task_workers -----
function fromDbTask(r, workerIds = []) {
  if (!r) return null
  return {
    id: r.id,
    zoneId: r.zone_id,
    batchId: r.batch_id,
    taskType: r.task_type,
    departmentId: r.department_id,
    taskId: r.task_id,
    workerIds: workerIds,
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
  }
}

function toDbTask(item) {
  const id = ensureUuid(item.id) || item.id
  return {
    id,
    zone_id: item.zoneId ?? item.zone_id ?? '',
    batch_id: item.batchId ?? item.batch_id ?? '',
    task_type: item.taskType ?? item.task_type ?? 'farming',
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
function fromDbSession(r) {
  if (!r) return null
  return {
    id: r.id,
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
    flagged: Boolean(r.flagged),
    assignedByEngineer: Boolean(r.assigned_by_engineer),
    notes: Array.isArray(r.notes) ? r.notes : (r.notes ? JSON.parse(r.notes) : []),
    ...(r.data && typeof r.data === 'object' ? r.data : {}),
  }
}

function toDbSession(item) {
  const id = ensureUuid(item.id) || item.id
  return {
    id,
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
    flagged: Boolean(item.flagged),
    assigned_by_engineer: item.assignedByEngineer !== false,
    notes: Array.isArray(item.notes) ? item.notes : [],
    data: {},
  }
}

// ----- Records -----
function fromDbRecord(r) {
  if (!r) return null
  return {
    id: r.id,
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
    ...(r.data && typeof r.data === 'object' ? r.data : {}),
  }
}

function toDbRecord(item) {
  const id = ensureUuid(item.id) || item.id
  return {
    id,
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
    data: {},
  }
}

// ----- Inventory -----
function fromDbInventory(r) {
  if (!r) return null
  return {
    id: r.id,
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
  return {
    id: r.id,
    itemId: r.item_id,
    old_quantity: r.old_quantity,
    new_quantity: r.new_quantity,
    reason: r.reason,
    movementType: r.movement_type,
    changed_by: r.changed_by,
    created_at: r.created_at,
    ...(r.data && typeof r.data === 'object' ? r.data : {}),
  }
}

function toDbInventoryMovement(item) {
  const id = ensureUuid(item.id) || item.id
  return {
    id,
    item_id: item.itemId ?? item.item_id,
    old_quantity: Number(item.old_quantity) ?? 0,
    new_quantity: Number(item.new_quantity) ?? 0,
    reason: item.reason ?? null,
    movement_type: item.movementType ?? item.movement_type ?? null,
    changed_by: item.changed_by ?? null,
    created_at: item.created_at ?? item.createdAt ?? null,
    data: {},
  }
}

// ----- Equipment -----
function fromDbEquipment(r) {
  if (!r) return null
  return {
    id: r.id,
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
    equipment_id: item.equipmentId ?? item.equipment_id,
    equipment_name: item.equipmentName ?? item.equipment_name ?? null,
    planned_date: item.plannedDate ?? item.planned_date,
    type: item.type ?? 'preventive',
    notes: item.notes ?? null,
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
    out.records = (recordsData || []).map(fromDbRecord).filter(Boolean)

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
    // Workers
    await deleteAll('workers')
    if (workersList.length > 0) {
      await supabase.from('workers').insert(workerRows)
    }

    // Tasks + task_workers (use workerIdMap for worker_ids)
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

    // Sessions (map workerId via workerIdMap)
    await deleteAll('sessions')
    const sessionsList = state.sessions || []
    if (sessionsList.length > 0) {
      const rows = sessionsList.map((s) => {
        const row = toDbSession(s)
        const mapped = workerIdMap[s.workerId ?? s.worker_id] ?? (isUuid(s.workerId ?? s.worker_id) ? s.workerId ?? s.worker_id : null)
        if (mapped) row.worker_id = mapped
        return row
      })
      await supabase.from('sessions').insert(rows)
    }

    // Records, zones, inventory, inventory_movements, equipment, faults, maintenance_plans
    await deleteAll('records')
    const recordsList = state.records || []
    if (recordsList.length > 0) {
      await supabase.from('records').insert(recordsList.map(toDbRecord))
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
      for (let i = 0; i < invList.length; i++) inventoryIdMap[invList[i].id] = invRows[i].id
      await supabase.from('inventory').insert(invRows)
    }

    await deleteAll('inventory_movements')
    const movList = state.inventoryMovements || []
    if (movList.length > 0) {
      const movRows = movList.map(toDbInventoryMovement)
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
      for (let i = 0; i < eqList.length; i++) equipmentIdMap[eqList[i].id] = eqRows[i].id
      await supabase.from('equipment').insert(eqRows)
    }

    await deleteAll('faults')
    const faultsList = state.faults || []
    if (faultsList.length > 0) {
      const faultRows = faultsList.map(toDbFault)
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
      for (const p of mpRows) {
        const resolved = equipmentIdMap[p.equipment_id] ?? (isUuid(p.equipment_id) ? p.equipment_id : null)
        if (resolved) p.equipment_id = resolved
      }
      await supabase.from('maintenance_plans').insert(mpRows.filter((p) => p.equipment_id))
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

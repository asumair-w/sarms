/**
 * Phase 1 – Tasks + task_workers → Supabase only (via USE_SUPABASE_ACTIVE).
 * Returns the same task objects the UI already uses (workerIds = store ids like "1").
 * Also upserts zones/workers as needed for FKs; worker list in the app remains localStorage-driven.
 */

import { supabase } from './supabase'
import { fromDbTask, toDbTask, toDbZone, isUuid } from './supabaseSchema'

const TASK_TOP_LEVEL_KEYS = new Set([
  'id',
  'code',
  'zoneId',
  'batchId',
  'taskType',
  'departmentId',
  'taskId',
  'workerIds',
  'worker_ids',
  'priority',
  'estimatedMinutes',
  'notes',
  'status',
  'gridRow',
  'gridCol',
  'gridSide',
  'flagged',
  'createdAt',
])

function withoutTechnicians(workers) {
  if (!Array.isArray(workers)) return []
  return workers.filter((w) => (w.role || '').toLowerCase() !== 'technician')
}

/** Persist extra UI fields (e.g. approvedAt) inside tasks.data JSONB. */
function taskToDbRow(task) {
  const base = toDbTask(task)
  const extra = {}
  for (const [k, v] of Object.entries(task)) {
    if (TASK_TOP_LEVEL_KEYS.has(k)) continue
    extra[k] = v
  }
  return {
    ...base,
    data: Object.keys(extra).length ? { ...(base.data || {}), ...extra } : base.data || {},
  }
}

function buildLegacyToUuidMap(appWorkers, dbRows) {
  const map = {}
  const byEmp = new Map((dbRows || []).map((r) => [r.employee_id?.toLowerCase(), r]))
  for (const w of appWorkers || []) {
    if (w.id == null) continue
    const emp = (w.employeeId || w.employee_id || '').trim().toLowerCase()
    const r = byEmp.get(emp)
    if (r) map[String(w.id)] = r.id
  }
  return map
}

function buildUuidToLegacyMap(dbRows) {
  const map = {}
  for (const r of dbRows || []) {
    const leg = r.data?.legacyId
    if (leg != null) map[r.id] = String(leg)
  }
  return map
}

export async function ensureZonesForTasks(zones) {
  if (!supabase || !zones?.length) return
  const rows = zones.map((z, i) => ({
    ...toDbZone(z),
    display_order: i,
  }))
  const { error } = await supabase.from('zones').upsert(rows, { onConflict: 'id' })
  if (error) console.warn('[SARMS][tasks-adapter] zones', error)
}

export async function ensureWorkersForTasks(workers) {
  if (!supabase) return { legacyToUuid: {}, dbWorkers: [] }
  const list = withoutTechnicians(workers)
  let { data: dbRows } = await supabase.from('workers').select('id, employee_id, data')
  dbRows = dbRows || []
  const seenEmp = new Set(dbRows.map((r) => r.employee_id?.toLowerCase()))

  const toInsert = []
  for (const w of list) {
    const emp = (w.employeeId || w.employee_id || '').trim()
    if (!emp) continue
    const key = emp.toLowerCase()
    if (seenEmp.has(key)) continue
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null
    if (!id) continue
    toInsert.push({
      id,
      employee_id: emp,
      code: w.code ?? null,
      full_name: w.fullName ?? w.full_name ?? 'Worker',
      phone: w.phone ?? null,
      email: w.email ?? null,
      nationality: w.nationality ?? null,
      role: w.role ?? 'worker',
      department: w.department ?? 'farming',
      status: w.status ?? 'active',
      temp_password: w.tempPassword ?? w.temp_password ?? null,
      skills: Array.isArray(w.skills) ? w.skills : [],
      data: { legacyId: w.id != null ? String(w.id) : null },
    })
    seenEmp.add(key)
  }
  if (toInsert.length) {
    const { error } = await supabase.from('workers').insert(toInsert)
    if (error) console.warn('[SARMS][tasks-adapter] workers insert', error)
    const { data: refreshed } = await supabase.from('workers').select('id, employee_id, data')
    dbRows = refreshed || dbRows
  }

  for (const w of list) {
    const emp = (w.employeeId || w.employee_id || '').trim().toLowerCase()
    const r = dbRows.find((x) => x.employee_id?.toLowerCase() === emp)
    if (r && w.id != null) {
      const nextData = { ...(r.data || {}), legacyId: String(w.id) }
      if (JSON.stringify(r.data?.legacyId) !== JSON.stringify(nextData.legacyId)) {
        await supabase.from('workers').update({ data: nextData }).eq('id', r.id)
        r.data = nextData
      }
    }
  }

  return { legacyToUuid: buildLegacyToUuidMap(list, dbRows), dbWorkers: dbRows }
}

export function resolveWorkerUuid(wid, appWorkers, legacyToUuid) {
  const s = String(wid ?? '').trim()
  if (!s) return null
  if (legacyToUuid[s]) return legacyToUuid[s]
  if (isUuid(s)) return s
  const w = (appWorkers || []).find(
    (x) =>
      String(x.id) === s ||
      String(x.code ?? '') === s ||
      String(x.employeeId ?? '').toLowerCase() === s.toLowerCase()
  )
  if (w && legacyToUuid[String(w.id)]) return legacyToUuid[String(w.id)]
  return null
}

/**
 * Load tasks in the same shape as localStorage (workerIds = app worker ids).
 */
export async function fetchTasksAppShaped() {
  if (!supabase) return []

  const { data: dbWorkers } = await supabase.from('workers').select('id, data')
  const uuidToLegacy = buildUuidToLegacyMap(dbWorkers || [])

  const { data: twRows, error: twErr } = await supabase.from('task_workers').select('task_id, worker_id')
  if (twErr) console.warn('[SARMS][tasks-adapter] task_workers', twErr)

  const taskToUuids = {}
  for (const row of twRows || []) {
    if (!taskToUuids[row.task_id]) taskToUuids[row.task_id] = []
    taskToUuids[row.task_id].push(row.worker_id)
  }

  const { data: tasksRows, error } = await supabase.from('tasks').select('*')
  if (error) {
    console.warn('[SARMS][tasks-adapter] tasks select', error)
    return []
  }

  return (tasksRows || [])
    .map((r) => {
      const uuids = taskToUuids[r.id] || []
      const workerIds = uuids.map((u) => uuidToLegacy[u] ?? u)
      return fromDbTask(r, workerIds)
    })
    .filter(Boolean)
}

/**
 * Upsert one task row + replace its task_workers links.
 */
export async function persistTask(task, workers, zones) {
  if (!supabase || !task?.id) return
  await ensureZonesForTasks(zones)
  const { legacyToUuid } = await ensureWorkersForTasks(workers)
  const row = taskToDbRow(task)

  const { error: upErr } = await supabase.from('tasks').upsert(row, { onConflict: 'id' })
  if (upErr) console.warn('[SARMS][tasks-adapter] task upsert', upErr)

  await supabase.from('task_workers').delete().eq('task_id', task.id)
  const wids = task.workerIds || task.worker_ids || []
  const twRows = []
  for (const wid of wids) {
    const uuid = resolveWorkerUuid(wid, workers, legacyToUuid)
    if (uuid) twRows.push({ task_id: task.id, worker_id: uuid })
  }
  if (twRows.length) {
    const { error: insErr } = await supabase.from('task_workers').insert(twRows)
    if (insErr) console.warn('[SARMS][tasks-adapter] task_workers insert', insErr)
  }
}

/** Replace all tasks (e.g. reset to seed). */
export async function replaceAllTasks(tasks, workers, zones) {
  if (!supabase) return
  await ensureZonesForTasks(zones)
  await ensureWorkersForTasks(workers)

  const { data: existing } = await supabase.from('tasks').select('id')
  const ids = (existing || []).map((r) => r.id)
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    if (chunk.length) await supabase.from('tasks').delete().in('id', chunk)
  }

  if (!tasks?.length) return
  const { legacyToUuid } = await ensureWorkersForTasks(workers)
  const rows = tasks.map((t) => taskToDbRow(t))
  const { error: tErr } = await supabase.from('tasks').insert(rows)
  if (tErr) console.warn('[SARMS][tasks-adapter] tasks bulk insert', tErr)

  const twRows = []
  for (const task of tasks) {
    for (const wid of task.workerIds || task.worker_ids || []) {
      const uuid = resolveWorkerUuid(wid, workers, legacyToUuid)
      if (uuid) twRows.push({ task_id: task.id, worker_id: uuid })
    }
  }
  if (twRows.length) {
    const { error: twErr } = await supabase.from('task_workers').insert(twRows)
    if (twErr) console.warn('[SARMS][tasks-adapter] task_workers bulk', twErr)
  }
}

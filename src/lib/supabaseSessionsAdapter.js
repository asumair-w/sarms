/**
 * Phase 2 – sessions → Supabase (USE_SUPABASE_ACTIVE).
 * Same session objects as localStorage: id may be s-assign-… or UUID; workerId = app worker id.
 */

import { supabase } from './supabase'
import { fromDbSession, isUuid, toDbSession } from './supabaseSchema'
import { ensureZonesForTasks, ensureWorkersForTasks, resolveWorkerUuid } from './supabaseTasksAdapter'

function buildUuidToLegacyMap(dbRows) {
  const map = {}
  for (const r of dbRows || []) {
    const leg = r.data?.legacyId
    if (leg != null) map[r.id] = String(leg)
  }
  return map
}

async function resolveSessionDbId(clientId) {
  if (!supabase || clientId == null) return null
  const key = String(clientId)
  if (isUuid(key)) return key
  const { data } = await supabase.from('sessions').select('id').contains('data', { clientId: key }).limit(1)
  return data?.[0]?.id ?? null
}

async function sessionRowExists(dbId) {
  if (!supabase || !dbId) return false
  const { data } = await supabase.from('sessions').select('id').eq('id', dbId).maybeSingle()
  return Boolean(data?.id)
}

/**
 * Load sessions (workerId = legacy app id).
 */
export async function fetchSessionsAppShaped() {
  if (!supabase) {
    console.error('[SARMS][Supabase] error', 'fetchSessionsAppShaped', 'no client')
    return null
  }
  const { data: dbWorkers, error: wErr } = await supabase.from('workers').select('id, data')
  if (wErr) {
    console.error('[SARMS][Supabase] error', 'fetchSessionsAppShaped.workers', wErr)
    return null
  }
  const uuidToLegacy = buildUuidToLegacyMap(dbWorkers || [])

  const { data: rows, error } = await supabase.from('sessions').select('*')
  if (error) {
    console.error('[SARMS][Supabase] error', 'fetchSessionsAppShaped.sessions', error)
    return null
  }

  return (rows || [])
    .map((r) => {
      const base = fromDbSession(r)
      if (!base) return null
      const legacyW = uuidToLegacy[r.worker_id] ?? base.workerId
      return { ...base, workerId: legacyW }
    })
    .filter(Boolean)
}

function stripUndefined(obj) {
  const o = { ...obj }
  Object.keys(o).forEach((k) => {
    if (o[k] === undefined) delete o[k]
  })
  return o
}

export async function persistSession(session, workers, zones, tasks) {
  if (!supabase || !session) return
  const taskId = session.taskId ?? session.task_id
  if (!taskId || String(taskId).trim() === '') {
    console.warn('[SARMS][sessions-adapter] skip persist: missing taskId', session.id)
    return
  }
  const taskExists = (tasks || []).some((t) => String(t.id) === String(taskId))
  if (!taskExists) {
    console.warn('[SARMS][sessions-adapter] skip persist: task not in store', taskId)
    return
  }

  await ensureZonesForTasks(zones)
  const { legacyToUuid } = await ensureWorkersForTasks(workers)
  const workerUuid = resolveWorkerUuid(session.workerId ?? session.worker_id, workers, legacyToUuid)
  if (!workerUuid) {
    console.warn('[SARMS][sessions-adapter] skip persist: worker', session.workerId)
    return
  }

  const clientKey = session.id
  let dbId = isUuid(String(clientKey)) ? String(clientKey) : await resolveSessionDbId(clientKey)
  const existed = dbId ? await sessionRowExists(dbId) : false
  let isNew = !existed
  if (!dbId) {
    dbId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null
    isNew = true
  }
  if (!dbId) return

  const row = toDbSession({
    ...session,
    id: dbId,
    taskId,
    workerId: workerUuid,
    _clientSessionKey: clientKey,
  })

  if (isNew) {
    if (!row.assigned_at) row.assigned_at = new Date().toISOString()
    const { error } = await supabase.from('sessions').insert(stripUndefined(row))
    if (error) console.warn('[SARMS][sessions-adapter] insert', error)
  } else {
    const { id: _id, ...patch } = row
    delete patch.id
    const clean = stripUndefined(patch)
    if (clean.assigned_at == null) delete clean.assigned_at
    const { error } = await supabase.from('sessions').update(clean).eq('id', dbId)
    if (error) console.warn('[SARMS][sessions-adapter] update', error)
  }
}

export async function deleteSessionFromSupabase(sessionId) {
  if (!supabase || sessionId == null) return
  const sid = String(sessionId)
  const dbId = isUuid(sid) ? sid : await resolveSessionDbId(sid)
  if (!dbId) return
  const { error } = await supabase.from('sessions').delete().eq('id', dbId)
  if (error) console.warn('[SARMS][sessions-adapter] delete', error)
}

export async function replaceAllSessions(sessions, workers, zones, tasks) {
  if (!supabase) return
  const { data: existing } = await supabase.from('sessions').select('id')
  const ids = (existing || []).map((r) => r.id)
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    if (chunk.length) await supabase.from('sessions').delete().in('id', chunk)
  }
  const list = (sessions || []).filter((s) => s.taskId || s.task_id)
  for (const s of list) {
    await persistSession(s, workers, zones, tasks)
  }
}

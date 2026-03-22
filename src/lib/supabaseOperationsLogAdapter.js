/**
 * Phase 3 – operations_log ↔ records adapter (UI uses `records`).
 *
 * DB stores task execution snapshots in `operations_log`.
 * The RPC stores the exact `record` object snapshot in `operations_log.data`,
 * so we can reconstruct the same in-memory `records` shape for KPIs/charts.
 */

import { supabase } from './supabase'
import { isUuid } from './supabaseSchema'
import { resolveWorkerUuidByEmployeeLogin } from './supabaseTasksAdapter'

export async function resolveSessionDbIdForClient(clientSessionId) {
  if (!supabase) return null
  if (clientSessionId == null) return null
  const sid = String(clientSessionId).trim()
  if (!sid) return null
  if (isUuid(sid)) return sid

  const { data, error } = await supabase
    .from('sessions')
    .select('id')
    .contains('data', { clientId: sid })
    .limit(1)
  if (error) {
    console.warn('[SARMS][ops-adapter] resolveSessionDbIdForClient error:', error)
    return null
  }
  return data?.[0]?.id ?? null
}

function mapOpsLogRowToRecord(row) {
  const snap = row?.data && typeof row.data === 'object' ? row.data : {}
  const out = { ...snap }

  // Enforce required UI keys.
  out.id = out.id ?? snap.recordId ?? row?.code ?? row?.task_id ?? row?.id
  out.recordType = out.recordType ?? 'production'

  // Align timestamps with UI naming.
  out.createdAt = out.createdAt ?? snap.createdAt ?? row?.created_at ?? null
  out.dateTime = out.dateTime ?? snap.dateTime ?? snap.date_time ?? null

  return out
}

export async function fetchOperationsLogRecords() {
  if (!supabase) {
    console.error('[SARMS][Supabase] error', 'fetchOperationsLogRecords', 'no client')
    return null
  }
  const { data, error } = await supabase
    .from('operations_log')
    .select('code,data,created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[SARMS][Supabase] error', 'fetchOperationsLogRecords', error)
    return null
  }

  return (data || []).map(mapOpsLogRowToRecord).filter(Boolean)
}

export async function approveTaskCompleteViaRpc({
  taskId,
  clientSessionId,
  startTime,
  expectedMinutes,
  record,
  workers,
}) {
  if (!supabase) {
    console.warn('[SARMS][rpc] approve_task_complete skipped: Supabase client not configured (check .env)')
    return
  }

  const sessionDbId = await resolveSessionDbIdForClient(clientSessionId)
  if (!sessionDbId) {
    const err = new Error(`[SARMS][ops-adapter] Cannot resolve DB session id for client=${clientSessionId}`)
    console.log('RPC error', err)
    throw err
  }

  let pApprovedBy = null
  try {
    const login =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sarms-user-id') : null
    if (login) pApprovedBy = await resolveWorkerUuidByEmployeeLogin(login, workers)
  } catch (_) {}

  const payload = {
    p_task_id: taskId,
    p_session_id: sessionDbId,
    p_start_time: startTime ?? null,
    p_expected_minutes: expectedMinutes ?? 60,
    p_record_id: record?.id ?? null,
    p_record_snapshot: record ?? {},
    p_approved_by: pApprovedBy,
  }

  console.log('Calling RPC approve_task_complete', payload)

  const { data, error } = await supabase.rpc('approve_task_complete', payload)

  if (error) {
    console.log('RPC error', error)
    throw error
  }

  console.log('RPC success', data)
}


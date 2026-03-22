/**
 * resolved_tickets — mirror on resolve (insert + delete open row) + read into app shapes.
 */

import { supabase } from './supabase'
import { isUuid } from './supabaseSchema'
import { resolveEquipmentUuidByAppId, markEquipmentMirrorActive } from './supabaseEquipmentAdapter'
import {
  resolveEquipmentTicketUuidByAppId,
  equipmentTicketRowToFault,
  equipmentTicketRowToMaintenancePlan,
} from './supabaseEquipmentTicketsAdapter'
import { resolveWorkerUuidByEmployeeLogin } from './supabaseTasksAdapter'
import { FAULT_STATUS_RESOLVED } from '../data/faults'

async function resolveResolvedByWorkerUuid(workers) {
  try {
    const login =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sarms-user-id') : null
    if (!login) return null
    return await resolveWorkerUuidByEmployeeLogin(login, workers || [])
  } catch (_) {
    return null
  }
}

export function mapResolvedTicketRowToApp(r) {
  if (!r) return null
  const data = r.data && typeof r.data === 'object' ? r.data : {}
  const snap = r.ticket_snapshot && typeof r.ticket_snapshot === 'object' ? r.ticket_snapshot : {}
  return {
    id: r.id,
    ticketType: r.ticket_type,
    faultId: data.faultId ?? snap.fault?.id ?? snap.faultId ?? null,
    maintenancePlanId: data.maintenancePlanId ?? snap.maintenancePlan?.id ?? snap.maintenancePlanId ?? null,
    resolvedAt: r.resolved_at,
    resolvedBy: data.resolvedBy ?? snap.resolvedBy ?? null,
    notes: r.notes,
    summary: r.summary ?? snap.summary,
    createdAt: r.created_at,
  }
}

function resolvedRowToFault(r, equipmentAppList) {
  if (r.ticket_type !== 'fault') return null
  const snap = r.ticket_snapshot?.fault
  const base = snap && typeof snap === 'object' ? { ...snap } : {}
  const data = r.data && typeof r.data === 'object' ? r.data : {}
  const equipId =
    base.equipmentId ??
    data.equipmentAppId ??
    (equipmentAppList || []).find((e) => isUuid(String(e.id)) && String(e.id) === String(r.equipment_id))?.id ??
    (equipmentAppList || []).find((e) => String(e.id) === String(r.equipment_id))?.id
  return {
    ...base,
    id: base.id ?? data.faultId ?? String(r.source_ticket_id),
    equipmentId: equipId ?? base.equipmentId,
    equipmentName: base.equipmentName ?? r.equipment_name,
    status: FAULT_STATUS_RESOLVED,
    resolvedAt: r.resolved_at,
    resolutionNote: base.resolutionNote ?? r.notes,
    description: base.description ?? '',
  }
}

function resolvedRowToMaintenancePlan(r, equipmentAppList) {
  if (r.ticket_type === 'fault') return null
  const snap = r.ticket_snapshot?.maintenancePlan
  const base = snap && typeof snap === 'object' ? { ...snap } : {}
  const data = r.data && typeof r.data === 'object' ? r.data : {}
  const equipId =
    base.equipmentId ??
    data.equipmentAppId ??
    (equipmentAppList || []).find((e) => isUuid(String(e.id)) && String(e.id) === String(r.equipment_id))?.id ??
    (equipmentAppList || []).find((e) => String(e.id) === String(r.equipment_id))?.id
  return {
    ...base,
    id: base.id ?? data.maintenancePlanId ?? String(r.source_ticket_id),
    equipmentId: equipId ?? base.equipmentId,
    equipmentName: base.equipmentName ?? r.equipment_name,
    status: 'completed',
    resolvedAt: r.resolved_at,
    resolutionNote: base.resolutionNote ?? r.notes,
    plannedDate: base.plannedDate ?? r.ticket_snapshot?.plannedDate,
    type: base.type ?? (r.ticket_type === 'inspection' ? 'inspection' : 'preventive'),
  }
}

export async function fetchResolvedTicketsAppShaped() {
  if (!supabase) {
    console.error('[SARMS][Supabase] error', 'fetchResolvedTicketsAppShaped', 'no client')
    return null
  }
  const { data, error } = await supabase
    .from('resolved_tickets')
    .select('*')
    .order('resolved_at', { ascending: false })
  if (error) {
    console.error('[SARMS][Supabase] error', 'fetchResolvedTicketsAppShaped', error)
    return null
  }
  return (data || []).map(mapResolvedTicketRowToApp).filter(Boolean)
}

export async function fetchResolvedFaultsAndMaintenancePlans(equipmentAppList) {
  if (!supabase) {
    console.error('[SARMS][Supabase] error', 'fetchResolvedFaultsAndMaintenancePlans', 'no client')
    return null
  }
  const { data, error } = await supabase
    .from('resolved_tickets')
    .select('*')
    .order('resolved_at', { ascending: false })
  if (error) {
    console.error('[SARMS][Supabase] error', 'fetchResolvedFaultsAndMaintenancePlans', error)
    return null
  }
  const faults = []
  const maintenancePlans = []
  for (const r of data || []) {
    if (r.ticket_type === 'fault') {
      const f = resolvedRowToFault(r, equipmentAppList)
      if (f) faults.push(f)
    } else {
      const m = resolvedRowToMaintenancePlan(r, equipmentAppList)
      if (m) maintenancePlans.push(m)
    }
  }
  return { faults, maintenancePlans }
}

/**
 * After local resolve: insert resolved_tickets + delete open equipment_tickets row.
 * Reads the open ticket row from DB for a full ticket_snapshot (no UI/store snapshot needed).
 */
export async function mirrorResolveTicketClose({ resolvedPayload, source, ticketType, workers }) {
  if (!supabase || !resolvedPayload) return

  const appTicketId =
    source === 'fault' ? resolvedPayload.faultId : resolvedPayload.maintenancePlanId
  const ticketUuid = await resolveEquipmentTicketUuidByAppId(appTicketId)
  if (!ticketUuid) {
    console.warn('[SARMS][resolved_tickets] mirror skipped — no equipment_tickets row for', appTicketId)
    return
  }

  const { data: openRow, error: fetchErr } = await supabase
    .from('equipment_tickets')
    .select('*')
    .eq('id', ticketUuid)
    .maybeSingle()
  if (fetchErr) console.warn('[SARMS][resolved_tickets] fetch open ticket', fetchErr)
  if (!openRow) {
    console.warn('[SARMS][resolved_tickets] mirror skipped — open ticket row missing', ticketUuid)
    return
  }

  const { data: eqRow } = await supabase
    .from('equipment')
    .select('id, data')
    .eq('id', openRow?.equipment_id)
    .maybeSingle()
  const equipAppId = eqRow?.data?.legacyId != null ? String(eqRow.data.legacyId) : openRow?.equipment_id
  const equipmentAppList = eqRow ? [{ id: equipAppId }] : []

  let faultSnapshot = null
  let maintenancePlanSnapshot = null
  if (openRow.ticket_type === 'fault') {
    faultSnapshot = equipmentTicketRowToFault(openRow, equipmentAppList)
    if (faultSnapshot) {
      faultSnapshot = {
        ...faultSnapshot,
        status: FAULT_STATUS_RESOLVED,
        resolvedAt: resolvedPayload.resolvedAt,
        resolutionNote: resolvedPayload.notes,
      }
    }
  } else {
    maintenancePlanSnapshot = equipmentTicketRowToMaintenancePlan(openRow, equipmentAppList)
    if (maintenancePlanSnapshot) {
      maintenancePlanSnapshot = {
        ...maintenancePlanSnapshot,
        status: 'completed',
        resolvedAt: resolvedPayload.resolvedAt,
        resolutionNote: resolvedPayload.notes,
      }
    }
  }

  const equipUuid = openRow.equipment_id ?? (await resolveEquipmentUuidByAppId(equipAppId))

  const dbTicketType =
    openRow.ticket_type ??
    (ticketType === 'fault' ? 'fault' : ticketType === 'inspection' ? 'inspection' : 'maintenance')

  const resolvedByWorker = await resolveResolvedByWorkerUuid(workers)
  const rowId =
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-rt`

  const ticket_snapshot = {
    fault: faultSnapshot,
    maintenancePlan: maintenancePlanSnapshot,
    resolvedPayload,
    openRow: openRow || null,
  }

  const row = {
    id: rowId,
    source_ticket_id: ticketUuid,
    equipment_id: openRow.equipment_id ?? equipUuid,
    equipment_name: openRow?.equipment_name ?? null,
    ticket_type: dbTicketType,
    resolved_at: resolvedPayload.resolvedAt ?? new Date().toISOString(),
    resolved_by_worker_id: resolvedByWorker,
    summary: resolvedPayload.summary ?? null,
    notes: resolvedPayload.notes ?? null,
    ticket_snapshot,
    data: {
      faultId: resolvedPayload.faultId ?? null,
      maintenancePlanId: resolvedPayload.maintenancePlanId ?? null,
      resolvedBy: resolvedPayload.resolvedBy ?? null,
      equipmentAppId: equipAppId ?? null,
    },
    created_at: new Date().toISOString(),
  }

  const { error: insErr } = await supabase.from('resolved_tickets').insert(row)
  if (insErr) {
    console.error('❌ mirrorResolveTicketClose insert', insErr)
    return
  }
  console.info('[SARMS][resolved_tickets] mirror — inserted resolved row', rowId)

  const { error: delErr } = await supabase.from('equipment_tickets').delete().eq('id', ticketUuid)
  if (delErr) console.error('❌ mirrorResolveTicketClose delete equipment_tickets', delErr)
  markEquipmentMirrorActive()
}

/**
 * equipment_tickets ↔ app faults (ticket_type fault) + maintenance plans (inspection / maintenance).
 * Open/active rows only; resolve flow moves to resolved_tickets (see supabaseResolvedTicketsAdapter).
 */

import { supabase } from './supabase'
import { isUuid } from './supabaseSchema'
import { resolveEquipmentUuidWithRetry, markEquipmentMirrorActive } from './supabaseEquipmentAdapter'
import { resolveWorkerUuidByEmployeeLogin } from './supabaseTasksAdapter'
import { FAULT_STATUS_OPEN, FAULT_TYPE_PREVENTIVE_ALERT } from '../data/faults'

async function resolveCreatedByWorkerUuid(workers) {
  try {
    const login =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sarms-user-id') : null
    if (!login) return null
    return await resolveWorkerUuidByEmployeeLogin(login, workers || [])
  } catch (_) {
    return null
  }
}

export async function resolveEquipmentTicketUuidByAppId(appTicketId) {
  if (!supabase) return null
  const raw = appTicketId != null ? String(appTicketId).trim() : ''
  if (!raw) return null
  if (isUuid(raw)) return raw

  const { data: byLegacy, error: e1 } = await supabase
    .from('equipment_tickets')
    .select('id')
    .eq('data->>legacyId', raw)
    .maybeSingle()
  if (e1) console.warn('[SARMS][equipment_tickets] resolve legacyId', e1)
  if (byLegacy?.id) return String(byLegacy.id)

  return null
}

function appEquipmentIdFromUuid(eqUuid, equipmentAppList) {
  const u = String(eqUuid)
  const hit = (equipmentAppList || []).find(
    (e) => e.id === u || (isUuid(u) && String(e.id) === u)
  )
  if (hit) return String(hit.id)
  return u
}

export function equipmentTicketRowToFault(r, equipmentAppList) {
  if (!r || r.ticket_type !== 'fault') return null
  const data = r.data && typeof r.data === 'object' ? r.data : {}
  const appId = data.legacyId != null ? String(data.legacyId) : String(r.id)
  const equipApp = appEquipmentIdFromUuid(r.equipment_id, equipmentAppList)
  return {
    ...data,
    id: appId,
    equipmentId: equipApp,
    equipmentName: r.equipment_name ?? data.equipmentName,
    category: data.category ?? 'other',
    severity: data.severity ?? r.severity ?? 'medium',
    stopWork: Boolean(data.stopWork ?? data.stop_work),
    description: r.description ?? data.description ?? '',
    status: FAULT_STATUS_OPEN,
    createdAt: r.created_at ?? data.createdAt,
    type: data.type,
    auto_generated: Boolean(data.auto_generated),
  }
}

export function equipmentTicketRowToMaintenancePlan(r, equipmentAppList) {
  if (!r || r.ticket_type === 'fault') return null
  const data = r.data && typeof r.data === 'object' ? r.data : {}
  const appId = data.legacyId != null ? String(data.legacyId) : String(r.id)
  const equipApp = appEquipmentIdFromUuid(r.equipment_id, equipmentAppList)
  const mpType =
    data.mpType ||
    (r.ticket_type === 'inspection' ? 'inspection' : 'preventive')
  return {
    ...data,
    id: appId,
    equipmentId: equipApp,
    equipmentName: r.equipment_name ?? data.equipmentName,
    plannedDate: r.due_date ?? data.plannedDate ?? undefined,
    type: mpType,
    notes: data.notes ?? r.description ?? '',
    priority: data.priority,
    inspectionIntervalDays: data.inspectionIntervalDays,
    status: r.status === 'scheduled' ? 'scheduled' : 'scheduled',
    createdAt: r.created_at ?? data.createdAt,
  }
}

function appTicketTypeToDb(faultOrMp, isFault) {
  if (isFault) return 'fault'
  const t = faultOrMp?.type || faultOrMp?.ticketType
  if (t === 'inspection') return 'inspection'
  return 'maintenance'
}

export async function mirrorUpsertFaultTicket(fault, workers) {
  if (!supabase || !fault) return
  if (fault.auto_generated || fault.type === FAULT_TYPE_PREVENTIVE_ALERT) return

  const equipmentId = await resolveEquipmentUuidWithRetry(fault.equipmentId)
  if (!equipmentId) {
    console.warn('[SARMS][equipment_tickets] mirror fault skipped — no equipment UUID', fault.equipmentId)
    return
  }

  let rowId = await resolveEquipmentTicketUuidByAppId(fault.id)
  if (!rowId) {
    rowId = isUuid(String(fault.id))
      ? String(fault.id)
      : typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-ft`
  }

  const createdBy = await resolveCreatedByWorkerUuid(workers)
  const data = {
    legacyId: String(fault.id),
    category: fault.category,
    stopWork: fault.stopWork,
    type: fault.type,
    auto_generated: fault.auto_generated,
    equipmentName: fault.equipmentName,
  }

  const row = {
    id: rowId,
    equipment_id: equipmentId,
    equipment_name: fault.equipmentName ?? null,
    ticket_type: 'fault',
    status: 'open',
    severity: fault.severity ?? null,
    due_date: null,
    description: fault.description ?? null,
    created_at: fault.createdAt ?? new Date().toISOString(),
    created_by_worker_id: createdBy,
    data,
  }

  const { data: existing } = await supabase.from('equipment_tickets').select('id').eq('id', rowId).maybeSingle()
  if (existing?.id) {
    const { error } = await supabase
      .from('equipment_tickets')
      .update({
        equipment_id: equipmentId,
        equipment_name: row.equipment_name,
        severity: row.severity,
        description: row.description,
        data,
      })
      .eq('id', rowId)
    if (error) console.error('❌ mirrorUpsertFaultTicket update', error)
    else {
      markEquipmentMirrorActive()
      console.info('[SARMS][equipment_tickets] mirror — fault updated', rowId)
    }
  } else {
    const { error } = await supabase.from('equipment_tickets').insert(row)
    if (error) console.error('❌ mirrorUpsertFaultTicket insert', error)
    else {
      markEquipmentMirrorActive()
      console.info('[SARMS][equipment_tickets] mirror — fault inserted', rowId)
    }
  }
}

export async function mirrorUpsertMaintenanceTicket(plan, workers) {
  if (!supabase || !plan) return

  const equipmentId = await resolveEquipmentUuidWithRetry(plan.equipmentId)
  if (!equipmentId) {
    console.warn('[SARMS][equipment_tickets] mirror MP skipped — no equipment UUID', plan.equipmentId)
    return
  }

  let rowId = await resolveEquipmentTicketUuidByAppId(plan.id)
  if (!rowId) {
    rowId = isUuid(String(plan.id))
      ? String(plan.id)
      : typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-mp`
  }

  const ticketType = appTicketTypeToDb(plan, false)
  const createdBy = await resolveCreatedByWorkerUuid(workers)
  const data = {
    legacyId: String(plan.id),
    mpType: plan.type,
    notes: plan.notes,
    priority: plan.priority,
    inspectionIntervalDays: plan.inspectionIntervalDays,
    equipmentName: plan.equipmentName,
  }

  const row = {
    id: rowId,
    equipment_id: equipmentId,
    equipment_name: plan.equipmentName ?? null,
    ticket_type: ticketType,
    status: plan.status === 'completed' ? 'scheduled' : 'scheduled',
    severity: null,
    due_date: plan.plannedDate ?? null,
    description: plan.notes ?? null,
    created_at: plan.createdAt ?? new Date().toISOString(),
    created_by_worker_id: createdBy,
    data,
  }

  const { data: existing } = await supabase.from('equipment_tickets').select('id').eq('id', rowId).maybeSingle()
  if (existing?.id) {
    const { error } = await supabase
      .from('equipment_tickets')
      .update({
        equipment_id: equipmentId,
        equipment_name: row.equipment_name,
        ticket_type: ticketType,
        due_date: row.due_date,
        description: row.description,
        data,
      })
      .eq('id', rowId)
    if (error) console.error('❌ mirrorUpsertMaintenanceTicket update', error)
    else {
      markEquipmentMirrorActive()
      console.info('[SARMS][equipment_tickets] mirror — maintenance ticket updated', rowId)
    }
  } else {
    const { error } = await supabase.from('equipment_tickets').insert(row)
    if (error) console.error('❌ mirrorUpsertMaintenanceTicket insert', error)
    else {
      markEquipmentMirrorActive()
      console.info('[SARMS][equipment_tickets] mirror — maintenance ticket inserted', rowId)
    }
  }
}

export async function mirrorDeleteEquipmentTicketByAppId(appTicketId) {
  if (!supabase) return
  const uuid = await resolveEquipmentTicketUuidByAppId(appTicketId)
  if (!uuid) {
    console.warn('[SARMS][equipment_tickets] delete skipped — unknown ticket', appTicketId)
    return
  }
  const { error } = await supabase.from('equipment_tickets').delete().eq('id', uuid)
  if (error) console.error('❌ mirrorDeleteEquipmentTicketByAppId', error)
  else console.info('[SARMS][equipment_tickets] mirror — deleted open ticket', uuid)
}

export async function fetchEquipmentTicketsMapped(equipmentAppList) {
  if (!supabase) {
    console.error('[SARMS][Supabase] error', 'fetchEquipmentTicketsMapped', 'no client')
    return null
  }
  const { data, error } = await supabase.from('equipment_tickets').select('*').order('created_at', { ascending: false })
  if (error) {
    console.error('[SARMS][Supabase] error', 'fetchEquipmentTicketsMapped', error)
    return null
  }
  const faults = []
  const maintenancePlans = []
  for (const r of data || []) {
    if (r.ticket_type === 'fault') {
      const f = equipmentTicketRowToFault(r, equipmentAppList)
      if (f) faults.push(f)
    } else {
      const m = equipmentTicketRowToMaintenancePlan(r, equipmentAppList)
      if (m) maintenancePlans.push(m)
    }
  }
  return { faults, maintenancePlans }
}

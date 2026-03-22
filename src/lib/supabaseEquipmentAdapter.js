/**
 * equipment — mirror + read (same shapes as localStorage).
 * Legacy app ids (eq1, …) stored in equipment.data.legacyId ↔ DB UUID.
 */

import { supabase } from './supabase'
import { isUuid } from './supabaseSchema'

/** Set after any successful equipment mirror write when using localStorage + Supabase mirror (read-test can then replace/clear from DB). */
export const EQUIPMENT_MIRROR_ACTIVE_KEY = 'sarms-equipment-mirror-active'

export function markEquipmentMirrorActive() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(EQUIPMENT_MIRROR_ACTIVE_KEY, '1')
  } catch (_) {}
}

export function hasEquipmentMirrorActive() {
  try {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(EQUIPMENT_MIRROR_ACTIVE_KEY) === '1'
  } catch {
    return false
  }
}

function parseDateOnly(v) {
  if (v == null || v === '') return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  try {
    return new Date(s).toISOString().slice(0, 10)
  } catch {
    return null
  }
}

export function mapEquipmentRowToApp(r) {
  if (!r) return null
  const data = r.data && typeof r.data === 'object' ? r.data : {}
  const lastInspection =
    data.lastInspection != null
      ? parseDateOnly(data.lastInspection)
      : parseDateOnly(r.last_service_at)
  const nextInspection =
    data.nextInspection != null
      ? parseDateOnly(data.nextInspection)
      : parseDateOnly(r.next_service_at)
  const appId = data.legacyId != null ? String(data.legacyId) : String(r.id)
  return {
    ...data,
    id: appId,
    code: r.code,
    name: r.name,
    category: data.category ?? data.Category ?? null,
    zone: r.zone ?? undefined,
    status: r.status,
    lastInspection: lastInspection || undefined,
    nextInspection: nextInspection || undefined,
    inspectionInterval: data.inspectionInterval != null ? Number(data.inspectionInterval) : undefined,
    createdAt: data.createdAt ?? r.created_at ?? undefined,
  }
}

function buildDataPayload(item) {
  const out = {}
  if (item?.id != null && !isUuid(String(item.id))) out.legacyId = String(item.id)
  if (item?.category != null) out.category = item.category
  if (item?.createdAt != null) out.createdAt = item.createdAt
  if (item?.inspectionInterval != null) out.inspectionInterval = item.inspectionInterval
  if (item?.lastInspection != null) out.lastInspection = item.lastInspection
  if (item?.nextInspection != null) out.nextInspection = item.nextInspection
  return out
}

function rowFromAppItem(item) {
  const id =
    item?.id != null && isUuid(String(item.id))
      ? String(item.id)
      : typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-eq`
  const last = parseDateOnly(item.lastInspection ?? item.last_inspection)
  const next = parseDateOnly(item.nextInspection ?? item.next_inspection)
  return {
    id,
    code: item.code ?? null,
    name: item.name ?? '',
    name_ar: item.nameAr ?? item.name_ar ?? null,
    zone: item.zone ?? null,
    status: item.status ?? 'active',
    last_service_at: last,
    next_service_at: next,
    created_at: item.createdAt ?? item.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    data: buildDataPayload({ ...item, id: item?.id }),
  }
}

export async function resolveEquipmentUuidByAppId(appId) {
  if (!supabase) return null
  const raw = appId != null ? String(appId).trim() : ''
  if (!raw) return null
  if (isUuid(raw)) return raw

  const { data: byLegacy, error: e1 } = await supabase
    .from('equipment')
    .select('id')
    .eq('data->>legacyId', raw)
    .maybeSingle()
  if (e1) console.warn('[SARMS][equipment] resolve legacyId', e1)
  if (byLegacy?.id) return String(byLegacy.id)

  // Do not query .eq('id', raw) when raw is not a UUID — Postgres rejects e.g. "eq1" for uuid columns.
  return null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function resolveEquipmentUuidWithRetry(appId) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const u = await resolveEquipmentUuidByAppId(appId)
    if (u) return u
    await sleep(40 * (attempt + 1))
  }
  return null
}

export async function fetchEquipmentAppShaped() {
  if (!supabase) {
    console.error('[SARMS][Supabase] error', 'fetchEquipmentAppShaped', 'no client')
    return null
  }
  const { data, error } = await supabase.from('equipment').select('*').order('name', { ascending: true })
  if (error) {
    console.error('[SARMS][Supabase] error', 'fetchEquipmentAppShaped', error)
    return null
  }
  return (data || []).map(mapEquipmentRowToApp).filter(Boolean)
}

/**
 * @param {object} item - App equipment row
 * @param {{ allowInsert?: boolean }} [options] - When false, only UPDATE existing DB rows (never insert). Use for status edits from ticket flow to avoid duplicate equipment rows when resolve is still racing.
 */
export async function mirrorUpsertEquipmentItem(item, options = {}) {
  const allowInsert = options.allowInsert !== false
  if (!supabase || !item) return

  let uuid = await resolveEquipmentUuidWithRetry(item.id)

  if (!uuid) {
    if (!allowInsert) {
      console.warn(
        '[SARMS][equipment] mirror update skipped — no DB row yet for',
        item.id,
        '(will retry on next action; avoid duplicate insert on ticket-only updates)'
      )
      return
    }
    uuid =
      item.id && isUuid(String(item.id))
        ? String(item.id)
        : typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-eq`
    const row = rowFromAppItem({ ...item, id: uuid })
    row.id = uuid
    const { error } = await supabase.from('equipment').insert(row)
    if (error) {
      console.error('❌ mirrorUpsertEquipmentItem insert', error)
      return
    }
    markEquipmentMirrorActive()
    console.info('[SARMS][equipment] mirror source=supabase — inserted row', uuid)
    return
  }

  const row = rowFromAppItem({ ...item, id: uuid })
  const { id: _omit, created_at: _c, ...updateBody } = row
  const { error: upErr } = await supabase.from('equipment').update(updateBody).eq('id', uuid)
  if (upErr) {
    console.error('❌ mirrorUpsertEquipmentItem update', upErr)
    return
  }
  markEquipmentMirrorActive()
  console.info('[SARMS][equipment] mirror source=supabase — updated row', uuid)
}

export async function mirrorDeleteEquipmentItem(appId) {
  if (!supabase) return
  const uuid = await resolveEquipmentUuidWithRetry(appId)
  if (!uuid) {
    console.warn('[SARMS][equipment] mirror delete skipped — unknown id', appId)
    return
  }
  const { error: tErr } = await supabase.from('equipment_tickets').delete().eq('equipment_id', uuid)
  if (tErr) console.warn('[SARMS][equipment] mirror delete equipment_tickets', tErr)
  const { error: rErr } = await supabase.from('resolved_tickets').delete().eq('equipment_id', uuid)
  if (rErr) console.warn('[SARMS][equipment] mirror delete resolved_tickets', rErr)
  const { error } = await supabase.from('equipment').delete().eq('id', uuid)
  if (error) {
    console.error('❌ mirrorDeleteEquipmentItem', error)
    return
  }
  markEquipmentMirrorActive()
  console.info('[SARMS][equipment] mirror source=supabase — deleted row', uuid)
}

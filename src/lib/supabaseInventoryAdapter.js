/**
 * Inventory + inventory_movements — mirror read/write (same shapes as localStorage).
 * Maps legacy app ids (e.g. inv1) via inventory.data.legacyId ↔ DB UUID.
 */

import { supabase } from './supabase'
import { isUuid } from './supabaseSchema'
import { resolveWorkerUuidByEmployeeLogin } from './supabaseTasksAdapter'

export function mapInventoryRowToApp(r) {
  if (!r) return null
  const data = r.data && typeof r.data === 'object' ? r.data : {}
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
    ...data,
  }
}

export function mapInventoryMovementRowToApp(r) {
  if (!r) return null
  const data = r.data && typeof r.data === 'object' ? r.data : {}
  return {
    id: r.id,
    code: r.code,
    itemId: r.item_id,
    old_quantity: r.old_quantity != null ? Number(r.old_quantity) : 0,
    new_quantity: r.new_quantity != null ? Number(r.new_quantity) : 0,
    reason: data.reason ?? r.reason,
    movementType: r.movement_type,
    changed_by: r.changed_by,
    created_at: r.created_at,
    change_amount: data.change_amount,
    ...data,
  }
}

export async function fetchInventoryAppShaped() {
  if (!supabase) {
    console.error('[SARMS][Supabase] error', 'fetchInventoryAppShaped', 'no client')
    return null
  }
  const { data, error } = await supabase.from('inventory').select('*').order('name', { ascending: true })
  if (error) {
    console.error('[SARMS][Supabase] error', 'fetchInventoryAppShaped', error)
    return null
  }
  return (data || []).map(mapInventoryRowToApp).filter(Boolean)
}

export async function fetchInventoryMovementsAppShaped() {
  if (!supabase) {
    console.error('[SARMS][Supabase] error', 'fetchInventoryMovementsAppShaped', 'no client')
    return null
  }
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[SARMS][Supabase] error', 'fetchInventoryMovementsAppShaped', error)
    return null
  }
  return (data || []).map(mapInventoryMovementRowToApp).filter(Boolean)
}

/** Resolve app item id (legacy or UUID) to inventory.id UUID in DB. */
export async function resolveInventoryItemUuid(itemIdOrLegacy) {
  if (!supabase) return null
  const raw = itemIdOrLegacy != null ? String(itemIdOrLegacy).trim() : ''
  if (!raw) return null
  if (isUuid(raw)) return raw

  const { data: byLegacy, error: e1 } = await supabase
    .from('inventory')
    .select('id')
    .eq('data->>legacyId', raw)
    .maybeSingle()
  if (e1) console.warn('[SARMS][inventory] resolve legacyId', e1)
  if (byLegacy?.id) return String(byLegacy.id)

  const { data: byCode, error: e2 } = await supabase.from('inventory').select('id').eq('code', raw).maybeSingle()
  if (e2) console.warn('[SARMS][inventory] resolve code', e2)
  if (byCode?.id) return String(byCode.id)

  return null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Same as resolve, with short retries (add-item then movement in same tick). */
async function resolveInventoryItemUuidForMovement(itemIdOrLegacy) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const u = await resolveInventoryItemUuid(itemIdOrLegacy)
    if (u) return u
    await sleep(50 * (attempt + 1))
  }
  return null
}

function buildDataPayload(item) {
  const out = {}
  if (item?.customCategory != null && item.customCategory !== '') out.customCategory = item.customCategory
  if (item?.id != null && !isUuid(String(item.id))) out.legacyId = String(item.id)
  return out
}

async function resolveChangedByWorkerUuid(workers) {
  try {
    const login =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sarms-user-id') : null
    if (!login) return null
    return await resolveWorkerUuidByEmployeeLogin(login, workers || [])
  } catch (_) {
    return null
  }
}

/**
 * Insert or update one inventory row (mirror after local state change).
 */
export async function mirrorUpsertInventoryItem(item, workers) {
  if (!supabase || !item) return
  console.log('🔥 mirror inventory upsert', { id: item.id, name: item.name })

  const quantity = Number(item.quantity) || 0
  const lastUpdated = item.lastUpdated ?? item.last_updated ?? new Date().toISOString()
  let uuid = await resolveInventoryItemUuid(item.id)

  if (!uuid) {
    uuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-inv`
    const insertRow = {
      id: uuid,
      code: item.code ?? null,
      name: item.name ?? '',
      category: item.category ?? 'other',
      quantity,
      unit: item.unit ?? '',
      min_qty: item.minQty ?? item.min_qty ?? null,
      warning_qty: item.warningQty ?? item.warning_qty ?? null,
      last_updated: lastUpdated,
      data: buildDataPayload(item),
    }
    const { error } = await supabase.from('inventory').insert(insertRow)
    if (error) {
      console.error('❌ mirrorUpsertInventoryItem insert', error)
      return
    }
    console.info('[SARMS][inventory] mirror source=supabase — inserted row', uuid)
    return
  }

  const updateRow = {
    name: item.name ?? '',
    category: item.category ?? 'other',
    quantity,
    unit: item.unit ?? '',
    min_qty: item.minQty ?? item.min_qty ?? null,
    warning_qty: item.warningQty ?? item.warning_qty ?? null,
    last_updated: lastUpdated,
    data: buildDataPayload(item),
  }
  const { error: upErr } = await supabase.from('inventory').update(updateRow).eq('id', uuid)
  if (upErr) {
    console.error('❌ mirrorUpsertInventoryItem update', upErr)
    return
  }
  console.info('[SARMS][inventory] mirror source=supabase — updated row', uuid)
}

/**
 * Insert one movement row (mirror). movement uses app itemId (legacy or UUID).
 */
export async function mirrorInsertInventoryMovement(movement, workers) {
  if (!supabase || !movement) return
  console.log('🔥 mirror inventory_movement', {
    itemId: movement.itemId,
    old: movement.old_quantity,
    new: movement.new_quantity,
  })

  const itemUuid = await resolveInventoryItemUuidForMovement(movement.itemId ?? movement.item_id)
  if (!itemUuid) {
    console.warn('[SARMS][inventory] mirror movement skipped — no UUID for item', movement.itemId)
    return
  }

  const login =
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sarms-user-id') : null
  const changedByWorkerId = await resolveChangedByWorkerUuid(workers)
  const movId =
    movement.id && isUuid(String(movement.id))
      ? String(movement.id)
      : typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-mov`

  const row = {
    id: movId,
    item_id: itemUuid,
    old_quantity: Number(movement.old_quantity) ?? 0,
    new_quantity: Number(movement.new_quantity) ?? 0,
    movement_type: movement.movementType ?? movement.movement_type ?? null,
    changed_by: login,
    changed_by_worker_id: changedByWorkerId,
    created_at: movement.created_at ?? movement.createdAt ?? new Date().toISOString(),
    data: {
      reason: movement.reason ?? null,
      change_amount: movement.change_amount ?? null,
    },
  }

  const { error } = await supabase.from('inventory_movements').insert(row)
  if (error) {
    console.error('❌ mirrorInsertInventoryMovement', error)
    return
  }
  console.info('[SARMS][inventory] mirror source=supabase — movement inserted', movId)
}

/**
 * Delete inventory row in DB (movements first — FK RESTRICT on inventory).
 */
export async function mirrorDeleteInventoryItem(itemId, workers) {
  if (!supabase) return
  const uuid = await resolveInventoryItemUuid(itemId)
  if (!uuid) {
    console.warn('[SARMS][inventory] mirror delete skipped — unknown item', itemId)
    return
  }
  console.log('🔥 mirror inventory delete', uuid)
  const { error: mErr } = await supabase.from('inventory_movements').delete().eq('item_id', uuid)
  if (mErr) console.error('❌ mirrorDeleteInventoryItem movements', mErr)
  const { error: iErr } = await supabase.from('inventory').delete().eq('id', uuid)
  if (iErr) console.error('❌ mirrorDeleteInventoryItem inventory', iErr)
  else console.info('[SARMS][inventory] mirror source=supabase — deleted row', uuid)
}

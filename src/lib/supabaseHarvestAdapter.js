import { supabase } from './supabase'

/**
 * Map DB row → same in-memory shape as Harvest Record form (`buildRecord` in RecordProduction).
 */
export function mapHarvestLogRowToAppRecord(row) {
  if (!row) return null
  const recordedAt = row.recorded_at
    ? new Date(row.recorded_at).toISOString()
    : new Date().toISOString()
  const createdAt = row.created_at ? new Date(row.created_at).toISOString() : recordedAt
  const q = row.quantity
  return {
    id: String(row.id),
    recordType: 'production',
    source: 'harvest_form',
    zone: row.zone_label ?? '',
    zoneId: row.zone_id ?? '',
    linesArea: row.lines_area ?? '',
    dateTime: recordedAt,
    quantity: q != null && q !== '' ? q : '',
    unit: row.unit ?? 'kg',
    notes: row.notes ?? '',
    imageData: row.image_data || undefined,
    createdAt,
  }
}

/** Rows from harvest_log as UI records (newest first, same order as DB). */
export async function fetchHarvestLogRecordsAppShaped() {
  const rows = await fetchHarvestLogs()
  return (rows || []).map(mapHarvestLogRowToAppRecord).filter(Boolean)
}

/**
 * operations_log-derived records + harvest_log rows — no duplicate harvest_form from ops.
 */
export function mergeOperationsRecordsWithHarvest(opsRecords, harvestAppRecords) {
  const ops = (opsRecords || []).filter((r) => r?.source !== 'harvest_form')
  const harvest = harvestAppRecords || []
  return [...ops, ...harvest]
}

export async function fetchHarvestLogs() {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('harvest_log')
    .select('*')
    .order('recorded_at', { ascending: false })

  if (error) {
    console.error('❌ fetchHarvestLogs error', error)
    return []
  }

  return data
}

export async function insertHarvestLog(payload) {
  console.log('🔥 inserting harvest_log', payload)

  if (!supabase) {
    const err = new Error('Supabase client not configured')
    console.error('❌ insertHarvestLog error', err)
    throw err
  }

  const { data, error } = await supabase.from('harvest_log').insert([payload]).select()

  if (error) {
    console.error('❌ insertHarvestLog error', error)
    throw error
  }

  console.log('✅ harvest_log inserted', data)
  return data
}

export async function updateHarvestLog(id, patch) {
  if (!supabase) throw new Error('Supabase client not configured')
  if (!id) throw new Error('updateHarvestLog: id is required')
  const { data, error } = await supabase
    .from('harvest_log')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteHarvestLog(id) {
  if (!supabase) throw new Error('Supabase client not configured')
  if (!id) throw new Error('deleteHarvestLog: id is required')
  const { error } = await supabase.from('harvest_log').delete().eq('id', id)
  if (error) throw error
}

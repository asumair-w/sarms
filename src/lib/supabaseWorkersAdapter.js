import { supabase } from './supabase'
import { isUuid, toDbWorker } from './supabaseSchema'

function asKey(v) {
  return String(v ?? '').trim()
}

export async function upsertWorker(worker) {
  if (!supabase || !worker) return null
  const row = toDbWorker(worker)
  const { error } = await supabase.from('workers').upsert(row, { onConflict: 'id' })
  if (error) {
    console.warn('[SARMS][workers-adapter] upsert', error)
    return null
  }
  return row
}

export async function deleteWorkerFromSupabase(worker) {
  if (!supabase || !worker) return
  const id = asKey(worker.id)
  if (isUuid(id)) {
    const { error } = await supabase.from('workers').delete().eq('id', id)
    if (error) console.warn('[SARMS][workers-adapter] delete by id', error)
    return
  }
  const employeeId = asKey(worker.employeeId ?? worker.employee_id)
  if (employeeId) {
    const { error } = await supabase.from('workers').delete().eq('employee_id', employeeId)
    if (error) console.warn('[SARMS][workers-adapter] delete by employee_id', error)
  }
}

export async function syncWorkersSnapshot(nextWorkers, prevWorkers) {
  if (!supabase) return
  const next = Array.isArray(nextWorkers) ? nextWorkers : []
  const prev = Array.isArray(prevWorkers) ? prevWorkers : []

  const nextById = new Set(next.map((w) => asKey(w.id)).filter(Boolean))
  const removed = prev.filter((w) => {
    const key = asKey(w.id)
    return key && !nextById.has(key)
  })

  for (const w of removed) {
    await deleteWorkerFromSupabase(w)
  }
  for (const w of next) {
    await upsertWorker(w)
  }
}

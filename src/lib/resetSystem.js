/**
 * SARMS Reset System – full data wipe for testing/pilot environments.
 * Admin only. Clears browser storage and Supabase tables, then reloads with minimal default state.
 */

import { supabase, isSupabaseConfigured } from './supabase'

const SKIP_HYDRATE_KEY = 'sarms-skip-hydrate'

/** Tables used by SARMS. Order respects FKs: task_workers, sessions first; then tasks; then rest. */
const SUPABASE_TABLES = [
  'task_workers',
  'sessions',
  'tasks',
  'records',
  'inventory_movements',
  'faults',
  'maintenance_plans',
  'workers',
  'equipment',
  'inventory',
  'zones',
  'settings',
]

/** Step 1 – Clear all SARMS-related browser storage (localStorage + sessionStorage). */
export function clearBrowserStorage() {
  try {
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('sarms') || key.startsWith('cache') || key.toLowerCase().includes('sarms'))) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k))
    // Also clear known SARMS keys that might not match above
    const known = [
      'sarms-workers', 'sarms-records', 'sarms-sessions', 'sarms-zones', 'sarms-tasks',
      'sarms-batches-by-zone', 'sarms-default-batch-by-zone', 'sarms-inventory',
      'sarms-inventory-movements', 'sarms-equipment', 'sarms-faults', 'sarms-maintenance-plans',
      'sarms_lang', 'sarms-skip-hydrate',
    ]
    known.forEach((k) => localStorage.removeItem(k))
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key && key.startsWith('sarms')) localStorage.removeItem(key)
    }
  } catch (e) {
    console.warn('resetSystem clear localStorage:', e)
  }
  try {
    sessionStorage.clear()
  } catch (e) {
    console.warn('resetSystem clear sessionStorage:', e)
  }
}

/** Step 2 – Delete all rows from SARMS Supabase tables (safe: delete by key, no DROP). */
export async function resetSupabaseDatabase() {
  if (!isSupabaseConfigured || !supabase) return
  const BATCH = 100
  for (const table of SUPABASE_TABLES) {
    try {
      const pk = table === 'settings' ? 'key' : table === 'task_workers' ? 'task_id' : 'id'
      const { data: rows, error: selectErr } = await supabase.from(table).select(pk)
      if (selectErr) {
        if (selectErr.code === '42P01') continue
        console.warn(`resetSystem ${table} select:`, selectErr.message)
        continue
      }
      const keys = (rows || []).map((r) => r[pk]).filter((k) => k != null && k !== '')
      for (let i = 0; i < keys.length; i += BATCH) {
        const chunk = keys.slice(i, i + BATCH)
        const { error: delErr } = await supabase.from(table).delete().in(pk, chunk)
        if (delErr) console.warn(`resetSystem ${table} delete:`, delErr.message)
      }
    } catch (e) {
      console.warn(`resetSystem ${table}:`, e)
    }
  }
}

/** Set flag so next load skips Supabase hydrate (avoids re-filling from cloud). */
export function setSkipHydrateBeforeReload() {
  try {
    sessionStorage.setItem(SKIP_HYDRATE_KEY, '1')
  } catch (_) {}
}

/** Log reset event (for auditing). */
export function logResetEvent(adminUserId) {
  try {
    const entry = `[SARMS Reset] ${new Date().toISOString()} – executed by admin: ${adminUserId || 'unknown'}`
    console.warn(entry)
  } catch (_) {}
}

export const RESET_SUCCESS_KEY = 'sarms-reset-success'

/**
 * Run full reset: clear storage, clear Supabase, set skip-hydrate, then reload.
 * Call after user confirmation. Sets a flag so the next load can show "System reset completed successfully."
 */
export async function executeFullReset(adminUserId) {
  logResetEvent(adminUserId)
  clearBrowserStorage()
  await resetSupabaseDatabase()
  setSkipHydrateBeforeReload()
  try {
    sessionStorage.setItem(RESET_SUCCESS_KEY, '1')
  } catch (_) {}
  window.location.reload()
}

/** Check and consume the reset-success flag (call on app load). Returns true if reset just completed. */
export function consumeResetSuccessFlag() {
  try {
    const v = sessionStorage.getItem(RESET_SUCCESS_KEY)
    if (v) {
      sessionStorage.removeItem(RESET_SUCCESS_KEY)
      return true
    }
  } catch (_) {}
  return false
}

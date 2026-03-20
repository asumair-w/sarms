/**
 * SARMS Reset System – full data wipe for testing/pilot environments.
 * Admin only. Clears browser storage and Supabase tables, then reloads with minimal default state.
 */

import { supabase, isSupabaseConfigured } from './supabase'
import { seedDefaultAccounts } from './defaultAccounts'
import { getInitialZones } from '../data/workerFlow'

const SKIP_HYDRATE_KEY = 'sarms-skip-hydrate'

/** Tables used by SARMS. Order respects FKs: task_workers, sessions first; then tasks; then rest. */
const SUPABASE_TABLES = [
  'task_workers',
  'sessions',
  'tasks',
  'records',
  'harvest_log',
  'inventory_movements',
  'resolved_tickets',
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
    // Requirement: wipe all localStorage so the app behaves like a fresh install.
    localStorage.clear()
  } catch (e) {
    console.warn('resetSystem clear localStorage:', e)
  }
  try {
    sessionStorage.clear()
  } catch (e) {
    console.warn('resetSystem clear sessionStorage:', e)
  }
}

/**
 * Local-only reset: clears localStorage and recreates the 3 default accounts.
 * (Admin: a1/a1, Engineer: e1/e1, Worker: w1/w1)
 */
/**
 * After a full wipe, write default logins + empty operational data.
 * If we only seed users/workers, the next load sees missing task/session/record keys
 * and refills demo seed from getInitial*() — looks like "reset did nothing".
 */
export function writeFreshLocalStateAfterReset() {
  try {
    seedDefaultAccounts()
    const zones = getInitialZones()
    const batchesByZone = {}
    const defaultBatchByZone = {}
    zones.forEach((z) => {
      batchesByZone[z.id] = [{ id: '1', name: 'Batch 1' }]
      defaultBatchByZone[z.id] = '1'
    })
    const empty = '[]'
    localStorage.setItem('sarms-records', empty)
    localStorage.setItem('sarms-sessions', empty)
    localStorage.setItem('sarms-tasks', empty)
    localStorage.setItem('sarms-zones', JSON.stringify(zones))
    localStorage.setItem('sarms-batches-by-zone', JSON.stringify(batchesByZone))
    localStorage.setItem('sarms-default-batch-by-zone', JSON.stringify(defaultBatchByZone))
    localStorage.setItem('sarms-inventory', empty)
    localStorage.setItem('sarms-inventory-movements', empty)
    localStorage.setItem('sarms-equipment', empty)
    localStorage.setItem('sarms-faults', empty)
    localStorage.setItem('sarms-maintenance-plans', empty)
    localStorage.setItem('sarms-resolved-tickets', empty)
    console.info('[SARMS][reset] fresh local state: empty tasks/sessions/records + default zones/workers')
  } catch (e) {
    console.warn('resetSystem writeFreshLocalStateAfterReset:', e)
  }
}

export function resetSystem() {
  console.info('[SARMS][reset] resetSystem() called: clearing storage and reseeding defaults')
  clearBrowserStorage()
  writeFreshLocalStateAfterReset()
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
  writeFreshLocalStateAfterReset()
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

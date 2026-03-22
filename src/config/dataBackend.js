import { isSupabaseConfigured } from '../lib/supabase'

/**
 * Data backend toggle: Supabase-only vs localStorage-only. No dual-sync.
 * Set in `.env`: VITE_USE_SUPABASE=true
 * Trim so Cloudflare/dashboard typos like "true " still match.
 */
const viteUseSupabaseRaw = import.meta.env?.VITE_USE_SUPABASE
export const USE_SUPABASE =
  typeof import.meta !== 'undefined' &&
  String(viteUseSupabaseRaw ?? '').trim() === 'true'

export const USE_SUPABASE_ACTIVE = USE_SUPABASE && isSupabaseConfigured

/** Legacy keys for tasks / sessions / records — must never be read when Supabase is the backend. */
export const SARMS_CORE_LOCALSTORAGE_KEYS = ['sarms-tasks', 'sarms-sessions', 'sarms-records']

/** Cached worker list must not override Supabase `workers` table (demo seeds had w1–w10). */
export const SARMS_WORKERS_LOCALSTORAGE_KEY = 'sarms-workers'

/** Remove stale core keys on startup (Supabase mode). Safe no-op if keys absent. */
export function purgeSarmsCoreLocalStorageKeys() {
  if (typeof localStorage === 'undefined') return
  try {
    SARMS_CORE_LOCALSTORAGE_KEYS.forEach((k) => localStorage.removeItem(k))
    localStorage.removeItem(SARMS_WORKERS_LOCALSTORAGE_KEY)
  } catch (_) {}
}

/**
 * Single source of truth (Supabase): remove every `sarms-*` key and legacy demo `users` so no stale data remains.
 */
export function purgeAllSarmsLocalStorageKeys() {
  if (typeof localStorage === 'undefined') return
  try {
    const toRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k.startsWith('sarms-') || k === 'users')) toRemove.push(k)
    }
    toRemove.forEach((k) => localStorage.removeItem(k))
  } catch (_) {}
}

if (USE_SUPABASE && !isSupabaseConfigured) {
  console.warn(
    '[SARMS] VITE_USE_SUPABASE is true but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing. Core data (tasks, sessions, operations_log) will stay empty until credentials are set — no localStorage fallback for those domains.'
  )
}

/**
 * One-shot bootstrap log so you can confirm env + flags before testing RPC (e.g. approve_task_complete).
 * Does not print secrets (only whether anon key is set + project host if URL is valid).
 */
export function logSupabaseBackendStatus() {
  if (typeof window === 'undefined') return
  const url = import.meta.env?.VITE_SUPABASE_URL
  let urlHost = null
  try {
    if (url) urlHost = new URL(url).host
  } catch {
    urlHost = '(invalid URL)'
  }
  console.info('[SARMS][supabase] backend status', {
    VITE_USE_SUPABASE: import.meta.env?.VITE_USE_SUPABASE,
    USE_SUPABASE_ACTIVE,
    urlHost,
    anonKeyConfigured: Boolean(import.meta.env?.VITE_SUPABASE_ANON_KEY),
  })
}

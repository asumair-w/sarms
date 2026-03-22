/**
 * SARMS auth: validates credentials, resolves role, enforces routing.
 * No role selection by user – role is always derived from User ID.
 * With Supabase: pass `workersOverride` from AppStore (no localStorage).
 * Legacy mode: reads workers from localStorage (sarms-workers).
 */

import { USE_SUPABASE } from './config/dataBackend'

export const ROLES = {
  WORKER: 'worker',
  ENGINEER: 'engineer',
  ADMIN: 'admin',
}

const ROUTES_BY_ROLE = {
  [ROLES.WORKER]: '/worker',
  [ROLES.ENGINEER]: '/engineer',
  [ROLES.ADMIN]: '/admin',
}

const WORKERS_STORAGE_KEY = 'sarms-workers'

/** Map stored worker role to auth ROLES (worker → WORKER). */
function roleToAuthRole(role) {
  if (role === 'engineer') return ROLES.ENGINEER
  if (role === 'admin') return ROLES.ADMIN
  return ROLES.WORKER
}

/** Load workers from localStorage (local-only mode). Never reads when VITE_USE_SUPABASE=true. */
function getStoredWorkers() {
  if (USE_SUPABASE) return []
  try {
    const raw = localStorage.getItem(WORKERS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (_) {}
  return []
}

/** Find worker by employeeId — uses override list when provided (Supabase). */
function findStoredWorker(userId, workersOverride) {
  const key = userId?.trim()?.toLowerCase()
  if (!key) return null
  const workers = Array.isArray(workersOverride) ? workersOverride : getStoredWorkers()
  return workers.find((w) => (w.employeeId || '').toLowerCase() === key) || null
}

/**
 * Validate ID + password. Returns { ok, role, error }.
 * @param {Array|undefined} workersOverride — from AppStore when using Supabase (single source of truth).
 */
export function validateCredentials(userId, password, workersOverride) {
  if (!userId?.trim()) return { ok: false, error: 'Invalid ID or password' }
  const worker = findStoredWorker(userId, workersOverride)
  if (worker) {
    const pwd = (worker.tempPassword || '').trim()
    if (pwd !== (password || '').trim()) return { ok: false, error: 'Invalid ID or password' }
    if (worker.status !== 'active') return { ok: false, error: 'Inactive or unauthorized user' }
    return { ok: true, role: roleToAuthRole(worker.role) }
  }
  return { ok: false, error: 'Invalid ID or password' }
}

/**
 * Validate User ID from QR code. Same contract as ID+password (role, status).
 * @param {Array|undefined} workersOverride — from AppStore when using Supabase.
 */
export function validateUserIdFromQR(userId, workersOverride) {
  if (!userId?.trim()) return { ok: false, error: 'Invalid or expired QR Code' }
  const worker = findStoredWorker(userId, workersOverride)
  if (worker) {
    if (worker.status !== 'active') return { ok: false, error: 'Inactive or unauthorized user' }
    return { ok: true, role: roleToAuthRole(worker.role) }
  }
  return { ok: false, error: 'Invalid or expired QR Code' }
}

/**
 * Get redirect path for role. Used after successful login.
 */
export function getRedirectForRole(role) {
  return ROUTES_BY_ROLE[role] ?? '/login'
}

const ROLE_KEY = 'sarms-user-role'
const USER_ID_KEY = 'sarms-user-id'
const SESSION_ID_KEY = 'sarms-session-id'

/** Clears browser session keys so /login is shown (LoginOrRedirectHome no longer bounces to role home). */
export function clearSessionAuth() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(ROLE_KEY)
    sessionStorage.removeItem(USER_ID_KEY)
    sessionStorage.removeItem(SESSION_ID_KEY)
  } catch (_) {}
}

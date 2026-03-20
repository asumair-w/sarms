/**
 * SARMS auth: validates credentials, resolves role, enforces routing.
 * No role selection by user – role is always derived from User ID.
 * Uses workers from localStorage (sarms-workers). Default accounts are seeded on bootstrap.
 */

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

/** Load workers from localStorage (same key as AppStore). */
function getStoredWorkers() {
  try {
    const raw = localStorage.getItem(WORKERS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (_) {}
  return []
}

/** Find stored worker by employeeId (login ID). */
function findStoredWorker(userId) {
  const key = userId?.trim()?.toLowerCase()
  if (!key) return null
  const workers = getStoredWorkers()
  return workers.find((w) => (w.employeeId || '').toLowerCase() === key) || null
}

/**
 * Validate ID + password. Returns { ok, role, error }.
 * Checks stored workers (source of truth when engineer toggles active/inactive).
 */
export function validateCredentials(userId, password) {
  if (!userId?.trim()) return { ok: false, error: 'Invalid ID or password' }
  const worker = findStoredWorker(userId)
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
 * Checks stored workers (source of truth when engineer toggles active/inactive).
 */
export function validateUserIdFromQR(userId) {
  if (!userId?.trim()) return { ok: false, error: 'Invalid or expired QR Code' }
  const worker = findStoredWorker(userId)
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

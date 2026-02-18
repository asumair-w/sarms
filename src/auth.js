/**
 * SARMS auth: validates credentials, resolves role, enforces routing.
 * No role selection by user – role is always derived from User ID.
 * Uses MOCK_USERS for seed accounts + workers from localStorage (sarms-workers) for newly added workers.
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

/** Map stored worker role to auth ROLES (worker/technician → WORKER). */
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
 * Mock user store (replace with real API).
 * In production: validate against backend; backend returns role and status.
 */
const MOCK_USERS = {
  w1: { password: 'w1', role: ROLES.WORKER, active: true },
  w2: { password: 'w2', role: ROLES.WORKER, active: true },
  w3: { password: 'w3', role: ROLES.WORKER, active: true },
  w4: { password: 'w4', role: ROLES.WORKER, active: true },
  w5: { password: 'w5', role: ROLES.WORKER, active: true },
  w6: { password: 'w6', role: ROLES.WORKER, active: true },
  w7: { password: 'w7', role: ROLES.WORKER, active: false },
  w8: { password: 'w8', role: ROLES.WORKER, active: true },
  w9: { password: 'w9', role: ROLES.WORKER, active: true },
  w10: { password: 'w10', role: ROLES.WORKER, active: true },
  e1: { password: 'e1', role: ROLES.ENGINEER, active: true },
  e2: { password: 'e2', role: ROLES.ENGINEER, active: true },
  e3: { password: 'e3', role: ROLES.ENGINEER, active: true },
  e4: { password: 'e4', role: ROLES.ENGINEER, active: true },
  e5: { password: 'e5', role: ROLES.ENGINEER, active: true },
  e6: { password: 'e6', role: ROLES.ENGINEER, active: true },
  e7: { password: 'e7', role: ROLES.ENGINEER, active: false },
  e8: { password: 'e8', role: ROLES.ENGINEER, active: true },
  e9: { password: 'e9', role: ROLES.ENGINEER, active: true },
  e10: { password: 'e10', role: ROLES.ENGINEER, active: true },
  t1: { password: 't1', role: ROLES.WORKER, active: true },
  t2: { password: 't2', role: ROLES.WORKER, active: true },
  t3: { password: 't3', role: ROLES.WORKER, active: true },
  t4: { password: 't4', role: ROLES.WORKER, active: true },
  t5: { password: 't5', role: ROLES.WORKER, active: true },
  t6: { password: 't6', role: ROLES.WORKER, active: false },
  t7: { password: 't7', role: ROLES.WORKER, active: true },
  t8: { password: 't8', role: ROLES.WORKER, active: true },
  t9: { password: 't9', role: ROLES.WORKER, active: true },
  t10: { password: 't10', role: ROLES.WORKER, active: true },
  a1: { password: 'a1', role: ROLES.ADMIN, active: true },
  a2: { password: 'a2', role: ROLES.ADMIN, active: true },
}

/**
 * Validate ID + password. Returns { ok, role, error }.
 * Checks MOCK_USERS first, then workers from localStorage (newly added workers).
 */
export function validateCredentials(userId, password) {
  if (!userId?.trim()) return { ok: false, error: 'Invalid ID or password' }
  const key = userId.trim().toLowerCase()
  const mockUser = MOCK_USERS[key]
  if (mockUser) {
    if (mockUser.password !== password) return { ok: false, error: 'Invalid ID or password' }
    if (!mockUser.active) return { ok: false, error: 'Inactive or unauthorized user' }
    return { ok: true, role: mockUser.role }
  }
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
 * Checks MOCK_USERS first, then workers from localStorage.
 */
export function validateUserIdFromQR(userId) {
  if (!userId?.trim()) return { ok: false, error: 'Invalid or expired QR Code' }
  const key = userId.trim().toLowerCase()
  const mockUser = MOCK_USERS[key]
  if (mockUser) {
    if (!mockUser.active) return { ok: false, error: 'Inactive or unauthorized user' }
    return { ok: true, role: mockUser.role }
  }
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

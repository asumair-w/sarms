const USERS_STORAGE_KEY = 'users'
const WORKERS_STORAGE_KEY = 'sarms-workers'

export const DEFAULT_USERS = [
  { id: 1, name: 'Admin', username: 'a1', password: 'a1', role: 'admin' },
  { id: 2, name: 'Engineer', username: 'e1', password: 'e1', role: 'engineer' },
  { id: 3, name: 'Worker', username: 'w1', password: 'w1', role: 'worker' },
]

function buildDefaultWorkersForAppStore() {
  const now = new Date().toISOString()
  return [
    {
      id: '1',
      employeeId: 'a1',
      fullName: 'Admin',
      phone: '',
      email: 'admin@sarms.local',
      nationality: '',
      role: 'admin',
      department: 'farming',
      status: 'active',
      tempPassword: 'a1',
      createdAt: now,
      skills: [],
    },
    {
      id: '2',
      employeeId: 'e1',
      fullName: 'Engineer',
      phone: '',
      email: 'engineer@sarms.local',
      nationality: '',
      role: 'engineer',
      department: 'maintenance',
      status: 'active',
      tempPassword: 'e1',
      createdAt: now,
      skills: [],
    },
    {
      id: '3',
      employeeId: 'w1',
      fullName: 'Worker',
      phone: '',
      email: 'worker@sarms.local',
      nationality: '',
      role: 'worker',
      department: 'farming',
      status: 'active',
      tempPassword: 'w1',
      createdAt: now,
      skills: [],
    },
  ]
}

export function seedDefaultAccounts() {
  // Force overwrite (used by resetSystem only)
  seedDefaultUsers()
  seedDefaultWorkers()
  console.info('[SARMS][seed] default accounts seeded (force):', { usersKey: USERS_STORAGE_KEY, workersKey: WORKERS_STORAGE_KEY })
}

export function seedDefaultUsers() {
  const usersJson = JSON.stringify(DEFAULT_USERS)
  localStorage.setItem(USERS_STORAGE_KEY, usersJson)
}

export function seedDefaultWorkers() {
  const workersJson = JSON.stringify(buildDefaultWorkersForAppStore())
  localStorage.setItem(WORKERS_STORAGE_KEY, workersJson)
}

export function ensureDefaultAccountsSeeded() {
  // Non-destructive bootstrap: only seed if storage is empty OR required keys are missing.
  // Never overwrite existing developer testing data. Use resetSystem() to force overwrite.
  if (typeof window !== 'undefined') {
    if (window.__SARMS_DEFAULT_ACCOUNTS_SEEDED__) return
    window.__SARMS_DEFAULT_ACCOUNTS_SEEDED__ = true
  }

  try {
    const isEmpty = localStorage.length === 0
    const hasUsers = !!localStorage.getItem(USERS_STORAGE_KEY)
    const hasWorkers = !!localStorage.getItem(WORKERS_STORAGE_KEY)

    if (isEmpty) {
      seedDefaultAccounts()
      console.info('[SARMS][seed] localStorage empty → seeded default users + workers')
      return
    }

    if (!hasUsers) {
      seedDefaultUsers()
      console.info('[SARMS][seed] missing key → seeded default users:', USERS_STORAGE_KEY)
    }
    if (!hasWorkers) {
      seedDefaultWorkers()
      console.info('[SARMS][seed] missing key → seeded default workers:', WORKERS_STORAGE_KEY)
    }
  } catch (e) {
    // If localStorage is unavailable/throws, do nothing (avoid destructive behavior).
    console.warn('[SARMS][seed] ensureDefaultAccountsSeeded() skipped:', e)
  }
}


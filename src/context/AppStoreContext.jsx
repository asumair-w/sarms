import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react'
import { getInitialZones } from '../data/workerFlow'
import { TASK_STATUS } from '../data/assignTask'
import { SEED_WORKERS, getMinimalWorkers } from '../data/engineerWorkers'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const RECORDS_STORAGE_KEY = 'sarms-records'
const SESSIONS_STORAGE_KEY = 'sarms-sessions'
const ZONES_STORAGE_KEY = 'sarms-zones'
const TASKS_STORAGE_KEY = 'sarms-tasks'
const BATCHES_BY_ZONE_STORAGE_KEY = 'sarms-batches-by-zone'
const DEFAULT_BATCH_BY_ZONE_STORAGE_KEY = 'sarms-default-batch-by-zone'
const WORKERS_STORAGE_KEY = 'sarms-workers'
const INVENTORY_STORAGE_KEY = 'sarms-inventory'
const INVENTORY_MOVEMENTS_STORAGE_KEY = 'sarms-inventory-movements'
const EQUIPMENT_STORAGE_KEY = 'sarms-equipment'
const FAULTS_STORAGE_KEY = 'sarms-faults'
const MAINTENANCE_PLANS_STORAGE_KEY = 'sarms-maintenance-plans'

const SARMS_DATA_KEYS = [
  RECORDS_STORAGE_KEY,
  SESSIONS_STORAGE_KEY,
  ZONES_STORAGE_KEY,
  TASKS_STORAGE_KEY,
  BATCHES_BY_ZONE_STORAGE_KEY,
  DEFAULT_BATCH_BY_ZONE_STORAGE_KEY,
  WORKERS_STORAGE_KEY,
  INVENTORY_STORAGE_KEY,
  INVENTORY_MOVEMENTS_STORAGE_KEY,
  EQUIPMENT_STORAGE_KEY,
  FAULTS_STORAGE_KEY,
  MAINTENANCE_PLANS_STORAGE_KEY,
]
const WORKER_SESSION_PREFIX = 'sarms-worker-session-'

const SKIP_HYDRATE_KEY = 'sarms-skip-hydrate'

/** Clears all SARMS data from localStorage (and worker session keys). Sets a flag so next load does not re-fill from Supabase. */
export function clearAllSarmsDataStorage() {
  try {
    sessionStorage.setItem(SKIP_HYDRATE_KEY, '1')
    SARMS_DATA_KEYS.forEach((key) => localStorage.removeItem(key))
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(WORKER_SESSION_PREFIX)) keysToRemove.push(key)
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key))
  } catch (_) {}
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (_) {}
  return []
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (_) {}
  return []
}

function loadZones() {
  try {
    const raw = localStorage.getItem(ZONES_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (_) {}
  return getInitialZones()
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (_) {}
  return []
}

/** Normalize batch list to array of { id, name }. Supports legacy string[] format. */
function normalizeBatchList(arr) {
  if (!arr || !Array.isArray(arr)) return [{ id: '1', name: 'Batch 1' }]
  if (arr.length === 0) return [{ id: '1', name: 'Batch 1' }]
  const first = arr[0]
  if (typeof first === 'string') return arr.map((s) => ({ id: s, name: `Batch ${s}` }))
  return arr.map((b) => ({ id: b.id ?? b, name: b.name ?? `Batch ${b.id ?? b}` }))
}

function loadBatchesByZone() {
  try {
    const raw = localStorage.getItem(BATCHES_BY_ZONE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const result = {}
        for (const [zoneId, list] of Object.entries(parsed)) {
          result[zoneId] = normalizeBatchList(list)
        }
        return result
      }
    }
  } catch (_) {}
  return {}
}

function loadDefaultBatchByZone() {
  try {
    const raw = localStorage.getItem(DEFAULT_BATCH_BY_ZONE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    }
  } catch (_) {}
  return {}
}

/** Technicians are removed from the system; filter them out from any loaded list. */
function withoutTechnicians(workers) {
  if (!Array.isArray(workers)) return workers
  return workers.filter((w) => (w.role || '').toLowerCase() !== 'technician')
}

/** Default is 15 workers + 1 engineer + 1 admin. If loaded data has more than 1 engineer or more than 1 admin, use minimal seed. */
function normalizeWorkersList(workers) {
  if (!Array.isArray(workers) || workers.length === 0) return getMinimalWorkers()
  const filtered = withoutTechnicians(workers)
  const engineers = filtered.filter((w) => (w.role || '').toLowerCase() === 'engineer').length
  const admins = filtered.filter((w) => (w.role || '').toLowerCase() === 'admin').length
  if (engineers > 1 || admins > 1) return getMinimalWorkers()
  return filtered
}

function loadWorkers() {
  try {
    const raw = localStorage.getItem(WORKERS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return normalizeWorkersList(parsed)
    }
  } catch (_) {}
  return getMinimalWorkers()
}

function loadInventory() {
  try {
    const raw = localStorage.getItem(INVENTORY_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (_) {}
  return []
}

function loadInventoryMovements() {
  try {
    const raw = localStorage.getItem(INVENTORY_MOVEMENTS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (_) {}
  return []
}

function loadEquipment() {
  try {
    const raw = localStorage.getItem(EQUIPMENT_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (_) {}
  return []
}

function loadFaults() {
  try {
    const raw = localStorage.getItem(FAULTS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (_) {}
  return []
}

function loadMaintenancePlans() {
  try {
    const raw = localStorage.getItem(MAINTENANCE_PLANS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (_) {}
  return []
}

/** Build full initial state (used on every provider mount so persisted data is never lost on remount/HMR). */
function getInitialState() {
  return {
    tasks: loadTasks(),
    records: loadRecords(),
    sessions: loadSessions(),
    zones: loadZones(),
    batchesByZone: loadBatchesByZone(),
    defaultBatchByZone: loadDefaultBatchByZone(),
    workers: loadWorkers(),
    inventory: loadInventory(),
    inventoryMovements: loadInventoryMovements(),
    equipment: loadEquipment(),
    faults: loadFaults(),
    maintenancePlans: loadMaintenancePlans(),
    hydrateDone: false,
  }
}

/** Fetch all SARMS data from Supabase and return state shape. */
async function fetchSupabaseState() {
  if (!supabase) return null
  const tables = [
    'workers', 'zones', 'tasks', 'records', 'sessions',
    'inventory', 'inventory_movements', 'equipment', 'faults', 'maintenance_plans', 'settings'
  ]
  const out = {}
  try {
    for (const table of tables) {
      if (table === 'settings') {
        const { data, error } = await supabase.from('settings').select('key, value')
        if (error) {
          if (error.code === '42P01') continue
          console.warn('Supabase settings:', error.message)
          continue
        }
        const rows = data || []
        const batchesRow = rows.find((r) => r.key === BATCHES_BY_ZONE_STORAGE_KEY)
        const defaultRow = rows.find((r) => r.key === DEFAULT_BATCH_BY_ZONE_STORAGE_KEY)
        out.batchesByZone = batchesRow && typeof batchesRow.value === 'object' ? batchesRow.value : {}
        out.defaultBatchByZone = defaultRow && typeof defaultRow.value === 'object' ? defaultRow.value : {}
        continue
      }
      const { data, error } = await supabase.from(table).select('id, data')
      if (error) {
        if (error.code === '42P01') continue
        console.warn(`Supabase ${table}:`, error.message)
        continue
      }
      const list = (data || []).map((row) => (row.data && typeof row.data === 'object' ? { ...row.data, id: row.id } : { id: row.id }))
      const key = table === 'inventory_movements' ? 'inventoryMovements' : table.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      out[key] = list
    }
    return out
  } catch (e) {
    console.warn('fetchSupabaseState:', e)
    return null
  }
}

/** Persist a list to Supabase (replace table). */
async function persistTable(tableName, list) {
  if (!supabase || !Array.isArray(list)) return
  try {
    await supabase.from(tableName).delete().neq('id', '')
    if (list.length > 0) {
      const rows = list.map((item) => ({ id: item.id, data: item }))
      await supabase.from(tableName).insert(rows)
    }
  } catch (e) {
    console.warn(`Supabase persist ${tableName}:`, e)
  }
}

/** Persist settings key. */
async function persistSetting(key, value) {
  if (!supabase) return
  try {
    await supabase.from('settings').upsert({ key, value: value || {} }, { onConflict: 'key' })
  } catch (e) {
    console.warn('Supabase persist settings:', e)
  }
}

function storeReducer(state, action) {
  switch (action.type) {
    case 'SET_TASKS':
      return { ...state, tasks: action.payload }
    case 'ADD_TASK':
      return { ...state, tasks: [action.payload, ...state.tasks] }
    case 'UPDATE_TASK_STATUS': {
      const { taskId, status } = action.payload
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, status } : t
        ),
      }
    }
    case 'UPDATE_TASK': {
      const { taskId, updates } = action.payload
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, ...updates } : t
        ),
      }
    }
    case 'ADD_RECORD':
      return { ...state, records: [action.payload, ...state.records] }
    case 'UPDATE_RECORD': {
      const { recordId, updates } = action.payload
      return {
        ...state,
        records: state.records.map((r) =>
          r.id === recordId ? { ...r, ...updates } : r
        ),
      }
    }
    case 'REMOVE_RECORD':
      return { ...state, records: state.records.filter((r) => r.id !== action.payload) }
    case 'SET_SESSIONS':
      return { ...state, sessions: action.payload }
    case 'ADD_SESSION':
      return { ...state, sessions: [action.payload, ...state.sessions] }
    case 'REMOVE_SESSION':
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.id !== action.payload),
      }
    case 'UPDATE_SESSION': {
      const { sessionId, updates } = action.payload
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, ...updates } : s
        ),
      }
    }
    case 'SET_INVENTORY':
      return { ...state, inventory: action.payload }
    case 'UPDATE_INVENTORY_ITEM': {
      const { itemId, updates } = action.payload
      return {
        ...state,
        inventory: state.inventory.map((i) =>
          i.id === itemId ? { ...i, ...updates, lastUpdated: new Date().toISOString() } : i
        ),
      }
    }
    case 'ADD_INVENTORY_ITEM':
      return { ...state, inventory: [action.payload, ...state.inventory] }
    case 'REMOVE_INVENTORY_ITEM': {
      const itemId = action.payload
      return { ...state, inventory: state.inventory.filter((i) => i.id !== itemId) }
    }
    case 'ADD_INVENTORY_MOVEMENT':
      return { ...state, inventoryMovements: [action.payload, ...state.inventoryMovements] }
    case 'SET_EQUIPMENT':
      return { ...state, equipment: action.payload }
    case 'ADD_EQUIPMENT':
      return { ...state, equipment: [action.payload, ...state.equipment] }
    case 'UPDATE_EQUIPMENT_ITEM': {
      const { equipmentId, updates } = action.payload
      return {
        ...state,
        equipment: state.equipment.map((e) =>
          e.id === equipmentId ? { ...e, ...updates } : e
        ),
      }
    }
    case 'REMOVE_EQUIPMENT': {
      const equipmentId = action.payload
      return { ...state, equipment: state.equipment.filter((e) => e.id !== equipmentId) }
    }
    case 'ADD_FAULT':
      return { ...state, faults: [action.payload, ...state.faults] }
    case 'UPDATE_FAULT': {
      const { faultId, updates } = action.payload
      return {
        ...state,
        faults: state.faults.map((f) =>
          f.id === faultId ? { ...f, ...updates } : f
        ),
      }
    }
    case 'ADD_MAINTENANCE_PLAN':
      return { ...state, maintenancePlans: [action.payload, ...state.maintenancePlans] }
    case 'UPDATE_MAINTENANCE_PLAN': {
      const { planId, updates } = action.payload
      return {
        ...state,
        maintenancePlans: state.maintenancePlans.map((p) =>
          p.id === planId ? { ...p, ...updates } : p
        ),
      }
    }
    case 'ADD_ZONE':
      return { ...state, zones: [...state.zones, action.payload] }
    case 'REMOVE_ZONE': {
      const zoneId = action.payload
      if ((zoneId || '').toString().toLowerCase() === 'inventory') return state
      const nextBatches = { ...state.batchesByZone }
      delete nextBatches[zoneId]
      return {
        ...state,
        zones: state.zones.filter((z) => z.id !== zoneId),
        batchesByZone: nextBatches,
      }
    }
    case 'SET_BATCHES_BY_ZONE':
      return { ...state, batchesByZone: action.payload }
    case 'SET_DEFAULT_BATCH': {
      const { zoneId, batchId } = action.payload
      const next = { ...state.defaultBatchByZone, [zoneId]: batchId }
      return { ...state, defaultBatchByZone: next }
    }
    case 'SET_WORKERS':
      return { ...state, workers: withoutTechnicians(Array.isArray(action.payload) ? action.payload : state.workers) }
    case 'UPDATE_WORKER': {
      const { workerId, updates } = action.payload
      return {
        ...state,
        workers: state.workers.map((w) =>
          w.id === workerId ? { ...w, ...updates } : w
        ),
      }
    }
    case 'RESET_TO_SEED':
      return getInitialState()
    case 'HYDRATE': {
      const payload = action.payload || {}
      const merged = { ...state, hydrateDone: true }
      for (const key of Object.keys(payload)) {
        const val = payload[key]
        if (Array.isArray(val)) {
          const arr = val.length > 0 ? val : (state[key] ?? [])
          merged[key] = key === 'workers' ? normalizeWorkersList(arr) : arr
        } else if (val != null && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 0) {
          merged[key] = val
        }
      }
      return merged
    }
    case 'HYDRATE_DONE':
      return { ...state, hydrateDone: true }
    default:
      return state
  }
}

const AppStoreContext = createContext(null)

export function AppStoreProvider({ children }) {
  const [state, dispatch] = useReducer(storeReducer, undefined, getInitialState)
  const supabaseHydrateDone = useRef(false)

  // Hydrate from Supabase once on mount (if configured). Skip when user just did "Clear all data" so they get empty state.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      supabaseHydrateDone.current = true
      dispatch({ type: 'HYDRATE_DONE' })
      return
    }
    try {
      if (sessionStorage.getItem(SKIP_HYDRATE_KEY)) {
        sessionStorage.removeItem(SKIP_HYDRATE_KEY)
        supabaseHydrateDone.current = true
        dispatch({ type: 'HYDRATE_DONE' })
        return
      }
    } catch (_) {}
    let cancelled = false
    fetchSupabaseState().then((payload) => {
      supabaseHydrateDone.current = true
      if (cancelled) {
        dispatch({ type: 'HYDRATE_DONE' })
        return
      }
      const hasAny = payload && Object.values(payload).some((v) => Array.isArray(v) ? v.length > 0 : typeof v === 'object' && v !== null && Object.keys(v).length > 0)
      if (hasAny) dispatch({ type: 'HYDRATE', payload })
      else dispatch({ type: 'HYDRATE_DONE' })
    }).catch(() => {
      supabaseHydrateDone.current = true
      dispatch({ type: 'HYDRATE_DONE' })
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!supabaseHydrateDone.current && isSupabaseConfigured) return
    if (isSupabaseConfigured) {
      persistTable('records', state.records)
    } else {
      try { localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(state.records)) } catch (_) {}
    }
  }, [state.records, state.hydrateDone])

  useEffect(() => {
    if (!supabaseHydrateDone.current && isSupabaseConfigured) return
    if (isSupabaseConfigured) persistTable('sessions', state.sessions)
    else try { localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(state.sessions)) } catch (_) {}
  }, [state.sessions, state.hydrateDone])

  useEffect(() => {
    if (!supabaseHydrateDone.current && isSupabaseConfigured) return
    if (isSupabaseConfigured) persistTable('zones', state.zones)
    else try { localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(state.zones)) } catch (_) {}
  }, [state.zones, state.hydrateDone])

  useEffect(() => {
    if (!supabaseHydrateDone.current && isSupabaseConfigured) return
    if (isSupabaseConfigured) persistTable('tasks', state.tasks)
    else try { localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(state.tasks)) } catch (_) {}
  }, [state.tasks, state.hydrateDone])

  useEffect(() => {
    if (!supabaseHydrateDone.current && isSupabaseConfigured) return
    if (isSupabaseConfigured) {
      persistSetting(BATCHES_BY_ZONE_STORAGE_KEY, state.batchesByZone)
    } else {
      try { localStorage.setItem(BATCHES_BY_ZONE_STORAGE_KEY, JSON.stringify(state.batchesByZone)) } catch (_) {}
    }
  }, [state.batchesByZone, state.hydrateDone])

  useEffect(() => {
    if (!supabaseHydrateDone.current && isSupabaseConfigured) return
    if (isSupabaseConfigured) {
      persistSetting(DEFAULT_BATCH_BY_ZONE_STORAGE_KEY, state.defaultBatchByZone)
    } else {
      try { localStorage.setItem(DEFAULT_BATCH_BY_ZONE_STORAGE_KEY, JSON.stringify(state.defaultBatchByZone)) } catch (_) {}
    }
  }, [state.defaultBatchByZone, state.hydrateDone])

  useEffect(() => {
    if (!supabaseHydrateDone.current && isSupabaseConfigured) return
    if (isSupabaseConfigured) persistTable('workers', state.workers)
    try { localStorage.setItem(WORKERS_STORAGE_KEY, JSON.stringify(state.workers)) } catch (_) {}
  }, [state.workers, state.hydrateDone])

  useEffect(() => {
    if (!supabaseHydrateDone.current && isSupabaseConfigured) return
    if (isSupabaseConfigured) persistTable('inventory', state.inventory)
    else try { localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(state.inventory)) } catch (_) {}
  }, [state.inventory, state.hydrateDone])

  useEffect(() => {
    if (!supabaseHydrateDone.current && isSupabaseConfigured) return
    if (isSupabaseConfigured) persistTable('inventory_movements', state.inventoryMovements)
    else try { localStorage.setItem(INVENTORY_MOVEMENTS_STORAGE_KEY, JSON.stringify(state.inventoryMovements)) } catch (_) {}
  }, [state.inventoryMovements, state.hydrateDone])

  useEffect(() => {
    if (!supabaseHydrateDone.current && isSupabaseConfigured) return
    if (isSupabaseConfigured) persistTable('equipment', state.equipment)
    else try { localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(state.equipment)) } catch (_) {}
  }, [state.equipment, state.hydrateDone])

  useEffect(() => {
    if (!supabaseHydrateDone.current && isSupabaseConfigured) return
    if (isSupabaseConfigured) persistTable('faults', state.faults)
    else try { localStorage.setItem(FAULTS_STORAGE_KEY, JSON.stringify(state.faults)) } catch (_) {}
  }, [state.faults, state.hydrateDone])

  useEffect(() => {
    if (!supabaseHydrateDone.current && isSupabaseConfigured) return
    if (isSupabaseConfigured) persistTable('maintenance_plans', state.maintenancePlans)
    else try { localStorage.setItem(MAINTENANCE_PLANS_STORAGE_KEY, JSON.stringify(state.maintenancePlans)) } catch (_) {}
  }, [state.maintenancePlans, state.hydrateDone])

  const addTask = useCallback((task) => dispatch({ type: 'ADD_TASK', payload: task }), [])
  const updateTaskStatus = useCallback((taskId, status) =>
    dispatch({ type: 'UPDATE_TASK_STATUS', payload: { taskId, status } }), [])
  const updateTask = useCallback((taskId, updates) =>
    dispatch({ type: 'UPDATE_TASK', payload: { taskId, updates } }), [])

  const addRecord = useCallback((record) => dispatch({ type: 'ADD_RECORD', payload: record }), [])
  const updateRecord = useCallback((recordId, updates) =>
    dispatch({ type: 'UPDATE_RECORD', payload: { recordId, updates } }), [])
  const removeRecord = useCallback((recordId) => dispatch({ type: 'REMOVE_RECORD', payload: recordId }), [])
  const addSession = useCallback((session) => dispatch({ type: 'ADD_SESSION', payload: session }), [])
  const removeSession = useCallback((sessionId) => dispatch({ type: 'REMOVE_SESSION', payload: sessionId }), [])
  const updateSession = useCallback((sessionId, updates) =>
    dispatch({ type: 'UPDATE_SESSION', payload: { sessionId, updates } }), [])

  const setInventory = useCallback((items) => dispatch({ type: 'SET_INVENTORY', payload: items }), [])
  const updateInventoryItem = useCallback((itemId, updates) =>
    dispatch({ type: 'UPDATE_INVENTORY_ITEM', payload: { itemId, updates } }), [])
  const addInventoryItem = useCallback((item) => dispatch({ type: 'ADD_INVENTORY_ITEM', payload: item }), [])
  const removeInventoryItem = useCallback((itemId) => dispatch({ type: 'REMOVE_INVENTORY_ITEM', payload: itemId }), [])
  const addInventoryMovement = useCallback((movement) =>
    dispatch({ type: 'ADD_INVENTORY_MOVEMENT', payload: movement }), [])

  const updateEquipmentItem = useCallback((equipmentId, updates) =>
    dispatch({ type: 'UPDATE_EQUIPMENT_ITEM', payload: { equipmentId, updates } }), [])
  const addEquipmentItem = useCallback((item) => dispatch({ type: 'ADD_EQUIPMENT', payload: item }), [])
  const removeEquipmentItem = useCallback((equipmentId) => dispatch({ type: 'REMOVE_EQUIPMENT', payload: equipmentId }), [])

  const addFault = useCallback((fault) => dispatch({ type: 'ADD_FAULT', payload: fault }), [])
  const updateFault = useCallback((faultId, updates) =>
    dispatch({ type: 'UPDATE_FAULT', payload: { faultId, updates } }), [])
  const addMaintenancePlan = useCallback((plan) => dispatch({ type: 'ADD_MAINTENANCE_PLAN', payload: plan }), [])
  const updateMaintenancePlan = useCallback((planId, updates) =>
    dispatch({ type: 'UPDATE_MAINTENANCE_PLAN', payload: { planId, updates } }), [])
  const addZone = useCallback((zone) => dispatch({ type: 'ADD_ZONE', payload: zone }), [])
  const removeZone = useCallback((zoneId) => dispatch({ type: 'REMOVE_ZONE', payload: zoneId }), [])
  const setBatchesByZone = useCallback((payload) => dispatch({ type: 'SET_BATCHES_BY_ZONE', payload }), [])
  const setDefaultBatch = useCallback((zoneId, batchId) =>
    dispatch({ type: 'SET_DEFAULT_BATCH', payload: { zoneId, batchId } }), [])
  const setWorkers = useCallback((payload) => dispatch({ type: 'SET_WORKERS', payload }), [])
  const updateWorker = useCallback((workerId, updates) =>
    dispatch({ type: 'UPDATE_WORKER', payload: { workerId, updates } }), [])

  const resetToSeed = useCallback(() => {
    clearAllSarmsDataStorage()
    dispatch({ type: 'RESET_TO_SEED' })
  }, [])

  const value = {
    ...state,
    addTask,
    updateTaskStatus,
    updateTask,
    addRecord,
    updateRecord,
    removeRecord,
    addSession,
    removeSession,
    updateSession,
    setInventory,
    updateInventoryItem,
    addInventoryItem,
    removeInventoryItem,
    addInventoryMovement,
    updateEquipmentItem,
    addEquipmentItem,
    removeEquipmentItem,
    addFault,
    updateFault,
    addMaintenancePlan,
    updateMaintenancePlan,
    addZone,
    removeZone,
    setBatchesByZone,
    setDefaultBatch,
    setWorkers,
    updateWorker,
    resetToSeed,
  }

  return (
    <AppStoreContext.Provider value={value}>
      {children}
    </AppStoreContext.Provider>
  )
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext)
  if (!ctx) throw new Error('useAppStore must be used within AppStoreProvider')
  return ctx
}

/** Resolve login userId (e.g. w1) to worker id for task assignment. Checks stored workers then minimal/seed. */
export function getWorkerIdFromUserId(userId) {
  const key = userId?.trim()?.toLowerCase()
  if (!key) return null
  try {
    const raw = localStorage.getItem(WORKERS_STORAGE_KEY)
    if (raw) {
      const list = JSON.parse(raw)
      if (Array.isArray(list)) {
        const w = list.find((x) => (x.employeeId || '').toLowerCase() === key)
        if (w) return w.id
      }
    }
  } catch (_) {}
  const minimal = getMinimalWorkers()
  const w = minimal.find((x) => (x.employeeId || '').toLowerCase() === key)
  if (w) return w.id
  const fallback = SEED_WORKERS.find((x) => (x.employeeId || '').toLowerCase() === key)
  return fallback?.id ?? null
}

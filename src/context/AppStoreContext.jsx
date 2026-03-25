import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react'
import { getInitialZones } from '../data/workerFlow'
import { TASK_STATUS, getInitialTasks, getInitialRecords } from '../data/assignTask'
import { SEED_WORKERS, getMinimalWorkers } from '../data/engineerWorkers'
import { getInitialInventory, getInitialEquipment, INVENTORY_MOVEMENT_REASON } from '../data/inventory'
import {
  getInitialFaults,
  getInitialMaintenancePlans,
  FAULT_STATUS_RESOLVED,
  FAULT_TYPE_PREVENTIVE_ALERT,
} from '../data/faults'
import { getInitialSessions } from '../data/monitorActive'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { EQUIPMENT_MIRROR_ACTIVE_KEY } from '../lib/supabaseEquipmentAdapter'
import {
  fetchSupabaseState,
  persistAllSupabase,
  fetchWorkersAppShaped,
  fetchZonesAndSettingsAppShaped,
} from '../lib/supabaseSchema'
import { USE_SUPABASE, USE_SUPABASE_ACTIVE } from '../config/dataBackend'
import { setPowerBiEmbedUrlCache } from '../config/powerBi'
import { fetchTasksAppShaped, persistTask, replaceAllTasks } from '../lib/supabaseTasksAdapter'
import {
  fetchSessionsAppShaped,
  persistSession,
  deleteSessionFromSupabase,
  replaceAllSessions,
} from '../lib/supabaseSessionsAdapter'
import {
  fetchOperationsLogRecords,
  approveTaskCompleteViaRpc,
  insertOperationsLogRecord,
} from '../lib/supabaseOperationsLogAdapter'
import {
  fetchHarvestLogRecordsAppShaped,
  mergeOperationsRecordsWithHarvest,
} from '../lib/supabaseHarvestAdapter'
import {
  fetchInventoryAppShaped,
  fetchInventoryMovementsAppShaped,
  mirrorUpsertInventoryItem,
  mirrorInsertInventoryMovement,
  mirrorDeleteInventoryItem,
} from '../lib/supabaseInventoryAdapter'
import {
  mirrorUpsertEquipmentItem,
  mirrorDeleteEquipmentItem,
} from '../lib/supabaseEquipmentAdapter'
import { mirrorUpsertFaultTicket, mirrorUpsertMaintenanceTicket } from '../lib/supabaseEquipmentTicketsAdapter'
import { mirrorResolveTicketClose } from '../lib/supabaseResolvedTicketsAdapter'
import {
  fetchEquipmentDomainAppShaped,
  equipmentDomainShouldHydrateReadTest,
} from '../lib/supabaseEquipmentDomain'
import { upsertWorker, syncWorkersSnapshot } from '../lib/supabaseWorkersAdapter'

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
const RESOLVED_TICKETS_STORAGE_KEY = 'sarms-resolved-tickets'

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
  RESOLVED_TICKETS_STORAGE_KEY,
  EQUIPMENT_MIRROR_ACTIVE_KEY,
]
const WORKER_SESSION_PREFIX = 'sarms-worker-session-'

const SKIP_HYDRATE_KEY = 'sarms-skip-hydrate'
const ROLE_KEY = 'sarms-user-role'
const USER_ID_KEY = 'sarms-user-id'
const POLLING_INTERVAL_MS = 15000

function hasActiveSessionAuth() {
  if (typeof window === 'undefined') return false
  try {
    const userId = sessionStorage.getItem(USER_ID_KEY)?.trim()
    const role = sessionStorage.getItem(ROLE_KEY)?.trim()
    return Boolean(userId && role)
  } catch (_) {
    return false
  }
}

/**
 * Critical for clean-workflow testing:
 * Do NOT automatically fetch/refresh/persist Supabase state on app load.
 * Enable only when explicitly requested (future toggle).
 */
const SUPABASE_AUTO_SYNC_ENABLED = false

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
    // Key present (including "[]") = trust storage; missing = first run → demo seed
    if (raw != null && raw !== '') {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        console.info('[SARMS][load] records from localStorage:', RECORDS_STORAGE_KEY, 'count=', parsed.length)
        return parsed
      }
    }
  } catch (_) {}
  return getInitialRecords()
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY)
    if (raw != null && raw !== '') {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        console.info('[SARMS][load] sessions from localStorage:', SESSIONS_STORAGE_KEY, 'count=', parsed.length)
        return parsed
      }
    }
  } catch (_) {}
  return getInitialSessions()
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
    if (raw != null && raw !== '') {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        console.info('[SARMS][load] tasks from localStorage:', TASKS_STORAGE_KEY, 'count=', parsed.length)
        return parsed
      }
    }
  } catch (_) {}
  return getInitialTasks()
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

/**
 * Normalize workers from storage. Never wipe the list for multi-engineer/admin —
 * that used to replace everyone with 3 default accounts and made new users "disappear".
 */
function normalizeWorkersList(workers) {
  if (!Array.isArray(workers)) return USE_SUPABASE ? [] : getMinimalWorkers()
  const filtered = withoutTechnicians(workers)
  if (USE_SUPABASE) return filtered
  if (filtered.length === 0) return getMinimalWorkers()
  return filtered
}

function loadWorkers() {
  try {
    const raw = localStorage.getItem(WORKERS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.info('[SARMS][load] workers from localStorage:', WORKERS_STORAGE_KEY, 'count=', parsed.length)
        return normalizeWorkersList(parsed)
      }
    }
  } catch (_) {}
  console.info('[SARMS][load] workers default minimal seed (localStorage empty or invalid)')
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

function loadResolvedTickets() {
  try {
    const raw = localStorage.getItem(RESOLVED_TICKETS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (_) {}
  return []
}

/** Full dummy/seed state for "Reset to seed" – tasks, inventory, equipment, faults, sessions, records, workers, zones, batches. */
function getSeedState() {
  const zones = getInitialZones()
  const batchesByZone = {}
  const defaultBatchByZone = {}
  zones.forEach((z) => {
    batchesByZone[z.id] = [{ id: '1', name: 'Batch 1' }]
    defaultBatchByZone[z.id] = '1'
  })
  return {
    tasks: getInitialTasks(),
    records: getInitialRecords(),
    sessions: getInitialSessions(),
    zones,
    batchesByZone,
    defaultBatchByZone,
    workers: SEED_WORKERS.map((w) => ({ ...w, skills: Array.isArray(w.skills) ? w.skills : [] })),
    inventory: getInitialInventory(),
    inventoryMovements: [],
    equipment: getInitialEquipment(),
    faults: getInitialFaults(),
    maintenancePlans: getInitialMaintenancePlans(),
    resolvedTickets: [],
    hydrateDone: true,
    dataStatus: 'ready',
    dataError: null,
  }
}

/** Build full initial state (used on every provider mount so persisted data is never lost on remount/HMR). */
function findTaskInList(tasks, taskId) {
  const idOrCode = String(taskId ?? '').trim()
  return (tasks || []).find(
    (t) => (t.id && String(t.id) === idOrCode) || (t.code && String(t.code) === idOrCode)
  )
}

function findSessionInList(sessions, sessionId) {
  const key = String(sessionId ?? '').trim()
  return (sessions || []).find((s) => s.id != null && String(s.id) === key)
}

function getInitialState() {
  if (USE_SUPABASE) {
    const misconfigured = !isSupabaseConfigured
    return {
      tasks: [],
      records: [],
      sessions: [],
      zones: [],
      batchesByZone: {},
      defaultBatchByZone: {},
      workers: [],
      inventory: [],
      inventoryMovements: [],
      equipment: [],
      faults: [],
      maintenancePlans: [],
      resolvedTickets: [],
      hydrateDone: false,
      dataStatus: misconfigured ? 'error' : 'loading',
      dataError: misconfigured
        ? 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — cannot load data.'
        : null,
    }
  }
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
    resolvedTickets: loadResolvedTickets(),
    hydrateDone: false,
    dataStatus: 'ready',
    dataError: null,
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
      const idOrCode = String(taskId ?? '').trim()
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          (t.id && String(t.id) === idOrCode) || (t.code && String(t.code) === idOrCode) ? { ...t, status } : t
        ),
      }
    }
    case 'UPDATE_TASK': {
      const { taskId, updates } = action.payload
      const idOrCode = String(taskId ?? '').trim()
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          (t.id && String(t.id) === idOrCode) || (t.code && String(t.code) === idOrCode) ? { ...t, ...updates } : t
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
    case 'ADD_RESOLVED_TICKET':
      return { ...state, resolvedTickets: [action.payload, ...(state.resolvedTickets || [])] }
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
      return action.payload ? { ...action.payload, hydrateDone: true } : getInitialState()
    case 'HYDRATE': {
      const payload = action.payload || {}
      const merged = { ...state, hydrateDone: true }
      for (const key of Object.keys(payload)) {
        const val = payload[key]
        if (Array.isArray(val)) {
          // Authoritative server arrays (including empty) — no "keep stale when empty" merge.
          merged[key] = key === 'workers' ? normalizeWorkersList(val) : val
        } else if (val != null && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 0) {
          merged[key] = val
        }
      }
      return merged
    }
    case 'HYDRATE_DONE': {
      const p = action.payload || {}
      return {
        ...state,
        hydrateDone: true,
        ...(p.dataStatus !== undefined ? { dataStatus: p.dataStatus } : {}),
        ...(p.dataError !== undefined ? { dataError: p.dataError } : {}),
      }
    }
    default:
      return state
  }
}

const AppStoreContext = createContext(null)

export function AppStoreProvider({ children }) {
  const [state, dispatch] = useReducer(storeReducer, undefined, getInitialState)
  const supabaseHydrateDone = useRef(false)
  const stateRef = useRef(state)
  const pollingIntervalRef = useRef(null)
  const pollingInFlightRef = useRef(false)
  // Phase 3: keep the exact record snapshot from `addRecord` so `removeSession`
  // can execute the engineer approval RPC inside a single transaction.
  const pendingOpsLogRecordRef = useRef(null) // record created by engineer approval
  const pendingEngineerCompletionRef = useRef(null) // { taskId, record }
  /** After addInventoryMovement, skip duplicate qty movement in updateInventoryItem (modal path). */
  const inventoryMirrorSkipQtyMovementRef = useRef(null)
  stateRef.current = state

  const refreshSupabaseCoreState = useCallback(async () => {
    if (!USE_SUPABASE_ACTIVE) return
    try {
      console.log('[Polling] fetching latest data...')
      const [
        tasks,
        sessions,
        opsRecords,
        zonesSettings,
        workersRefresh,
        inventoryApp,
        movementsApp,
        equipmentDomain,
      ] = await Promise.all([
        fetchTasksAppShaped(),
        fetchSessionsAppShaped(),
        fetchOperationsLogRecords(),
        fetchZonesAndSettingsAppShaped(),
        fetchWorkersAppShaped(),
        fetchInventoryAppShaped(),
        fetchInventoryMovementsAppShaped(),
        fetchEquipmentDomainAppShaped(),
      ])
      if (
        tasks == null ||
        sessions == null ||
        opsRecords == null ||
        zonesSettings == null ||
        workersRefresh == null ||
        inventoryApp == null ||
        movementsApp == null ||
        equipmentDomain == null
      ) {
        console.error('[SARMS][Supabase] error', 'refreshSupabaseCoreState', 'one or more fetches returned null')
        return
      }
      setPowerBiEmbedUrlCache(zonesSettings?.powerBiUrl || '')
      let harvestApp = []
      try {
        harvestApp = await fetchHarvestLogRecordsAppShaped()
      } catch (e) {
        console.warn('[SARMS][harvest] fetchHarvestLogRecordsAppShaped failed', e?.message ?? e)
      }
      const records = mergeOperationsRecordsWithHarvest(opsRecords, harvestApp)
      const payload = {
        tasks,
        sessions,
        records,
        workers: workersRefresh,
        zones: zonesSettings.zones,
        batchesByZone: zonesSettings.batchesByZone,
        defaultBatchByZone: zonesSettings.defaultBatchByZone,
        inventory: inventoryApp,
        inventoryMovements: movementsApp,
        equipment: equipmentDomain.equipment,
        faults: equipmentDomain.faults,
        maintenancePlans: equipmentDomain.maintenancePlans,
        resolvedTickets: equipmentDomain.resolvedTickets,
      }
      dispatch({ type: 'HYDRATE', payload })
      console.log('[Polling] updated successfully')
    } catch (e) {
      console.error('[Polling] error', e)
      console.error('[SARMS][Supabase] error', 'refreshSupabaseCoreState', e)
    }
  }, [])

  /** Supabase-only bootstrap: no localStorage fallback; failure → error state. */
  useEffect(() => {
    if (!USE_SUPABASE || !isSupabaseConfigured) return
    let cancelled = false
    ;(async () => {
      try {
        console.info('[SARMS][supabase] bootstrap: fetching all domains from Supabase…')
        const [
          tasks,
          sessions,
          opsRecords,
          zonesSettings,
          workersFromDb,
          inventoryApp,
          movementsApp,
          equipmentDomain,
        ] = await Promise.all([
          fetchTasksAppShaped(),
          fetchSessionsAppShaped(),
          fetchOperationsLogRecords(),
          fetchZonesAndSettingsAppShaped(),
          fetchWorkersAppShaped(),
          fetchInventoryAppShaped(),
          fetchInventoryMovementsAppShaped(),
          fetchEquipmentDomainAppShaped(),
        ])
        if (cancelled) return
        if (
          tasks == null ||
          sessions == null ||
          opsRecords == null ||
          zonesSettings == null ||
          workersFromDb == null ||
          inventoryApp == null ||
          movementsApp == null ||
          equipmentDomain == null
        ) {
          console.error('[SARMS][Supabase] error', 'bootstrap', 'critical fetch returned null')
          dispatch({
            type: 'HYDRATE_DONE',
            payload: {
              dataStatus: 'error',
              dataError: 'فشل الاتصال بالخادم، حاول مرة أخرى',
            },
          })
          supabaseHydrateDone.current = true
          return
        }
      setPowerBiEmbedUrlCache(zonesSettings?.powerBiUrl || '')
        let harvestApp = []
        try {
          harvestApp = await fetchHarvestLogRecordsAppShaped()
        } catch (e) {
          console.warn('[SARMS][harvest] fetchHarvestLogRecordsAppShaped failed', e?.message ?? e)
        }
        const records = mergeOperationsRecordsWithHarvest(opsRecords, harvestApp)
        const payload = {
          tasks,
          sessions,
          records,
          workers: workersFromDb,
          zones: zonesSettings.zones,
          batchesByZone: zonesSettings.batchesByZone,
          defaultBatchByZone: zonesSettings.defaultBatchByZone,
          inventory: inventoryApp,
          inventoryMovements: movementsApp,
          equipment: equipmentDomain.equipment,
          faults: equipmentDomain.faults,
          maintenancePlans: equipmentDomain.maintenancePlans,
          resolvedTickets: equipmentDomain.resolvedTickets,
        }
        dispatch({ type: 'HYDRATE', payload })
        dispatch({
          type: 'HYDRATE_DONE',
          payload: { dataStatus: 'ready', dataError: null },
        })
        supabaseHydrateDone.current = true
        console.info('[SARMS][supabase] bootstrap complete')
      } catch (e) {
        console.error('[SARMS][Supabase] error', 'bootstrap', e)
        if (!cancelled) {
          dispatch({
            type: 'HYDRATE_DONE',
            payload: {
              dataStatus: 'error',
              dataError: e?.message ?? String(e),
            },
          })
        }
        supabaseHydrateDone.current = true
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Legacy: full-state Supabase hydrate (disabled unless SUPABASE_AUTO_SYNC_ENABLED).
  useEffect(() => {
    if (USE_SUPABASE) return
    if (!isSupabaseConfigured || !SUPABASE_AUTO_SYNC_ENABLED) {
      if (isSupabaseConfigured && !SUPABASE_AUTO_SYNC_ENABLED) {
        console.info('[SARMS][supabase] auto-sync disabled: skipping hydrate on mount')
      }
      supabaseHydrateDone.current = true
      dispatch({ type: 'HYDRATE_DONE' })
      return
    }
    try {
      if (sessionStorage.getItem(SKIP_HYDRATE_KEY)) {
        sessionStorage.removeItem(SKIP_HYDRATE_KEY)
        console.info('[SARMS][supabase] skip-hydrate flag found: skipping hydrate on mount')
        supabaseHydrateDone.current = true
        dispatch({ type: 'HYDRATE_DONE' })
        return
      }
    } catch (_) {}
    let cancelled = false
    console.info('[SARMS][supabase] hydrating on mount…')
    fetchSupabaseState().then((payload) => {
      supabaseHydrateDone.current = true
      if (cancelled) {
        dispatch({ type: 'HYDRATE_DONE' })
        return
      }
      const hasAny = payload && Object.values(payload).some((v) => Array.isArray(v) ? v.length > 0 : typeof v === 'object' && v !== null && Object.keys(v).length > 0)
      console.info('[SARMS][supabase] hydrate payload:', hasAny ? 'has data' : 'empty')
      if (hasAny) dispatch({ type: 'HYDRATE', payload })
      else dispatch({ type: 'HYDRATE_DONE' })
    }).catch(() => {
      supabaseHydrateDone.current = true
      console.info('[SARMS][supabase] hydrate failed; continuing with local state')
      dispatch({ type: 'HYDRATE_DONE' })
    })
    return () => { cancelled = true }
  }, [])

  // Read-test: localStorage mode — if harvest_log has rows in Supabase, show those instead of local harvest_form (no row-level merge).
  useEffect(() => {
    if (USE_SUPABASE) return
    if (!isSupabaseConfigured || !state.hydrateDone) return
    let cancelled = false
    ;(async () => {
      let harvestApp = []
      try {
        harvestApp = await fetchHarvestLogRecordsAppShaped()
      } catch (e) {
        console.warn('[SARMS][harvest] fetchHarvestLogRecordsAppShaped failed', e?.message ?? e)
        return
      }
      if (cancelled || harvestApp.length === 0) return
      const current = stateRef.current.records || []
      const nonHarvest = current.filter((r) => r.source !== 'harvest_form')
      console.info(
        '[SARMS][harvest] read test: using',
        harvestApp.length,
        'harvest_log row(s) from Supabase (local harvest_form entries omitted when DB has data)'
      )
      dispatch({ type: 'HYDRATE', payload: { records: [...nonHarvest, ...harvestApp] } })
    })()
    return () => {
      cancelled = true
    }
  }, [state.hydrateDone])

  // Central Supabase polling every 15s (whole app). Single interval; do NOT clear on logout
  // (otherwise polling never restarts after re-login — effect deps don't change).
  useEffect(() => {
    if (!USE_SUPABASE_ACTIVE) return
    if (!isSupabaseConfigured || !state.hydrateDone) return
    if (pollingIntervalRef.current) return

    const tick = () => {
      if (!USE_SUPABASE_ACTIVE) return
      if (!hasActiveSessionAuth()) return
      if (pollingInFlightRef.current) return
      pollingInFlightRef.current = true
      void refreshSupabaseCoreState().finally(() => {
        pollingInFlightRef.current = false
      })
    }

    pollingIntervalRef.current = setInterval(tick, POLLING_INTERVAL_MS)
    tick()

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [state.hydrateDone, refreshSupabaseCoreState])

  // Read-test: localStorage mode — if inventory has rows in Supabase, use that + movements (no merge with local inventory).
  useEffect(() => {
    if (USE_SUPABASE) return
    if (!isSupabaseConfigured || !state.hydrateDone) return
    let cancelled = false
    ;(async () => {
      let inv = []
      let mov = []
      try {
        inv = await fetchInventoryAppShaped()
        mov = await fetchInventoryMovementsAppShaped()
      } catch (e) {
        console.warn('[SARMS][inventory] read test fetch failed', e?.message ?? e)
        return
      }
      if (cancelled || !inv || inv.length === 0 || mov == null) return
      console.info(
        '[SARMS][inventory] read test: using Supabase as source —',
        inv.length,
        'items,',
        mov.length,
        'movements (local inventory replaced when DB has data)'
      )
      dispatch({ type: 'HYDRATE', payload: { inventory: inv, inventoryMovements: mov } })
    })()
    return () => {
      cancelled = true
    }
  }, [state.hydrateDone])

  // Read-test (localStorage mode): if equipment domain has rows in Supabase, use that domain (no merge with local).
  useEffect(() => {
    if (USE_SUPABASE) return
    if (!isSupabaseConfigured || !state.hydrateDone) return
    let cancelled = false
    ;(async () => {
      let domain = null
      try {
        domain = await fetchEquipmentDomainAppShaped()
      } catch (e) {
        console.warn('[SARMS][equipment] read test fetch failed', e?.message ?? e)
        return
      }
      if (cancelled || !equipmentDomainShouldHydrateReadTest(domain)) return
      console.info(
        '[SARMS][equipment] read test: using Supabase —',
        domain.equipment?.length ?? 0,
        'equipment,',
        domain.faults?.length ?? 0,
        'faults,',
        domain.maintenancePlans?.length ?? 0,
        'MP,',
        domain.resolvedTickets?.length ?? 0,
        'resolved (local equipment domain replaced when DB has data)'
      )
      dispatch({
        type: 'HYDRATE',
        payload: {
          equipment: domain.equipment,
          faults: domain.faults,
          maintenancePlans: domain.maintenancePlans,
          resolvedTickets: domain.resolvedTickets,
        },
      })
    })()
    return () => {
      cancelled = true
    }
  }, [state.hydrateDone])

  // Auto-refresh from Supabase every 3s (disabled for clean reset workflows; not used for USE_SUPABASE task mode)
  useEffect(() => {
    if (USE_SUPABASE) return
    if (!isSupabaseConfigured || !SUPABASE_AUTO_SYNC_ENABLED || !state.hydrateDone) return
    const interval = setInterval(() => {
      fetchSupabaseState().then((payload) => {
        if (payload && Object.keys(payload).length > 0) {
          dispatch({ type: 'HYDRATE', payload })
        }
      }).catch(() => {})
    }, 3000)
    return () => clearInterval(interval)
  }, [state.hydrateDone])

  // Supabase: single debounced persist of full state (production schema: columns + task_workers + UUIDs)
  useEffect(() => {
    if (USE_SUPABASE) return
    if (!supabaseHydrateDone.current || !isSupabaseConfigured || !SUPABASE_AUTO_SYNC_ENABLED || !state.hydrateDone) return
    const t = setTimeout(() => {
      persistAllSupabase(state)
    }, 600)
    return () => clearTimeout(t)
  }, [
    state.hydrateDone,
    state.workers,
    state.zones,
    state.tasks,
    state.records,
    state.sessions,
    state.batchesByZone,
    state.defaultBatchByZone,
    state.inventory,
    state.inventoryMovements,
    state.equipment,
    state.faults,
    state.maintenancePlans,
    state.resolvedTickets,
  ])

  // Always persist batches/default batch to localStorage in local-only mode.
  useEffect(() => {
    if (USE_SUPABASE) return
    try {
      localStorage.setItem(BATCHES_BY_ZONE_STORAGE_KEY, JSON.stringify(state.batchesByZone))
    } catch (_) {}
  }, [state.batchesByZone, state.hydrateDone])

  useEffect(() => {
    if (USE_SUPABASE) return
    try {
      localStorage.setItem(DEFAULT_BATCH_BY_ZONE_STORAGE_KEY, JSON.stringify(state.defaultBatchByZone))
    } catch (_) {}
  }, [state.defaultBatchByZone, state.hydrateDone])

  // Persist full SARMS state to localStorage (local-only mode only).
  useEffect(() => {
    if (USE_SUPABASE) return
    try {
      localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(state.records))
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(state.sessions))
      localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(state.zones))
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(state.tasks))
      localStorage.setItem(WORKERS_STORAGE_KEY, JSON.stringify(state.workers))
      localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(state.inventory))
      localStorage.setItem(INVENTORY_MOVEMENTS_STORAGE_KEY, JSON.stringify(state.inventoryMovements))
      localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(state.equipment))
      localStorage.setItem(FAULTS_STORAGE_KEY, JSON.stringify(state.faults))
      localStorage.setItem(MAINTENANCE_PLANS_STORAGE_KEY, JSON.stringify(state.maintenancePlans))
      localStorage.setItem(RESOLVED_TICKETS_STORAGE_KEY, JSON.stringify(state.resolvedTickets || []))
    } catch (_) {}
  }, [
    state.records,
    state.sessions,
    state.zones,
    state.tasks,
    state.workers,
    state.inventory,
    state.inventoryMovements,
    state.equipment,
    state.faults,
    state.maintenancePlans,
    state.resolvedTickets,
    state.hydrateDone,
  ])

  const addTask = useCallback((task) => {
    dispatch({ type: 'ADD_TASK', payload: task })
    if (USE_SUPABASE_ACTIVE) {
      const { workers, zones } = stateRef.current
      persistTask(task, workers, zones).catch((e) => console.warn('[SARMS][tasks] persist add', e))
    }
  }, [])

  const updateTaskStatus = useCallback((taskId, status) => {
    dispatch({ type: 'UPDATE_TASK_STATUS', payload: { taskId, status } })
    if (USE_SUPABASE_ACTIVE) {
      if (status === TASK_STATUS.COMPLETED && pendingOpsLogRecordRef.current) {
        pendingEngineerCompletionRef.current = {
          taskId: String(taskId ?? ''),
          record: pendingOpsLogRecordRef.current,
        }
        pendingOpsLogRecordRef.current = null
      }

      const pending = pendingEngineerCompletionRef.current
      if (pending && String(pending.taskId) === String(taskId ?? '')) return

      const prev = findTaskInList(stateRef.current.tasks, taskId)
      if (prev) {
        const merged = { ...prev, status }
        const { workers, zones } = stateRef.current
        persistTask(merged, workers, zones).catch((e) => console.warn('[SARMS][tasks] persist status', e))
      }
    }
  }, [])

  const updateTask = useCallback((taskId, updates) => {
    dispatch({ type: 'UPDATE_TASK', payload: { taskId, updates } })
    if (USE_SUPABASE_ACTIVE) {
      const pending = pendingEngineerCompletionRef.current
      if (pending && String(pending.taskId) === String(taskId ?? '')) return

      const prev = findTaskInList(stateRef.current.tasks, taskId)
      if (prev) {
        const merged = { ...prev, ...updates }
        const { workers, zones } = stateRef.current
        persistTask(merged, workers, zones).catch((e) => console.warn('[SARMS][tasks] persist update', e))
      }
    }
  }, [])

  const addRecord = useCallback((record) => {
    const isProduction = record?.recordType === 'production'
    const isHarvest = record?.source === 'harvest_form'
    const isEngineerApprovalRecord =
      USE_SUPABASE_ACTIVE &&
      isProduction &&
      !isHarvest &&
      record &&
      record.duration != null &&
      record.startTime
    if (USE_SUPABASE_ACTIVE && isProduction && !isHarvest && !isEngineerApprovalRecord) {
      const taskId = record.taskId ?? record.task_id
      const sourceSessionId = record.sourceSessionId ?? record.source_session_id ?? null
      if (!taskId) {
        console.warn('[SARMS][ops] skip local addRecord in Supabase mode: missing taskId for operations_log insert')
        return
      }
      void insertOperationsLogRecord({
        taskId,
        sourceSessionId,
        startTime: record.startTime ?? record.dateTime,
        expectedMinutes: record.expectedMinutes ?? 60,
        record,
        workers: stateRef.current.workers,
      })
        .then(() => refreshSupabaseCoreState())
        .catch((e) => console.warn('[SARMS][ops] direct operations_log insert failed', e?.message ?? e))
      return
    }
    dispatch({ type: 'ADD_RECORD', payload: record })
    // In engineer approval flow, `addRecord` is followed by:
    //   updateTaskStatus(taskId, completed) → updateTask(taskId, { approvedAt, engineerComment }) → removeSession(sessionId)
    // We capture the record snapshot so `removeSession` can execute the RPC inside a single transaction.
    if (isEngineerApprovalRecord) {
      pendingOpsLogRecordRef.current = record
    }
  }, [])
  const updateRecord = useCallback((recordId, updates) =>
    dispatch({ type: 'UPDATE_RECORD', payload: { recordId, updates } }), [])
  const removeRecord = useCallback((recordId) => dispatch({ type: 'REMOVE_RECORD', payload: recordId }), [])
  const addSession = useCallback((session) => {
    dispatch({ type: 'ADD_SESSION', payload: session })
    if (USE_SUPABASE_ACTIVE) {
      const { workers, zones, tasks } = stateRef.current
      persistSession(session, workers, zones, tasks).catch((e) =>
        console.warn('[SARMS][sessions] persist add', e)
      )
    }
  }, [])

  const removeSession = useCallback((sessionId) => {
    const snapshot = (stateRef.current.sessions || []).find((s) => s.id === sessionId)
    const taskId = snapshot?.taskId ?? snapshot?.task_id
    const pending = pendingEngineerCompletionRef.current
    const shouldRpc =
      USE_SUPABASE_ACTIVE &&
      pending &&
      taskId != null &&
      String(pending.taskId) === String(taskId ?? '')

    dispatch({ type: 'REMOVE_SESSION', payload: sessionId })
    if (USE_SUPABASE_ACTIVE) {
      if (shouldRpc) {
        const record = pending?.record
        pendingEngineerCompletionRef.current = null
        approveTaskCompleteViaRpc({
          taskId,
          clientSessionId: sessionId,
          startTime: snapshot?.startTime ?? snapshot?.start_time,
          expectedMinutes: snapshot?.expectedMinutes ?? snapshot?.expected_minutes,
          record,
          workers: stateRef.current.workers,
        })
          .then(() => refreshSupabaseCoreState())
          .catch(() => refreshSupabaseCoreState())
      } else {
        deleteSessionFromSupabase(sessionId).catch((e) => console.warn('[SARMS][sessions] delete', e))
      }
    }
  }, [refreshSupabaseCoreState])

  const updateSession = useCallback((sessionId, updates) => {
    dispatch({ type: 'UPDATE_SESSION', payload: { sessionId, updates } })
    if (USE_SUPABASE_ACTIVE) {
      const prev = findSessionInList(stateRef.current.sessions, sessionId)
      if (prev) {
        const merged = { ...prev, ...updates }
        const { workers, zones, tasks } = stateRef.current
        persistSession(merged, workers, zones, tasks).catch((e) =>
          console.warn('[SARMS][sessions] persist update', e)
        )
      }
    }
  }, [])

  const setInventory = useCallback((items) => dispatch({ type: 'SET_INVENTORY', payload: items }), [])
  const updateInventoryItem = useCallback((itemId, updates) => {
    const prev = stateRef.current.inventory.find((i) => String(i.id) === String(itemId))
    dispatch({ type: 'UPDATE_INVENTORY_ITEM', payload: { itemId, updates } })
    if (!USE_SUPABASE_ACTIVE || !prev) return
    const merged = { ...prev, ...updates, lastUpdated: new Date().toISOString() }
    void mirrorUpsertInventoryItem(merged, stateRef.current.workers).catch((e) =>
      console.warn('[SARMS][inventory] mirror upsert failed', e?.message ?? e)
    )
    const qtyChanged =
      updates.quantity !== undefined && Number(prev.quantity) !== Number(updates.quantity)
    if (qtyChanged) {
      const skip = inventoryMirrorSkipQtyMovementRef.current === String(itemId)
      inventoryMirrorSkipQtyMovementRef.current = null
      if (!skip) {
        void mirrorInsertInventoryMovement(
          {
            itemId,
            old_quantity: prev.quantity,
            new_quantity: Number(updates.quantity),
            reason: INVENTORY_MOVEMENT_REASON.ADJUSTMENT,
            movementType: 'edit',
            created_at: new Date().toISOString(),
            change_amount: Number(updates.quantity) - Number(prev.quantity),
          },
          stateRef.current.workers
        ).catch((e) => console.warn('[SARMS][inventory] mirror qty adjustment movement failed', e?.message ?? e))
      }
    } else if (inventoryMirrorSkipQtyMovementRef.current === String(itemId)) {
      inventoryMirrorSkipQtyMovementRef.current = null
    }
  }, [])
  const addInventoryItem = useCallback((item) => {
    dispatch({ type: 'ADD_INVENTORY_ITEM', payload: item })
    if (!USE_SUPABASE_ACTIVE) return
    void mirrorUpsertInventoryItem(item, stateRef.current.workers).catch((e) =>
      console.warn('[SARMS][inventory] mirror insert item failed', e?.message ?? e)
    )
  }, [])
  const removeInventoryItem = useCallback((itemId) => {
    dispatch({ type: 'REMOVE_INVENTORY_ITEM', payload: itemId })
    if (!USE_SUPABASE_ACTIVE) return
    void mirrorDeleteInventoryItem(itemId, stateRef.current.workers).catch((e) =>
      console.warn('[SARMS][inventory] mirror delete failed', e?.message ?? e)
    )
  }, [])
  const addInventoryMovement = useCallback((movement) => {
    dispatch({ type: 'ADD_INVENTORY_MOVEMENT', payload: movement })
    if (!USE_SUPABASE_ACTIVE) return
    inventoryMirrorSkipQtyMovementRef.current = String(movement.itemId ?? movement.item_id ?? '')
    void mirrorInsertInventoryMovement(movement, stateRef.current.workers).catch((e) =>
      console.warn('[SARMS][inventory] mirror movement failed', e?.message ?? e)
    )
  }, [])

  const updateEquipmentItem = useCallback((equipmentId, updates) => {
    dispatch({ type: 'UPDATE_EQUIPMENT_ITEM', payload: { equipmentId, updates } })
    if (!USE_SUPABASE_ACTIVE) return
    const prev = stateRef.current.equipment.find(
      (e) => String(e.id) === String(equipmentId)
    )
    if (!prev) return
    // Never insert a new equipment row on edit (e.g. ticket flow updates status only).
    void mirrorUpsertEquipmentItem({ ...prev, ...updates }, { allowInsert: false }).catch((e) =>
      console.warn('[SARMS][equipment] mirror update failed', e?.message ?? e)
    )
  }, [])
  const addEquipmentItem = useCallback((item) => {
    dispatch({ type: 'ADD_EQUIPMENT', payload: item })
    if (USE_SUPABASE_ACTIVE) {
      void mirrorUpsertEquipmentItem(item, { allowInsert: true }).catch((e) =>
        console.warn('[SARMS][equipment] mirror add failed', e?.message ?? e)
      )
    }
  }, [])
  const removeEquipmentItem = useCallback((equipmentId) => {
    dispatch({ type: 'REMOVE_EQUIPMENT', payload: equipmentId })
    if (USE_SUPABASE_ACTIVE) {
      void mirrorDeleteEquipmentItem(equipmentId).catch((e) =>
        console.warn('[SARMS][equipment] mirror delete failed', e?.message ?? e)
      )
    }
  }, [])

  const addResolvedTicket = useCallback((ticket) => {
    dispatch({ type: 'ADD_RESOLVED_TICKET', payload: ticket })
    if (USE_SUPABASE_ACTIVE) {
      const source = ticket.faultId != null ? 'fault' : 'maintenance'
      void mirrorResolveTicketClose({
        resolvedPayload: ticket,
        source,
        ticketType: ticket.ticketType,
        workers: stateRef.current.workers,
      }).catch((e) => console.warn('[SARMS][resolved_tickets] mirror failed', e?.message ?? e))
    }
  }, [])
  const addFault = useCallback((fault) => {
    dispatch({ type: 'ADD_FAULT', payload: fault })
    if (USE_SUPABASE_ACTIVE) {
      if (fault.auto_generated || fault.type === FAULT_TYPE_PREVENTIVE_ALERT) return
      mirrorUpsertFaultTicket(fault, stateRef.current.workers)
        .then(() => {
          // Re-sync equipment after the ticket row exists (fixes status when first mirror ran before equipment row existed).
          setTimeout(() => {
            const eq = stateRef.current.equipment.find((e) => String(e.id) === String(fault.equipmentId))
            if (eq) {
              void mirrorUpsertEquipmentItem(eq, { allowInsert: false }).catch((e) =>
                console.warn('[SARMS][equipment] post-fault equipment sync failed', e?.message ?? e)
              )
            }
          }, 0)
        })
        .catch((e) => console.warn('[SARMS][equipment_tickets] mirror add fault failed', e?.message ?? e))
    }
  }, [])
  const updateFault = useCallback((faultId, updates) => {
    dispatch({ type: 'UPDATE_FAULT', payload: { faultId, updates } })
    if (!USE_SUPABASE_ACTIVE) return
    if (updates.status === FAULT_STATUS_RESOLVED) return
    const prev = stateRef.current.faults.find((f) => f.id === faultId)
    if (!prev) return
    const merged = { ...prev, ...updates }
    if (merged.auto_generated || merged.type === FAULT_TYPE_PREVENTIVE_ALERT) return
    void mirrorUpsertFaultTicket(merged, stateRef.current.workers).catch((e) =>
      console.warn('[SARMS][equipment_tickets] mirror update fault failed', e?.message ?? e)
    )
  }, [])
  const addMaintenancePlan = useCallback((plan) => {
    dispatch({ type: 'ADD_MAINTENANCE_PLAN', payload: plan })
    if (USE_SUPABASE_ACTIVE) {
      mirrorUpsertMaintenanceTicket(plan, stateRef.current.workers)
        .then(() => {
          setTimeout(() => {
            const eq = stateRef.current.equipment.find((e) => String(e.id) === String(plan.equipmentId))
            if (eq) {
              void mirrorUpsertEquipmentItem(eq, { allowInsert: false }).catch((e) =>
                console.warn('[SARMS][equipment] post-maintenance-ticket equipment sync failed', e?.message ?? e)
              )
            }
          }, 0)
        })
        .catch((e) => console.warn('[SARMS][equipment_tickets] mirror add MP failed', e?.message ?? e))
    }
  }, [])
  const updateMaintenancePlan = useCallback((planId, updates) => {
    dispatch({ type: 'UPDATE_MAINTENANCE_PLAN', payload: { planId, updates } })
    if (!USE_SUPABASE_ACTIVE) return
    if (updates.status === 'completed') return
    const prev = stateRef.current.maintenancePlans.find((p) => p.id === planId)
    if (!prev) return
    void mirrorUpsertMaintenanceTicket({ ...prev, ...updates }, stateRef.current.workers).catch((e) =>
      console.warn('[SARMS][equipment_tickets] mirror update MP failed', e?.message ?? e)
    )
  }, [])
  const addZone = useCallback((zone) => dispatch({ type: 'ADD_ZONE', payload: zone }), [])
  const removeZone = useCallback((zoneId) => dispatch({ type: 'REMOVE_ZONE', payload: zoneId }), [])
  const setBatchesByZone = useCallback((payload) => dispatch({ type: 'SET_BATCHES_BY_ZONE', payload }), [])
  const setDefaultBatch = useCallback((zoneId, batchId) =>
    dispatch({ type: 'SET_DEFAULT_BATCH', payload: { zoneId, batchId } }), [])
  const setWorkers = useCallback((payload) => {
    const prevWorkers = stateRef.current.workers || []
    dispatch({ type: 'SET_WORKERS', payload })
    if (!USE_SUPABASE_ACTIVE) return
    void syncWorkersSnapshot(payload, prevWorkers).catch((e) =>
      console.warn('[SARMS][workers] sync snapshot failed', e?.message ?? e)
    )
  }, [])
  const updateWorker = useCallback((workerId, updates) => {
    dispatch({ type: 'UPDATE_WORKER', payload: { workerId, updates } })
    if (!USE_SUPABASE_ACTIVE) return
    const prev = (stateRef.current.workers || []).find((w) => String(w.id) === String(workerId))
    if (!prev) return
    void upsertWorker({ ...prev, ...updates }).catch((e) =>
      console.warn('[SARMS][workers] mirror update failed', e?.message ?? e)
    )
  }, [])

  const resetToSeed = useCallback(() => {
    const seed = getSeedState()
    dispatch({ type: 'RESET_TO_SEED', payload: seed })
    if (USE_SUPABASE_ACTIVE) {
      replaceAllTasks(seed.tasks, seed.workers, seed.zones)
        .then(() => replaceAllSessions(seed.sessions, seed.workers, seed.zones, seed.tasks))
        .catch((e) => console.warn('[SARMS][tasks/sessions] reset seed sync', e))
    }
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
    addResolvedTicket,
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

/**
 * Resolve login userId (e.g. w1) to worker id for task assignment.
 * With Supabase: pass `workersList` from App Store (no sarms-workers localStorage).
 */
export function getWorkerIdFromUserId(userId, workersList) {
  const key = userId?.trim()?.toLowerCase()
  if (!key) return null
  let list = workersList
  if (!Array.isArray(list)) {
    if (USE_SUPABASE) return null
    try {
      const raw = localStorage.getItem(WORKERS_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) list = parsed
      }
    } catch (_) {}
  }
  if (!Array.isArray(list)) list = []
  const w = list.find((x) => (x.employeeId || '').toLowerCase() === key)
  if (w) return w.id
  if (USE_SUPABASE) return null
  const minimal = getMinimalWorkers()
  const w2 = minimal.find((x) => (x.employeeId || '').toLowerCase() === key)
  if (w2) return w2.id
  const fallback = SEED_WORKERS.find((x) => (x.employeeId || '').toLowerCase() === key)
  return fallback?.id ?? null
}

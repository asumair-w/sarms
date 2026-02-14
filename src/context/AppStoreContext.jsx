import { createContext, useContext, useReducer, useCallback, useEffect } from 'react'
import { getInitialTasks, getInitialRecords } from '../data/assignTask'
import { getInitialInventory, getInitialEquipment } from '../data/inventory'
import { getInitialFaults, getInitialMaintenancePlans } from '../data/faults'
import { getInitialSessions } from '../data/monitorActive'
import { getInitialZones } from '../data/workerFlow'
import { TASK_STATUS } from '../data/assignTask'
import { SEED_WORKERS } from '../data/engineerWorkers'

const RECORDS_STORAGE_KEY = 'sarms-records'
const SESSIONS_STORAGE_KEY = 'sarms-sessions'
const ZONES_STORAGE_KEY = 'sarms-zones'
const TASKS_STORAGE_KEY = 'sarms-tasks'
const BATCHES_BY_ZONE_STORAGE_KEY = 'sarms-batches-by-zone'
const WORKERS_STORAGE_KEY = 'sarms-workers'

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (_) {}
  return getInitialRecords()
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
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
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (_) {}
  return getInitialTasks()
}

function loadBatchesByZone() {
  try {
    const raw = localStorage.getItem(BATCHES_BY_ZONE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    }
  } catch (_) {}
  return {}
}

function loadWorkers() {
  try {
    const raw = localStorage.getItem(WORKERS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (_) {}
  return SEED_WORKERS.map((w) => ({ ...w, skills: Array.isArray(w.skills) ? w.skills : [] }))
}

const initialState = {
  tasks: loadTasks(),
  records: loadRecords(),
  sessions: loadSessions(),
  zones: loadZones(),
  batchesByZone: loadBatchesByZone(),
  workers: loadWorkers(),
  inventory: getInitialInventory(),
  equipment: getInitialEquipment(),
  faults: getInitialFaults(),
  maintenancePlans: getInitialMaintenancePlans(),
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
    case 'SET_EQUIPMENT':
      return { ...state, equipment: action.payload }
    case 'ADD_FAULT':
      return { ...state, faults: [action.payload, ...state.faults] }
    case 'ADD_MAINTENANCE_PLAN':
      return { ...state, maintenancePlans: [action.payload, ...state.maintenancePlans] }
    case 'ADD_ZONE':
      return { ...state, zones: [...state.zones, action.payload] }
    case 'REMOVE_ZONE': {
      const zoneId = action.payload
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
    case 'SET_WORKERS':
      return { ...state, workers: action.payload }
    case 'UPDATE_WORKER': {
      const { workerId, updates } = action.payload
      return {
        ...state,
        workers: state.workers.map((w) =>
          w.id === workerId ? { ...w, ...updates } : w
        ),
      }
    }
    default:
      return state
  }
}

const AppStoreContext = createContext(null)

export function AppStoreProvider({ children }) {
  const [state, dispatch] = useReducer(storeReducer, initialState)

  useEffect(() => {
    try {
      localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(state.records))
    } catch (_) {}
  }, [state.records])

  useEffect(() => {
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(state.sessions))
    } catch (_) {}
  }, [state.sessions])

  useEffect(() => {
    try {
      localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(state.zones))
    } catch (_) {}
  }, [state.zones])

  useEffect(() => {
    try {
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(state.tasks))
    } catch (_) {}
  }, [state.tasks])

  useEffect(() => {
    try {
      localStorage.setItem(BATCHES_BY_ZONE_STORAGE_KEY, JSON.stringify(state.batchesByZone))
    } catch (_) {}
  }, [state.batchesByZone])

  useEffect(() => {
    try {
      localStorage.setItem(WORKERS_STORAGE_KEY, JSON.stringify(state.workers))
    } catch (_) {}
  }, [state.workers])

  const addTask = useCallback((task) => dispatch({ type: 'ADD_TASK', payload: task }), [])
  const updateTaskStatus = useCallback((taskId, status) =>
    dispatch({ type: 'UPDATE_TASK_STATUS', payload: { taskId, status } }), [])
  const updateTask = useCallback((taskId, updates) =>
    dispatch({ type: 'UPDATE_TASK', payload: { taskId, updates } }), [])

  const addRecord = useCallback((record) => dispatch({ type: 'ADD_RECORD', payload: record }), [])
  const addSession = useCallback((session) => dispatch({ type: 'ADD_SESSION', payload: session }), [])
  const removeSession = useCallback((sessionId) => dispatch({ type: 'REMOVE_SESSION', payload: sessionId }), [])
  const updateSession = useCallback((sessionId, updates) =>
    dispatch({ type: 'UPDATE_SESSION', payload: { sessionId, updates } }), [])

  const setInventory = useCallback((items) => dispatch({ type: 'SET_INVENTORY', payload: items }), [])
  const updateInventoryItem = useCallback((itemId, updates) =>
    dispatch({ type: 'UPDATE_INVENTORY_ITEM', payload: { itemId, updates } }), [])
  const addInventoryItem = useCallback((item) => dispatch({ type: 'ADD_INVENTORY_ITEM', payload: item }), [])

  const addFault = useCallback((fault) => dispatch({ type: 'ADD_FAULT', payload: fault }), [])
  const addMaintenancePlan = useCallback((plan) => dispatch({ type: 'ADD_MAINTENANCE_PLAN', payload: plan }), [])
  const addZone = useCallback((zone) => dispatch({ type: 'ADD_ZONE', payload: zone }), [])
  const removeZone = useCallback((zoneId) => dispatch({ type: 'REMOVE_ZONE', payload: zoneId }), [])
  const setBatchesByZone = useCallback((payload) => dispatch({ type: 'SET_BATCHES_BY_ZONE', payload }), [])
  const setWorkers = useCallback((payload) => dispatch({ type: 'SET_WORKERS', payload }), [])
  const updateWorker = useCallback((workerId, updates) =>
    dispatch({ type: 'UPDATE_WORKER', payload: { workerId, updates } }), [])

  const value = {
    ...state,
    addTask,
    updateTaskStatus,
    updateTask,
    addRecord,
    addSession,
    removeSession,
    updateSession,
    setInventory,
    updateInventoryItem,
    addInventoryItem,
    addFault,
    addMaintenancePlan,
    addZone,
    removeZone,
    setBatchesByZone,
    setWorkers,
    updateWorker,
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

/** Resolve login userId (e.g. w1) to worker id (e.g. 1) for task assignment. */
export function getWorkerIdFromUserId(userId) {
  const w = SEED_WORKERS.find((x) => x.employeeId === userId?.trim()?.toLowerCase())
  return w?.id ?? null
}

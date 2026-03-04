import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  TASK_TYPES,
  TASK_STATUS,
  TASK_STATUS_LABELS,
  PRIORITY_OPTIONS,
  GRID_ROWS,
  GRID_COLS,
  OVERVIEW_LEFT_ROWS,
  OVERVIEW_RIGHT_ROWS,
  generateTaskId,
} from '../../data/assignTask'
import { getTasksForDepartment, getTaskById, getDepartment } from '../../data/workerFlow'
import { SEED_WORKERS, DEPARTMENT_OPTIONS } from '../../data/engineerWorkers'
import { useAppStore } from '../../context/AppStoreContext'
import { useLanguage } from '../../context/LanguageContext'
import { getTranslation } from '../../i18n/translations'
import { nextBatchNumber } from '../../utils/idGenerators'
import styles from './AssignTask.module.css'

const ASSIGN_TASK_SELECTION_KEY = 'sarms-assign-task-selection'
const WORKERS = SEED_WORKERS.filter((w) => w.role === 'worker')
/** Workers and technicians (and engineers) who can be assigned to a task. */
const ASSIGNABLE = SEED_WORKERS.filter(
  (w) => w.role === 'worker' || w.role === 'technician' || w.role === 'engineer'
)
const TASK_TYPE_LABEL = Object.fromEntries(TASK_TYPES.map((t) => [t.id, t.label]))

function taskLabelByLang(task, lang) {
  if (!task) return ''
  return lang === 'ar' ? (task.labelAr ?? task.labelEn) : (task.labelEn ?? task.labelAr)
}
const PRIORITY_LABEL = Object.fromEntries(PRIORITY_OPTIONS.map((p) => [p.id, p.label]))

/** Normalize batch list to array of { id, name }. Supports legacy string[] from store. */
function normalizeBatchList(arr) {
  if (!arr || !Array.isArray(arr)) return [{ id: '1', name: 'Batch 1' }]
  if (arr.length === 0) return [{ id: '1', name: 'Batch 1' }]
  const first = arr[0]
  if (typeof first === 'string') return arr.map((s) => ({ id: s, name: `Batch ${s}` }))
  return arr.map((b) => ({ id: b.id ?? b, name: b.name ?? `Batch ${b.id ?? b}` }))
}

/** Normalize task status for consistent counts (handles approved, casing, etc.). */
function normalizeTaskStatus(status) {
  if (!status) return null
  const s = String(status).toLowerCase()
  if (s === TASK_STATUS.PENDING_APPROVAL || s === 'approved') return TASK_STATUS.PENDING_APPROVAL
  if (s === TASK_STATUS.IN_PROGRESS) return TASK_STATUS.IN_PROGRESS
  if (s === TASK_STATUS.COMPLETED) return TASK_STATUS.COMPLETED
  if (s === TASK_STATUS.REJECTED) return TASK_STATUS.REJECTED
  return null
}

/* مسار العمليات: Pending → In Progress → Completed (بدون Approved) */
const OPERATION_PATH_STEPS = [
  { id: TASK_STATUS.PENDING_APPROVAL, label: 'Pending', color: '#8b95a0' },
  { id: TASK_STATUS.IN_PROGRESS, label: 'In Progress', color: '#b89a4a' },
  { id: TASK_STATUS.COMPLETED, label: 'Completed', color: '#5c7b5c' },
]

function workerNames(workerIds) {
  return (workerIds || [])
    .map((id) => ASSIGNABLE.find((w) => w.id === id)?.fullName ?? id)
    .join(', ')
}

/** Parse linesArea (e.g. "1–20", "5-10", "21–25") to [from, to] or null. */
function parseLinesRange(linesArea) {
  if (!linesArea || typeof linesArea !== 'string') return null
  const s = linesArea.trim().replace(/\s+/g, ' ')
  const parts = s.split(/[–\-]/).map((p) => parseInt(p.trim(), 10))
  if (parts.length < 2 || parts.some(Number.isNaN)) return null
  const from = Math.max(1, Math.min(40, parts[0]))
  const to = Math.max(1, Math.min(40, parts[1]))
  if (from > to) return null
  return [from, to]
}

/** Status priority for overview (higher = show this when multiple tasks cover same row). */
function overviewStatusPriority(status) {
  if (status === TASK_STATUS.IN_PROGRESS) return 2
  if (status === TASK_STATUS.PENDING_APPROVAL || status === 'approved') return 1
  if (status === TASK_STATUS.COMPLETED) return 0
  return -1
}

export default function AssignTask() {
  const navigate = useNavigate()
  const location = useLocation()
  const { lang } = useLanguage()
  const t = (key) => getTranslation(lang, 'engineer', key)
  const { tasks, zones = [], addTask, updateTaskStatus, updateTask, addSession, addZone, removeZone, batchesByZone: storeBatchesByZone = {}, setBatchesByZone, defaultBatchByZone = {}, setDefaultBatch } = useAppStore()

  const ZONE_LABEL = useMemo(() => Object.fromEntries((zones || []).map((z) => [z.id, z.label])), [zones])
  /** Zone display label: use store label, or fallback to "Zone A" / "Inventory" for known ids */
  const getZoneDisplayLabel = useCallback(
    (zoneId) => {
      if (ZONE_LABEL[zoneId]) return ZONE_LABEL[zoneId]
      if (!zoneId) return '—'
      if (zoneId === 'inventory') return 'Inventory'
      if (String(zoneId).length <= 2) return `Zone ${String(zoneId).toUpperCase()}`
      return zoneId
    },
    [ZONE_LABEL]
  )
  const [selectedZone, setSelectedZone] = useState('a')
  const [selectedBatch, setSelectedBatch] = useState('1')
  const batchesByZone = storeBatchesByZone
  const [greenhouseExpanded, setGreenhouseExpanded] = useState(false)
  const [kpiFilter, setKpiFilter] = useState(null) // status or 'zones'
  const [assignOpen, setAssignOpen] = useState(false)
  const [addZoneOpen, setAddZoneOpen] = useState(false)
  const [newZoneName, setNewZoneName] = useState('')
  const [assignForm, setAssignForm] = useState({
    departmentId: 'farming',
    taskId: 'irrigation',
    zoneId: 'a',
    lines: '',
    workerIds: [],
  })
  const [assignSearch, setAssignSearch] = useState('')
  const [deleteZoneOpen, setDeleteZoneOpen] = useState(false)
  const [zoneToDelete, setZoneToDelete] = useState('')
  const [deleteBatchOpen, setDeleteBatchOpen] = useState(false)
  const [batchToDelete, setBatchToDelete] = useState('')
  const [addBatchOpen, setAddBatchOpen] = useState(false)
  const [newBatchName, setNewBatchName] = useState('')
  const [acceptDurationTaskId, setAcceptDurationTaskId] = useState(null)
  const [acceptDurationMinutes, setAcceptDurationMinutes] = useState(60)
  const restoredSelectionRef = useRef(false)

  const DURATION_PRESETS = useMemo(
    () => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((h) => ({ hours: h, minutes: h * 60 })),
    []
  )

  // Restore last selected zone & batch when returning to the page
  useEffect(() => {
    if (restoredSelectionRef.current || !zones?.length) return
    restoredSelectionRef.current = true
    try {
      const raw = sessionStorage.getItem(ASSIGN_TASK_SELECTION_KEY)
      if (!raw) return
      const { zone, batch } = JSON.parse(raw)
      if (!zone || !zones.some((z) => z.id === zone)) return
      const list = normalizeBatchList(batchesByZone[zone])
      const ids = list.map((b) => b.id)
      const batchToSet = ids.includes(batch)
        ? batch
        : (defaultBatchByZone[zone] && ids.includes(defaultBatchByZone[zone])
          ? defaultBatchByZone[zone]
          : list[0]?.id ?? '1')
      setSelectedZone(zone)
      setSelectedBatch(batchToSet)
    } catch (_) {}
  }, [zones, batchesByZone, defaultBatchByZone])

  // Persist zone & batch so they are restored when coming back to the page
  useEffect(() => {
    try {
      sessionStorage.setItem(ASSIGN_TASK_SELECTION_KEY, JSON.stringify({ zone: selectedZone, batch: selectedBatch }))
    } catch (_) {}
  }, [selectedZone, selectedBatch])

  // Sync batches when zones change (e.g. new zone added): ensure every zone has at least one batch
  useEffect(() => {
    if (!zones || zones.length === 0 || !setBatchesByZone) return
    const next = { ...batchesByZone }
    let changed = false
    zones.forEach((z) => {
      const list = next[z.id]
      if (!Array.isArray(list) || list.length === 0) {
        next[z.id] = [{ id: '1', name: 'Batch 1' }]
        changed = true
      }
    })
    if (changed) setBatchesByZone(next)
  }, [zones, batchesByZone, setBatchesByZone])

  // If selected zone was deleted (e.g. Zone A removed), switch to the first available zone
  useEffect(() => {
    if (!zones || zones.length === 0) return
    const zoneIds = zones.map((z) => z.id)
    if (!zoneIds.includes(selectedZone)) {
      setSelectedZone(zones[0].id)
      setSelectedBatch('1')
    }
  }, [zones, selectedZone])

  // When zone changes, select default batch for that zone (or first batch)
  useEffect(() => {
    const defaultBatch = defaultBatchByZone[selectedZone]
    const list = normalizeBatchList(batchesByZone[selectedZone])
    const ids = list.map((b) => b.id)
    if (defaultBatch && ids.includes(defaultBatch)) {
      setSelectedBatch(defaultBatch)
    } else if (list.length > 0 && !ids.includes(selectedBatch)) {
      setSelectedBatch(list[0].id)
    }
  }, [selectedZone, defaultBatchByZone, batchesByZone])

  // Apply filter from "Review Now" (Engineer Home → Pending Approvals)
  useEffect(() => {
    const filterStatus = location.state?.filterStatus
    if (filterStatus && [TASK_STATUS.PENDING_APPROVAL, TASK_STATUS.IN_PROGRESS, TASK_STATUS.COMPLETED].includes(filterStatus)) {
      setKpiFilter(filterStatus)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state?.filterStatus, location.pathname, navigate])

  const tasksInZone = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.zoneId === selectedZone &&
          (t.batchId === selectedBatch || (!t.batchId && selectedBatch === '1'))
      ),
    [tasks, selectedZone, selectedBatch]
  )
  /* For the table "All Operations for the Selected Batch": always show all tasks in this zone+batch (no widget filter). */
  const tasksForBatchTable = tasksInZone
  const tasksFiltered = useMemo(() => {
    if (!kpiFilter) return tasksInZone
    if (kpiFilter === 'zones') return tasksInZone
    return tasksInZone.filter((t) => t.status === kpiFilter)
  }, [tasksInZone, kpiFilter])
  /** Overview: map each row to a task from linesArea (اللاينز المعينة). Key = left-1..20 or right-1..20. */
  const tasksByRow = useMemo(() => {
    const m = new Map()
    tasksInZone.forEach((t) => {
      const range = parseLinesRange(t.linesArea)
      if (range) {
        const [from, to] = range
        const priority = overviewStatusPriority(t.status)
        for (let lineNum = from; lineNum <= to; lineNum++) {
          if (lineNum >= 1 && lineNum <= 40) {
            const key = lineNum <= 20 ? `left-${lineNum}` : `right-${lineNum - 20}`
            const existing = m.get(key)
            if (!existing || priority > overviewStatusPriority(existing.status)) {
              m.set(key, t)
            }
          }
        }
      } else {
        const side = t.gridSide ?? 'left'
        const row = t.gridRow ?? 0
        const maxRow = side === 'left' ? OVERVIEW_LEFT_ROWS : OVERVIEW_RIGHT_ROWS
        if (row >= 1 && row <= maxRow) {
          const key = `${side}-${row}`
          const existing = m.get(key)
          const priority = overviewStatusPriority(t.status)
          if (!existing || priority > overviewStatusPriority(existing.status)) {
            m.set(key, t)
          }
        }
      }
    })
    return m
  }, [tasksInZone])

  const statsByStatus = useMemo(() => {
    const s = {
      [TASK_STATUS.PENDING_APPROVAL]: 0,
      [TASK_STATUS.IN_PROGRESS]: 0,
      [TASK_STATUS.COMPLETED]: 0,
    }
    tasksInZone.forEach((t) => {
      const status = normalizeTaskStatus(t.status)
      if (status && s[status] !== undefined) s[status] += 1
    })
    return s
  }, [tasksInZone])

  const totalZones = (zones || []).length
  /* Operations Management widget: counts and lists across ALL zones */
  const allPendingCount = useMemo(
    () => (tasks || []).filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.PENDING_APPROVAL).length,
    [tasks]
  )
  const allInProgressCount = useMemo(
    () => (tasks || []).filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.IN_PROGRESS).length,
    [tasks]
  )
  const allCompletedCount = useMemo(
    () => (tasks || []).filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.COMPLETED).length,
    [tasks]
  )
  /* Per zone+batch (for Operation path under selected batch) */
  const pendingCount = statsByStatus[TASK_STATUS.PENDING_APPROVAL] ?? 0
  const inProgressCount = statsByStatus[TASK_STATUS.IN_PROGRESS] ?? 0
  const completedCount = statsByStatus[TASK_STATUS.COMPLETED] ?? 0

  /** Quick list for Operations Management: all-zones pending / in progress / completed, or zones list (tasks sorted by zone) */
  const kpiQuickList = useMemo(() => {
    if (!kpiFilter) return []
    if (kpiFilter === TASK_STATUS.PENDING_APPROVAL) {
      const list = (tasks || []).filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.PENDING_APPROVAL)
      return [...list].sort((a, b) => (ZONE_LABEL[a.zoneId] ?? a.zoneId).localeCompare(ZONE_LABEL[b.zoneId] ?? b.zoneId))
    }
    if (kpiFilter === TASK_STATUS.IN_PROGRESS) {
      const list = (tasks || []).filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.IN_PROGRESS)
      return [...list].sort((a, b) => (ZONE_LABEL[a.zoneId] ?? a.zoneId).localeCompare(ZONE_LABEL[b.zoneId] ?? b.zoneId))
    }
    if (kpiFilter === TASK_STATUS.COMPLETED) {
      const list = (tasks || []).filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.COMPLETED)
      return [...list].sort((a, b) => (ZONE_LABEL[a.zoneId] ?? a.zoneId).localeCompare(ZONE_LABEL[b.zoneId] ?? b.zoneId))
    }
    if (kpiFilter === 'zones') {
      return (zones || []).map((z) => ({ type: 'zone', id: z.id, label: z.label }))
    }
    return []
  }, [kpiFilter, tasks, zones, ZONE_LABEL])

  const zoneWorkers = useMemo(() => {
    const ids = new Set()
    tasksInZone.forEach((t) => t.workerIds?.forEach((id) => ids.add(id)))
    return Array.from(ids).map((id) => ASSIGNABLE.find((w) => w.id === id)).filter(Boolean)
  }, [tasksInZone])

  const batchesForZone = useMemo(
    () => normalizeBatchList(batchesByZone[selectedZone]),
    [batchesByZone, selectedZone]
  )

  // When current batch is not in the zone's list, pick default batch for zone (or first)
  useEffect(() => {
    if (batchesForZone.some((b) => b.id === selectedBatch)) return
    const defaultId = defaultBatchByZone[selectedZone]
    const next =
      defaultId && batchesForZone.some((b) => b.id === defaultId)
        ? defaultId
        : (batchesForZone[0]?.id ?? '1')
    setSelectedBatch(next)
  }, [selectedZone, batchesForZone, selectedBatch, defaultBatchByZone])

  function openAddBatch() {
    setNewBatchName('')
    setAddBatchOpen(true)
  }

  function confirmAddBatch(e) {
    e?.preventDefault()
    const list = normalizeBatchList(batchesByZone[selectedZone])
    const newId = nextBatchNumber(list)
    const name = (newBatchName || '').trim() || `Batch ${newId}`
    const newBatch = { id: newId, name }
    setBatchesByZone({
      ...batchesByZone,
      [selectedZone]: [...list, newBatch],
    })
    setSelectedBatch(newId)
    setAddBatchOpen(false)
    setNewBatchName('')
  }

  function addBatch() {
    openAddBatch()
  }

  function confirmDeleteZone() {
    if (!zoneToDelete) return
    const remaining = (zones || []).filter((z) => z.id !== zoneToDelete)
    removeZone(zoneToDelete)
    setZoneToDelete(null)
    if (selectedZone === zoneToDelete && remaining.length > 0) {
      setSelectedZone(remaining[0].id)
      setSelectedBatch('1')
    }
  }

  function confirmDeleteBatch() {
    if (!batchToDelete) return
    const list = batchesForZone
    const nextList = list.filter((b) => b.id !== batchToDelete)
    const nextBatch = nextList.length > 0 ? nextList[0].id : '1'
    setBatchesByZone({
      ...batchesByZone,
      [selectedZone]: nextList.length > 0 ? nextList : [{ id: '1', name: 'Batch 1' }],
    })
    if (selectedBatch === batchToDelete) {
      setSelectedBatch(nextBatch)
    }
    if (defaultBatchByZone[selectedZone] === batchToDelete && setDefaultBatch) {
      setDefaultBatch(selectedZone, nextBatch)
    }
    setBatchToDelete(null)
  }

  const departmentLabel = Object.fromEntries(DEPARTMENT_OPTIONS.map((d) => [d.value, d.label]))

  const tasksForDepartment = useMemo(
    () => getTasksForDepartment(assignForm.departmentId),
    [assignForm.departmentId]
  )

  function openAssign() {
    const firstTaskId = getTasksForDepartment('farming')[0]?.id ?? 'irrigation'
    setAssignForm({
      departmentId: 'farming',
      taskId: firstTaskId,
      zoneId: selectedZone,
      lines: '',
      workerIds: [],
    })
    setAssignSearch('')
    setAssignOpen(true)
  }

  const assignableFiltered = useMemo(() => {
    const q = (assignSearch || '').trim().toLowerCase()
    if (!q) return ASSIGNABLE
    return ASSIGNABLE.filter(
      (w) =>
        (w.fullName || '').toLowerCase().includes(q) ||
        (w.employeeId || '').toLowerCase().includes(q) ||
        (w.id || '').toLowerCase().includes(q)
    )
  }, [assignSearch])

  function toggleWorker(workerId) {
    setAssignForm((f) => ({
      ...f,
      workerIds: f.workerIds.includes(workerId)
        ? f.workerIds.filter((id) => id !== workerId)
        : [...f.workerIds, workerId],
    }))
  }

  function confirmAssign(e) {
    e.preventDefault()
    const taskId = generateTaskId(tasks)
    const task = {
      id: taskId,
      departmentId: assignForm.departmentId,
      zoneId: assignForm.zoneId,
      batchId: selectedBatch,
      linesArea: assignForm.lines.trim() || '—',
      taskType: assignForm.departmentId,
      taskId: assignForm.taskId,
      workerIds: [...assignForm.workerIds],
      priority: 'medium',
      estimatedMinutes: 60,
      notes: assignForm.lines.trim() ? `Lines: ${assignForm.lines.trim()}` : '',
      status: TASK_STATUS.PENDING_APPROVAL,
      gridRow: 1,
      gridCol: 1,
      gridSide: 'left',
      createdAt: new Date().toISOString(),
    }
    addTask(task)
    setAssignOpen(false)
  }

  function openAcceptDurationModal(taskId) {
    setAcceptDurationTaskId(taskId)
    setAcceptDurationMinutes(60)
  }

  function acceptTaskWithDuration(expectedMinutes) {
    const taskId = acceptDurationTaskId
    if (!taskId) return
    const task = (tasks || []).find((t) => t.id === taskId)
    const isPending = task?.status === TASK_STATUS.PENDING_APPROVAL || task?.status === 'approved'
    if (!task || !isPending) {
      setAcceptDurationTaskId(null)
      return
    }
    const mins = Math.max(1, Math.min(600, Number(expectedMinutes) || 60))
    updateTaskStatus(taskId, TASK_STATUS.IN_PROGRESS)
    const now = new Date().toISOString()
    const dept = getDepartment(task.departmentId)
    const taskLabel = getTasksForDepartment(task.departmentId)?.find((t) => t.id === task.taskId)
    const zoneLabel = ZONE_LABEL[task.zoneId] ?? task.zoneId
    const linesArea = task.linesArea || '—'
    ;(task.workerIds || []).forEach((wId) => {
      const workerName = ASSIGNABLE.find((w) => w.id === wId)?.fullName ?? String(wId)
      addSession({
        id: `s-assign-${taskId}-${wId}`,
        workerId: String(wId),
        workerName,
        departmentId: task.departmentId,
        department: dept?.labelEn ?? task.departmentId,
        taskTypeId: task.departmentId,
        task: taskLabel?.labelEn ?? task.taskId,
        zoneId: task.zoneId,
        zone: zoneLabel,
        linesArea,
        startTime: now,
        expectedMinutes: mins,
        flagged: false,
        notes: [],
        taskId,
        assignedByEngineer: true,
      })
    })
    setAcceptDurationTaskId(null)
  }

  function rejectTask(taskId) {
    updateTaskStatus(taskId, TASK_STATUS.REJECTED)
  }

  function openAddZone() {
    setNewZoneName('')
    setAddZoneOpen(true)
  }

  const ZONE_LETTER_AR = { A: 'أ', B: 'ب', C: 'ج', D: 'د', E: 'ه', F: 'و', G: 'ز', H: 'ح', I: 'ي', J: 'ي', K: 'ك', L: 'ل', M: 'م', N: 'ن', O: 'و', P: 'ب', Q: 'ق', R: 'ر', S: 'س', T: 'ت', U: 'و', V: 'ف', W: 'و', X: 'كس', Y: 'ي', Z: 'ز' }

  function confirmAddZone(e) {
    e.preventDefault()
    const name = newZoneName.trim()
    if (!name) return
    const baseName = name.replace(/^Zone\s+/i, '').trim() || name
    const slug = baseName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'zone'
    const id = (zones || []).some((z) => z.id === slug) ? `${slug}-${Date.now().toString(36).slice(-4)}` : slug
    const label = name.startsWith('Zone ') ? name : `Zone ${name}`
    const singleLetter = baseName.length === 1 ? baseName.toUpperCase() : null
    const labelAr = singleLetter && ZONE_LETTER_AR[singleLetter]
      ? (name.startsWith('Zone ') ? `المنطقة ${ZONE_LETTER_AR[singleLetter]}` : ZONE_LETTER_AR[singleLetter])
      : (name.startsWith('Zone ') ? `المنطقة ${baseName}` : baseName)
    addZone({
      id,
      labelEn: baseName,
      labelAr,
      label,
      icon: 'squares-2x2',
    })
    setSelectedZone(id)
    setSelectedBatch('1')
    setAssignForm((f) => ({ ...f, zoneId: id }))
    setAddZoneOpen(false)
    setNewZoneName('')
  }

  return (
    <div className={styles.page}>
      {/* 1. Operations Management Indicators (Top KPIs) – always visible */}
      <section className={styles.kpiSection}>
        <h2 className={styles.kpiSectionTitle}><i className="fas fa-chart-line fa-fw" /> Operations Management</h2>
        <div className={styles.kpiGrid}>
          <button
            type="button"
            className={styles.kpiCard}
            onClick={() => setKpiFilter(kpiFilter === TASK_STATUS.PENDING_APPROVAL ? null : TASK_STATUS.PENDING_APPROVAL)}
          >
            <span className={styles.kpiValue}>{allPendingCount}</span>
            <span className={styles.kpiLabel}><i className="fas fa-clock fa-fw" /> Pending</span>
          </button>
          <button
            type="button"
            className={styles.kpiCard}
            onClick={() => setKpiFilter(kpiFilter === TASK_STATUS.IN_PROGRESS ? null : TASK_STATUS.IN_PROGRESS)}
          >
            <span className={styles.kpiValue}>{allInProgressCount}</span>
            <span className={styles.kpiLabel}><i className="fas fa-spinner fa-fw" /> In Progress</span>
          </button>
          <button
            type="button"
            className={styles.kpiCard}
            onClick={() => setKpiFilter(kpiFilter === TASK_STATUS.COMPLETED ? null : TASK_STATUS.COMPLETED)}
          >
            <span className={styles.kpiValue}>{allCompletedCount}</span>
            <span className={styles.kpiLabel}><i className="fas fa-circle-check fa-fw" /> Completed</span>
          </button>
          <button
            type="button"
            className={styles.kpiCard}
            onClick={() => setKpiFilter(kpiFilter === 'zones' ? null : 'zones')}
          >
            <span className={styles.kpiValue}>{totalZones}</span>
            <span className={styles.kpiLabel}><i className="fas fa-map-location-dot fa-fw" /> Total Zones</span>
          </button>
        </div>
        {kpiFilter && (
          <div className={styles.kpiQuickList}>
            <div className={styles.kpiQuickListHeader}>
              <span>
                {kpiFilter === TASK_STATUS.PENDING_APPROVAL && (allPendingCount ? `${allPendingCount} Pending (all zones)` : 'Pending (all zones)')}
                {kpiFilter === TASK_STATUS.IN_PROGRESS && (allInProgressCount ? `${allInProgressCount} In Progress (all zones)` : 'In Progress (all zones)')}
                {kpiFilter === TASK_STATUS.COMPLETED && (allCompletedCount ? `${allCompletedCount} Completed (all zones)` : 'Completed (all zones)')}
                {kpiFilter === 'zones' && `${totalZones} Zones`}
              </span>
              <button type="button" className={styles.kpiQuickListClose} onClick={() => setKpiFilter(null)} aria-label="Close">
                <i className="fas fa-times" />
              </button>
            </div>
            {kpiFilter === 'zones' ? (
              <ul className={styles.kpiQuickListUl}>
                {kpiQuickList.map((z) => (
                  <li key={z.id} className={styles.kpiQuickListItem}>
                    <div className={styles.kpiQuickListItemContent}>
                      <i className="fas fa-map-pin fa-fw" /> {z.label}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.kpiQuickListTableWrap}>
                <table className={styles.taskTable}>
                  <thead>
                    <tr>
                      <th><i className="fas fa-map-pin fa-fw" /> Zone</th>
                      <th><i className="fas fa-briefcase fa-fw" /> Operation</th>
                      <th><i className="fas fa-building fa-fw" /> Department</th>
                      <th><i className="fas fa-user-group fa-fw" /> Assigned Worker(s)</th>
                      <th><i className="fas fa-align-left fa-fw" /> Lines</th>
                      <th><i className="fas fa-info-circle fa-fw" /> Status</th>
                      <th><i className="fas fa-clock fa-fw" /> Timestamp</th>
                      <th><i className="fas fa-hand fa-fw" /> Accept / Reject</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpiQuickList.map((t) => (
                      <tr key={t.id}>
                        <td>{getZoneDisplayLabel(t.zoneId)}</td>
                        <td>{(taskLabelByLang(getTaskById(t.taskId), lang) || TASK_TYPE_LABEL[t.taskType] || getDepartment(t.departmentId)?.labelEn) ?? 'Task'}</td>
                        <td>{departmentLabel[t.departmentId] ?? TASK_TYPE_LABEL[t.taskType] ?? t.taskType}</td>
                        <td>{workerNames(t.workerIds)}</td>
                        <td>{t.linesArea || '—'}</td>
                        <td>
                          <span className={styles.statusBadge} data-status={t.status}>
                            {TASK_STATUS_LABELS[t.status] ?? t.status ?? '—'}
                          </span>
                        </td>
                        <td>{t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}</td>
                        <td className={styles.acceptRejectCell}>
                          {(t.status === TASK_STATUS.PENDING_APPROVAL || t.status === 'approved') && (
                            <>
                              <button type="button" className={styles.actionLinkAccept} onClick={() => openAcceptDurationModal(t.id)}>
                                <i className="fas fa-check fa-fw" /> Accept
                              </button>
                              <button type="button" className={styles.actionLinkReject} onClick={() => rejectTask(t.id)}>
                                <i className="fas fa-times fa-fw" /> Reject
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {kpiFilter !== 'zones' && kpiQuickList.length === 0 && (
              <p className={styles.kpiQuickListEmpty}>No tasks in this category across all zones.</p>
            )}
          </div>
        )}
      </section>

      {/* 2. Zones Section + Add Zone */}
      <section className={styles.zoneSection}>
        <div className={styles.zoneSectionHeader}>
          <h2 className={styles.sectionTitle}><i className="fas fa-map fa-fw" /> ZONES</h2>
          <div className={styles.zoneHeaderActions}>
            <button type="button" className={styles.addZoneBtn} onClick={openAddZone}>
              <i className="fas fa-plus fa-fw" /> Add Zone
            </button>
            {(zones || []).length > 1 && (
              <button
                type="button"
                className={styles.deleteZoneBtn}
                onClick={() => { setDeleteZoneOpen(true); setZoneToDelete(selectedZone ?? (zones || [])[0]?.id ?? ''); }}
              >
                <i className="fas fa-trash-can fa-fw" /> Delete Zone
              </button>
            )}
          </div>
        </div>
        <div className={styles.zoneList}>
          {(zones || []).map((z) => (
            <button
              key={z.id}
              type="button"
              className={selectedZone === z.id ? `${styles.zoneBtn} ${styles.zoneBtnActive}` : styles.zoneBtn}
              onClick={() => setSelectedZone(z.id)}
            >
              {z.label}
            </button>
          ))}
        </div>
      </section>

      {addZoneOpen && (
        <div className={styles.modalOverlay} onClick={() => setAddZoneOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}><i className="fas fa-map fa-fw" /> Add Zone</h3>
            <form onSubmit={confirmAddZone}>
              <div className={styles.formRow}>
                <label>Zone name</label>
                <input
                  type="text"
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  placeholder="e.g. E or Zone E"
                  autoFocus
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => setAddZoneOpen(false)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary} disabled={!newZoneName.trim()}>Add Zone</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {zoneToDelete && (
        <div className={styles.modalOverlay} onClick={() => setZoneToDelete(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}><i className="fas fa-trash-can fa-fw" /> Delete Zone</h3>
            <p className={styles.modalMessage}>
              Delete zone &quot;{ZONE_LABEL[zoneToDelete] ?? zoneToDelete}&quot;? Tasks in this zone will keep their zone reference but the zone will no longer appear in the list.
            </p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setZoneToDelete(null)}>Cancel</button>
              <button type="button" className={styles.btnDanger} onClick={confirmDeleteZone}>Delete Zone</button>
            </div>
          </div>
        </div>
      )}

      {batchToDelete && (
        <div className={styles.modalOverlay} onClick={() => setBatchToDelete(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}><i className="fas fa-trash-can fa-fw" /> Delete Batch</h3>
            <p className={styles.modalMessage}>
              Delete batch &quot;{batchesForZone.find((b) => b.id === batchToDelete)?.name ?? batchToDelete}&quot; for {ZONE_LABEL[selectedZone] ?? selectedZone}? Tasks in this batch will keep their batch reference.
            </p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setBatchToDelete(null)}>Cancel</button>
              <button type="button" className={styles.btnDanger} onClick={confirmDeleteBatch}>Delete Batch</button>
            </div>
          </div>
        </div>
      )}

      {/* New batch name modal */}
      {addBatchOpen && (
        <div className={styles.modalOverlay} onClick={() => setAddBatchOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>New batch</h3>
            <p className={styles.modalText}>Name this batch. It will be selected after creation.</p>
            <form onSubmit={confirmAddBatch}>
              <input
                type="text"
                className={styles.modalInput}
                value={newBatchName}
                onChange={(e) => setNewBatchName(e.target.value)}
                placeholder="e.g. Current work, Harvest week 1"
                autoFocus
              />
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => { setAddBatchOpen(false); setNewBatchName(''); }}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Create batch</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3–6. Merged: Batch + Greenhouse + Workers + All Operations */}
      <section className={styles.mergedAssignSection}>
        <div className={styles.mergedBlock}>
          <div className={styles.batchesSectionHeader}>
            <h2 className={styles.sectionTitle}>
              <i className="fas fa-layer-group fa-fw" /> {batchesForZone.find((b) => b.id === selectedBatch)?.name ?? selectedBatch} – {ZONE_LABEL[selectedZone] ?? selectedZone}
            </h2>
            <div className={styles.batchHeaderActions}>
              <button type="button" className={styles.addBatchBtn} onClick={addBatch}>
                <i className="fas fa-plus fa-fw" /> New batch
              </button>
              {batchesForZone.length > 1 && (
                <button
                  type="button"
                  className={styles.deleteBatchBtn}
                  onClick={() => { setDeleteBatchOpen(true); setBatchToDelete(selectedBatch); }}
                >
                  <i className="fas fa-trash-can fa-fw" /> Delete batch
                </button>
              )}
            </div>
          </div>
          <div className={styles.batchTabs}>
            {batchesForZone.map((b) => (
              <button
                key={b.id}
                type="button"
                className={selectedBatch === b.id ? `${styles.batchTab} ${styles.batchTabActive}` : styles.batchTab}
                onClick={() => setSelectedBatch(b.id)}
                title={defaultBatchByZone[selectedZone] === b.id ? 'Default batch (new tasks go here)' : undefined}
              >
                {b.name}
                {defaultBatchByZone[selectedZone] === b.id && <span className={styles.batchDefaultBadge} title="Default"> ★</span>}
              </button>
            ))}
          </div>
          <div className={styles.defaultBatchRow}>
            <button
              type="button"
              className={styles.setDefaultBatchBtn}
              onClick={() => setDefaultBatch(selectedZone, selectedBatch)}
              title="New assignments will go to this batch"
            >
              <i className="fas fa-star fa-fw" /> Set as default batch
            </button>
          </div>
          <div className={styles.operationPath}>
            <span className={styles.operationPathLabel}><i className="fas fa-route fa-fw" /> Operation path</span>
            <div className={styles.operationPathSteps}>
              {OPERATION_PATH_STEPS.map((step) => (
                <span
                  key={step.id}
                  className={styles.operationPathChip}
                  style={{ background: step.color, color: '#fff' }}
                >
                  {step.label} ({statsByStatus[step.id] ?? 0})
                </span>
              ))}
            </div>
          </div>
          <div className={styles.workspaceToolbar}>
            <button type="button" className={styles.assignBtn} onClick={openAssign}>
              <i className="fas fa-tasks fa-fw" /> Assign Task
            </button>
          </div>
        </div>

        <div className={styles.mergedDivider} />

        <div className={`${styles.greenhouseInMerged} ${styles.mergedBlock}`}>
          <div className={styles.greenhouseHeader}>
            <button
              type="button"
              className={styles.greenhouseToggle}
              onClick={() => setGreenhouseExpanded((e) => !e)}
            >
              <i className={`fas fa-fw ${greenhouseExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`} /> {greenhouseExpanded ? 'Collapse' : 'Expand'}
            </button>
            <h2 className={styles.greenhouseTitle}>
              <i className="fas fa-seedling fa-fw" /> Greenhouse Overview – {ZONE_LABEL[selectedZone]} · {batchesForZone.find((b) => b.id === selectedBatch)?.name ?? selectedBatch}
            </h2>
          </div>
          {greenhouseExpanded && (
            <>
              <div className={styles.greenhouseLegend}>
                {OPERATION_PATH_STEPS.map((step) => (
                  <span key={step.id} className={styles.legendItem}>
                    <span className={styles.legendDot} style={{ background: step.color }} />
                    {step.label}
                  </span>
                ))}
              </div>
              <div className={styles.greenhouseContent}>
                <div className={styles.greenhouseSide}>
                  <span className={styles.sideLabel}>Left side</span>
                  <div className={styles.linesGrid}>
                    {Array.from({ length: OVERVIEW_LEFT_ROWS }, (_, rowIndex) => {
                      const rowNum = rowIndex + 1
                      const task = tasksByRow.get(`left-${rowNum}`)
                      const statusClass =
                        task?.status === TASK_STATUS.COMPLETED
                          ? styles.lineCellCompleted
                          : task?.status === TASK_STATUS.IN_PROGRESS
                            ? styles.lineCellInProgress
                            : (task?.status === TASK_STATUS.PENDING_APPROVAL || task?.status === 'approved')
                              ? styles.lineCellPending
                              : ''
                      return (
                        <div
                          key={`L-${rowIndex}`}
                          className={`${styles.lineCell} ${styles.lineCellMerged} ${statusClass}`}
                          title={task ? `Row ${rowNum} – ${TASK_STATUS_LABELS[task.status]}` : `Row ${rowNum}`}
                        >
                          {rowNum}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className={styles.greenhouseAisle}>
                  <span className={styles.aisleLabel}>Aisle</span>
                </div>
                <div className={styles.greenhouseSide}>
                  <span className={styles.sideLabel}>Right side</span>
                  <div className={styles.linesGrid}>
                    {Array.from({ length: OVERVIEW_RIGHT_ROWS }, (_, rowIndex) => {
                      const rowNum = rowIndex + 1
                      const displayNum = rowNum + OVERVIEW_LEFT_ROWS
                      const task = tasksByRow.get(`right-${rowNum}`)
                      const statusClass =
                        task?.status === TASK_STATUS.COMPLETED
                          ? styles.lineCellCompleted
                          : task?.status === TASK_STATUS.IN_PROGRESS
                            ? styles.lineCellInProgress
                            : (task?.status === TASK_STATUS.PENDING_APPROVAL || task?.status === 'approved')
                              ? styles.lineCellPending
                              : ''
                      return (
                        <div
                          key={`R-${rowIndex}`}
                          className={`${styles.lineCell} ${styles.lineCellMerged} ${statusClass}`}
                          title={task ? `Row ${displayNum} – ${TASK_STATUS_LABELS[task.status]}` : `Row ${displayNum}`}
                        >
                          {displayNum}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className={styles.mergedDivider} />

        <div className={styles.mergedBlock}>
          <h2 className={styles.sectionTitle}><i className="fas fa-users fa-fw" /> Workers Who Worked in This Zone</h2>
          <div className={styles.workersList}>
            {zoneWorkers.length === 0 ? (
              <p className={styles.workersEmpty}>No workers assigned to this zone yet.</p>
            ) : (
              zoneWorkers.map((w) => (
                <div key={w.id} className={styles.workerCard}>
                  <span className={styles.workerAvatar}>{w.fullName?.charAt(0) ?? w.id}</span>
                  <span className={styles.workerName}>{w.fullName}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={styles.mergedDivider} />

        <div className={styles.mergedBlock}>
          <h2 className={styles.sectionTitle}><i className="fas fa-list-check fa-fw" /> All Operations for the Selected Batch</h2>
          <p className={styles.batchTableSubtitle}>{getZoneDisplayLabel(selectedZone)} · {batchesForZone.find((b) => b.id === selectedBatch)?.name ?? selectedBatch}</p>
          <div className={styles.taskTableWrap}>
            <table className={styles.taskTable}>
              <thead>
                <tr>
                  <th><i className="fas fa-briefcase fa-fw" /> Operation</th>
                  <th><i className="fas fa-building fa-fw" /> Department</th>
                  <th><i className="fas fa-user-group fa-fw" /> Assigned Worker(s)</th>
                  <th><i className="fas fa-align-left fa-fw" /> Lines</th>
                  <th><i className="fas fa-info-circle fa-fw" /> Status</th>
                  <th><i className="fas fa-clock fa-fw" /> Timestamp</th>
                  <th><i className="fas fa-hand fa-fw" /> Accept / Reject</th>
                </tr>
              </thead>
              <tbody>
                {tasksForBatchTable.map((t) => (
                  <tr key={t.id}>
                    <td>{(taskLabelByLang(getTaskById(t.taskId), lang) || TASK_TYPE_LABEL[t.taskType] || getDepartment(t.departmentId)?.labelEn) ?? 'Task'}</td>
                    <td>{departmentLabel[t.departmentId] ?? TASK_TYPE_LABEL[t.taskType] ?? t.taskType}</td>
                    <td>{workerNames(t.workerIds)}</td>
                    <td>{t.linesArea || '—'}</td>
                    <td>
                      <span className={styles.statusBadge} data-status={t.status}>
                        {TASK_STATUS_LABELS[t.status] ?? t.status ?? '—'}
                      </span>
                    </td>
                    <td>{t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}</td>
                    <td className={styles.acceptRejectCell}>
                      {(t.status === TASK_STATUS.PENDING_APPROVAL || t.status === 'approved') && (
                        <>
                          <button type="button" className={styles.actionLinkAccept} onClick={() => openAcceptDurationModal(t.id)}>
                            <i className="fas fa-check fa-fw" /> Accept
                          </button>
                          <button type="button" className={styles.actionLinkReject} onClick={() => rejectTask(t.id)}>
                            <i className="fas fa-times fa-fw" /> Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Assign Task Modal */}
      {assignOpen && (
        <div className={styles.modalOverlay} onClick={() => setAssignOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}><i className="fas fa-tasks fa-fw" /> {t('assignTaskTitle')}</h3>
            <form onSubmit={confirmAssign} className={styles.assignForm}>
              <div className={styles.formRow}>
                <label><i className="fas fa-building fa-fw" /> {t('assignDepartment')}</label>
                <select
                  value={assignForm.departmentId}
                  onChange={(e) => {
                    const nextDept = e.target.value
                    const tasksForDept = getTasksForDepartment(nextDept)
                    const firstId = tasksForDept[0]?.id ?? ''
                    setAssignForm((f) => ({ ...f, departmentId: nextDept, taskId: firstId }))
                  }}
                >
                  {DEPARTMENT_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formRow}>
                <label><i className="fas fa-list-check fa-fw" /> {t('assignTask')}</label>
                <select
                  value={assignForm.taskId}
                  onChange={(e) => setAssignForm((f) => ({ ...f, taskId: e.target.value }))}
                >
                  {tasksForDepartment.map((task) => (
                    <option key={task.id} value={task.id}>{taskLabelByLang(task, lang)}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formRow}>
                <label>{t('assignZone')}</label>
                <select
                  value={assignForm.zoneId}
                  onChange={(e) => setAssignForm((f) => ({ ...f, zoneId: e.target.value }))}
                >
                  {(zones || []).map((z) => (
                    <option key={z.id} value={z.id}>{z.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formRow}>
                <label><i className="fas fa-align-left fa-fw" /> {t('assignLines')}</label>
                <input
                  type="text"
                  value={assignForm.lines}
                  onChange={(e) => setAssignForm((f) => ({ ...f, lines: e.target.value }))}
                  placeholder={t('assignLinesPlaceholder')}
                />
              </div>
              <div className={styles.formRow}>
                <label><i className="fas fa-user-plus fa-fw" /> {t('assignWorkerTech')}</label>
                <input
                  type="search"
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  placeholder={t('assignSearchPlaceholder')}
                  className={styles.searchInput}
                  autoComplete="off"
                />
                <div className={styles.workerChips}>
                  {assignableFiltered.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      className={assignForm.workerIds.includes(w.id) ? `${styles.chip} ${styles.chipActive}` : styles.chip}
                      onClick={() => toggleWorker(w.id)}
                    >
                      {w.fullName}
                    </button>
                  ))}
                  {assignableFiltered.length === 0 && (
                    <span className={styles.noMatch}>{t('assignNoMatch')}</span>
                  )}
                </div>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => setAssignOpen(false)}>
                  <i className="fas fa-times fa-fw" /> {t('assignCancel')}
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={assignForm.workerIds.length === 0}>
                  <i className="fas fa-check fa-fw" /> {t('assignConfirm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Accept task – set expected duration (1h–10h or custom minutes) */}
      {acceptDurationTaskId && (
        <div className={styles.modalOverlay} onClick={() => setAcceptDurationTaskId(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}><i className="fas fa-clock fa-fw" /> Set expected duration</h3>
            <p className={styles.modalMessage}>Choose how long this task is expected to take (used for On time / Delayed status).</p>
            <div className={styles.durationPresets}>
              {DURATION_PRESETS.map(({ hours, minutes }) => (
                <button
                  key={hours}
                  type="button"
                  className={acceptDurationMinutes === minutes ? `${styles.durationPresetBtn} ${styles.durationPresetBtnActive}` : styles.durationPresetBtn}
                  onClick={() => setAcceptDurationMinutes(minutes)}
                >
                  {hours}h
                </button>
              ))}
            </div>
            <div className={styles.durationCustom}>
              <label className={styles.durationLabel}>Custom (minutes)</label>
              <input
                type="number"
                min={1}
                max={600}
                value={acceptDurationMinutes}
                onChange={(e) => setAcceptDurationMinutes(Math.max(1, Math.min(600, parseInt(e.target.value, 10) || 60)))}
                className={styles.modalInput}
              />
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setAcceptDurationTaskId(null)}>
                Cancel
              </button>
              <button type="button" className={styles.btnPrimary} onClick={() => acceptTaskWithDuration(acceptDurationMinutes)}>
                <i className="fas fa-check fa-fw" /> Accept task
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

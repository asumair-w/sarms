import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  TASK_TYPES,
  TASK_STATUS,
  TASK_STATUS_LABELS,
  PRIORITY_OPTIONS,
  GRID_ROWS,
  GRID_COLS,
  generateTaskId,
} from '../../data/assignTask'
import { getTasksForDepartment, getTaskById, getDepartment } from '../../data/workerFlow'
import { SEED_WORKERS, DEPARTMENT_OPTIONS } from '../../data/engineerWorkers'
import { useAppStore } from '../../context/AppStoreContext'
import { useLanguage } from '../../context/LanguageContext'
import { getTranslation } from '../../i18n/translations'
import styles from './AssignTask.module.css'

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

const OVERVIEW_ROWS = 20
const COLS_PER_ROW = 5
const OPERATION_PATH_STEPS = [
  { id: TASK_STATUS.PENDING_APPROVAL, label: 'Pending Approval', color: '#8b95a0' },
  { id: TASK_STATUS.APPROVED, label: 'Approved', color: '#6b7b8a' },
  { id: TASK_STATUS.IN_PROGRESS, label: 'In Progress', color: '#b89a4a' },
  { id: TASK_STATUS.COMPLETED, label: 'Completed', color: '#5c7b5c' },
]

function workerNames(workerIds) {
  return (workerIds || [])
    .map((id) => ASSIGNABLE.find((w) => w.id === id)?.fullName ?? id)
    .join(', ')
}

export default function AssignTask() {
  const navigate = useNavigate()
  const location = useLocation()
  const { lang } = useLanguage()
  const t = (key) => getTranslation(lang, 'engineer', key)
  const { tasks, zones = [], addTask, updateTaskStatus, updateTask, addSession, addZone, removeZone, batchesByZone: storeBatchesByZone = {}, setBatchesByZone } = useAppStore()

  function toggleTaskFlag(taskId) {
    const task = tasks.find((x) => x.id === taskId)
    if (!task) return
    const nextFlagged = !(task.flagged === true)
    updateTask(taskId, { flagged: nextFlagged })
    if (viewTask?.id === taskId) setViewTask((prev) => (prev ? { ...prev, flagged: nextFlagged } : null))
  }
  const ZONE_LABEL = useMemo(() => Object.fromEntries((zones || []).map((z) => [z.id, z.label])), [zones])
  const [selectedZone, setSelectedZone] = useState('a')
  const [selectedBatch, setSelectedBatch] = useState('1')
  const batchesByZone = storeBatchesByZone
  const [greenhouseExpanded, setGreenhouseExpanded] = useState(true)
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
  const [viewTask, setViewTask] = useState(null)
  const [noteTask, setNoteTask] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [deleteZoneOpen, setDeleteZoneOpen] = useState(false)
  const [zoneToDelete, setZoneToDelete] = useState('')
  const [deleteBatchOpen, setDeleteBatchOpen] = useState(false)
  const [batchToDelete, setBatchToDelete] = useState('')

  // Sync batches when zones change (e.g. new zone added): ensure every zone has at least ['1']
  useEffect(() => {
    if (!zones || zones.length === 0 || !setBatchesByZone) return
    const next = { ...batchesByZone }
    let changed = false
    zones.forEach((z) => {
      if (!(z.id in next) || !Array.isArray(next[z.id]) || next[z.id].length === 0) {
        next[z.id] = ['1']
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

  // Apply filter from "Review Now" (Engineer Home → Pending Approvals)
  useEffect(() => {
    const filterStatus = location.state?.filterStatus
    if (filterStatus && [TASK_STATUS.PENDING_APPROVAL, TASK_STATUS.APPROVED, TASK_STATUS.IN_PROGRESS, TASK_STATUS.COMPLETED].includes(filterStatus)) {
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
  const tasksFiltered = useMemo(() => {
    if (!kpiFilter) return tasksInZone
    if (kpiFilter === 'zones') return tasksInZone
    return tasksInZone.filter((t) => t.status === kpiFilter)
  }, [tasksInZone, kpiFilter])
  const tasksByCell = useMemo(() => {
    const m = new Map()
    tasksInZone.forEach((t) => {
      const side = t.gridSide ?? 'left'
      const row = t.gridRow ?? 0
      const col = t.gridCol ?? 0
      if (row >= 1 && row <= OVERVIEW_ROWS && col >= 1 && col <= COLS_PER_ROW) {
        m.set(`${side}-${row}-${col}`, t)
      }
    })
    return m
  }, [tasksInZone])

  const statsByStatus = useMemo(() => {
    const s = {
      [TASK_STATUS.PENDING_APPROVAL]: 0,
      [TASK_STATUS.APPROVED]: 0,
      [TASK_STATUS.IN_PROGRESS]: 0,
      [TASK_STATUS.COMPLETED]: 0,
    }
    tasksInZone.forEach((t) => { s[t.status] = (s[t.status] || 0) + 1 })
    return s
  }, [tasksInZone])

  /* Analytics: all tasks for section-specific charts */
  const analyticsByStatus = useMemo(() => {
    const s = {
      [TASK_STATUS.PENDING_APPROVAL]: 0,
      [TASK_STATUS.APPROVED]: 0,
      [TASK_STATUS.IN_PROGRESS]: 0,
      [TASK_STATUS.COMPLETED]: 0,
    }
    tasks.forEach((t) => { s[t.status] = (s[t.status] || 0) + 1 })
    return OPERATION_PATH_STEPS.map((step) => ({ label: step.label, value: s[step.id] ?? 0 }))
  }, [tasks])
  const analyticsByZone = useMemo(() => {
    const byZone = {}
    tasks.forEach((t) => {
      const z = t.zoneId || 'other'
      byZone[z] = (byZone[z] || 0) + 1
    })
    return (zones || []).map((z) => ({ label: ZONE_LABEL[z.id] ?? z.id, value: byZone[z.id] || 0 }))
  }, [tasks])
  const analyticsByType = useMemo(() => {
    const byType = {}
    tasks.forEach((t) => {
      const type = t.taskType || 'other'
      byType[type] = (byType[type] || 0) + 1
    })
    return TASK_TYPES.map((t) => ({ label: t.label, value: byType[t.id] || 0 }))
  }, [tasks])
  const analyticsStatusMax = Math.max(...analyticsByStatus.map((d) => d.value), 1)
  const analyticsZoneMax = Math.max(...analyticsByZone.map((d) => d.value), 1)
  const analyticsTypeMax = Math.max(...analyticsByType.map((d) => d.value), 1)
  const ANALYTICS_COLORS = ['#166534', '#15803d', '#22c55e', '#4ade80', '#6b8a6b', '#86efac', '#94a3b8']
  const analyticsByZoneWithColors = useMemo(
    () => analyticsByZone.map((d, i) => ({ ...d, color: ANALYTICS_COLORS[i % ANALYTICS_COLORS.length] })),
    [analyticsByZone]
  )
  const analyticsZoneTotal = analyticsByZone.reduce((s, d) => s + d.value, 0)

  const totalZones = (zones || []).length
  const approvedCount = statsByStatus[TASK_STATUS.APPROVED] ?? 0
  const pendingCount = statsByStatus[TASK_STATUS.PENDING_APPROVAL] ?? 0
  const completedCount = statsByStatus[TASK_STATUS.COMPLETED] ?? 0

  const zoneWorkers = useMemo(() => {
    const ids = new Set()
    tasksInZone.forEach((t) => t.workerIds?.forEach((id) => ids.add(id)))
    return Array.from(ids).map((id) => ASSIGNABLE.find((w) => w.id === id)).filter(Boolean)
  }, [tasksInZone])

  const completionLeft = useMemo(() => {
    const inZone = tasksInZone.length
    if (!inZone) return 0
    const completed = tasksInZone.filter((t) => t.status === TASK_STATUS.COMPLETED).length
    return Math.round((completed / inZone) * 100)
  }, [tasksInZone])
  const completionRight = useMemo(() => {
    const inZone = tasksInZone.length
    if (!inZone) return 0
    const inProgress = tasksInZone.filter((t) => t.status === TASK_STATUS.IN_PROGRESS).length
    return Math.min(100, completionLeft + Math.round((inProgress / inZone) * 50))
  }, [tasksInZone, completionLeft])

  const batchesForZone = useMemo(
    () => batchesByZone[selectedZone] ?? ['1'],
    [batchesByZone, selectedZone]
  )

  useEffect(() => {
    if (!batchesForZone.includes(selectedBatch)) {
      setSelectedBatch(batchesForZone[0] ?? '1')
    }
  }, [selectedZone, batchesForZone, selectedBatch])

  function addBatch() {
    const list = batchesByZone[selectedZone] ?? ['1']
    const nextNum = String(list.length + 1)
    setBatchesByZone({
      ...batchesByZone,
      [selectedZone]: [...list, nextNum],
    })
    setSelectedBatch(nextNum)
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
    const list = batchesByZone[selectedZone] ?? ['1']
    const nextList = list.filter((b) => b !== batchToDelete)
    setBatchesByZone({
      ...batchesByZone,
      [selectedZone]: nextList.length > 0 ? nextList : ['1'],
    })
    if (selectedBatch === batchToDelete) {
      setSelectedBatch(nextList.length > 0 ? nextList[0] : '1')
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
    const taskId = generateTaskId()
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
      status: TASK_STATUS.IN_PROGRESS,
      gridRow: 1,
      gridCol: 1,
      gridSide: 'left',
      createdAt: new Date().toISOString(),
    }
    addTask(task)
    const now = new Date().toISOString()
    const dept = getDepartment(assignForm.departmentId)
    const taskLabel = getTasksForDepartment(assignForm.departmentId).find((t) => t.id === assignForm.taskId)
    const zoneLabel = ZONE_LABEL[assignForm.zoneId] ?? assignForm.zoneId
    const linesArea = assignForm.lines.trim() || '—'
    assignForm.workerIds.forEach((wId) => {
      const workerName = ASSIGNABLE.find((w) => w.id === wId)?.fullName ?? String(wId)
      addSession({
        id: `s-assign-${taskId}-${wId}`,
        workerId: String(wId),
        workerName,
        departmentId: assignForm.departmentId,
        department: dept?.labelEn ?? assignForm.departmentId,
        taskTypeId: assignForm.departmentId,
        task: taskLabel?.labelEn ?? assignForm.taskId,
        zoneId: assignForm.zoneId,
        zone: zoneLabel,
        linesArea,
        startTime: now,
        expectedMinutes: 60,
        flagged: false,
        notes: [],
        taskId,
        assignedByEngineer: true,
      })
    })
    setAssignOpen(false)
  }

  function approveTask(taskId) {
    updateTaskStatus(taskId, TASK_STATUS.APPROVED)
  }

  function openAddZone() {
    setNewZoneName('')
    setAddZoneOpen(true)
  }

  function saveTaskNote(e) {
    e.preventDefault()
    if (!noteTask || !noteText.trim()) return
    const newNotes = (noteTask.notes || '').trim() ? `${noteTask.notes}\n${noteText.trim()}` : noteText.trim()
    updateTask(noteTask.id, { notes: newNotes })
    setNoteTask(null)
    setNoteText('')
    if (viewTask?.id === noteTask.id) setViewTask((prev) => (prev ? { ...prev, notes: newNotes } : null))
  }

  function confirmAddZone(e) {
    e.preventDefault()
    const name = newZoneName.trim()
    if (!name) return
    const id = `z-${Date.now().toString(36)}`
    const label = name.startsWith('Zone ') ? name : `Zone ${name}`
    addZone({
      id,
      labelEn: name,
      labelAr: name,
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
            onClick={() => setKpiFilter(kpiFilter === TASK_STATUS.APPROVED ? null : TASK_STATUS.APPROVED)}
          >
            <span className={styles.kpiValue}>{approvedCount}</span>
            <span className={styles.kpiLabel}><i className="fas fa-check-circle fa-fw" /> Approved</span>
          </button>
          <button
            type="button"
            className={styles.kpiCard}
            onClick={() => setKpiFilter(kpiFilter === TASK_STATUS.PENDING_APPROVAL ? null : TASK_STATUS.PENDING_APPROVAL)}
          >
            <span className={styles.kpiValue}>{pendingCount}</span>
            <span className={styles.kpiLabel}><i className="fas fa-clock fa-fw" /> Pending Approval</span>
          </button>
          <button
            type="button"
            className={styles.kpiCard}
            onClick={() => setKpiFilter(kpiFilter === TASK_STATUS.COMPLETED ? null : TASK_STATUS.COMPLETED)}
          >
            <span className={styles.kpiValue}>{completedCount}</span>
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
              Delete Batch {batchToDelete} for {ZONE_LABEL[selectedZone] ?? selectedZone}? Tasks in this batch will keep their batch reference.
            </p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setBatchToDelete(null)}>Cancel</button>
              <button type="button" className={styles.btnDanger} onClick={confirmDeleteBatch}>Delete Batch</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Batches for Selected Zone + Operation Path */}
      <section className={styles.batchesSection}>
        <div className={styles.batchesSectionHeader}>
          <h2 className={styles.sectionTitle}>
            <i className="fas fa-layer-group fa-fw" /> Batch {selectedBatch} – {ZONE_LABEL[selectedZone] ?? selectedZone}
          </h2>
          <div className={styles.batchHeaderActions}>
            <button type="button" className={styles.addBatchBtn} onClick={addBatch}>
              <i className="fas fa-plus fa-fw" /> New batch
            </button>
            {batchesForZone.length > 1 && (
              <button
                type="button"
                className={styles.deleteBatchBtn}
                onClick={() => { setDeleteBatchOpen(true); setBatchToDelete(batchesForZone[0] ?? ''); }}
              >
                <i className="fas fa-trash-can fa-fw" /> Delete batch
              </button>
            )}
          </div>
        </div>
        <div className={styles.batchTabs}>
          {batchesForZone.map((b) => (
            <button
              key={b}
              type="button"
              className={selectedBatch === b ? `${styles.batchTab} ${styles.batchTabActive}` : styles.batchTab}
              onClick={() => setSelectedBatch(b)}
            >
              Batch {b}
            </button>
          ))}
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
      </section>

      {/* 4. Expandable Greenhouse Overview */}
      <section className={styles.greenhouseSection}>
        <div className={styles.greenhouseHeader}>
          <button
            type="button"
            className={styles.greenhouseToggle}
            onClick={() => setGreenhouseExpanded((e) => !e)}
          >
            <i className={`fas fa-fw ${greenhouseExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`} /> {greenhouseExpanded ? 'Collapse' : 'Expand'}
          </button>
          <h2 className={styles.greenhouseTitle}>
            <i className="fas fa-seedling fa-fw" /> Greenhouse Overview – {ZONE_LABEL[selectedZone]} · Batch {selectedBatch}
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
                <div className={styles.completionBar}>
                  <div className={styles.completionFill} style={{ width: `${completionLeft}%` }} />
                </div>
                <div className={styles.linesGrid}>
                  {Array.from({ length: OVERVIEW_ROWS }, (_, rowIndex) =>
                    Array.from({ length: COLS_PER_ROW }, (_, colIndex) => {
                      const rowNum = rowIndex + 1
                      const colNum = colIndex + 1
                      const task = tasksByCell.get(`left-${rowNum}-${colNum}`)
                      const statusClass =
                        task?.status === TASK_STATUS.COMPLETED
                          ? styles.lineCellCompleted
                          : task?.status === TASK_STATUS.IN_PROGRESS
                            ? styles.lineCellInProgress
                            : ''
                      return (
                        <div
                          key={`L-${rowIndex}-${colIndex}`}
                          className={`${styles.lineCell} ${statusClass}`}
                          title={task ? `Row ${rowNum} – ${TASK_STATUS_LABELS[task.status]}` : `Row ${rowNum}`}
                        >
                          {rowNum}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
              <div className={styles.greenhouseAisle}>
                <span className={styles.aisleLabel}>Aisle</span>
              </div>
              <div className={styles.greenhouseSide}>
                <span className={styles.sideLabel}>Right side</span>
                <div className={styles.completionBar}>
                  <div className={styles.completionFill} style={{ width: `${completionRight}%` }} />
                </div>
                <div className={styles.linesGrid}>
                  {Array.from({ length: OVERVIEW_ROWS }, (_, rowIndex) =>
                    Array.from({ length: COLS_PER_ROW }, (_, colIndex) => {
                      const rowNum = rowIndex + 1
                      const colNum = colIndex + 1
                      const task = tasksByCell.get(`right-${rowNum}-${colNum}`)
                      const statusClass =
                        task?.status === TASK_STATUS.COMPLETED
                          ? styles.lineCellCompleted
                          : task?.status === TASK_STATUS.IN_PROGRESS
                            ? styles.lineCellInProgress
                            : ''
                      return (
                        <div
                          key={`R-${rowIndex}-${colIndex}`}
                          className={`${styles.lineCell} ${statusClass}`}
                          title={task ? `Row ${rowNum} – ${TASK_STATUS_LABELS[task.status]}` : `Row ${rowNum}`}
                        >
                          {rowNum}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* 5. Zone Workers List */}
      <section className={styles.workersSection}>
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
      </section>

      {/* 6. All Operations for the Selected Batch */}
      <section className={styles.reviewSection}>
        <h2 className={styles.sectionTitle}><i className="fas fa-list-check fa-fw" /> All Operations for the Selected Batch</h2>
        <div className={styles.taskTableWrap}>
          <table className={styles.taskTable}>
            <thead>
              <tr>
                <th><i className="fas fa-briefcase fa-fw" /> Operation</th>
                <th><i className="fas fa-building fa-fw" /> Department</th>
                <th><i className="fas fa-user-group fa-fw" /> Assigned Worker(s)</th>
                <th><i className="fas fa-info-circle fa-fw" /> Status</th>
                <th><i className="fas fa-clock fa-fw" /> Timestamp</th>
                <th><i className="fas fa-ellipsis fa-fw" /> Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasksFiltered.map((t) => (
                <tr key={t.id}>
                  <td>{(taskLabelByLang(getTaskById(t.taskId), lang) || TASK_TYPE_LABEL[t.taskType]) ?? t.taskType}</td>
                  <td>{departmentLabel[t.departmentId] ?? TASK_TYPE_LABEL[t.taskType] ?? t.taskType}</td>
                  <td>{workerNames(t.workerIds)}</td>
                  <td>
                    <span className={styles.statusBadge} data-status={t.status}>
                      {TASK_STATUS_LABELS[t.status]}
                    </span>
                  </td>
                  <td>{t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}</td>
                  <td>
                    <button type="button" className={styles.actionLink} onClick={() => setViewTask(t)}>
                      <i className="fas fa-eye fa-fw" /> View
                    </button>
                    {t.status === TASK_STATUS.PENDING_APPROVAL && (
                      <>
                        {' · '}
                        <button type="button" className={styles.actionLink} onClick={() => approveTask(t.id)}>
                          <i className="fas fa-check fa-fw" /> Approve
                        </button>
                      </>
                    )}
                    {' · '}
                    <button type="button" className={styles.actionLink} onClick={() => { setNoteTask(t); setNoteText(''); }}>
                      <i className="fas fa-note-sticky fa-fw" /> Add Note
                    </button>
                    {' · '}
                    <button
                      type="button"
                      className={styles.actionLink}
                      onClick={() => toggleTaskFlag(t.id)}
                      title={t.flagged ? 'Remove flag (Unflag)' : 'Mark task as needing attention (Flag)'}
                    >
                      <i className={`fas fa-flag fa-fw ${t.flagged ? styles.flagActive : ''}`} /> {t.flagged ? 'Unflag' : 'Flag'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Analytics – task-specific charts (vertical bar, pie, horizontal bar) + More Details → General Reports */}
      <section className={styles.analyticsSection}>
        <h2 className={styles.sectionTitle}><i className="fas fa-chart-bar fa-fw" /> Analytics</h2>
        <div className={styles.chartsRow}>
          <div className={styles.chartWrap}>
            <h3 className={styles.chartCaption}>Tasks by status</h3>
            <div className={styles.verticalBarChart}>
              {analyticsByStatus.map((d) => (
                <div key={d.label} className={styles.verticalBarCol}>
                  <div
                    className={styles.verticalBarFill}
                    style={{ height: `${(d.value / analyticsStatusMax) * 100}%` }}
                    title={`${d.label}: ${d.value}`}
                  />
                  <span className={styles.verticalBarValue}>{d.value}</span>
                  <span className={styles.verticalBarLabel}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.chartWrap}>
            <h3 className={styles.chartCaption}>Tasks by zone</h3>
            <div
              className={styles.analyticsPie}
              style={{
                background: analyticsZoneTotal
                  ? `conic-gradient(${analyticsByZoneWithColors.map((d, i) => {
                      const start = (analyticsByZoneWithColors.slice(0, i).reduce((s, x) => s + x.value, 0) / analyticsZoneTotal) * 100
                      const end = (analyticsByZoneWithColors.slice(0, i + 1).reduce((s, x) => s + x.value, 0) / analyticsZoneTotal) * 100
                      return `${d.color} ${start}% ${end}%`
                    }).join(', ')})`
                  : '#e2e8f0',
              }}
            />
            <ul className={styles.analyticsPieLegend}>
              {analyticsByZoneWithColors.map((d) => (
                <li key={d.label} className={styles.analyticsPieLegendItem}>
                  <span className={styles.analyticsPieLegendDot} style={{ background: d.color }} />
                  <span>{d.label}</span>
                  <span className={styles.analyticsPieLegendValue}>{d.value}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.chartWrap}>
            <h3 className={styles.chartCaption}>Tasks by type</h3>
            <div className={styles.barChart}>
              {analyticsByType.map((d) => (
                <div key={d.label} className={styles.barRow}>
                  <span className={styles.barLabel}>{d.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(d.value / analyticsTypeMax) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.moreWrap}>
          <button type="button" className={styles.moreBtn} onClick={() => navigate('/engineer/reports')}>
            More Details
          </button>
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

      {/* View Task Modal */}
      {noteTask && (
        <div className={styles.modalOverlay} onClick={() => { setNoteTask(null); setNoteText(''); }}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}><i className="fas fa-note-sticky fa-fw" /> Add note – {noteTask.id}</h3>
            <form onSubmit={saveTaskNote}>
              <div className={styles.formRow}>
                <label>Note</label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a note for this task…"
                  rows={4}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.75rem', fontSize: '0.95rem', border: '1px solid #e2e8f0', borderRadius: 8 }}
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => { setNoteTask(null); setNoteText(''); }}>Cancel</button>
                <button type="submit" className={styles.btnPrimary} disabled={!noteText.trim()}>Save note</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewTask && (
        <div className={styles.modalOverlay} onClick={() => setViewTask(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}><i className="fas fa-eye fa-fw" /> {t('viewTaskTitle')}</h3>
            <dl className={styles.viewTaskDl}>
              <dt>Task ID</dt><dd>{viewTask.id}</dd>
              <dt>{t('assignDepartment')}</dt><dd>{departmentLabel[viewTask.departmentId] ?? viewTask.departmentId ?? '—'}</dd>
              <dt>{t('assignZone')}</dt><dd>{ZONE_LABEL[viewTask.zoneId]}</dd>
              <dt>{t('assignLines')}</dt><dd>{viewTask.linesArea ?? viewTask.notes ?? '—'}</dd>
              <dt>Task</dt><dd>{taskLabelByLang(getTaskById(viewTask.taskId), lang) || TASK_TYPE_LABEL[viewTask.taskType] || viewTask.taskId || '—'}</dd>
              <dt>{t('viewAssigned')}</dt><dd>{workerNames(viewTask.workerIds) || '—'}</dd>
              <dt>Status</dt><dd>{TASK_STATUS_LABELS[viewTask.status]}</dd>
              <dt>Duration</dt><dd>{viewTask.estimatedMinutes} min</dd>
              <dt>Notes</dt><dd>{viewTask.notes || '—'}</dd>
            </dl>
            <div className={styles.modalActions}>
              {viewTask.status === TASK_STATUS.PENDING_APPROVAL && (
                <button type="button" className={styles.btnPrimary} onClick={() => { approveTask(viewTask.id); setViewTask(null); }}>
                  <i className="fas fa-check fa-fw" /> {t('viewApprove')}
                </button>
              )}
              <button type="button" className={styles.btnSecondary} onClick={() => setViewTask(null)}><i className="fas fa-xmark fa-fw" /> {t('viewClose')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

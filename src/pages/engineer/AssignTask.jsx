import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ZONES,
  TASK_TYPES,
  TASK_STATUS,
  TASK_STATUS_LABELS,
  PRIORITY_OPTIONS,
  GRID_ROWS,
  GRID_COLS,
  generateTaskId,
} from '../../data/assignTask'
import { SEED_WORKERS } from '../../data/engineerWorkers'
import { useAppStore } from '../../context/AppStoreContext'
import styles from './AssignTask.module.css'

const WORKERS = SEED_WORKERS.filter((w) => w.role === 'worker')
const TASK_TYPE_LABEL = Object.fromEntries(TASK_TYPES.map((t) => [t.id, t.label]))
const ZONE_LABEL = Object.fromEntries(ZONES.map((z) => [z.id, z.label]))
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
  return workerIds
    .map((id) => WORKERS.find((w) => w.id === id)?.fullName ?? id)
    .join(', ')
}

export default function AssignTask() {
  const navigate = useNavigate()
  const { tasks, addTask, updateTaskStatus } = useAppStore()
  const [selectedZone, setSelectedZone] = useState('a')
  const [selectedBatch, setSelectedBatch] = useState('1')
  const [greenhouseExpanded, setGreenhouseExpanded] = useState(false)
  const [kpiFilter, setKpiFilter] = useState(null) // status or 'zones'
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignForm, setAssignForm] = useState({
    zoneId: 'a',
    taskType: 'farming',
    workerIds: [],
    priority: 'medium',
    estimatedMinutes: 60,
    notes: '',
    gridRow: 1,
    gridCol: 1,
    gridSide: 'left',
  })
  const [viewTask, setViewTask] = useState(null)

  const tasksInZone = useMemo(
    () => tasks.filter((t) => t.zoneId === selectedZone),
    [tasks, selectedZone]
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
    tasks.forEach((t) => { s[t.status] = (s[t.status] || 0) + 1 })
    return s
  }, [tasks])
  const totalZones = ZONES.length
  const approvedCount = statsByStatus[TASK_STATUS.APPROVED] ?? 0
  const pendingCount = statsByStatus[TASK_STATUS.PENDING_APPROVAL] ?? 0
  const completedCount = statsByStatus[TASK_STATUS.COMPLETED] ?? 0

  const zoneWorkers = useMemo(() => {
    const ids = new Set()
    tasksInZone.forEach((t) => t.workerIds?.forEach((id) => ids.add(id)))
    return Array.from(ids).map((id) => WORKERS.find((w) => w.id === id)).filter(Boolean)
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

  const batchesForZone = useMemo(() => ['1'], [selectedZone])

  function openAssign() {
    setAssignForm({
      zoneId: selectedZone,
      taskType: 'farming',
      workerIds: [],
      priority: 'medium',
      estimatedMinutes: 60,
      notes: '',
      gridRow: 1,
      gridCol: 1,
      gridSide: 'left',
    })
    setAssignOpen(true)
  }

  function confirmAssign(e) {
    e.preventDefault()
    if (assignForm.workerIds.length === 0) return
    const task = {
      id: generateTaskId(),
      zoneId: assignForm.zoneId,
      taskType: assignForm.taskType,
      workerIds: [...assignForm.workerIds],
      priority: assignForm.priority,
      estimatedMinutes: assignForm.estimatedMinutes,
      notes: assignForm.notes.trim(),
      status: TASK_STATUS.PENDING_APPROVAL,
      gridRow: assignForm.gridRow,
      gridCol: assignForm.gridCol,
      gridSide: assignForm.gridSide ?? 'left',
      createdAt: new Date().toISOString(),
    }
    addTask(task)
    setAssignOpen(false)
  }

  function toggleWorker(workerId) {
    setAssignForm((f) => ({
      ...f,
      workerIds: f.workerIds.includes(workerId)
        ? f.workerIds.filter((id) => id !== workerId)
        : [...f.workerIds, workerId],
    }))
  }

  function setAssignPosition(row, col) {
    setAssignForm((f) => ({ ...f, gridRow: row, gridCol: col }))
  }

  function approveTask(taskId) {
    updateTaskStatus(taskId, TASK_STATUS.APPROVED)
  }

  function addZone() {
    // Demo: could add a new zone to state; for now just alert or no-op
  }

  return (
    <div className={styles.page}>
      {/* 1. Operations Management Indicators (Top KPIs) – always visible */}
      <section className={styles.kpiSection}>
        <h2 className={styles.kpiSectionTitle}>Operations Management</h2>
        <div className={styles.kpiGrid}>
          <button
            type="button"
            className={styles.kpiCard}
            onClick={() => setKpiFilter(kpiFilter === TASK_STATUS.APPROVED ? null : TASK_STATUS.APPROVED)}
          >
            <span className={styles.kpiValue}>{approvedCount}</span>
            <span className={styles.kpiLabel}>Approved</span>
          </button>
          <button
            type="button"
            className={styles.kpiCard}
            onClick={() => setKpiFilter(kpiFilter === TASK_STATUS.PENDING_APPROVAL ? null : TASK_STATUS.PENDING_APPROVAL)}
          >
            <span className={styles.kpiValue}>{pendingCount}</span>
            <span className={styles.kpiLabel}>Pending Approval</span>
          </button>
          <button
            type="button"
            className={styles.kpiCard}
            onClick={() => setKpiFilter(kpiFilter === TASK_STATUS.COMPLETED ? null : TASK_STATUS.COMPLETED)}
          >
            <span className={styles.kpiValue}>{completedCount}</span>
            <span className={styles.kpiLabel}>Completed</span>
          </button>
          <button
            type="button"
            className={styles.kpiCard}
            onClick={() => setKpiFilter(kpiFilter === 'zones' ? null : 'zones')}
          >
            <span className={styles.kpiValue}>{totalZones}</span>
            <span className={styles.kpiLabel}>Total Zones</span>
          </button>
        </div>
      </section>

      {/* 2. Zones Section + Add Zone */}
      <section className={styles.zoneSection}>
        <div className={styles.zoneSectionHeader}>
          <h2 className={styles.sectionTitle}>ZONES</h2>
          <button type="button" className={styles.addZoneBtn} onClick={addZone}>
            + Add Zone
          </button>
        </div>
        <div className={styles.zoneList}>
          {ZONES.map((z) => (
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

      {/* 3. Batches for Selected Zone + Operation Path */}
      <section className={styles.batchesSection}>
        <h2 className={styles.sectionTitle}>
          Batch {selectedBatch} – {ZONE_LABEL[selectedZone] ?? selectedZone}
        </h2>
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
          <span className={styles.operationPathLabel}>Operation path</span>
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
            Assign Task
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
            {greenhouseExpanded ? 'Collapse' : 'Expand'}
          </button>
          <h2 className={styles.greenhouseTitle}>
            Greenhouse Overview – {ZONE_LABEL[selectedZone]} · Batch {selectedBatch}
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
        <h2 className={styles.sectionTitle}>Workers Who Worked in This Zone</h2>
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
        <h2 className={styles.sectionTitle}>All Operations for the Selected Batch</h2>
        <div className={styles.taskTableWrap}>
          <table className={styles.taskTable}>
            <thead>
              <tr>
                <th>Operation</th>
                <th>Department</th>
                <th>Assigned Worker(s)</th>
                <th>Status</th>
                <th>Timestamp</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasksFiltered.map((t) => (
                <tr key={t.id}>
                  <td>{TASK_TYPE_LABEL[t.taskType] ?? t.taskType}</td>
                  <td>{TASK_TYPE_LABEL[t.taskType] ?? t.taskType}</td>
                  <td>{workerNames(t.workerIds)}</td>
                  <td>
                    <span className={styles.statusBadge} data-status={t.status}>
                      {TASK_STATUS_LABELS[t.status]}
                    </span>
                  </td>
                  <td>{t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}</td>
                  <td>
                    <button type="button" className={styles.actionLink} onClick={() => setViewTask(t)}>
                      View
                    </button>
                    {t.status === TASK_STATUS.PENDING_APPROVAL && (
                      <>
                        {' · '}
                        <button type="button" className={styles.actionLink} onClick={() => approveTask(t.id)}>
                          Approve
                        </button>
                      </>
                    )}
                    {' · '}
                    <button type="button" className={styles.actionLink}>Add Note</button>
                    {' · '}
                    <button type="button" className={styles.actionLink}>Flag</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Analytics – More Details */}
      <section className={styles.analyticsSection}>
        <h2 className={styles.sectionTitle}>Analytics</h2>
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
            <h3 className={styles.modalTitle}>Assign Task</h3>
            <form onSubmit={confirmAssign} className={styles.assignForm}>
              <div className={styles.formRow}>
                <label>Zone</label>
                <select
                  value={assignForm.zoneId}
                  onChange={(e) => setAssignForm((f) => ({ ...f, zoneId: e.target.value }))}
                >
                  {ZONES.map((z) => (
                    <option key={z.id} value={z.id}>{z.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formRow}>
                <label>Task Type</label>
                <select
                  value={assignForm.taskType}
                  onChange={(e) => setAssignForm((f) => ({ ...f, taskType: e.target.value }))}
                >
                  {TASK_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formRow}>
                <label>Workers (select one or more)</label>
                <div className={styles.workerChips}>
                  {WORKERS.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      className={assignForm.workerIds.includes(w.id) ? `${styles.chip} ${styles.chipActive}` : styles.chip}
                      onClick={() => toggleWorker(w.id)}
                    >
                      {w.fullName}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.formRow}>
                <label>Priority</label>
                <select
                  value={assignForm.priority}
                  onChange={(e) => setAssignForm((f) => ({ ...f, priority: e.target.value }))}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formRow}>
                <label>Estimated duration (minutes)</label>
                <input
                  type="number"
                  min={1}
                  value={assignForm.estimatedMinutes}
                  onChange={(e) => setAssignForm((f) => ({ ...f, estimatedMinutes: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className={styles.formRow}>
                <label>Position (row, column, side)</label>
                <div className={styles.positionRow}>
                  <select
                    value={assignForm.gridRow}
                    onChange={(e) => setAssignForm((f) => ({ ...f, gridRow: Number(e.target.value) }))}
                    title="Row 1–20"
                  >
                    {Array.from({ length: OVERVIEW_ROWS }, (_, i) => (
                      <option key={i} value={i + 1}>Row {i + 1}</option>
                    ))}
                  </select>
                  <select
                    value={assignForm.gridCol}
                    onChange={(e) => setAssignForm((f) => ({ ...f, gridCol: Number(e.target.value) }))}
                    title="Column 1–5"
                  >
                    {Array.from({ length: COLS_PER_ROW }, (_, i) => (
                      <option key={i} value={i + 1}>Col {i + 1}</option>
                    ))}
                  </select>
                  <select
                    value={assignForm.gridSide ?? 'left'}
                    onChange={(e) => setAssignForm((f) => ({ ...f, gridSide: e.target.value }))}
                  >
                    <option value="left">Left side</option>
                    <option value="right">Right side</option>
                  </select>
                </div>
              </div>
              <div className={styles.formRow}>
                <label>Notes (optional)</label>
                <textarea
                  value={assignForm.notes}
                  onChange={(e) => setAssignForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Optional notes"
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => setAssignOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={assignForm.workerIds.length === 0}>
                  Confirm assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Task Modal */}
      {viewTask && (
        <div className={styles.modalOverlay} onClick={() => setViewTask(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Task details</h3>
            <dl className={styles.viewTaskDl}>
              <dt>Task ID</dt><dd>{viewTask.id}</dd>
              <dt>Zone</dt><dd>{ZONE_LABEL[viewTask.zoneId]}</dd>
              <dt>Task Type</dt><dd>{TASK_TYPE_LABEL[viewTask.taskType]}</dd>
              <dt>Assigned</dt><dd>{workerNames(viewTask.workerIds)}</dd>
              <dt>Status</dt><dd>{TASK_STATUS_LABELS[viewTask.status]}</dd>
              <dt>Duration</dt><dd>{viewTask.estimatedMinutes} min</dd>
              <dt>Notes</dt><dd>{viewTask.notes || '—'}</dd>
            </dl>
            <div className={styles.modalActions}>
              {viewTask.status === TASK_STATUS.PENDING_APPROVAL && (
                <button type="button" className={styles.btnPrimary} onClick={() => { approveTask(viewTask.id); setViewTask(null); }}>
                  Approve
                </button>
              )}
              <button type="button" className={styles.btnSecondary} onClick={() => setViewTask(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

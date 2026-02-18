import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getSessionStatus,
  getElapsedMinutes,
  SESSION_STATUS,
  SESSION_STATUS_LABELS,
} from '../../data/monitorActive'
import { getTasksForDepartment, getTaskById, getInitialZones } from '../../data/workerFlow'
import { DEPARTMENT_OPTIONS, getQRCodeUrl } from '../../data/engineerWorkers'
import { useAppStore } from '../../context/AppStoreContext'
import { useLanguage } from '../../context/LanguageContext'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import styles from './MonitorActiveWork.module.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

function getDayEnd(dayStart) {
  const d = new Date(dayStart)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

function isSessionDelayedAtEndOfDay(session, endOfDayMs) {
  const start = new Date(session.startTime).getTime()
  const expected = (session.expectedMinutes || 60) * 60 * 1000
  const due = start + expected
  if (due >= endOfDayMs) return false
  if (start > endOfDayMs) return false
  const completed = session.completedAt ? new Date(session.completedAt).getTime() : null
  if (completed != null && completed <= endOfDayMs) return false
  return true
}

function getRiskLevel(delayRate) {
  if (delayRate > 30) return { label: 'High', color: 'high' }
  if (delayRate >= 15) return { label: 'Moderate', color: 'moderate' }
  return { label: 'Stable', color: 'stable' }
}

function taskLabelByLang(task, lang) {
  if (!task) return ''
  return lang === 'ar' ? (task.labelAr ?? task.labelEn) : (task.labelEn ?? task.labelAr)
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export default function MonitorActiveWork() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const { sessions, updateSession, addRecord, zones: storeZones, workers } = useAppStore()
  const zonesList = (storeZones && storeZones.length > 0) ? storeZones : getInitialZones()
  const [filterDept, setFilterDept] = useState('')
  const [filterTaskId, setFilterTaskId] = useState('')
  const [filterZone, setFilterZone] = useState('')
  const [searchWorker, setSearchWorker] = useState('')
  const [clickedCard, setClickedCard] = useState(null)
  const [viewSession, setViewSession] = useState(null)
  const [noteSession, setNoteSession] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [tick, setTick] = useState(0)
  const [sortBy, setSortBy] = useState('startTime')
  const [sortOrder, setSortOrder] = useState('asc')
  const [profileWorker, setProfileWorker] = useState(null)
  const [riskModalOpen, setRiskModalOpen] = useState(false)

  useEffect(() => {
    const ms = 60 * 1000
    const interval = setInterval(() => setTick((t) => t + 1), ms)
    return () => clearInterval(interval)
  }, [])

  const now = Date.now()
  const activeSessionsOnly = useMemo(() => sessions.filter((s) => !s.completedAt), [sessions])
  const completedSessionsOnly = useMemo(() => sessions.filter((s) => s.completedAt), [sessions])
  const completedCount = useMemo(() => completedSessionsOnly.length, [completedSessionsOnly])
  const sessionsWithStatus = useMemo(
    () =>
      activeSessionsOnly.map((s) => {
        const worker = (workers || []).find((w) => String(w.id) === String(s.workerId))
        return {
          ...s,
          status: getSessionStatus(s, now),
          elapsedMinutes: getElapsedMinutes(s, now),
          employeeId: worker?.employeeId || s.workerId,
        }
      }),
    [activeSessionsOnly, tick, now, workers]
  )
  const completedSessionsWithStatus = useMemo(
    () =>
      completedSessionsOnly.map((s) => {
        const worker = (workers || []).find((w) => String(w.id) === String(s.workerId))
        const completedAt = s.completedAt ? new Date(s.completedAt).getTime() : now
        const startTime = new Date(s.startTime).getTime()
        const durationMinutes = Math.round((completedAt - startTime) / 60000)
        return {
          ...s,
          status: 'completed',
          elapsedMinutes: durationMinutes,
          employeeId: worker?.employeeId || s.workerId,
        }
      }),
    [completedSessionsOnly, workers]
  )

  const tasksForFilter = useMemo(() => getTasksForDepartment(filterDept), [filterDept])

  const filtered = useMemo(() => {
    let list = clickedCard === 'completed' ? completedSessionsWithStatus : sessionsWithStatus
    if (clickedCard === 'on_time') list = list.filter((s) => s.status === SESSION_STATUS.ON_TIME)
    else if (clickedCard === 'delayed') list = list.filter((s) => s.status === SESSION_STATUS.DELAYED)
    else if (clickedCard === 'flagged') list = list.filter((s) => s.status === SESSION_STATUS.FLAGGED)
    if (filterDept) list = list.filter((s) => (s.departmentId || (s.department && s.department.toLowerCase())) === filterDept)
    if (filterTaskId) {
      const task = getTaskById(filterTaskId)
      const labelEn = task?.labelEn
      const labelAr = task?.labelAr
      list = list.filter(
        (s) =>
          s.taskId === filterTaskId ||
          s.task === labelEn ||
          s.task === labelAr
      )
    }
    if (filterZone) list = list.filter((s) => (s.zoneId || (s.zone && s.zone.toLowerCase())) === filterZone)
    if (searchWorker.trim()) {
      const q = searchWorker.trim().toLowerCase()
      list = list.filter(
        (s) =>
          s.workerName?.toLowerCase().includes(q) ||
          s.workerId?.toLowerCase().includes(q)
      )
    }
    return list
  }, [sessionsWithStatus, completedSessionsWithStatus, clickedCard, filterDept, filterTaskId, filterZone, searchWorker])

  const sortedFiltered = useMemo(() => {
    const list = [...filtered]
    const key = sortBy
    const asc = sortOrder === 'asc'
    list.sort((a, b) => {
      let va = a[key]
      let vb = b[key]
      if (key === 'startTime') {
        va = new Date(a.startTime).getTime()
        vb = new Date(b.startTime).getTime()
      } else if (key === 'elapsedMinutes') {
        va = a.elapsedMinutes ?? 0
        vb = b.elapsedMinutes ?? 0
      } else if (key === 'workerName') {
        va = (a.workerName || '').toLowerCase()
        vb = (b.workerName || '').toLowerCase()
      } else if (key === 'status') {
        va = (a.status || '').toLowerCase()
        vb = (b.status || '').toLowerCase()
      } else {
        va = String(va ?? '').toLowerCase()
        vb = String(vb ?? '').toLowerCase()
      }
      if (va < vb) return asc ? -1 : 1
      if (va > vb) return asc ? 1 : -1
      return 0
    })
    return list
  }, [filtered, sortBy, sortOrder])

  const summary = useMemo(() => {
    const onTime = sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.ON_TIME).length
    const delayed = sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.DELAYED).length
    const flagged = sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.FLAGGED).length
    return {
      activeWorkers: new Set(sessionsWithStatus.map((s) => s.workerId)).size,
      activeTasks: sessionsWithStatus.length,
      onTimeTasks: onTime,
      delayedTasks: delayed,
      flaggedIssues: flagged,
      completedTasks: completedCount,
    }
  }, [sessionsWithStatus, completedCount])

  const performanceRisk = useMemo(() => {
    const total = sessionsWithStatus.length
    const delayed = sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.DELAYED).length
    const delayRate = total > 0 ? Math.round((delayed / total) * 100) : 0
    const risk = getRiskLevel(delayRate)
    const now = Date.now()
    const oneDay = 24 * 60 * 60 * 1000
    let last7Total = 0
    let prev7Total = 0
    for (let i = 0; i < 7; i++) {
      const dayEnd = getDayEnd(now - (i + 1) * oneDay)
      const count = sessions.filter((s) => isSessionDelayedAtEndOfDay(s, dayEnd)).length
      last7Total += count
    }
    for (let i = 7; i < 14; i++) {
      const dayEnd = getDayEnd(now - (i + 1) * oneDay)
      const count = sessions.filter((s) => isSessionDelayedAtEndOfDay(s, dayEnd)).length
      prev7Total += count
    }
    const trendPercent = prev7Total > 0 ? Math.round(((last7Total - prev7Total) / prev7Total) * 100) : (last7Total > 0 ? 100 : 0)
    const trendDirection = last7Total >= prev7Total ? 'up' : 'down'
    return {
      delayRate,
      riskLevel: risk.label,
      riskColor: risk.color,
      trendPercent: trendDirection === 'up' ? trendPercent : -Math.abs(trendPercent),
      trendDirection,
    }
  }, [sessionsWithStatus, sessions])

  const riskTrendByDay = useMemo(() => {
    const now = Date.now()
    const oneDay = 24 * 60 * 60 * 1000
    const days = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now - i * oneDay)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = getDayEnd(dayStart.getTime())
      const count = sessions.filter((s) => isSessionDelayedAtEndOfDay(s, dayEnd)).length
      days.push({ date: dayStart.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), count })
    }
    return days
  }, [sessions])

  const bottleneckInsights = useMemo(() => {
    const active = sessionsWithStatus
    const byZone = {}
    const byDept = {}
    active.forEach((s) => {
      const z = s.zone || s.zoneId || 'Other'
      const d = s.department || s.departmentId || 'Other'
      if (!byZone[z]) byZone[z] = { total: 0, delayed: 0 }
      if (!byDept[d]) byDept[d] = { total: 0, delayed: 0 }
      byZone[z].total += 1
      byDept[d].total += 1
      if (s.status === SESSION_STATUS.DELAYED) {
        byZone[z].delayed += 1
        byDept[d].delayed += 1
      }
    })
    const zoneEntries = Object.entries(byZone).map(([name, v]) => ({ name, ...v, rate: v.total > 0 ? Math.round((v.delayed / v.total) * 100) : 0 }))
    const deptEntries = Object.entries(byDept).map(([name, v]) => ({ name, ...v, rate: v.total > 0 ? Math.round((v.delayed / v.total) * 100) : 0 }))
    const zone = zoneEntries.sort((a, b) => b.rate - a.rate)[0] || null
    const dept = deptEntries.sort((a, b) => b.rate - a.rate)[0] || null
    return { zone, department: dept }
  }, [sessionsWithStatus])

  function toggleFlag(sessionId) {
    const s = sessions.find((x) => x.id === sessionId)
    if (s) updateSession(sessionId, { flagged: !s.flagged })
    if (viewSession?.id === sessionId) setViewSession((v) => (v ? { ...v, flagged: !v.flagged } : null))
  }

  function addNote(sessionId, text) {
    if (!text.trim()) return
    const s = sessions.find((x) => x.id === sessionId)
    if (s) updateSession(sessionId, { notes: [...(s.notes || []), { at: new Date().toISOString(), text: text.trim() }] })
    setNoteSession(null)
    setNoteText('')
  }

  function markCompleted(sessionId) {
    const s = sessions.find((x) => x.id === sessionId)
    if (!s) return
    const completedAt = new Date().toISOString()
    updateSession(sessionId, { completedAt })
    if (viewSession?.id === sessionId) setViewSession(null)
    if (noteSession?.id === sessionId) setNoteSession(null)
    const startMs = new Date(s.startTime).getTime()
    const durationMinutes = Math.round((Date.now() - startMs) / 60000)
    const engineerNotesStr = (s.notes?.length)
      ? s.notes.map((n) => `${new Date(n.at).toLocaleString()}: ${n.text}`).join('\n')
      : undefined
    const record = {
      id: `R-${Date.now()}`,
      recordType: 'production',
      worker: s.workerName ?? '',
      department: s.department ?? '',
      task: s.task ?? '',
      zone: s.zone ?? '',
      zoneId: s.zoneId,
      linesArea: s.linesArea ?? '',
      lines: s.linesArea ?? '',
      dateTime: completedAt,
      createdAt: completedAt,
      duration: durationMinutes,
      startTime: s.startTime,
      notes: undefined,
      engineerNotes: engineerNotesStr,
      imageData: s.imageData,
    }
    addRecord(record)
  }

  function handleSort(key) {
    if (sortBy === key) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    else {
      setSortBy(key)
      setSortOrder('asc')
    }
  }

  function exportToCSV() {
    const headers = ['Worker Name', 'ID', 'Department', 'Task', 'Zone', 'Lines/Area', 'Start Time', 'Duration', 'Source', 'Status']
    const rows = sortedFiltered.map((s) => [
      s.workerName ?? '',
      s.employeeId ?? s.workerId ?? '',
      s.department ?? '',
      s.task ?? '',
      s.zone ?? '',
      s.linesArea ?? '',
      s.startTime ? new Date(s.startTime).toLocaleString() : '',
      formatDuration(s.elapsedMinutes ?? 0),
      s.assignedByEngineer ? 'Assigned' : 'Self-started',
      s.status === 'completed' ? 'Completed' : (SESSION_STATUS_LABELS[s.status] ?? s.status),
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `monitor-sessions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function printTable() {
    const prevTitle = document.title
    document.title = `Monitor Active Work – ${new Date().toLocaleString()}`
    window.print()
    document.title = prevTitle
  }

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><i className="fas fa-chart-pie fa-fw" /> Summary</h2>
        <div className={styles.cards}>
          <button
            type="button"
            className={`${styles.card} ${clickedCard === 'tasks' ? styles.cardActive : ''}`}
            onClick={() => setClickedCard(clickedCard === 'tasks' ? null : 'tasks')}
          >
            <span className={styles.cardLabel}>Active Tasks</span>
            <span className={styles.cardValue}>{summary.activeTasks}</span>
          </button>
          <button
            type="button"
            className={`${styles.card} ${styles.cardDelayed} ${clickedCard === 'delayed' ? styles.cardActive : ''}`}
            onClick={() => setClickedCard(clickedCard === 'delayed' ? null : 'delayed')}
          >
            <span className={styles.cardLabel}>Delayed Tasks</span>
            <span className={styles.cardValue}>{summary.delayedTasks}</span>
          </button>
          <button
            type="button"
            className={`${styles.card} ${styles.cardFlagged} ${clickedCard === 'flagged' ? styles.cardActive : ''}`}
            onClick={() => setClickedCard(clickedCard === 'flagged' ? null : 'flagged')}
          >
            <span className={styles.cardLabel}>Flagged Issues</span>
            <span className={styles.cardValue}>{summary.flaggedIssues}</span>
          </button>
          <button
            type="button"
            className={`${styles.card} ${styles.cardCompleted} ${clickedCard === 'completed' ? styles.cardActive : ''}`}
            onClick={() => setClickedCard(clickedCard === 'completed' ? null : 'completed')}
          >
            <span className={styles.cardLabel}>Completed</span>
            <span className={styles.cardValue}>{summary.completedTasks}</span>
          </button>
          <button
            type="button"
            className={`${styles.card} ${styles.cardRisk} ${styles[`cardRisk${performanceRisk.riskColor.charAt(0).toUpperCase() + performanceRisk.riskColor.slice(1)}`]}`}
            onClick={() => setRiskModalOpen(true)}
          >
            <span className={styles.cardLabel}>Performance Risk Overview</span>
            <span className={styles.cardValue}>{performanceRisk.delayRate}%</span>
            <span className={styles.cardRiskLabel}>{performanceRisk.riskLevel}</span>
            <span className={styles.cardRiskTrend}>
              {performanceRisk.trendDirection === 'up' ? '↑' : '↓'} {performanceRisk.trendDirection === 'up' ? '+' : ''}{performanceRisk.trendPercent}% vs last week
            </span>
          </button>
        </div>
      </section>

      <section className={`${styles.section} ${styles.tableSection}`}>
        <div className={styles.filtersRow}>
          <h2 className={styles.sectionTitle}>
            {clickedCard === 'completed' ? 'Completed Tasks' : clickedCard === 'delayed' ? 'Delayed Tasks' : clickedCard === 'flagged' ? 'Flagged Issues' : clickedCard === 'on_time' ? 'On Time Tasks' : 'Active Workers'}
          </h2>
          <div className={styles.filtersActions}>
            <button type="button" className={styles.exportBtn} onClick={exportToCSV}>
              <i className="fas fa-file-csv fa-fw" /> Export CSV
            </button>
            <button type="button" className={styles.exportBtn} onClick={printTable}>
              <i className="fas fa-print fa-fw" /> Print
            </button>
          </div>
        </div>
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label>Department</label>
            <select
              value={filterDept}
              onChange={(e) => {
                setFilterDept(e.target.value)
                setFilterTaskId('')
              }}
            >
              <option value="">All</option>
              {DEPARTMENT_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label>Task</label>
            <select
              value={filterTaskId}
              onChange={(e) => setFilterTaskId(e.target.value)}
              disabled={!filterDept}
              title={!filterDept ? 'Select department first' : ''}
            >
              <option value="">All</option>
              {tasksForFilter.map((task) => (
                <option key={task.id} value={task.id}>{taskLabelByLang(task, lang)}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label>Zone</label>
            <select value={filterZone} onChange={(e) => setFilterZone(e.target.value)}>
              <option value="">All</option>
              {zonesList.map((z) => (
                <option key={z.id} value={z.id}>{z.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label>Worker (name or ID)</label>
            <input
              type="search"
              placeholder="Search..."
              value={searchWorker}
              onChange={(e) => setSearchWorker(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th><button type="button" className={styles.thSort} onClick={() => handleSort('workerName')}>Worker Name {sortBy === 'workerName' && (sortOrder === 'asc' ? '↑' : '↓')}</button></th>
                <th><button type="button" className={styles.thSort} onClick={() => handleSort('department')}>Department {sortBy === 'department' && (sortOrder === 'asc' ? '↑' : '↓')}</button></th>
                <th><button type="button" className={styles.thSort} onClick={() => handleSort('task')}>Task {sortBy === 'task' && (sortOrder === 'asc' ? '↑' : '↓')}</button></th>
                <th><button type="button" className={styles.thSort} onClick={() => handleSort('zone')}>Zone {sortBy === 'zone' && (sortOrder === 'asc' ? '↑' : '↓')}</button></th>
                <th>Lines / Area</th>
                <th><button type="button" className={styles.thSort} onClick={() => handleSort('startTime')}>Start Time {sortBy === 'startTime' && (sortOrder === 'asc' ? '↑' : '↓')}</button></th>
                <th><button type="button" className={styles.thSort} onClick={() => handleSort('elapsedMinutes')}>Duration {sortBy === 'elapsedMinutes' && (sortOrder === 'asc' ? '↑' : '↓')}</button></th>
                <th>Source</th>
                <th><button type="button" className={styles.thSort} onClick={() => handleSort('status')}>Status {sortBy === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}</button></th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.length === 0 ? (
                <tr>
                  <td colSpan={10} className={styles.emptyCell}>
                    No active sessions match the filters.
                  </td>
                </tr>
              ) : (
                sortedFiltered.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.workerName}
                      {s.employeeId && <span className={styles.workerId}> ({s.employeeId})</span>}
                    </td>
                    <td>{s.department}</td>
                    <td>{s.task}</td>
                    <td>{s.zone}</td>
                    <td>{s.linesArea}</td>
                    <td>{new Date(s.startTime).toLocaleString()}</td>
                    <td>{formatDuration(s.elapsedMinutes)}</td>
                    <td>{s.assignedByEngineer ? 'Assigned' : 'Self-started'}</td>
                    <td>
                      {s.status === 'completed' ? (
                        <span className={styles.statusBadge} data-status="completed" style={{ background: '#dcfce7', color: '#166534' }}>
                          Completed
                        </span>
                      ) : (
                        <span className={styles.statusBadge} data-status={s.status}>
                          {SESSION_STATUS_LABELS[s.status]}
                        </span>
                      )}
                    </td>
                    <td>
                      <button type="button" className={styles.actionLink} onClick={() => setViewSession(s)}>View</button>
                      {' · '}
                      <button type="button" className={styles.actionLink} onClick={() => setProfileWorker((workers || []).find((w) => String(w.id) === String(s.workerId)) || null)}>Profile</button>
                      {s.status !== 'completed' && (
                        <>
                          {' · '}
                          <button type="button" className={styles.actionLink} onClick={() => { setNoteSession(s); setNoteText(''); }}>Note</button>
                          {' · '}
                          <button type="button" className={styles.actionLink} onClick={() => toggleFlag(s.id)}>
                            {s.flagged ? 'Unflag' : 'Flag'}
                          </button>
                          {' · '}
                          <button type="button" className={styles.actionLinkComplete} onClick={() => markCompleted(s.id)}>
                            Complete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* View session modal – use latest from store so notes/flag updates show */}
      {viewSession && (() => {
        const currentSession = sessions.find((s) => s.id === viewSession.id) || viewSession
        return (
        <div className={styles.modalOverlay} onClick={() => setViewSession(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Session details</h3>
            <dl className={styles.dl}>
              <dt>Worker</dt><dd>{currentSession.workerName}</dd>
              <dt>Department</dt><dd>{currentSession.department}</dd>
              <dt>Task</dt><dd>{taskLabelByLang(getTaskById(currentSession.taskId), lang) || currentSession.task}</dd>
              <dt>Zone</dt><dd>{currentSession.zone}</dd>
              <dt>Lines / Area</dt><dd>{currentSession.linesArea}</dd>
              <dt>Start Time</dt><dd>{new Date(currentSession.startTime).toLocaleString()}</dd>
              <dt>Expected</dt><dd>{currentSession.expectedMinutes} min</dd>
              <dt>Status</dt><dd><span className={styles.statusBadge} data-status={currentSession.flagged ? SESSION_STATUS.FLAGGED : getSessionStatus(currentSession)}>{SESSION_STATUS_LABELS[currentSession.flagged ? SESSION_STATUS.FLAGGED : getSessionStatus(currentSession)]}</span></dd>
              <dt>Source</dt><dd>{currentSession.assignedByEngineer ? 'Assigned by engineer' : 'Self-started by worker'}</dd>
              <dt>Notes</dt>
              <dd>
                {currentSession.notes?.length ? (
                  <ul className={styles.notesList}>
                    {currentSession.notes.map((n, i) => (
                      <li key={i}>{new Date(n.at).toLocaleString()}: {n.text}</li>
                    ))}
                  </ul>
                ) : '—'}
              </dd>
            </dl>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setViewSession(null)}>Close</button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Add note modal */}
      {noteSession && (
        <div className={styles.modalOverlay} onClick={() => { setNoteSession(null); setNoteText(''); }}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Add note – {noteSession.workerName}</h3>
            <textarea
              className={styles.noteTextarea}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Operational note..."
              rows={4}
            />
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => { setNoteSession(null); setNoteText(''); }}>Cancel</button>
              <button type="button" className={styles.btnPrimary} onClick={() => addNote(noteSession.id, noteText)} disabled={!noteText.trim()}>
                Save note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile popup – worker credentials & data */}
      {profileWorker && (
        <div className={styles.modalOverlay} onClick={() => setProfileWorker(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}><i className="fas fa-user fa-fw" /> {profileWorker.fullName}</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setProfileWorker(null)} aria-label="Close">×</button>
            </div>
            <p className={styles.profileSubtitle}>{profileWorker.employeeId} · {profileWorker.department}</p>
            <div className={styles.profileCreds}>
              <div className={styles.profileCredRow}>
                <span className={styles.profileCredLabel}>Username</span>
                <strong className={styles.profileCredValue}>{profileWorker.employeeId || '—'}</strong>
              </div>
              <div className={styles.profileCredRow}>
                <span className={styles.profileCredLabel}>Password</span>
                <strong className={styles.profileCredValue}>{profileWorker.tempPassword || '—'}</strong>
              </div>
            </div>
            <div className={styles.profileQr}>
              <span className={styles.profileCredLabel}>QR code (login)</span>
              <img src={getQRCodeUrl(profileWorker.employeeId || '', 160)} alt="" className={styles.profileQrImg} />
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setProfileWorker(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Performance Risk Overview – expandable details */}
      {riskModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setRiskModalOpen(false)}>
          <div className={styles.riskModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}><i className="fas fa-chart-line fa-fw" /> Performance Risk Overview</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setRiskModalOpen(false)} aria-label="Close">×</button>
            </div>
            <section className={styles.riskSection}>
              <h4 className={styles.riskSectionTitle}>7-day delayed tasks</h4>
              <div className={styles.riskChartWrap}>
                <Line
                  data={{
                    labels: riskTrendByDay.map((d) => d.date),
                    datasets: [
                      {
                        label: 'Delayed count',
                        data: riskTrendByDay.map((d) => d.count),
                        borderColor: 'rgb(184, 83, 9)',
                        backgroundColor: 'rgba(184, 83, 9, 0.1)',
                        fill: true,
                        tension: 0.3,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { beginAtZero: true, ticks: { stepSize: 1 } },
                    },
                  }}
                  height={200}
                />
              </div>
            </section>
            <section className={styles.riskSection}>
              <h4 className={styles.riskSectionTitle}>Bottleneck insights</h4>
              <div className={styles.bottleneckGrid}>
                {bottleneckInsights.zone && (
                  <div className={styles.bottleneckCard}>
                    <span className={styles.bottleneckLabel}>Zone with highest delay rate</span>
                    <span className={styles.bottleneckName}>{bottleneckInsights.zone.name}</span>
                    <span className={`${styles.bottleneckRate} ${styles[`riskRate${getRiskLevel(bottleneckInsights.zone.rate).color.charAt(0).toUpperCase() + getRiskLevel(bottleneckInsights.zone.rate).color.slice(1)}`]}`}>
                      {bottleneckInsights.zone.rate}%
                    </span>
                    <span className={styles.bottleneckCount}>{bottleneckInsights.zone.delayed} delayed</span>
                  </div>
                )}
                {bottleneckInsights.department && (
                  <div className={styles.bottleneckCard}>
                    <span className={styles.bottleneckLabel}>Department with highest overdue rate</span>
                    <span className={styles.bottleneckName}>{bottleneckInsights.department.name}</span>
                    <span className={`${styles.bottleneckRate} ${styles[`riskRate${getRiskLevel(bottleneckInsights.department.rate).color.charAt(0).toUpperCase() + getRiskLevel(bottleneckInsights.department.rate).color.slice(1)}`]}`}>
                      {bottleneckInsights.department.rate}%
                    </span>
                    <span className={styles.bottleneckCount}>{bottleneckInsights.department.delayed} delayed</span>
                  </div>
                )}
              </div>
            </section>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setRiskModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

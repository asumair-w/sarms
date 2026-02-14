import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getSessionStatus,
  getElapsedMinutes,
  SESSION_STATUS,
  SESSION_STATUS_LABELS,
} from '../../data/monitorActive'
import { getTasksForDepartment, getTaskById, getInitialZones } from '../../data/workerFlow'
import { DEPARTMENT_OPTIONS } from '../../data/engineerWorkers'
import { useAppStore } from '../../context/AppStoreContext'
import { useLanguage } from '../../context/LanguageContext'
import styles from './MonitorActiveWork.module.css'

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
  const { sessions, updateSession, zones: storeZones } = useAppStore()
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

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000)
    return () => clearInterval(interval)
  }, [])

  const now = Date.now()
  const sessionsWithStatus = useMemo(
    () =>
      sessions.map((s) => ({
        ...s,
        status: getSessionStatus(s, now),
        elapsedMinutes: getElapsedMinutes(s, now),
      })),
    [sessions, tick, now]
  )

  const tasksForFilter = useMemo(() => getTasksForDepartment(filterDept), [filterDept])

  const filtered = useMemo(() => {
    let list = sessionsWithStatus
    if (clickedCard === 'active') list = list.filter((s) => s.status === SESSION_STATUS.ACTIVE)
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
  }, [sessionsWithStatus, clickedCard, filterDept, filterTaskId, filterZone, searchWorker])

  const summary = useMemo(() => {
    const active = sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.ACTIVE).length
    const delayed = sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.DELAYED).length
    const flagged = sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.FLAGGED).length
    return {
      activeWorkers: new Set(sessionsWithStatus.map((s) => s.workerId)).size,
      activeTasks: sessionsWithStatus.length,
      delayedTasks: delayed,
      flaggedIssues: flagged,
    }
  }, [sessionsWithStatus])

  const analyticsByZone = useMemo(() => {
    const map = {}
    sessionsWithStatus.forEach((s) => {
      const z = s.zone || s.zoneId || 'Other'
      map[z] = (map[z] || 0) + 1
    })
    return Object.entries(map).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  }, [sessionsWithStatus])
  const analyticsByDept = useMemo(() => {
    const map = {}
    sessionsWithStatus.forEach((s) => {
      const d = s.department || s.departmentId || 'Other'
      map[d] = (map[d] || 0) + 1
    })
    return Object.entries(map).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  }, [sessionsWithStatus])
  const analyticsByStatus = useMemo(() => [
    { id: SESSION_STATUS.ACTIVE, label: SESSION_STATUS_LABELS[SESSION_STATUS.ACTIVE], count: sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.ACTIVE).length },
    { id: SESSION_STATUS.DELAYED, label: SESSION_STATUS_LABELS[SESSION_STATUS.DELAYED], count: sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.DELAYED).length },
    { id: SESSION_STATUS.FLAGGED, label: SESSION_STATUS_LABELS[SESSION_STATUS.FLAGGED], count: sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.FLAGGED).length },
  ], [sessionsWithStatus])
  const maxZone = Math.max(1, ...analyticsByZone.map((x) => x.count))
  const maxDept = Math.max(1, ...analyticsByDept.map((x) => x.count))
  const maxStatus = Math.max(1, ...analyticsByStatus.map((x) => x.count))

  function refresh() {
    setTick((t) => t + 1)
  }

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

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><i className="fas fa-chart-pie fa-fw" /> Summary</h2>
        <div className={styles.cards}>
          <button
            type="button"
            className={`${styles.card} ${clickedCard === 'active' ? styles.cardActive : ''}`}
            onClick={() => setClickedCard(clickedCard === 'active' ? null : 'active')}
          >
            <span className={styles.cardLabel}>Active Workers</span>
            <span className={styles.cardValue}>{summary.activeWorkers}</span>
          </button>
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
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.filtersRow}>
          <h2 className={styles.sectionTitle}><i className="fas fa-filter fa-fw" /> Filters</h2>
          <button type="button" className={styles.refreshBtn} onClick={refresh}>
            Refresh
          </button>
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
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Active Workers</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Worker Name</th>
                <th>Department</th>
                <th>Task</th>
                <th>Zone</th>
                <th>Lines / Area</th>
                <th>Start Time</th>
                <th>Duration</th>
                <th>Source</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className={styles.emptyCell}>
                    No active sessions match the filters.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id}>
                    <td>{s.workerName}</td>
                    <td>{s.department}</td>
                    <td>{s.task}</td>
                    <td>{s.zone}</td>
                    <td>{s.linesArea}</td>
                    <td>{new Date(s.startTime).toLocaleString()}</td>
                    <td>{formatDuration(s.elapsedMinutes)}</td>
                    <td>{s.assignedByEngineer ? 'Assigned' : 'Self-started'}</td>
                    <td>
                      <span className={styles.statusBadge} data-status={s.status}>
                        {SESSION_STATUS_LABELS[s.status]}
                      </span>
                    </td>
                    <td>
                      <button type="button" className={styles.actionLink} onClick={() => setViewSession(s)}>View</button>
                      {' · '}
                      <button type="button" className={styles.actionLink} onClick={() => { setNoteSession(s); setNoteText(''); }}>Note</button>
                      {' · '}
                      <button type="button" className={styles.actionLink} onClick={() => toggleFlag(s.id)}>
                        {s.flagged ? 'Unflag' : 'Flag'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.analyticsSection}>
        <h2 className={styles.sectionTitle}><i className="fas fa-chart-column fa-fw" /> Analytics</h2>
        <div className={styles.chartsRow}>
          <div className={styles.chartWrap}>
            <div className={styles.chartCaption}>Sessions by zone</div>
            <div className={styles.barChart}>
              {analyticsByZone.map((row, i) => (
                <div key={i} className={styles.barRow}>
                  <span className={styles.barLabel}>{row.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(row.count / maxZone) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{row.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.chartWrap}>
            <div className={styles.chartCaption}>Sessions by department</div>
            <div className={styles.barChart}>
              {analyticsByDept.map((row, i) => (
                <div key={i} className={styles.barRow}>
                  <span className={styles.barLabel}>{row.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(row.count / maxDept) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{row.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.chartWrap}>
            <div className={styles.chartCaption}>Sessions by status</div>
            <div className={styles.barChart}>
              {analyticsByStatus.map((row) => (
                <div key={row.id} className={styles.barRow}>
                  <span className={styles.barLabel}>{row.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(row.count / maxStatus) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{row.count}</span>
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
    </div>
  )
}

import { useState, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ROLE_OPTIONS,
  DEPARTMENT_OPTIONS,
  SKILL_OPTIONS,
} from '../../data/engineerWorkers'
import { useAppStore } from '../../context/AppStoreContext'
import { useLanguage } from '../../context/LanguageContext'
import { getTranslation } from '../../i18n/translations'
import { TASK_STATUS } from '../../data/assignTask'
import styles from './RegisterManageWorkers.module.css'

const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]))
const DEPT_LABEL = Object.fromEntries(DEPARTMENT_OPTIONS.map((d) => [d.value, d.label]))

function getWeekStart() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.getFullYear(), d.getMonth(), diff)
  monday.setHours(0, 0, 0, 0)
  return monday.getTime()
}

function getAccountStatus(worker) {
  return worker.status === 'active' ? 'active' : 'not_active'
}

function isInTask(worker, sessions) {
  return !!(sessions && sessions.some((s) => String(s.workerId) === String(worker.id)))
}

const IS_WORKER_OR_TECH = (role) => role === 'worker' || role === 'technician'

/** Tasks assigned to worker (workerIds includes id). */
function getWorkerTasks(tasks, workerId) {
  const wid = String(workerId)
  return (tasks || []).filter((t) => (t.workerIds || []).some((id) => String(id) === wid))
}

/** Tasks this week (createdAt >= week start). */
function getTasksThisWeek(tasks, workerId) {
  const weekStart = getWeekStart()
  return getWorkerTasks(tasks, workerId).filter((t) => new Date(t.createdAt).getTime() >= weekStart)
}

/** Overdue: not completed and past due (createdAt + estimatedMinutes). */
function getOverdueTasks(tasks, workerId) {
  const now = Date.now()
  return getWorkerTasks(tasks, workerId).filter((t) => {
    if (t.status === TASK_STATUS.COMPLETED) return false
    const created = new Date(t.createdAt).getTime()
    const mins = t.estimatedMinutes || 60
    const due = created + mins * 60 * 1000
    return due < now
  })
}

/** Active tasks (in progress or approved). */
function getActiveTasks(tasks, workerId) {
  return getWorkerTasks(tasks, workerId).filter(
    (t) => t.status === TASK_STATUS.IN_PROGRESS || t.status === TASK_STATUS.APPROVED
  )
}

function getEfficiency(tasks, workerId) {
  const assigned = getWorkerTasks(tasks, workerId)
  if (assigned.length === 0) return null
  const completed = assigned.filter((t) => t.status === TASK_STATUS.COMPLETED).length
  return Math.round((completed / assigned.length) * 100)
}

function efficiencyClass(pct) {
  if (pct == null) return ''
  if (pct > 80) return 'effHigh'
  if (pct >= 60) return 'effMid'
  return 'effLow'
}

export default function RegisterManageWorkers() {
  const location = useLocation()
  const isEngineerRoute = location.pathname.startsWith('/engineer')
  const { lang } = useLanguage()
  const t = (key) => getTranslation(lang, 'engineer', key)
  const { sessions, tasks, workers, updateWorker } = useAppStore()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterSkill, setFilterSkill] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editWorker, setEditWorker] = useState(null)
  const [editForm, setEditForm] = useState({ fullName: '', role: '', department: '', status: '', skills: [] })

  const weekStart = useMemo(() => getWeekStart(), [])

  /** Engineer must not see or filter by Admin role. */
  const roleOptions = useMemo(
    () => (isEngineerRoute ? ROLE_OPTIONS.filter((r) => r.value !== 'admin') : ROLE_OPTIONS),
    [isEngineerRoute]
  )

  const filtered = useMemo(() => {
    let list = workers || []
    if (isEngineerRoute) list = list.filter((w) => w.role !== 'admin')
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((w) => w.fullName.toLowerCase().includes(q) || (w.employeeId && w.employeeId.toLowerCase().includes(q)))
    }
    if (filterRole) list = list.filter((w) => w.role === filterRole)
    if (filterDept) list = list.filter((w) => w.department === filterDept)
    if (filterStatus) list = list.filter((w) => getAccountStatus(w) === filterStatus)
    if (filterSkill) list = list.filter((w) => (w.skills || []).includes(filterSkill))
    return list
  }, [workers, search, filterRole, filterDept, filterStatus, filterSkill, isEngineerRoute])

  const ranking = useMemo(() => {
    const list = isEngineerRoute ? (workers || []).filter((w) => w.role !== 'admin') : (workers || [])
    const now = Date.now()
    let topPerformer = null
    let mostOverloaded = null
    let mostDelayed = null
    let maxCompleted = 0
    let maxActive = 0
    let maxOverdue = 0
    list.forEach((w) => {
      const weekTasks = getWorkerTasks(tasks || [], w.id).filter((t) => new Date(t.createdAt).getTime() >= weekStart)
      const completedThisWeek = weekTasks.filter((t) => t.status === TASK_STATUS.COMPLETED).length
      const activeCount = getActiveTasks(tasks || [], w.id).length
      const overdueCount = getOverdueTasks(tasks || [], w.id).length
      if (completedThisWeek > maxCompleted) {
        maxCompleted = completedThisWeek
        topPerformer = { worker: w, value: completedThisWeek }
      }
      if (activeCount > maxActive) {
        maxActive = activeCount
        mostOverloaded = { worker: w, value: activeCount }
      }
      if (overdueCount > maxOverdue) {
        maxOverdue = overdueCount
        mostDelayed = { worker: w, value: overdueCount }
      }
    })
    return { topPerformer, mostOverloaded, mostDelayed }
  }, [workers, tasks, weekStart, isEngineerRoute])

  function openEdit(w) {
    setEditWorker(w)
    setEditForm({
      fullName: w.fullName,
      role: w.role,
      department: w.department,
      status: w.status,
      skills: Array.isArray(w.skills) ? [...w.skills] : [],
    })
    setEditOpen(true)
  }

  function saveEdit(e) {
    e.preventDefault()
    if (!editWorker) return
    updateWorker(editWorker.id, {
      fullName: editForm.fullName,
      role: editForm.role,
      department: editForm.department,
      status: editForm.status,
      skills: editForm.skills,
    })
    setEditOpen(false)
  }

  function toggleSkill(skill) {
    setEditForm((f) => ({
      ...f,
      skills: f.skills.includes(skill) ? f.skills.filter((s) => s !== skill) : [...f.skills, skill],
    }))
  }

  const profileBase = isEngineerRoute ? '/engineer/register/worker' : '/admin/register/worker'

  return (
    <div className={styles.page}>
      <h1 className={styles.title}><i className="fas fa-users fa-fw" /> {t('navRegister')}</h1>

      {/* Worker Ranking Widget */}
      <section className={styles.rankingSection}>
        <h2 className={styles.rankingTitle}><i className="fas fa-trophy fa-fw" /> Worker Ranking</h2>
        <div className={styles.rankingGrid}>
          <div className={styles.rankingCard}>
            <span className={styles.rankingLabel}>Top Performer (this week)</span>
            {ranking.topPerformer ? (
              isEngineerRoute ? (
                <Link to={`${profileBase}/${ranking.topPerformer.worker.id}`} className={styles.rankingLink}>
                  {ranking.topPerformer.worker.fullName}
                </Link>
              ) : (
                <span className={styles.rankingName}>{ranking.topPerformer.worker.fullName}</span>
              )
            ) : (
              <span className={styles.cellMuted}>—</span>
            )}
            {ranking.topPerformer && <span className={styles.rankingMetric}>{ranking.topPerformer.value} completed</span>}
          </div>
          <div className={styles.rankingCard}>
            <span className={styles.rankingLabel}>Most Overloaded (active tasks)</span>
            {ranking.mostOverloaded && ranking.mostOverloaded.value > 0 ? (
              isEngineerRoute ? (
                <Link to={`${profileBase}/${ranking.mostOverloaded.worker.id}`} className={styles.rankingLink}>
                  {ranking.mostOverloaded.worker.fullName}
                </Link>
              ) : (
                <span className={styles.rankingName}>{ranking.mostOverloaded.worker.fullName}</span>
              )
            ) : (
              <span className={styles.cellMuted}>—</span>
            )}
            {ranking.mostOverloaded && ranking.mostOverloaded.value > 0 && (
              <span className={styles.rankingMetric}>{ranking.mostOverloaded.value} active</span>
            )}
          </div>
          <div className={styles.rankingCard}>
            <span className={styles.rankingLabel}>Most Delayed (overdue)</span>
            {ranking.mostDelayed && ranking.mostDelayed.value > 0 ? (
              isEngineerRoute ? (
                <Link to={`${profileBase}/${ranking.mostDelayed.worker.id}`} className={styles.rankingLink}>
                  {ranking.mostDelayed.worker.fullName}
                </Link>
              ) : (
                <span className={styles.rankingName}>{ranking.mostDelayed.worker.fullName}</span>
              )
            ) : (
              <span className={styles.cellMuted}>—</span>
            )}
            {ranking.mostDelayed && ranking.mostDelayed.value > 0 && (
              <span className={styles.rankingMetric}>{ranking.mostDelayed.value} overdue</span>
            )}
          </div>
        </div>
      </section>

      <div className={styles.filters}>
        <input
          type="search"
          className={styles.search}
          placeholder="Search by name or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={styles.filter} value={isEngineerRoute && filterRole === 'admin' ? '' : filterRole} onChange={(e) => setFilterRole(e.target.value)}>
          <option value="">All roles</option>
          {roleOptions.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <select className={styles.filter} value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
          <option value="">All departments</option>
          {DEPARTMENT_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
        <select className={styles.filter} value={filterSkill} onChange={(e) => setFilterSkill(e.target.value)}>
          <option value="">All skills</option>
          {SKILL_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className={styles.filter} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All (account)</option>
          <option value="active">Active</option>
          <option value="not_active">Not active</option>
        </select>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Full Name</th>
              <th>Skills</th>
              <th>Role</th>
              <th>Department</th>
              <th>Account</th>
              <th>In task</th>
              <th>Tasks This Week</th>
              <th>Overdue</th>
              <th>Efficiency %</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => {
              const accountStatus = getAccountStatus(w)
              const accountLabel = accountStatus === 'active' ? 'Active' : 'Not active'
              const accountCls = accountStatus === 'active' ? styles.badgeActive : styles.badgeNotActive
              const showInTask = IS_WORKER_OR_TECH(w.role)
              const inTask = showInTask && isInTask(w, sessions)
              const tasksWeek = getTasksThisWeek(tasks || [], w.id).length
              const overdue = getOverdueTasks(tasks || [], w.id).length
              const eff = getEfficiency(tasks || [], w.id)
              const effCls = styles[efficiencyClass(eff)]
              const skills = Array.isArray(w.skills) ? w.skills : []
              return (
                <tr key={w.id}>
                  <td className={styles.cellId}>{w.employeeId}</td>
                  <td>
                    {isEngineerRoute ? (
                      <Link to={`${profileBase}/${w.id}`} className={styles.nameLink}>{w.fullName}</Link>
                    ) : (
                      w.fullName
                    )}
                  </td>
                  <td>
                    <div className={styles.skillTags}>
                      {skills.length ? skills.map((s) => <span key={s} className={styles.skillTag}>{s}</span>) : <span className={styles.cellMuted}>—</span>}
                    </div>
                  </td>
                  <td>{ROLE_LABEL[w.role] ?? w.role}</td>
                  <td>{DEPT_LABEL[w.department] ?? w.department}</td>
                  <td><span className={accountCls}>{accountLabel}</span></td>
                  <td>
                    {showInTask ? (
                      inTask ? <span className={styles.badgeInTask}>Yes</span> : <span className={styles.badgeNotInTask}>No</span>
                    ) : (
                      <span className={styles.cellMuted}>—</span>
                    )}
                  </td>
                  <td>{tasksWeek}</td>
                  <td>{overdue}</td>
                  <td><span className={effCls}>{eff != null ? `${eff}%` : '—'}</span></td>
                  <td>
                    <div className={styles.actionsCell}>
                      <Link to={`${profileBase}/${w.id}`} className={styles.actionBtn}>View</Link>
                      <button type="button" className={styles.actionBtn} onClick={() => openEdit(w)} title="Edit">Edit</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className={styles.empty}>No workers match your filters.</p>
        )}
      </div>

      {editOpen && editWorker && (
        <div className={styles.overlay} onClick={() => setEditOpen(false)}>
          <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.panelHeader}>
              <h2>Edit Worker</h2>
              <button type="button" className={styles.closeBtn} onClick={() => setEditOpen(false)} aria-label="Close">×</button>
            </div>
            <form onSubmit={saveEdit} className={styles.form}>
              <label className={styles.label}>Full Name *</label>
              <input className={styles.input} value={editForm.fullName} onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))} required />
              <label className={styles.label}>Role</label>
              <select className={styles.input} value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}>
                {roleOptions.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <label className={styles.label}>Department</label>
              <select className={styles.input} value={editForm.department} onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}>
                {DEPARTMENT_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
              <label className={styles.label}>Account Status</label>
              <select className={styles.input} value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="inactive">Not active</option>
              </select>
              <label className={styles.label}>Skills</label>
              <div className={styles.skillCheckboxGrid}>
                {SKILL_OPTIONS.map((skill) => (
                  <label key={skill} className={styles.skillCheckbox}>
                    <input type="checkbox" checked={editForm.skills.includes(skill)} onChange={() => toggleSkill(skill)} />
                    <span>{skill}</span>
                  </label>
                ))}
              </div>
              <div className={styles.formActions}>
                <button type="submit" className={styles.primaryBtn}>Save</button>
                <button type="button" className={styles.secondaryBtn} onClick={() => setEditOpen(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

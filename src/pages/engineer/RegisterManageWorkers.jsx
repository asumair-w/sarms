import { useState, useMemo, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import {
  ROLE_OPTIONS,
  DEPARTMENT_OPTIONS,
  SKILL_OPTIONS,
  generateEmployeeId,
  getQRCodeUrl,
} from '../../data/engineerWorkers'
import { useAppStore } from '../../context/AppStoreContext'
import { useLanguage } from '../../context/LanguageContext'
import { getTranslation } from '../../i18n/translations'
import { TASK_STATUS } from '../../data/assignTask'
import styles from './RegisterManageWorkers.module.css'

const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]))
const DEPT_LABEL = Object.fromEntries(DEPARTMENT_OPTIONS.map((d) => [d.value, d.label]))

/** Map skill option value to translation key (engineer.skillXxx). */
const SKILL_KEY_MAP = {
  'Harvesting': 'skillHarvesting',
  'Irrigation': 'skillIrrigation',
  'Machine Repair': 'skillMachineRepair',
  'Inspection': 'skillInspection',
  'Plant Care': 'skillPlantCare',
  'Packing': 'skillPacking',
  'Storage': 'skillStorage',
  'Spraying / Treatment': 'skillSprayingTreatment',
  'Monitoring': 'skillMonitoring',
  'Preventive Maintenance': 'skillPreventiveMaintenance',
  'Testing': 'skillTesting',
  'Quality Check': 'skillQualityCheck',
}

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

const IS_WORKER = (role) => role === 'worker'

/** Normalize task status for consistent comparison. */
function normalizeTaskStatus(status) {
  if (!status) return null
  const s = String(status).toLowerCase()
  if (s === TASK_STATUS.PENDING_APPROVAL || s === 'approved') return TASK_STATUS.PENDING_APPROVAL
  if (s === TASK_STATUS.IN_PROGRESS) return TASK_STATUS.IN_PROGRESS
  if (s === TASK_STATUS.FINISHED_BY_WORKER) return TASK_STATUS.FINISHED_BY_WORKER
  if (s === TASK_STATUS.COMPLETED) return TASK_STATUS.COMPLETED
  if (s === TASK_STATUS.REJECTED) return TASK_STATUS.REJECTED
  return null
}

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

/** Overdue: not completed and past due. Uses session start time when task has an active session. */
function getOverdueTasks(tasks, workerId, sessions = []) {
  const now = Date.now()
  const activeSessionsByTaskId = sessions
    .filter((s) => !s.completedAt && s.taskId)
    .reduce((acc, s) => {
      acc[String(s.taskId)] = s
      return acc
    }, {})
  return getWorkerTasks(tasks, workerId).filter((t) => {
    if (normalizeTaskStatus(t.status) === TASK_STATUS.COMPLETED) return false
    const created = t.createdAt ? new Date(t.createdAt).getTime() : 0
    const session = activeSessionsByTaskId[String(t.id)]
    if (!session && !created) return false
    const mins = t.estimatedMinutes || 60
    const dueTime = session
      ? new Date(session.startTime).getTime() + (session.expectedMinutes ?? mins) * 60 * 1000
      : created + mins * 60 * 1000
    if (!Number.isFinite(dueTime) || dueTime <= 0) return false
    return dueTime < now
  })
}

/** Active tasks (pending approval or in progress). */
function getActiveTasks(tasks, workerId) {
  return getWorkerTasks(tasks, workerId).filter((t) => {
    const status = normalizeTaskStatus(t.status)
    return status === TASK_STATUS.IN_PROGRESS || status === TASK_STATUS.PENDING_APPROVAL || status === TASK_STATUS.FINISHED_BY_WORKER
  })
}

function getEfficiency(tasks, workerId) {
  const assigned = getWorkerTasks(tasks, workerId)
  if (assigned.length === 0) return null
  const completed = assigned.filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.COMPLETED).length
  return Math.round((completed / assigned.length) * 100)
}

function efficiencyClass(pct) {
  if (pct == null) return ''
  if (pct > 80) return 'effHigh'
  if (pct >= 60) return 'effMid'
  return 'effLow'
}

function RegisterManageWorkers() {
  const location = useLocation()
  const isEngineerRoute = location.pathname.startsWith('/engineer')
  const { lang } = useLanguage()
  const t = (key) => getTranslation(lang, 'engineer', key)
  const getSkillLabel = (skill) => t(SKILL_KEY_MAP[skill] || skill)
  const getRoleLabel = (role) => (role ? t('role' + (role.charAt(0).toUpperCase() + role.slice(1))) : '')
  const getDeptLabel = (dept) => (dept ? t('dept' + (dept.charAt(0).toUpperCase() + dept.slice(1))) : '')
  const { sessions, tasks, workers, updateWorker, setWorkers } = useAppStore()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterSkill, setFilterSkill] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editWorker, setEditWorker] = useState(null)
  const [editForm, setEditForm] = useState({ fullName: '', role: '', department: '', status: '', skills: [] })
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({
    fullName: '',
    role: 'worker',
    department: 'farming',
    status: 'active',
    skills: [],
    phone: '',
    email: '',
  })
  const [createdWorker, setCreatedWorker] = useState(null)
  const workersTableRef = useRef(null)

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
    let topPerformer = null
    let mostOverloaded = null
    let mostDelayed = null
    let maxCompleted = 0
    let maxActive = 0
    let maxOverdue = 0
    list.forEach((w) => {
      const weekTasks = getWorkerTasks(tasks || [], w.id).filter((t) => new Date(t.createdAt).getTime() >= weekStart)
      const completedThisWeek = weekTasks.filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.COMPLETED).length
      const activeCount = getActiveTasks(tasks || [], w.id).length
      const overdueCount = getOverdueTasks(tasks || [], w.id, sessions || []).length
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
  }, [workers, tasks, sessions, weekStart, isEngineerRoute])

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

  function deleteWorker() {
    if (!editWorker || !setWorkers) return
    if (!window.confirm(`Delete "${editWorker.fullName}" (${editWorker.employeeId}) permanently? This cannot be undone.`)) return
    const list = (workers || []).filter((w) => w.id !== editWorker.id)
    setWorkers(list)
    setEditOpen(false)
    setEditWorker(null)
  }

  function toggleSkill(skill) {
    setEditForm((f) => ({
      ...f,
      skills: f.skills.includes(skill) ? f.skills.filter((s) => s !== skill) : [...f.skills, skill],
    }))
  }

  function openAdd() {
    setAddForm({
      fullName: '',
      role: 'worker',
      department: 'farming',
      status: 'active',
      skills: [],
      phone: '',
      email: '',
    })
    setCreatedWorker(null)
    setAddOpen(true)
  }

  function toggleAddSkill(skill) {
    setAddForm((f) => ({
      ...f,
      skills: f.skills.includes(skill) ? f.skills.filter((s) => s !== skill) : [...f.skills, skill],
    }))
  }

  function saveAddWorker(e) {
    e.preventDefault()
    if (!addForm.fullName.trim() || !setWorkers) return
    const list = workers || []
    const employeeId = generateEmployeeId(addForm.role, list)
    const tempPassword = employeeId
    const newId = list.length > 0 ? String(Math.max(...list.map((w) => parseInt(w.id, 10) || 0)) + 1) : '1'
    const newWorker = {
      id: newId,
      employeeId,
      fullName: addForm.fullName.trim(),
      phone: addForm.phone.trim() || '',
      email: addForm.email.trim() || '',
      nationality: '',
      role: addForm.role,
      department: addForm.department,
      status: addForm.status,
      tempPassword,
      createdAt: new Date().toISOString(),
      skills: Array.isArray(addForm.skills) ? [...addForm.skills] : [],
    }
    setWorkers([...list, newWorker])
    setCreatedWorker({ employeeId, tempPassword, fullName: newWorker.fullName })
  }

  function closeAddAndCreated() {
    setAddOpen(false)
    setCreatedWorker(null)
  }

  function exportEmployeesPDF() {
    const el = workersTableRef.current
    if (!el) return
    html2canvas(el, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()
      const margin = 10
      const w = pdfW - margin * 2
      const h = (canvas.height * w) / canvas.width

      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Worker List', margin, 12)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.text(new Date().toLocaleString(), margin, 18)

      let y = 24
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Filters applied:', margin, y)
      y += 5
      const roleLabel = filterRole ? (ROLE_LABEL[filterRole] || filterRole) : 'All'
      const deptLabel = filterDept ? (DEPT_LABEL[filterDept] || filterDept) : 'All'
      const skillLabel = filterSkill ? (SKILL_OPTIONS.includes(filterSkill) ? filterSkill : filterSkill) : 'All'
      const accountLabel = filterStatus === 'active' ? t('active') : filterStatus === 'not_active' ? t('notActive') : t('filterAll')
      const searchValue = search.trim() || '—'
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      const filterLine1 = `Role: ${roleLabel}   ·   Department: ${deptLabel}   ·   Skills: ${skillLabel}   ·   Account: ${accountLabel}`
      const filterLine2 = `Search: ${searchValue}`
      const filterLine3 = `Rows: ${filtered.length}`
      const lineH = 5
      const split1 = pdf.splitTextToSize(filterLine1, w)
      split1.forEach((line) => { pdf.text(line, margin, y); y += lineH })
      pdf.text(filterLine2, margin, y); y += lineH
      pdf.text(filterLine3, margin, y); y += lineH
      y += 3
      pdf.setDrawColor(220, 220, 220)
      pdf.line(margin, y, margin + w, y)
      y += 4
      const headerH = y
      const imgH = Math.min(h, pdfH - headerH - 4)
      const imgW = (canvas.width * imgH) / canvas.height
      const imgX = margin + (w - imgW) / 2
      pdf.addImage(imgData, 'PNG', imgX, headerH, imgW, imgH)
      pdf.save(`Workers-${new Date().toISOString().slice(0, 10)}.pdf`)
    }).catch(() => {})
  }

  const profileBase = isEngineerRoute ? '/engineer/register/worker' : '/admin/register/worker'

  return (
    <div className={styles.page}>
      {/* Worker Ranking Widget */}
      <section className={styles.rankingSection}>
        <h2 className={styles.rankingTitle}><i className="fas fa-trophy fa-fw" /> {t('workerRanking')}</h2>
        <div className={styles.rankingGrid}>
          {ranking.topPerformer ? (
            <Link to={`${profileBase}/${ranking.topPerformer.worker.id}`} className={`${styles.rankingCard} ${styles.rankingCardGold} ${styles.rankingCardLink}`}>
              <span className={styles.rankingLabel}>{t('topPerformerThisWeek')}</span>
              <span className={styles.rankingName}>{ranking.topPerformer.worker.fullName}</span>
              <span className={styles.rankingMetric}>{ranking.topPerformer.value} {t('completedLabel')}</span>
            </Link>
          ) : (
            <div className={`${styles.rankingCard} ${styles.rankingCardGold}`}>
              <span className={styles.rankingLabel}>{t('topPerformerThisWeek')}</span>
              <span className={styles.cellMuted}>—</span>
            </div>
          )}
          {ranking.mostOverloaded && ranking.mostOverloaded.value > 0 ? (
            <Link to={`${profileBase}/${ranking.mostOverloaded.worker.id}`} className={`${styles.rankingCard} ${styles.rankingCardNeutral} ${styles.rankingCardLink}`}>
              <span className={styles.rankingLabel}>{t('mostOverloadedActiveTasks')}</span>
              <span className={styles.rankingName}>{ranking.mostOverloaded.worker.fullName}</span>
              <span className={styles.rankingMetric}>{ranking.mostOverloaded.value} {t('activeLabel')}</span>
            </Link>
          ) : (
            <div className={`${styles.rankingCard} ${styles.rankingCardNeutral}`}>
              <span className={styles.rankingLabel}>{t('mostOverloadedActiveTasks')}</span>
              <span className={styles.cellMuted}>—</span>
            </div>
          )}
          {ranking.mostDelayed && ranking.mostDelayed.value > 0 ? (
            <Link to={`${profileBase}/${ranking.mostDelayed.worker.id}`} className={`${styles.rankingCard} ${styles.rankingCardBad} ${styles.rankingCardLink}`}>
              <span className={styles.rankingLabel}>{t('mostDelayedOverdue')}</span>
              <span className={styles.rankingName}>{ranking.mostDelayed.worker.fullName}</span>
              <span className={styles.rankingMetric}>{ranking.mostDelayed.value} {t('overdueLabel')}</span>
            </Link>
          ) : (
            <div className={`${styles.rankingCard} ${styles.rankingCardBad}`}>
              <span className={styles.rankingLabel}>{t('mostDelayedOverdue')}</span>
              <span className={styles.cellMuted}>—</span>
            </div>
          )}
        </div>
      </section>

      <div className={styles.filters}>
        <input
          type="search"
          className={styles.search}
          placeholder={t('searchByNameOrId')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={styles.filter} value={isEngineerRoute && filterRole === 'admin' ? '' : filterRole} onChange={(e) => setFilterRole(e.target.value)}>
          <option value="">{t('allRoles')}</option>
          {roleOptions.map((r) => (
            <option key={r.value} value={r.value}>{getRoleLabel(r.value)}</option>
          ))}
        </select>
        <select className={styles.filter} value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
          <option value="">{t('allDepartmentsOpt')}</option>
          {DEPARTMENT_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>{getDeptLabel(d.value)}</option>
          ))}
        </select>
        <select className={styles.filter} value={filterSkill} onChange={(e) => setFilterSkill(e.target.value)}>
          <option value="">{t('allSkills')}</option>
          {SKILL_OPTIONS.map((s) => (
            <option key={s} value={s}>{getSkillLabel(s)}</option>
          ))}
        </select>
        <select className={styles.filter} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">{t('allAccount')}</option>
          <option value="active">{t('active')}</option>
          <option value="not_active">{t('notActive')}</option>
        </select>
        <button type="button" className={styles.addWorkerBtn} onClick={openAdd}>
          <i className="fas fa-user-plus fa-fw" /> {t('addNewWorker')}
        </button>
        <button type="button" className={styles.exportPdfBtn} onClick={exportEmployeesPDF} disabled={filtered.length === 0} title="Export table to PDF">
          <i className="fas fa-file-pdf fa-fw" /> {t('exportPdf')}
        </button>
      </div>

      <div className={styles.tableWrap} ref={workersTableRef}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('employeeId')}</th>
              <th>{t('fullName')}</th>
              <th>{t('skills')}</th>
              <th>{t('role')}</th>
              <th>{t('department')}</th>
              <th>{t('account')}</th>
              <th>{t('inTask')}</th>
              <th>{t('tasksThisWeek')}</th>
              <th>{t('overdue')}</th>
              <th>{t('efficiencyPct')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => {
              const accountStatus = getAccountStatus(w)
              const accountLabel = accountStatus === 'active' ? t('active') : t('notActive')
              const accountCls = accountStatus === 'active' ? styles.badgeActive : styles.badgeNotActive
              const showInTask = IS_WORKER(w.role)
              const inTask = showInTask && isInTask(w, sessions)
              const tasksWeek = getTasksThisWeek(tasks || [], w.id).length
              const overdue = getOverdueTasks(tasks || [], w.id, sessions || []).length
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
                      {skills.length ? skills.map((s) => <span key={s} className={styles.skillTag}>{getSkillLabel(s)}</span>) : <span className={styles.cellMuted}>—</span>}
                    </div>
                  </td>
                  <td>{getRoleLabel(w.role) || w.role}</td>
                  <td>{getDeptLabel(w.department) || w.department}</td>
                  <td><span className={accountCls}>{accountLabel}</span></td>
                  <td>
                    {showInTask ? (
                      inTask ? <span className={styles.badgeInTask}>{t('yes')}</span> : <span className={styles.badgeNotInTask}>{t('no')}</span>
                    ) : (
                      <span className={styles.cellMuted}>—</span>
                    )}
                  </td>
                  <td>{tasksWeek}</td>
                  <td>{overdue}</td>
                  <td><span className={effCls}>{eff != null ? `${eff}%` : '—'}</span></td>
                  <td>
                    <div className={styles.actionsCell}>
                      <Link to={`${profileBase}/${w.id}`} className={styles.actionBtn}>{t('view')}</Link>
                      <button type="button" className={styles.actionBtn} onClick={() => openEdit(w)} title={t('edit')}>{t('edit')}</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className={styles.empty}>{t('noWorkersMatch')}</p>
        )}
      </div>

      {/* Add New Worker modal: form step */}
      {addOpen && !createdWorker && (
        <div className={styles.overlay} onClick={closeAddAndCreated}>
          <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.panelHeader}>
              <h2><i className="fas fa-user-plus fa-fw" /> {t('addNewWorker')}</h2>
              <button type="button" className={styles.closeBtn} onClick={closeAddAndCreated} aria-label={t('close')}>×</button>
            </div>
            <form onSubmit={saveAddWorker} className={styles.form}>
              <label className={styles.label}>{t('fullNameRequired')}</label>
              <input className={styles.input} value={addForm.fullName} onChange={(e) => setAddForm((f) => ({ ...f, fullName: e.target.value }))} placeholder={t('fullName')} required />
              <label className={styles.label}>{t('role')}</label>
              <select className={styles.input} value={addForm.role} onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}>
                {roleOptions.map((r) => (
                  <option key={r.value} value={r.value}>{getRoleLabel(r.value)}</option>
                ))}
              </select>
              <label className={styles.label}>{t('department')}</label>
              <select className={styles.input} value={addForm.department} onChange={(e) => setAddForm((f) => ({ ...f, department: e.target.value }))}>
                {DEPARTMENT_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{getDeptLabel(d.value)}</option>
                ))}
              </select>
              <label className={styles.label}>{t('accountStatus')}</label>
              <select className={styles.input} value={addForm.status} onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="active">{t('active')}</option>
                <option value="inactive">{t('notActive')}</option>
              </select>
              <label className={styles.label}>{t('phone')}</label>
              <input type="tel" className={styles.input} value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} placeholder={t('phonePlaceholder')} />
              <label className={styles.label}>{t('email')}</label>
              <input type="email" className={styles.input} value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} placeholder={t('emailPlaceholder')} />
              <label className={styles.label}>{t('skills')}</label>
              <div className={styles.skillCheckboxGrid}>
                {SKILL_OPTIONS.map((skill) => (
                  <label key={skill} className={styles.skillCheckbox}>
                    <input type="checkbox" checked={addForm.skills.includes(skill)} onChange={() => toggleAddSkill(skill)} />
                    <span>{getSkillLabel(skill)}</span>
                  </label>
                ))}
              </div>
              <div className={styles.formActions}>
                <button type="submit" className={styles.primaryBtn}>{t('createWorker')}</button>
                <button type="button" className={styles.secondaryBtn} onClick={closeAddAndCreated}>{t('cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Worker modal: success step (ID, password, QR) */}
      {addOpen && createdWorker && (
        <div className={styles.overlay} onClick={closeAddAndCreated}>
          <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.panelHeader}>
              <h2><i className="fas fa-check-circle fa-fw" /> {t('workerCreated')}</h2>
              <button type="button" className={styles.closeBtn} onClick={closeAddAndCreated} aria-label={t('close')}>×</button>
            </div>
            <div className={styles.createdPanel}>
              <p className={styles.createdName}>{createdWorker.fullName}</p>
              <div className={styles.createdRow}>
                <span className={styles.createdLabel}>{t('employeeIdLogin')}</span>
                <code className={styles.createdCode}>{createdWorker.employeeId}</code>
              </div>
              <div className={styles.createdRow}>
                <span className={styles.createdLabel}>{t('tempPassword')}</span>
                <code className={styles.createdCode}>{createdWorker.tempPassword}</code>
              </div>
              <div className={styles.qrWrap}>
                <span className={styles.createdLabel}>{t('qrCodeForLogin')}</span>
                <img src={getQRCodeUrl(createdWorker.employeeId, 180)} alt={`QR for ${createdWorker.employeeId}`} className={styles.qrImg} />
              </div>
              <p className={styles.createdHint}>{t('saveIdPasswordHint')}</p>
              <div className={styles.formActions}>
                <button type="button" className={styles.primaryBtn} onClick={closeAddAndCreated}>{t('done')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editOpen && editWorker && (
        <div className={styles.overlay} onClick={() => setEditOpen(false)}>
          <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.panelHeader}>
              <h2>{t('editWorker')}</h2>
              <button type="button" className={styles.closeBtn} onClick={() => setEditOpen(false)} aria-label={t('close')}>×</button>
            </div>
            <form onSubmit={saveEdit} className={styles.form}>
              <label className={styles.label}>{t('fullNameRequired')}</label>
              <input className={styles.input} value={editForm.fullName} onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))} required />
              <label className={styles.label}>{t('role')}</label>
              <select className={styles.input} value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}>
                {roleOptions.map((r) => (
                  <option key={r.value} value={r.value}>{getRoleLabel(r.value)}</option>
                ))}
              </select>
              <label className={styles.label}>{t('department')}</label>
              <select className={styles.input} value={editForm.department} onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}>
                {DEPARTMENT_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{getDeptLabel(d.value)}</option>
                ))}
              </select>
              <label className={styles.label}>{t('accountStatus')}</label>
              <select className={styles.input} value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="active">{t('active')}</option>
                <option value="inactive">{t('notActive')}</option>
              </select>
              <label className={styles.label}>{t('skills')}</label>
              <div className={styles.skillCheckboxGrid}>
                {SKILL_OPTIONS.map((skill) => (
                  <label key={skill} className={styles.skillCheckbox}>
                    <input type="checkbox" checked={editForm.skills.includes(skill)} onChange={() => toggleSkill(skill)} />
                    <span>{getSkillLabel(skill)}</span>
                  </label>
                ))}
              </div>
              <div className={styles.formActions}>
                <button type="submit" className={styles.primaryBtn}>{t('save')}</button>
                <button type="button" className={styles.secondaryBtn} onClick={() => setEditOpen(false)}>{t('cancel')}</button>
              </div>
              <div className={styles.deleteSection}>
                <button type="button" className={styles.dangerBtn} onClick={deleteWorker} title={t('deleteWorkerPermanently')}>
                  <i className="fas fa-user-minus fa-fw" /> {t('deleteWorkerPermanently')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default RegisterManageWorkers

import { useParams, useNavigate, Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useAppStore } from '../../context/AppStoreContext'
import { TASK_STATUS } from '../../data/assignTask'
import { DEPARTMENT_OPTIONS, getQRCodeUrl } from '../../data/engineerWorkers'
import styles from './WorkerProfile.module.css'

const DEPT_LABEL = Object.fromEntries(DEPARTMENT_OPTIONS.map((d) => [d.value, d.label]))

function getWeekStart() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.getFullYear(), d.getMonth(), diff)
  monday.setHours(0, 0, 0, 0)
  return monday.getTime()
}

function getWorkerTasks(tasks, workerId) {
  const wid = String(workerId)
  return (tasks || []).filter((t) => (t.workerIds || []).some((id) => String(id) === wid))
}

export default function WorkerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { workers, tasks, records, faults, sessions } = useAppStore()

  const userRole = typeof window !== 'undefined' ? sessionStorage.getItem('sarms-user-role') : null
  const canViewProfile = userRole === 'engineer' || userRole === 'admin'
  const backToRegister = userRole === 'admin' ? '/admin/register' : '/engineer/register'
  const worker = useMemo(() => (workers || []).find((w) => w.id === id), [workers, id])

  const stats = useMemo(() => {
    if (!worker) return null
    const workerTasks = getWorkerTasks(tasks || [], worker.id)
    const totalAssigned = workerTasks.length
    const completed = workerTasks.filter((t) => t.status === TASK_STATUS.COMPLETED).length
    const now = Date.now()
    const overdue = workerTasks.filter((t) => {
      if (t.status === TASK_STATUS.COMPLETED) return false
      const created = new Date(t.createdAt).getTime()
      const due = created + (t.estimatedMinutes || 60) * 60 * 1000
      return due < now
    }).length
    const activeTasks = workerTasks.filter(
      (t) => t.status === TASK_STATUS.IN_PROGRESS || t.status === TASK_STATUS.PENDING_APPROVAL || t.status === TASK_STATUS.FINISHED_BY_WORKER
    )
    const efficiency = totalAssigned > 0 ? Math.round((completed / totalAssigned) * 100) : null

    const workerRecords = (records || []).filter((r) => r.worker === worker.fullName)
    const faultRecords = workerRecords.filter((r) => r.recordType === 'fault_maintenance')
    const productionRecords = workerRecords.filter((r) => r.recordType === 'production')

    return {
      totalAssigned,
      completed,
      overdue,
      activeCount: activeTasks.length,
      efficiency,
      faultRecords,
      productionRecords,
      workerTasks,
    }
  }, [worker, tasks, records])

  const weeklyData = useMemo(() => {
    if (!worker || !stats) return []
    const weekStart = getWeekStart()
    const days = []
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    for (let i = 0; i < 7; i++) {
      const dayStart = weekStart + i * 86400000
      const dayEnd = dayStart + 86400000
      const count = stats.workerTasks.filter((t) => {
        const created = new Date(t.createdAt).getTime()
        return created >= dayStart && created < dayEnd
      }).length
      days.push({ label: dayNames[i], count })
    }
    return days
  }, [worker, stats])

  if (!canViewProfile) {
    navigate(backToRegister, { replace: true })
    return null
  }

  if (!worker) {
    return (
      <div className={styles.page}>
        <p className={styles.notFound}>Worker not found.</p>
        <Link to={backToRegister} className={styles.backLink}>← Back to Manage Workers</Link>
      </div>
    )
  }

  const inSession = (sessions || []).some((s) => String(s.workerId) === String(worker.id))
  const skills = Array.isArray(worker.skills) ? worker.skills : []
  const maxWeekCount = Math.max(1, ...weeklyData.map((d) => d.count))
  const loginUsername = worker.employeeId || ''
  const loginPassword = worker.tempPassword || ''
  const qrUrl = getQRCodeUrl(loginUsername, 180)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link to={backToRegister} className={styles.backLink}><i className="fas fa-arrow-left fa-fw" /> Back to Manage Workers</Link>
        <h1 className={styles.title}>{worker.fullName}</h1>
        <p className={styles.subtitle}>{worker.employeeId} · {DEPT_LABEL[worker.department] ?? worker.department}</p>
        {skills.length > 0 && (
          <div className={styles.skillTags}>
            {skills.map((s) => <span key={s} className={styles.skillTag}>{s}</span>)}
          </div>
        )}
      </div>

      <section className={styles.credentialsSection}>
        <h2 className={styles.sectionTitle}><i className="fas fa-key fa-fw" /> Login credentials</h2>
        <p className={styles.sectionDesc}>Username and password used to sign in to the system. QR code for quick login scan.</p>
        <div className={styles.credentialsRow}>
          <div className={styles.credentialsFields}>
            <div className={styles.credRow}>
              <span className={styles.credLabel}>Username</span>
              <strong className={styles.credValue}>{loginUsername || '—'}</strong>
            </div>
            <div className={styles.credRow}>
              <span className={styles.credLabel}>Password</span>
              <strong className={styles.credValue}>{loginPassword || '—'}</strong>
            </div>
          </div>
          <div className={styles.qrBlock}>
            <span className={styles.credLabel}>QR Code (login scan)</span>
            <img src={qrUrl} alt={`QR for ${loginUsername}`} className={styles.qrImage} />
          </div>
        </div>
      </section>

      <section className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Total tasks assigned</span>
          <span className={styles.cardValue}>{stats.totalAssigned}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Tasks completed</span>
          <span className={styles.cardValue}>{stats.completed}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Overdue tasks</span>
          <span className={styles.cardValue}>{stats.overdue}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Current active tasks</span>
          <span className={styles.cardValue}>{stats.activeCount}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Efficiency %</span>
          <span className={styles.cardValue}>{stats.efficiency != null ? `${stats.efficiency}%` : '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>In task now</span>
          <span className={styles.cardValue}>{inSession ? 'Yes' : 'No'}</span>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Faults linked</h2>
        <p className={styles.sectionDesc}>Records of type fault/maintenance where this worker is mentioned.</p>
        {stats.faultRecords.length === 0 ? (
          <p className={styles.empty}>None</p>
        ) : (
          <ul className={styles.list}>
            {stats.faultRecords.map((r) => (
              <li key={r.id}>{r.notes || r.zone} {r.severity && `(${r.severity})`}</li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Production records</h2>
        <p className={styles.sectionDesc}>Production entries for this worker.</p>
        {stats.productionRecords.length === 0 ? (
          <p className={styles.empty}>None</p>
        ) : (
          <p className={styles.count}>{stats.productionRecords.length} record(s)</p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><i className="fas fa-chart-bar fa-fw" /> Weekly performance</h2>
        <p className={styles.sectionDesc}>Tasks assigned this week by day (Mon–Sun).</p>
        <div className={styles.chart}>
          <div className={styles.chartBars}>
            {weeklyData.map((d) => (
              <div key={d.label} className={styles.chartBarWrap}>
                <span className={styles.chartValue}>{d.count}</span>
                <div className={styles.chartBarTrack}>
                  <div
                    className={styles.chartBar}
                    style={{ height: maxWeekCount ? `${(d.count / maxWeekCount) * 100}%` : '0%' }}
                    title={`${d.label}: ${d.count} task(s)`}
                  />
                </div>
                <span className={styles.chartLabel}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { useLanguage } from '../../context/LanguageContext'
import { getTranslation } from '../../i18n/translations'
import { SECTION_ACTIONS } from '../../data/engineerNav'
import { useAppStore } from '../../context/AppStoreContext'
import { TASK_STATUS } from '../../data/assignTask'
import { DEPARTMENT_OPTIONS } from '../../data/engineerWorkers'
import { getInitialZones, getDepartment, getTasksForDepartment } from '../../data/workerFlow'
import { getInventoryStatus } from '../../data/inventory'
import { SEVERITY_OPTIONS, FAULT_STATUS_OPEN, FAULT_STATUS_RESOLVED } from '../../data/faults'
import styles from './EngineerHome.module.css'

/** Monday 00:00:00 of the current week (ISO week). */
function getWeekStart() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.getFullYear(), d.getMonth(), diff)
  monday.setHours(0, 0, 0, 0)
  return monday.getTime()
}

/** Critical severity: high or critical */
function isCriticalSeverity(severity) {
  const s = (severity || '').toLowerCase()
  return s === 'high' || s === 'critical'
}

/** Normalize task status for chart counts (approved = pending_approval). */
function normalizeTaskStatus(status) {
  if (!status) return null
  const s = String(status).toLowerCase()
  if (s === TASK_STATUS.PENDING_APPROVAL || s === 'approved') return TASK_STATUS.PENDING_APPROVAL
  if (s === TASK_STATUS.IN_PROGRESS) return TASK_STATUS.IN_PROGRESS
  if (s === TASK_STATUS.COMPLETED) return TASK_STATUS.COMPLETED
  if (s === TASK_STATUS.REJECTED) return TASK_STATUS.REJECTED
  return null
}

/** True if task status is in progress (for active operations list). */
function isTaskInProgress(status) {
  if (status == null || status === '') return false
  const s = String(status).toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_').trim()
  return s === TASK_STATUS.IN_PROGRESS
}

/** Safe parse date for weekly filter; returns 0 if invalid. */
function safeTaskCreatedAt(task) {
  if (!task || !task.createdAt) return 0
  const t = new Date(task.createdAt).getTime()
  return Number.isFinite(t) ? t : 0
}

export default function EngineerHome() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const t = (key) => getTranslation(lang, 'engineer', key)
  const { tasks, sessions, zones: storeZones, workers, faults, inventory, equipment } = useAppStore()
  const zonesList = (storeZones && storeZones.length > 0) ? storeZones : getInitialZones()
  const ZONE_LABEL = useMemo(() => Object.fromEntries(zonesList.map((z) => [z.id, z.label])), [zonesList])
  const equipmentById = useMemo(() => Object.fromEntries((equipment || []).map((e) => [e.id, e])), [equipment])
  const isEngineer = typeof window !== 'undefined' && sessionStorage.getItem('sarms-user-role') === 'engineer'

  /* Critical Alerts – from current store state */
  const overdueCount = useMemo(() => {
    const now = Date.now()
    const activeSessionsByTaskId = (sessions || [])
      .filter((s) => !s.completedAt && s.taskId)
      .reduce((acc, s) => {
        const id = String(s.taskId)
        if (!acc[id]) acc[id] = s
        return acc
      }, {})
    return (tasks || []).filter((task) => {
      if (normalizeTaskStatus(task.status) === TASK_STATUS.COMPLETED) return false
      const mins = task.estimatedMinutes || 60
      const session = activeSessionsByTaskId[String(task.id)]
      const created = safeTaskCreatedAt(task)
      if (!session && !created) return false
      const dueTime = session
        ? new Date(session.startTime).getTime() + (session.expectedMinutes ?? mins) * 60 * 1000
        : created + mins * 60 * 1000
      if (!Number.isFinite(dueTime) || dueTime <= 0) return false
      return dueTime < now
    }).length
  }, [tasks, sessions])
  const criticalFaultsCount = useMemo(
    () => (faults || []).filter((f) => isCriticalSeverity(f.severity) && (f.status || FAULT_STATUS_OPEN) !== FAULT_STATUS_RESOLVED).length,
    [faults]
  )
  const lowStockCount = useMemo(() => {
    return (inventory || []).filter((item) => getInventoryStatus(item) !== 'normal').length
  }, [inventory])

  const pendingApprovalCount = useMemo(
    () => (tasks || []).filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.PENDING_APPROVAL).length,
    [tasks]
  )

  /* Weekly Progress: Monday to now (only tasks with valid createdAt in current week) */
  const weeklyProgress = useMemo(() => {
    const weekStart = getWeekStart()
    const now = Date.now()
    const weekTasks = (tasks || []).filter((t) => {
      const created = safeTaskCreatedAt(t)
      return created >= weekStart && created <= now
    })
    const completed = weekTasks.filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.COMPLETED).length
    const total = weekTasks.length
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, pct }
  }, [tasks])

  /* Recent Fault Logs (last 5 by createdAt DESC) */
  const recentFaults = useMemo(() => {
    const list = [...(faults || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)
    return list.map((f) => ({
      ...f,
      zone: equipmentById[f.equipmentId]?.zone ?? '—',
      severityLabel: SEVERITY_OPTIONS.find((s) => s.id === f.severity)?.label ?? f.severity ?? '—',
    }))
  }, [faults, equipmentById])

  /* Tasks by type – vertical bars (normalize departmentId/taskType to lowercase) */
  const typeChartData = useMemo(() => {
    const byType = {}
    ;(tasks || []).forEach((task) => {
      const raw = task.departmentId || task.taskType || 'other'
      const dept = String(raw).toLowerCase().trim() || 'other'
      byType[dept] = (byType[dept] || 0) + 1
    })
    const colors = ['var(--sarms-chart-success)', 'var(--sarms-chart-warning)', 'var(--sarms-chart-info)']
    const series = DEPARTMENT_OPTIONS.map((d, i) => ({
      label: d.label,
      value: byType[d.value] || 0,
      color: colors[i % colors.length],
    }))
    const max = Math.max(...series.map((s) => s.value), 1)
    return series.map((s) => ({ ...s, max }))
  }, [tasks])

  /* Tasks by zone – bar chart, adopted palette (no grey) */
  const ZONE_CHART_COLORS = ['#34d399', '#fde047', '#93c5fd', '#6ee7b7', '#fb923c', '#f87171']
  const zoneChartData = useMemo(() => {
    const byZone = {}
    ;(tasks || []).forEach((t) => {
      const raw = t.zoneId ?? ''
      const zoneKey = String(raw).toLowerCase().trim() || 'other'
      byZone[zoneKey] = (byZone[zoneKey] || 0) + 1
    })
    const series = zonesList.map((z, i) => {
      const id = z.id
      const value = byZone[id] || 0
      const label = ZONE_LABEL[id] ?? (id === 'inventory' ? 'Inventory' : `Zone ${id.toUpperCase()}`)
      return { label, value, color: ZONE_CHART_COLORS[i % ZONE_CHART_COLORS.length] }
    })
    const max = Math.max(...series.map((s) => s.value), 1)
    return series.map((s) => ({ ...s, max }))
  }, [tasks, zonesList, ZONE_LABEL])

  /* Task status doughnut – count by normalized status (approved = pending_approval) */
  const doughnutData = useMemo(() => {
    const s = { [TASK_STATUS.PENDING_APPROVAL]: 0, [TASK_STATUS.IN_PROGRESS]: 0, [TASK_STATUS.COMPLETED]: 0 }
    ;(tasks || []).forEach((task) => {
      const canonical = normalizeTaskStatus(task.status)
      if (canonical && s[canonical] !== undefined) s[canonical] = (s[canonical] || 0) + 1
    })
    return [
      { labelKey: 'chartPending', value: s[TASK_STATUS.PENDING_APPROVAL], color: 'var(--sarms-chart-muted)' },
      { labelKey: 'chartInProgress', value: s[TASK_STATUS.IN_PROGRESS], color: 'var(--sarms-chart-warning)' },
      { labelKey: 'chartCompleted', value: s[TASK_STATUS.COMPLETED], color: 'var(--sarms-chart-success)' },
    ].filter((d) => d.value > 0)
  }, [tasks])
  const doughnutTotal = useMemo(() => doughnutData.reduce((sum, d) => sum + d.value, 0) || 1, [doughnutData])

  /* Active Operations: same logic as Monitor Active Work – real sessions without completedAt + IN_PROGRESS tasks without a session */
  const realActiveSessions = useMemo(() => (sessions || []).filter((s) => !s.completedAt), [sessions])
  const taskIdsWithActiveSession = useMemo(
    () => new Set(realActiveSessions.map((s) => String(s.taskId)).filter(Boolean)),
    [realActiveSessions]
  )
  const virtualSessionsFromTasks = useMemo(() => {
    const list = []
    ;(tasks || []).forEach((task) => {
      if (!isTaskInProgress(task.status)) return
      if (task.id != null && taskIdsWithActiveSession.has(String(task.id))) return
      const dept = getDepartment(task.departmentId)
      const deptId = task.departmentId || task.taskType
      const taskLabel = getTasksForDepartment(deptId)?.find((t) => t.id === task.taskId)
      const zoneIdNorm = task.zoneId != null ? String(task.zoneId).toLowerCase() : ''
      const zoneLabel = ZONE_LABEL[zoneIdNorm] ?? (zoneIdNorm === 'inventory' ? 'Inventory' : zoneIdNorm ? `Zone ${zoneIdNorm.toUpperCase()}` : '—')
      const workerIds = Array.isArray(task.workerIds) ? task.workerIds : []
      const departmentIdNorm = (task.departmentId || task.taskType || '').toLowerCase()
      const baseSession = {
        taskId: task.id,
        departmentId: departmentIdNorm || task.departmentId,
        department: dept?.labelEn ?? task.departmentId ?? '—',
        task: taskLabel?.labelEn ?? task.taskId ?? '—',
        zoneId: zoneIdNorm || task.zoneId,
        zone: zoneLabel,
        linesArea: task.linesArea || '—',
        assignedByEngineer: true,
      }
      if (workerIds.length === 0) {
        list.push({ id: `task-${task.id}`, workerId: '', workerName: '—', ...baseSession })
      } else {
        workerIds.forEach((wId) => {
          const worker = (workers || []).find((w) => String(w.id) === String(wId))
          list.push({
            id: `task-${task.id}-${wId}`,
            workerId: String(wId),
            workerName: worker?.fullName ?? String(wId),
            ...baseSession,
          })
        })
      }
    })
    return list
  }, [tasks, taskIdsWithActiveSession, workers, ZONE_LABEL])
  const activeOperationsList = useMemo(
    () => [...realActiveSessions, ...virtualSessionsFromTasks],
    [realActiveSessions, virtualSessionsFromTasks]
  )

  const [activeOpsExpanded, setActiveOpsExpanded] = useState(false)
  const [recentFaultsExpanded, setRecentFaultsExpanded] = useState(false)

  const kpiCards = [
    { count: overdueCount, labelKey: 'homeOverdueTasks', path: '/engineer/monitor', icon: 'fa-clock', variant: 'warning' },
    { count: criticalFaultsCount, labelKey: 'homeCriticalFaults', path: '/engineer/faults', icon: 'fa-triangle-exclamation', variant: 'danger' },
    { count: lowStockCount, labelKey: 'homeLowStock', path: '/engineer/inventory', icon: 'fa-cubes', variant: 'info' },
    ...(isEngineer ? [{ count: pendingApprovalCount, labelKey: 'homeTasksPendingReview', path: '/engineer/assign-task', state: { filterStatus: TASK_STATUS.PENDING_APPROVAL }, icon: 'fa-clipboard-check', variant: 'success' }] : []),
  ]

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('layoutTitle')}</h1>
        <p className={styles.pageSubtitle}>{t('homeSectionsTitle')} · {t('homeAnalyticsCharts')}</p>
      </header>

      {/* KPI row – aligned with Reports/Inventory card style */}
      <div className={styles.kpiRow}>
        {kpiCards.map((card) => (
          <button
            key={card.labelKey}
            type="button"
            className={`${styles.kpiCard} ${styles[`kpiCard_${card.variant}`]}`}
            onClick={() => navigate(card.path, { state: card.state })}
          >
            <span className={styles.kpiIcon}><i className={`fas ${card.icon} fa-fw`} /></span>
            <span className={styles.kpiCount}>{card.count}</span>
            <span className={styles.kpiLabel}>{t(card.labelKey)}</span>
          </button>
        ))}
      </div>

      {isEngineer && pendingApprovalCount > 0 && (
        <div className={styles.reviewBanner}>
          <span>{pendingApprovalCount} {t('homeTasksPendingReview')}</span>
          <button type="button" className={styles.reviewNowBtn} onClick={() => navigate('/engineer/assign-task', { state: { filterStatus: TASK_STATUS.PENDING_APPROVAL } })}>
            {t('homeReviewNow')}
          </button>
        </div>
      )}

      {/* Quick access – card grid (not circles) */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('homeSectionsTitle')}</h2>
        <div className={styles.actionGrid}>
          {SECTION_ACTIONS.map((item) => (
            <button
              key={item.path}
              type="button"
              className={styles.actionCard}
              onClick={() => navigate(item.path)}
            >
              <i className={`fas fa-${item.faIcon || item.icon} fa-fw ${styles.actionCardIcon}`} />
              <span className={styles.actionCardLabel}>{t(item.labelKey)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Analytics */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('homeAnalyticsCharts')}</h2>
        <div className={styles.chartsRow}>
          <div className={styles.chartWrap}>
            <h3 className={styles.widgetTitle}>{t('homeWeeklyProgress')}</h3>
            <div className={styles.weeklyProgressWrap}>
              <span className={styles.weeklyPct}>{weeklyProgress.pct}%</span>
              <span className={styles.weeklyCount}>{weeklyProgress.completed} / {weeklyProgress.total}</span>
              <div className={styles.weeklyBarTrack}>
                <div className={styles.weeklyBarFill} style={{ width: `${weeklyProgress.pct}%` }} />
              </div>
            </div>
            <p className={styles.chartCaption}>{t('homeWeeklyProgressCaption')}</p>
          </div>
          <div className={styles.chartWrap}>
            <div className={styles.typeVerticalChart}>
              {typeChartData.map((d) => (
                <div key={d.label} className={styles.typeVerticalCol}>
                  <div className={styles.typeVerticalBarWrap}>
                    <span className={styles.typeVerticalValue}>{d.value}</span>
                    <div
                      className={styles.typeVerticalBar}
                      style={{
                        height: `${(d.value / d.max) * 100}%`,
                        backgroundColor: d.color,
                      }}
                      title={`${d.label}: ${d.value}`}
                    />
                  </div>
                  <span className={styles.typeVerticalLabel}>{d.label}</span>
                </div>
              ))}
            </div>
            <p className={styles.chartCaption}>{t('homeTasksByType')}</p>
          </div>
          <div className={styles.chartWrap}>
            <div
              className={styles.doughnutChart}
              style={{
                background: doughnutData.length
                  ? `conic-gradient(${doughnutData.map((d, i) => {
                      const start = (doughnutData.slice(0, i).reduce((s, x) => s + x.value, 0) / doughnutTotal) * 100
                      const end = (doughnutData.slice(0, i + 1).reduce((s, x) => s + x.value, 0) / doughnutTotal) * 100
                      return `${d.color} ${start}% ${end}%`
                    }).join(', ')})`
                  : 'var(--sarms-border, #d4d4d4)',
              }}
            />
            <ul className={styles.doughnutLegend}>
              {doughnutData.map((d) => (
                <li key={d.labelKey} className={styles.doughnutLegendItem}>
                  <span className={styles.doughnutLegendDot} style={{ background: d.color }} />
                  <span>{t(d.labelKey)}</span>
                  <span className={styles.doughnutLegendValue}>{d.value}</span>
                </li>
              ))}
            </ul>
            <p className={styles.chartCaption}>{t('homeTaskStatus')}</p>
          </div>
          <div className={styles.chartWrap}>
            <div className={styles.barChart}>
              {zoneChartData.map((d) => (
                <div key={d.label} className={styles.barRow}>
                  <span className={styles.barLabel}>{d.label}</span>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{ width: `${(d.value / d.max) * 100}%`, backgroundColor: d.color }}
                    />
                  </div>
                  <span className={styles.barValue}>{d.value}</span>
                </div>
              ))}
            </div>
            <p className={styles.chartCaption}>{t('homeTasksByZone')}</p>
          </div>
        </div>
        <div className={styles.moreAnalyticsWrap}>
          <button type="button" className={styles.moreAnalyticsBtn} onClick={() => navigate('/engineer/reports')}>
            {t('homeMoreAnalytics')}
          </button>
        </div>
      </section>

      {/* Active Operations – reflects current system: active sessions (no completedAt) + IN_PROGRESS tasks without session */}
      <section className={styles.section}>
        <button
          type="button"
          className={styles.collapseHeader}
          onClick={() => setActiveOpsExpanded((e) => !e)}
          aria-expanded={activeOpsExpanded}
        >
          <i className={`fas fa-fw ${activeOpsExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
          <h2 className={styles.sectionTitleCollapse}>{t('homeActiveOperations')}</h2>
          {activeOperationsList.length > 0 && <span className={styles.collapseBadge}>{activeOperationsList.length}</span>}
        </button>
        {activeOpsExpanded && (
          <div className={styles.collapseContent}>
            <div className={styles.opsCard}>
              {activeOperationsList.length === 0 ? (
                <p className={styles.opsEmpty}>{t('homeNoActiveSessions')}</p>
              ) : (
                <ul className={styles.opsList}>
                  {activeOperationsList.map((op) => (
                    <li key={op.id} className={styles.opsItem}>
                      <button
                        type="button"
                        className={styles.opsItemBtn}
                        onClick={() => navigate('/engineer/monitor')}
                      >
                        <span className={styles.opsWorker}>{op.workerName ?? '—'}</span>
                        <span className={styles.opsDetail}>
                          {[op.department, op.task].filter(Boolean).join(' · ') || '—'} · {(op.zone === 'Inventory' || (op.zone && String(op.zone).startsWith('Zone '))) ? (op.zone || '—') : (op.zone ? `Zone ${op.zone}` : '—')} · {op.linesArea || '—'}
                        </span>
                        {op.assignedByEngineer != null && (
                          <span className={styles.opsSource} title={op.assignedByEngineer ? 'Assigned by engineer' : 'Self-started by worker'}>
                            {op.assignedByEngineer ? 'Assigned' : 'Self'}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Recent Fault Logs */}
      <section className={styles.section}>
        <button
          type="button"
          className={styles.collapseHeader}
          onClick={() => setRecentFaultsExpanded((e) => !e)}
          aria-expanded={recentFaultsExpanded}
        >
          <i className={`fas fa-fw ${recentFaultsExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
          <h2 className={styles.sectionTitleCollapse}><i className="fas fa-wrench fa-fw" /> {t('homeRecentFaultLogs')}</h2>
          {recentFaults.length > 0 && <span className={styles.collapseBadge}>{recentFaults.length}</span>}
        </button>
        {recentFaultsExpanded && (
          <div className={styles.collapseContent}>
            <div className={styles.faultTableWrap}>
              <table className={styles.faultTable}>
                <thead>
                  <tr>
                    <th>{t('homeFaultTitle')}</th>
                    <th>{t('homeFaultZone')}</th>
                    <th>{t('homeFaultSeverity')}</th>
                    <th>{t('homeFaultStatus')}</th>
                    <th>{t('homeFaultCreated')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentFaults.length === 0 ? (
                    <tr><td colSpan={5} className={styles.faultEmpty}>{t('homeNoFaults')}</td></tr>
                  ) : (
                    recentFaults.map((f) => (
                      <tr key={f.id} className={styles.faultRow} onClick={() => navigate('/engineer/faults')}>
                        <td>{f.equipmentName || f.description || f.id}</td>
                        <td>{f.zone}</td>
                        <td>{f.severityLabel}</td>
                        <td>{((f.status || FAULT_STATUS_OPEN) === FAULT_STATUS_RESOLVED) ? t('homeFaultStatusResolved') : t('homeFaultStatusOpen')}</td>
                        <td>{f.createdAt ? new Date(f.createdAt).toLocaleString() : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

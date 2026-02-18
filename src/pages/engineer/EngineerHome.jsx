import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { useLanguage } from '../../context/LanguageContext'
import { getTranslation } from '../../i18n/translations'
import { SECTION_ACTIONS } from '../../data/engineerNav'
import { useAppStore } from '../../context/AppStoreContext'
import { TASK_STATUS } from '../../data/assignTask'
import { DEPARTMENT_OPTIONS } from '../../data/engineerWorkers'
import { getInitialZones } from '../../data/workerFlow'
import { getInventoryStatus } from '../../data/inventory'
import { SEVERITY_OPTIONS } from '../../data/faults'
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

export default function EngineerHome() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const t = (key) => getTranslation(lang, 'engineer', key)
  const { tasks, sessions, zones: storeZones, faults, inventory, equipment } = useAppStore()
  const zonesList = (storeZones && storeZones.length > 0) ? storeZones : getInitialZones()
  const ZONE_LABEL = useMemo(() => Object.fromEntries(zonesList.map((z) => [z.id, z.label])), [zonesList])
  const equipmentById = useMemo(() => Object.fromEntries((equipment || []).map((e) => [e.id, e])), [equipment])
  const isEngineer = typeof window !== 'undefined' && sessionStorage.getItem('sarms-user-role') === 'engineer'

  /* Critical Alerts */
  const overdueCount = useMemo(() => {
    const now = Date.now()
    return (tasks || []).filter((task) => {
      if (task.status === TASK_STATUS.COMPLETED) return false
      const created = new Date(task.createdAt).getTime()
      const mins = task.estimatedMinutes || 60
      const due = created + mins * 60 * 1000
      return due < now
    }).length
  }, [tasks])
  const criticalFaultsCount = useMemo(
    () => (faults || []).filter((f) => (f.severity || '').toLowerCase() === 'high').length,
    [faults]
  )
  const lowStockCount = useMemo(() => {
    return (inventory || []).filter((item) => getInventoryStatus(item) !== 'normal').length
  }, [inventory])

  const pendingApprovalCount = useMemo(
    () => (tasks || []).filter((t) => t.status === TASK_STATUS.PENDING_APPROVAL).length,
    [tasks]
  )
  /* Weekly Progress: Monday to now */
  const weeklyProgress = useMemo(() => {
    const weekStart = getWeekStart()
    const now = Date.now()
    const weekTasks = (tasks || []).filter((t) => {
      const created = new Date(t.createdAt).getTime()
      return created >= weekStart && created <= now
    })
    const total = weekTasks.length
    const completed = weekTasks.filter((t) => t.status === TASK_STATUS.COMPLETED).length
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

  /* Tasks by type – vertical bars with distinct colors */
  const typeChartData = useMemo(() => {
    const byType = {}
    tasks.forEach((task) => {
      const dept = task.departmentId || task.taskType || 'other'
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

  /* Tasks by zone (for the extra chart) */
  const zoneChartData = useMemo(() => {
    const byZone = {}
    tasks.forEach((t) => {
      const z = t.zoneId || 'other'
      byZone[z] = (byZone[z] || 0) + 1
    })
    const series = zonesList.map((z) => ({ label: ZONE_LABEL[z.id] ?? z.id, value: byZone[z.id] || 0 }))
    const max = Math.max(...series.map((s) => s.value), 1)
    return series.map((s) => ({ ...s, max }))
  }, [tasks, zonesList, ZONE_LABEL])

  const doughnutData = useMemo(() => {
    const s = { [TASK_STATUS.PENDING_APPROVAL]: 0, [TASK_STATUS.IN_PROGRESS]: 0, [TASK_STATUS.COMPLETED]: 0 }
    tasks.forEach((task) => { s[task.status] = (s[task.status] || 0) + 1 })
    return [
      { labelKey: 'chartPending', value: s[TASK_STATUS.PENDING_APPROVAL], color: 'var(--sarms-chart-muted)' },
      { labelKey: 'chartInProgress', value: s[TASK_STATUS.IN_PROGRESS], color: 'var(--sarms-chart-warning)' },
      { labelKey: 'chartCompleted', value: s[TASK_STATUS.COMPLETED], color: 'var(--sarms-chart-success)' },
    ].filter((d) => d.value > 0)
  }, [tasks])
  const doughnutTotal = useMemo(() => doughnutData.reduce((sum, d) => sum + d.value, 0) || 1, [doughnutData])

  const [activeOpsExpanded, setActiveOpsExpanded] = useState(false)
  const [recentFaultsExpanded, setRecentFaultsExpanded] = useState(false)

  return (
    <div className={styles.page}>
      {/* Critical Alerts + Pending Approvals – top row */}
      <div className={styles.topCardsRow}>
        <section className={styles.alertsCard}>
          <h2 className={styles.alertsCardTitle}><i className="fas fa-triangle-exclamation fa-fw" /> {t('homeCriticalAlerts')}</h2>
          <div className={styles.alertsList}>
            <button type="button" className={styles.alertItem} onClick={() => navigate('/engineer/monitor')}>
              <span className={styles.alertCount}>{overdueCount}</span>
              <span className={styles.alertLabel}>{t('homeOverdueTasks')}</span>
            </button>
            <button type="button" className={styles.alertItem} onClick={() => navigate('/engineer/faults')}>
              <span className={styles.alertCount}>{criticalFaultsCount}</span>
              <span className={styles.alertLabel}>{t('homeCriticalFaults')}</span>
            </button>
            <button type="button" className={styles.alertItem} onClick={() => navigate('/engineer/inventory')}>
              <span className={styles.alertCount}>{lowStockCount}</span>
              <span className={styles.alertLabel}>{t('homeLowStock')}</span>
            </button>
          </div>
        </section>
        {isEngineer && (
          <section className={styles.pendingCard}>
            <h2 className={styles.pendingCardTitle}><i className="fas fa-clipboard-check fa-fw" /> {t('homePendingApprovals')}</h2>
            <p className={styles.pendingCount}>{pendingApprovalCount}</p>
            <p className={styles.pendingSub}>{t('homeTasksPendingReview')}</p>
            <button type="button" className={styles.reviewNowBtn} onClick={() => navigate('/engineer/assign-task', { state: { filterStatus: TASK_STATUS.PENDING_APPROVAL } })}>
              {t('homeReviewNow')}
            </button>
          </section>
        )}
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><i className="fas fa-th-large fa-fw" /> {t('homeSectionsTitle')}</h2>
        <div className={styles.actionGrid}>
          {SECTION_ACTIONS.map((item) => (
            <button
              key={item.path}
              type="button"
              className={styles.actionBox}
              onClick={() => navigate(item.path)}
            >
              <i className={`fas fa-${item.faIcon || item.icon} fa-fw ${styles.actionIcon}`} />
              <span className={styles.actionLabel}>{t(item.labelKey)}</span>
            </button>
          ))}
        </div>
        <div className={styles.sectionAnalyticsBlock}>
          <h3 className={styles.analyticsSubTitle}><i className="fas fa-chart-column fa-fw" /> {t('homeAnalyticsCharts')}</h3>
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
                      style={{ width: `${(d.value / d.max) * 100}%` }}
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
            <button
              type="button"
              className={styles.moreAnalyticsBtn}
              onClick={() => navigate('/engineer/reports')}
            >
              {t('homeMoreAnalytics')}
            </button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <button
          type="button"
          className={styles.collapseHeader}
          onClick={() => setActiveOpsExpanded((e) => !e)}
          aria-expanded={activeOpsExpanded}
        >
          <i className={`fas fa-fw ${activeOpsExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
          <h2 className={styles.sectionTitleCollapse}>{t('homeActiveOperations')}</h2>
          {sessions.length > 0 && <span className={styles.collapseBadge}>{sessions.length}</span>}
        </button>
        {activeOpsExpanded && (
          <div className={styles.collapseContent}>
          <div className={styles.opsCard}>
            {sessions.length === 0 ? (
              <p className={styles.opsEmpty}>{t('homeNoActiveSessions')}</p>
            ) : (
              <ul className={styles.opsList}>
                {sessions.map((op) => (
                  <li key={op.id} className={styles.opsItem}>
                    <button
                      type="button"
                      className={styles.opsItemBtn}
                      onClick={() => navigate('/engineer/monitor')}
                    >
                      <span className={styles.opsWorker}>{op.workerName}</span>
                      <span className={styles.opsDetail}>
                        {op.department} · {op.task} · {op.zone === 'Inventory' ? op.zone : `Zone ${op.zone}`} · {op.linesArea || '—'}
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
                      <td>{t('homeFaultStatusOpen')}</td>
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

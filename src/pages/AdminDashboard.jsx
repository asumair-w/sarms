import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { getTranslation } from '../i18n/translations'
import { useAppStore } from '../context/AppStoreContext'
import { getInventoryStatus } from '../data/inventory'
import { INVENTORY_STATUS } from '../data/inventory'
import { TASK_STATUS } from '../data/assignTask'
import { SEED_WORKERS } from '../data/engineerWorkers'
import { getPowerBiEmbedUrl } from '../config/powerBi'
import styles from './AdminDashboard.module.css'

const PERIOD_PRESETS = [
  { id: 'last7', labelKey: 'periodLast7Days' },
  { id: 'last30', labelKey: 'periodLast30Days' },
  { id: 'thisMonth', labelKey: 'periodThisMonth' },
  { id: 'lastQuarter', labelKey: 'periodLastQuarter' },
  { id: 'custom', labelKey: 'periodCustom' },
]

function getPeriodRange(preset, customFrom, customTo) {
  const now = Date.now()
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  const end = endOfToday.getTime()
  let start
  if (preset === 'custom' && customFrom && customTo) {
    start = new Date(customFrom).setHours(0, 0, 0, 0)
    const endCustom = new Date(customTo)
    endCustom.setHours(23, 59, 59, 999)
    return [start, endCustom.getTime()]
  }
  if (preset === 'custom') {
    start = now - 30 * 24 * 60 * 60 * 1000
    return [start, end]
  }
  switch (preset) {
    case 'last7':
      start = now - 7 * 24 * 60 * 60 * 1000
      break
    case 'last30':
      start = now - 30 * 24 * 60 * 60 * 1000
      break
    case 'thisMonth': {
      const d = new Date()
      d.setDate(1)
      d.setHours(0, 0, 0, 0)
      start = d.getTime()
      break
    }
    case 'lastQuarter': {
      const d = new Date()
      const q = Math.floor(d.getMonth() / 3) + 1
      const startMonth = (q - 1) * 3
      d.setMonth(startMonth)
      d.setDate(1)
      d.setHours(0, 0, 0, 0)
      start = d.getTime()
      break
    }
    default:
      start = now - 30 * 24 * 60 * 60 * 1000
  }
  return [start, end]
}

function isInRange(isoDate, startMs, endMs) {
  if (!isoDate) return false
  const t = new Date(isoDate).getTime()
  return t >= startMs && t <= endMs
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const t = (key) => getTranslation(lang, 'admin', key)
  const { tasks, sessions, faults, inventory } = useAppStore()
  const [analyticsTab, setAnalyticsTab] = useState('internal') // 'internal' | 'powerbi'
  const [powerBiVisible, setPowerBiVisible] = useState(true)
  const [powerBiFullscreen, setPowerBiFullscreen] = useState(false)
  const [periodPreset, setPeriodPreset] = useState('last30')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const [periodStart, periodEnd] = useMemo(
    () => getPeriodRange(periodPreset, customFrom, customTo),
    [periodPreset, customFrom, customTo]
  )

  const kpis = useMemo(() => {
    const inRange = (iso) => isInRange(iso, periodStart, periodEnd)
    const activeWorkers = SEED_WORKERS.filter(
      (w) => w.status === 'active' && w.createdAt && inRange(w.createdAt)
    ).length
    const tasksInPeriod = tasks.filter((task) => task.createdAt && inRange(task.createdAt))
    const activeTasks = tasksInPeriod.filter((task) => task.status === TASK_STATUS.IN_PROGRESS).length
    const delayedTasks = tasksInPeriod.filter(
      (task) =>
        (task.status === TASK_STATUS.PENDING_APPROVAL || task.status === TASK_STATUS.IN_PROGRESS) &&
        Date.now() - new Date(task.createdAt).getTime() > 24 * 60 * 60 * 1000
    ).length
    const openFaults = faults.filter((f) => f.createdAt && inRange(f.createdAt)).length
    const inventoryInPeriod = inventory.filter(
      (i) => i.lastUpdated && inRange(i.lastUpdated)
    )
    const inventoryAlerts = inventoryInPeriod.filter(
      (i) => getInventoryStatus(i) !== INVENTORY_STATUS.NORMAL
    ).length
    return {
      totalActiveWorkers: activeWorkers,
      activeTasks,
      delayedTasks,
      openFaults,
      inventoryAlerts,
    }
  }, [tasks, faults, inventory, periodStart, periodEnd])

  const internalChartData = useMemo(() => {
    const byStatus = {
      [TASK_STATUS.PENDING_APPROVAL]: 0,
      [TASK_STATUS.IN_PROGRESS]: 0,
      [TASK_STATUS.COMPLETED]: 0,
    }
    tasks.forEach((t) => {
      if (byStatus[t.status] !== undefined) byStatus[t.status]++
    })
    const max = Math.max(1, ...Object.values(byStatus))
    return [
      { labelKey: 'pendingApproval', value: byStatus[TASK_STATUS.PENDING_APPROVAL], max },
      { labelKey: 'inProgress', value: byStatus[TASK_STATUS.IN_PROGRESS], max },
      { labelKey: 'completed', value: byStatus[TASK_STATUS.COMPLETED], max },
    ]
  }, [tasks])

  const quickActions = [
    { labelKey: 'registerManageWorkers', icon: 'users', faIcon: 'users', path: '/admin/register' },
  ]

  return (
    <div className={styles.page}>
      {/* 1. Top KPI Summary */}
      <section className={styles.kpiSection}>
        <div className={styles.kpiHeader}>
          <h2 className={styles.sectionTitle}><i className="fas fa-chart-pie fa-fw" /> {t('dashboardKpiSummary')}</h2>
          <div className={styles.periodFilter}>
            <label htmlFor="kpi-period" className={styles.periodLabel}>
              {t('kpiPeriod')}
            </label>
            <select
              id="kpi-period"
              className={styles.periodSelect}
              value={periodPreset}
              onChange={(e) => setPeriodPreset(e.target.value)}
              aria-label={t('kpiPeriod')}
            >
              {PERIOD_PRESETS.map(({ id, labelKey }) => (
                <option key={id} value={id}>
                  {t(labelKey)}
                </option>
              ))}
            </select>
            {periodPreset === 'custom' && (
              <div className={styles.periodCustomRow}>
                <input
                  type="date"
                  className={styles.periodDateInput}
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  aria-label={t('periodFrom')}
                />
                <span className={styles.periodDateSep}>–</span>
                <input
                  type="date"
                  className={styles.periodDateInput}
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  aria-label={t('periodTo')}
                />
              </div>
            )}
          </div>
        </div>
        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{kpis.totalActiveWorkers}</span>
            <span className={styles.kpiLabel}>{t('totalActiveWorkers')}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{kpis.activeTasks}</span>
            <span className={styles.kpiLabel}>{t('activeTasks')}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{kpis.delayedTasks}</span>
            <span className={styles.kpiLabel}>{t('delayedTasks')}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{kpis.openFaults}</span>
            <span className={styles.kpiLabel}>{t('openFaults')}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{kpis.inventoryAlerts}</span>
            <span className={styles.kpiLabel}>{t('inventoryAlerts')}</span>
          </div>
        </div>
      </section>

      {/* 2. Internal vs Power BI Tabs */}
      <section className={styles.analyticsSection}>
        <div className={styles.tabBar}>
          <button
            type="button"
            className={analyticsTab === 'internal' ? styles.tabActive : styles.tab}
            onClick={() => setAnalyticsTab('internal')}
          >
            {t('internalCharts')}
          </button>
          <button
            type="button"
            className={analyticsTab === 'powerbi' ? styles.tabActive : styles.tab}
            onClick={() => setAnalyticsTab('powerbi')}
          >
            {t('powerBiReports')}
          </button>
        </div>

        {analyticsTab === 'internal' && (
          <div className={styles.internalCharts}>
            <h3 className={styles.chartTitle}>{t('taskStatus')}</h3>
            <div className={styles.barChart}>
              {internalChartData.map(({ labelKey, value, max }) => (
                <div key={labelKey} className={styles.barRow}>
                  <span className={styles.barLabel}>{t(labelKey)}</span>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{ width: `${(value / max) * 100}%` }}
                    />
                  </div>
                  <span className={styles.barValue}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {analyticsTab === 'powerbi' && (
          <div className={styles.powerBiBlock}>
            <div className={styles.powerBiControls}>
              <button
                type="button"
                className={styles.controlBtn}
                onClick={() => setPowerBiVisible((v) => !v)}
              >
                {powerBiVisible ? t('hidePowerBi') : t('showPowerBi')}
              </button>
              {powerBiVisible && (
                <button
                  type="button"
                  className={styles.controlBtn}
                  onClick={() => setPowerBiFullscreen((f) => !f)}
                >
                  {powerBiFullscreen ? t('exitFullscreen') : t('fullscreen')}
                </button>
              )}
            </div>
            {powerBiVisible && (
              <div
                className={
                  powerBiFullscreen ? styles.powerBiFrameFullscreen : styles.powerBiFrameWrap
                }
              >
                {powerBiFullscreen && (
                  <div className={styles.powerBiFullscreenBar}>
                    <button
                      type="button"
                      className={styles.controlBtn}
                      onClick={() => setPowerBiFullscreen(false)}
                    >
                      {t('exitFullscreen')}
                    </button>
                  </div>
                )}
                {getPowerBiEmbedUrl() ? (
                  <iframe
                    title="Power BI Analytics"
                    src={getPowerBiEmbedUrl()}
                    className={styles.powerBiIframe}
                    allowFullScreen
                  />
                ) : (
                  <div className={styles.powerBiPlaceholder}>
                    <p>{t('powerBiNotConfigured')}</p>
                    <p className={styles.powerBiHint}>
                      {t('powerBiHintConfig')} <code>src/config/powerBi.js</code>
                    </p>
                    <p className={styles.powerBiHint}>
                      {t('powerBiHintSteps')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. System Quick Actions */}
      <section className={styles.quickActionsSection}>
        <h2 className={styles.sectionTitle}><i className="fas fa-bolt fa-fw" /> {t('systemQuickActions')}</h2>
        <div className={styles.quickActionsGrid}>
          {quickActions.map(({ labelKey, icon, faIcon, path }) => (
            <button
              key={path}
              type="button"
              className={styles.quickActionBtn}
              onClick={() => navigate(path)}
            >
              <i className={`fas fa-${faIcon || icon} fa-fw ${styles.quickActionIcon}`} />
              <span className={styles.quickActionLabel}>{t(labelKey)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

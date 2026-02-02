import { useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { useLanguage } from '../../context/LanguageContext'
import { getTranslation } from '../../i18n/translations'
import { SECTION_ACTIONS } from '../../data/engineerNav'
import { Icon } from '../../components/HeroIcons'
import { useAppStore } from '../../context/AppStoreContext'
import { TASK_STATUS } from '../../data/assignTask'
import styles from './EngineerHome.module.css'

export default function EngineerHome() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const t = (key) => getTranslation(lang, 'engineer', key)
  const { tasks, sessions } = useAppStore()

  const barData = useMemo(() => {
    const byType = {}
    tasks.forEach((task) => { byType[task.taskType] = (byType[task.taskType] || 0) + 1 })
    const labels = ['farming', 'maintenance', 'quality', 'storage']
    const max = Math.max(...Object.values(byType), 1)
    return labels.map((id) => ({ label: id.charAt(0).toUpperCase() + id.slice(1), value: byType[id] || 0, max }))
  }, [tasks])

  const doughnutData = useMemo(() => {
    const s = { [TASK_STATUS.COMPLETED]: 0, [TASK_STATUS.IN_PROGRESS]: 0, [TASK_STATUS.APPROVED]: 0, [TASK_STATUS.PENDING_APPROVAL]: 0 }
    tasks.forEach((task) => { s[task.status] = (s[task.status] || 0) + 1 })
    return [
      { labelKey: 'chartCompleted', value: s[TASK_STATUS.COMPLETED], color: 'var(--sarms-chart-success)' },
      { labelKey: 'chartInProgress', value: s[TASK_STATUS.IN_PROGRESS], color: 'var(--sarms-chart-warning)' },
      { labelKey: 'chartApproved', value: s[TASK_STATUS.APPROVED], color: 'var(--sarms-chart-info)' },
      { labelKey: 'chartPending', value: s[TASK_STATUS.PENDING_APPROVAL], color: 'var(--sarms-chart-muted)' },
    ].filter((d) => d.value > 0)
  }, [tasks])
  const doughnutTotal = useMemo(() => doughnutData.reduce((sum, d) => sum + d.value, 0) || 1, [doughnutData])

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('homeSectionsTitle')}</h2>
        <div className={styles.actionGrid}>
          {SECTION_ACTIONS.map((item) => (
            <button
              key={item.path}
              type="button"
              className={styles.actionBox}
              onClick={() => navigate(item.path)}
            >
              <Icon name={item.icon} className={styles.actionIcon} />
              <span className={styles.actionLabel}>{t(item.labelKey)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('homeActiveOperations')}</h2>
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
                      {op.department} · {op.task} · Zone {op.zone} · Lines {op.linesArea}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('homeAnalyticsCharts')}</h2>
        <div className={styles.chartsRow}>
          <div className={styles.chartWrap}>
            <div className={styles.barChart}>
              {barData.map((d) => (
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
      </section>
    </div>
  )
}

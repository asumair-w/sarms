import { useMemo } from 'react'
import styles from './SystemHealthScore.module.css'

const WEIGHTS = {
  delayedTasks: 0.3,
  criticalFaults: 0.3,
  overdueMaintenance: 0.2,
  inventoryRisk: 0.2,
}

/**
 * System Health Score: single 0–100% from weighted risk metrics.
 * Green ≥80, yellow 60–79, red <60.
 */
export default function SystemHealthScore({ overviewData }) {
  const { score, band } = useMemo(() => {
    if (!overviewData?.riskMetrics?.values?.length) return { score: 100, band: 'high' }
    const [delayedPct, criticalFaultPct, criticalInvPct, , overduePct] = overviewData.riskMetrics.values
    const weightedRisk =
      (Number(delayedPct) || 0) * WEIGHTS.delayedTasks +
      (Number(criticalFaultPct) || 0) * WEIGHTS.criticalFaults +
      (Number(overduePct) || 0) * WEIGHTS.overdueMaintenance +
      (Number(criticalInvPct) || 0) * WEIGHTS.inventoryRisk
    const health = Math.max(0, Math.min(100, Math.round(100 - weightedRisk)))
    const band = health >= 80 ? 'high' : health >= 60 ? 'medium' : 'low'
    return { score: health, band }
  }, [overviewData])

  return (
    <div className={styles.wrap} role="status" aria-label={`System health score ${score} percent`}>
      <div className={`${styles.ring} ${styles[band]}`}>
        <svg viewBox="0 0 36 36" className={styles.svg}>
          <path
            className={styles.bg}
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          <path
            className={styles.progress}
            strokeDasharray={`${score}, 100`}
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
        <span className={styles.value}>{score}%</span>
      </div>
      <span className={styles.label}>System health</span>
    </div>
  )
}

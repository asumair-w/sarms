import OperationalStatusChart from './charts/OperationalStatusChart'
import ProductionTrendChart from './charts/ProductionTrendChart'
import ZoneDistributionChart from './charts/ZoneDistributionChart'
import RiskRadarChart from './charts/RiskRadarChart'
import InventoryHealthChart from './charts/InventoryHealthChart'
import EquipmentLoadChart from './charts/EquipmentLoadChart'
import styles from './ExecutiveOverview.module.css'
import shell from '../../styles/sarmsPageShell.module.css'

/**
 * Executive Overview – layout container for the six analytical charts.
 * Accepts a single `data` prop with aggregated metrics for all charts.
 *
 * Expected data shape:
 * - operationalStatus: { labels?, tasks[], sessions[], faults[] }
 * - productionTrend: { dates[], values[] }
 * - zoneDistribution: { labels[], tasks[], sessions[], faults[] }
 * - riskMetrics: { labels?, values[] }  (5 axes)
 * - inventoryHealth: { normal, low, critical }
 * - equipmentLoad: { openFaults, scheduledMaintenance, overdueMaintenance, activeEquipmentPct, labels? }
 */
const noopT = (k) => k

export default function ExecutiveOverview({ data = {}, t = noopT, onDrillDown, zoneIds = [] }) {
  const {
    operationalStatus,
    productionTrend,
    zoneDistribution,
    riskMetrics,
    inventoryHealth,
    equipmentLoad,
  } = data

  return (
    <div className={`${shell.statGrid} ${styles.chartGrid}`} role="region" aria-label="Executive overview charts">
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>{t('operationalStatus')}</h3>
        <div className={styles.chartWrap}>
          <OperationalStatusChart data={operationalStatus} t={t} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'operationalStatus', ...payload }) : undefined} />
        </div>
      </div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>{t('productionTrend')}</h3>
        <div className={styles.chartWrap}>
          <ProductionTrendChart data={productionTrend} t={t} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'productionTrend', ...payload }) : undefined} />
        </div>
      </div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>{t('activityByZone')}</h3>
        <div className={styles.chartWrap}>
          <ZoneDistributionChart data={zoneDistribution} t={t} zoneIds={zoneIds} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'zoneDistribution', ...payload }) : undefined} />
        </div>
      </div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>{t('systemRisk')}</h3>
        <div className={styles.chartWrap}>
          <RiskRadarChart data={riskMetrics} t={t} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'riskRadar', ...payload }) : undefined} />
        </div>
      </div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>{t('inventoryHealth')}</h3>
        <div className={styles.chartWrap}>
          <InventoryHealthChart data={inventoryHealth} t={t} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'inventoryHealth', ...payload }) : undefined} />
        </div>
      </div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>{t('equipmentLoad')}</h3>
        <div className={styles.chartWrap}>
          <EquipmentLoadChart data={equipmentLoad} t={t} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'equipmentLoad', ...payload }) : undefined} />
        </div>
      </div>
    </div>
  )
}

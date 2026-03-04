import OperationalStatusChart from './charts/OperationalStatusChart'
import ProductionTrendChart from './charts/ProductionTrendChart'
import ZoneDistributionChart from './charts/ZoneDistributionChart'
import RiskRadarChart from './charts/RiskRadarChart'
import InventoryHealthChart from './charts/InventoryHealthChart'
import EquipmentLoadChart from './charts/EquipmentLoadChart'
import styles from './ExecutiveOverview.module.css'

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
export default function ExecutiveOverview({ data = {}, onDrillDown, zoneIds = [] }) {
  const {
    operationalStatus,
    productionTrend,
    zoneDistribution,
    riskMetrics,
    inventoryHealth,
    equipmentLoad,
  } = data

  return (
    <div className={styles.grid} role="region" aria-label="Executive overview charts">
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Operational status</h3>
        <div className={styles.chartWrap}>
          <OperationalStatusChart data={operationalStatus} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'operationalStatus', ...payload }) : undefined} />
        </div>
      </div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Production trend</h3>
        <div className={styles.chartWrap}>
          <ProductionTrendChart data={productionTrend} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'productionTrend', ...payload }) : undefined} />
        </div>
      </div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Activity by zone</h3>
        <div className={styles.chartWrap}>
          <ZoneDistributionChart data={zoneDistribution} zoneIds={zoneIds} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'zoneDistribution', ...payload }) : undefined} />
        </div>
      </div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>System risk</h3>
        <div className={styles.chartWrap}>
          <RiskRadarChart data={riskMetrics} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'riskRadar', ...payload }) : undefined} />
        </div>
      </div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Inventory health</h3>
        <div className={styles.chartWrap}>
          <InventoryHealthChart data={inventoryHealth} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'inventoryHealth', ...payload }) : undefined} />
        </div>
      </div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Equipment load</h3>
        <div className={styles.chartWrap}>
          <EquipmentLoadChart data={equipmentLoad} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'equipmentLoad', ...payload }) : undefined} />
        </div>
      </div>
    </div>
  )
}

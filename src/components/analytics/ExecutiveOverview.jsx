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
const noopT = (k) => k

export default function ExecutiveOverview({ data = {}, t = noopT, onDrillDown, zoneIds = [], compact = false }) {
  const {
    operationalStatus,
    productionTrend,
    zoneDistribution,
    riskMetrics,
    inventoryHealth,
    equipmentLoad,
  } = data

  const gridClass = compact ? `${styles.chartGrid} ${styles.chartGridCompact}` : styles.chartGrid
  const cardClass = compact ? `${styles.card} ${styles.cardCompact}` : styles.card
  const titleClass = compact ? `${styles.cardTitle} ${styles.cardTitleCompact}` : styles.cardTitle
  const wrapClass = compact ? `${styles.chartWrap} ${styles.chartWrapCompact}` : styles.chartWrap

  return (
    <div className={gridClass} role="region" aria-label="Executive overview charts">
      <div className={cardClass}>
        <h3 className={titleClass}>{t('operationalStatus')}</h3>
        <div className={wrapClass}>
          <OperationalStatusChart data={operationalStatus} t={t} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'operationalStatus', ...payload }) : undefined} />
        </div>
      </div>
      <div className={cardClass}>
        <h3 className={titleClass}>{t('productionTrend')}</h3>
        <div className={wrapClass}>
          <ProductionTrendChart data={productionTrend} t={t} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'productionTrend', ...payload }) : undefined} />
        </div>
      </div>
      <div className={cardClass}>
        <h3 className={titleClass}>{t('activityByZone')}</h3>
        <div className={wrapClass}>
          <ZoneDistributionChart data={zoneDistribution} t={t} zoneIds={zoneIds} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'zoneDistribution', ...payload }) : undefined} />
        </div>
      </div>
      <div className={cardClass}>
        <h3 className={titleClass}>{t('systemRisk')}</h3>
        <div className={wrapClass}>
          <RiskRadarChart data={riskMetrics} t={t} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'riskRadar', ...payload }) : undefined} />
        </div>
      </div>
      <div className={cardClass}>
        <h3 className={titleClass}>{t('inventoryHealth')}</h3>
        <div className={wrapClass}>
          <InventoryHealthChart data={inventoryHealth} t={t} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'inventoryHealth', ...payload }) : undefined} />
        </div>
      </div>
      <div className={cardClass}>
        <h3 className={titleClass}>{t('equipmentLoad')}</h3>
        <div className={wrapClass}>
          <EquipmentLoadChart data={equipmentLoad} t={t} onSegmentClick={onDrillDown ? (payload) => onDrillDown({ chart: 'equipmentLoad', ...payload }) : undefined} />
        </div>
      </div>
    </div>
  )
}

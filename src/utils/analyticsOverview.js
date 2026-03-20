/**
 * Builds chart-ready overview data from filtered system datasets.
 * Used by Executive Overview; all values respect appliedFilters context.
 */
import { TASK_STATUS } from '../data/assignTask'
import { SESSION_STATUS } from '../data/monitorActive'
import { INVENTORY_STATUS } from '../data/inventory'
import { FAULT_STATUS_OPEN } from '../data/faults'

function normalizeTaskStatus(status) {
  if (!status) return null
  const s = String(status).toLowerCase().trim()
  if (s === TASK_STATUS.PENDING_APPROVAL || s === 'approved') return TASK_STATUS.PENDING_APPROVAL
  if (s === TASK_STATUS.IN_PROGRESS) return TASK_STATUS.IN_PROGRESS
  if (s === TASK_STATUS.FINISHED_BY_WORKER) return TASK_STATUS.FINISHED_BY_WORKER
  if (s === TASK_STATUS.COMPLETED) return TASK_STATUS.COMPLETED
  if (s === TASK_STATUS.REJECTED) return TASK_STATUS.REJECTED
  return null
}

/**
 * @param {Object} params
 * @param {Array} params.filteredTasks
 * @param {Array} params.filteredSessions
 * @param {Array} params.filteredFaults
 * @param {Array} params.filteredRecords
 * @param {Array} params.inventoryWithStatus - items with .status (normal/low/critical)
 * @param {Array} params.equipment
 * @param {Array} params.filteredMaintenance - maintenance plans (filtered by equipment if applicable)
 * @param {Object} params.appliedFilters - { dateFrom, dateTo, ... }
 * @param {Array} params.zonesList
 * @param {Object} params.ZONE_LABEL
 * @param {Object} params.equipmentById
 */
export function buildOverviewData({
  filteredTasks,
  filteredSessions,
  filteredFaults,
  filteredRecords,
  inventoryWithStatus,
  equipment,
  filteredMaintenance,
  appliedFilters,
  zonesList,
  ZONE_LABEL,
  equipmentById,
}) {
  const today = (appliedFilters?.dateTo || new Date().toISOString().slice(0, 10)).toString().slice(0, 10)

  // 1. Operational status: Pending, In Progress, Completed, Delayed (rejected/cancelled excluded from all counts)
  const tasksPending = filteredTasks.filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.PENDING_APPROVAL).length
  const tasksInProgress = filteredTasks.filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.IN_PROGRESS).length
  const tasksCompleted = filteredTasks.filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.COMPLETED).length
  const sessionsActive = filteredSessions.filter((s) => !s.completedAt).length
  const sessionsDelayed = filteredSessions.filter((s) => s.status === SESSION_STATUS.DELAYED).length
  const openFaultsCount = filteredFaults.filter((f) => (f.status || FAULT_STATUS_OPEN) === FAULT_STATUS_OPEN).length

  const operationalStatus = {
    labels: ['Pending', 'In Progress', 'Completed', 'Delayed'],
    tasks: [tasksPending, tasksInProgress, tasksCompleted, 0],
    sessions: [0, sessionsActive, 0, sessionsDelayed],
    faults: [0, openFaultsCount, 0, 0],
  }

  // 2. Production trend: group production records by date in selected range
  const byDay = {}
  ;(filteredRecords || [])
    .filter((r) => r.recordType === 'production')
    .forEach((r) => {
      const d = (r.dateTime || r.createdAt || '').toString().slice(0, 10)
      if (!d) return
      byDay[d] = (byDay[d] || 0) + (Number(r.quantity) || 0)
    })
  const sortedProd = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]))
  const productionTrend = {
    dates: sortedProd.map(([d]) => d).length ? sortedProd.map(([d]) => d) : [appliedFilters?.dateFrom || appliedFilters?.dateTo || today],
    values: sortedProd.map(([, v]) => v).length ? sortedProd.map(([, v]) => v) : [0],
  }

  // 3. Zone distribution: tasks, sessions, faults per zone
  const zoneIds = (zonesList || []).map((z) => z.id)
  const tasksByZone = {}
  const sessionsByZone = {}
  const faultsByZone = {}
  zoneIds.forEach((id) => {
    tasksByZone[id] = 0
    sessionsByZone[id] = 0
    faultsByZone[id] = 0
  })
  ;(filteredTasks || []).filter((t) => normalizeTaskStatus(t.status) !== TASK_STATUS.REJECTED).forEach((t) => {
    const z = t.zoneId || 'other'
    if (tasksByZone[z] !== undefined) tasksByZone[z] += 1
  })
  ;(filteredSessions || []).forEach((s) => {
    const z = s.zoneId || s.zone || 'Other'
    const zId = (zonesList || []).find((x) => x.id === z || x.label === z)?.id || z
    if (sessionsByZone[zId] !== undefined) sessionsByZone[zId] += 1
  })
  ;(filteredFaults || []).forEach((f) => {
    const eq = equipmentById?.[f.equipmentId]
    const z = eq?.zone ? ((zonesList || []).find((x) => x.label === eq.zone || x.id === eq.zone)?.id || eq.zone) : 'other'
    if (faultsByZone[z] !== undefined) faultsByZone[z] += 1
  })
  const zoneDistribution = {
    labels: zoneIds.map((id) => ZONE_LABEL?.[id] || id),
    tasks: zoneIds.map((id) => tasksByZone[id] || 0),
    sessions: zoneIds.map((id) => sessionsByZone[id] || 0),
    faults: zoneIds.map((id) => faultsByZone[id] || 0),
  }

  // 4. Risk metrics (radar): delayed %, critical fault %, critical inventory %, workers at risk %, overdue maintenance %
  const totalSessions = Math.max(1, (filteredSessions || []).length)
  const totalFaults = Math.max(1, (filteredFaults || []).length)
  const totalInv = Math.max(1, (inventoryWithStatus || []).length)
  const totalPlans = Math.max(1, (filteredMaintenance || []).length)
  const delayedPct = ((filteredSessions || []).filter((s) => s.status === SESSION_STATUS.DELAYED).length / totalSessions) * 100
  const criticalFaultPct = ((filteredFaults || []).filter((f) => f.severity === 'critical').length / totalFaults) * 100
  const criticalInvPct = ((inventoryWithStatus || []).filter((i) => i.status === INVENTORY_STATUS.CRITICAL).length / totalInv) * 100
  const workersWithDelay = new Set((filteredSessions || []).filter((s) => s.status === SESSION_STATUS.DELAYED).map((s) => s.workerId)).size
  const totalWorkers = Math.max(1, new Set((filteredSessions || []).map((s) => s.workerId)).size)
  const workerDelayPct = (workersWithDelay / totalWorkers) * 100
  const overduePlans = (filteredMaintenance || []).filter((p) => (p.plannedDate || '').slice(0, 10) < today).length
  const overduePct = (overduePlans / totalPlans) * 100

  const riskMetrics = {
    labels: ['Delayed tasks %', 'Critical faults %', 'Critical inventory %', 'Low worker efficiency %', 'Overdue maintenance %'],
    values: [
      Math.min(100, delayedPct),
      Math.min(100, criticalFaultPct),
      Math.min(100, criticalInvPct),
      Math.min(100, workerDelayPct),
      Math.min(100, overduePct),
    ],
  }

  // 5. Inventory health (doughnut)
  const inv = inventoryWithStatus || []
  const inventoryHealth = {
    normal: inv.filter((i) => i.status === INVENTORY_STATUS.NORMAL).length,
    low: inv.filter((i) => i.status === INVENTORY_STATUS.LOW).length,
    critical: inv.filter((i) => i.status === INVENTORY_STATUS.CRITICAL).length,
  }

  // 6. Equipment load (polar)
  const openFaults = (filteredFaults || []).filter((f) => (f.status || FAULT_STATUS_OPEN) === FAULT_STATUS_OPEN).length
  const scheduled = (filteredMaintenance || []).filter((p) => (p.plannedDate || '').slice(0, 10) >= today).length
  const overdue = (filteredMaintenance || []).filter((p) => (p.plannedDate || '').slice(0, 10) < today).length
  const totalEq = Math.max(1, (equipment || []).length)
  const activeEq = (equipment || []).filter((e) => (e.status || 'active') === 'active').length
  const equipmentLoad = {
    openFaults,
    scheduledMaintenance: scheduled,
    overdueMaintenance: overdue,
    activeEquipmentPct: (activeEq / totalEq) * 100,
    labels: ['Open faults', 'Scheduled maintenance', 'Overdue maintenance', 'Active equipment %'],
  }

  return {
    operationalStatus,
    productionTrend,
    zoneDistribution,
    riskMetrics,
    inventoryHealth,
    equipmentLoad,
  }
}

const DELAYED_THRESHOLD = 25
const CRITICAL_INV_THRESHOLD = 3
const OPEN_FAULTS_THRESHOLD = 5

/**
 * Generates a short insight from overview data for the Auto Insight box.
 * Returns messageKey + messageParams so the UI can translate and interpolate.
 * @param {Object} overviewData - result of buildOverviewData
 * @returns {{ type: 'warning'|'risk'|'stable', messageKey: string, messageParams?: Object }}
 */
export function getAutoInsight(overviewData) {
  if (!overviewData) return { type: 'stable', messageKey: 'calculating' }

  const { riskMetrics, inventoryHealth, equipmentLoad, operationalStatus } = overviewData
  const delayedPct = riskMetrics?.values?.[0] ?? 0
  const criticalInv = inventoryHealth?.critical ?? 0
  const openFaults = equipmentLoad?.openFaults ?? 0
  const delayedCount = (operationalStatus?.sessions?.[3]) ?? 0

  if (delayedPct >= DELAYED_THRESHOLD || delayedCount > 5) {
    return {
      type: 'warning',
      messageKey: 'insightDelayedSessions',
      messageParams: { count: delayedCount, pct: Math.round(delayedPct) },
    }
  }
  if (criticalInv >= CRITICAL_INV_THRESHOLD) {
    return {
      type: 'risk',
      messageKey: 'insightCriticalInventory',
      messageParams: { count: criticalInv },
    }
  }
  if (openFaults >= OPEN_FAULTS_THRESHOLD) {
    return {
      type: 'warning',
      messageKey: 'insightOpenFaults',
      messageParams: { count: openFaults },
    }
  }
  if (criticalInv > 0 || openFaults > 0 || delayedCount > 0) {
    return { type: 'stable', messageKey: 'insightStableMinor' }
  }
  return { type: 'stable', messageKey: 'insightAllStable' }
}

/**
 * Compute percentage change between current and previous period values.
 * Used for trend comparison indicators. Capped to avoid misleading extremes (e.g. +2098%).
 * @param {number} current
 * @param {number} previous
 * @returns {number} Percentage change (e.g. 12 for +12%, -8 for -8%), capped between -99 and 999
 */
export function percentChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0
  const raw = Math.round(((current - previous) / previous) * 100)
  return Math.max(-99, Math.min(999, raw))
}

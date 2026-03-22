import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { getTranslation } from '../../i18n/translations'
import { getPowerBiEmbedUrl } from '../../config/powerBi'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  RadialLinearScale,
} from 'chart.js'
import { Bar, Line, Radar, Doughnut, Pie } from 'react-chartjs-2'
import { DEPARTMENT_OPTIONS, SEED_WORKERS } from '../../data/engineerWorkers'
import { TASK_STATUS, TASK_STATUS_LABELS } from '../../data/assignTask'
import { getInitialZones, getTaskById, getDepartment, getTasksForDepartment, TASKS_BY_DEPARTMENT, INVENTORY_TASKS } from '../../data/workerFlow'
import { getInventoryStatus, INVENTORY_CATEGORIES, INVENTORY_STATUS } from '../../data/inventory'
import { FAULT_CATEGORIES, SEVERITY_OPTIONS, FAULT_STATUS_OPEN } from '../../data/faults'
import { getSessionStatus, getElapsedMinutes, SESSION_STATUS, SESSION_STATUS_LABELS } from '../../data/monitorActive'
import { useAppStore } from '../../context/AppStoreContext'
import ExecutiveOverview from '../../components/analytics/ExecutiveOverview'
import SystemHealthScore from '../../components/analytics/SystemHealthScore'
import DrillDownModal from '../../components/analytics/DrillDownModal'
import { buildOverviewData, getAutoInsight, percentChange } from '../../utils/analyticsOverview'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import styles from './ReportsAnalytics.module.css'
import shell from '../../styles/sarmsPageShell.module.css'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  RadialLinearScale
)

const ALL_TASK_OPTIONS = (() => {
  const list = []
  Object.values(TASKS_BY_DEPARTMENT).forEach((arr) => arr.forEach((t) => list.push({ id: t.id, label: t.labelEn })))
  INVENTORY_TASKS.forEach((t) => list.push({ id: t.id, label: t.labelEn }))
  return list
})()

const WORKER_OPTIONS = SEED_WORKERS.filter((w) => w.role === 'worker' || w.role === 'engineer')

const DEFAULT_DATE_FROM = () => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
const DEFAULT_DATE_TO = () => new Date().toISOString().slice(0, 10)

/** SARMS olive chart palette – matches Executive Overview analytics */
const COLOR = {
  GREEN: '#5c7b5c',
  YELLOW: '#c7924a',
  RED: '#b85c5c',
  NEUTRAL: '#7a8580',
  ORANGE: '#c7924a',
  LIGHT_GREEN: '#a9bfa9',
  SOFT_BLUE: '#4f7c8a',
}
/** Hover (darker) for bar/donut – never lighter */
const HOVER = {
  GREEN: '#385438',
  NEUTRAL: '#5e6763',
  SOFT_BLUE: '#3a606b',
  LIGHT_GREEN: '#7fa77f',
  OLIVE_SOFT: '#5c7b5c',
  ORANGE: '#a6783c',
  RED: '#8f4444',
}
const CHART_GRID = '#e4e9e4'

function inDateRange(iso, from, to) {
  if (!from && !to) return true
  const d = new Date(iso).toISOString().slice(0, 10)
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

/** Session is completed if it has completedAt, completed_at (API), or endTime. */
function isSessionCompleted(s) {
  return !!(s?.completedAt ?? s?.completed_at ?? s?.endTime)
}

/** Session belongs to zone z (z has .id and .label). */
function sessionInZone(s, z) {
  const sid = (s.zoneId || s.zone || '').toString().trim().toLowerCase()
  const slabel = (s.zone || s.zoneId || '').toString().trim()
  const zid = (z.id || '').toString().trim().toLowerCase()
  const zlabel = (z.label || '').toString().trim()
  return sid === zid || slabel === zlabel
}

/** Same as Monitor Active Work: task is in progress. */
function isTaskInProgress(status) {
  if (status == null || status === '') return false
  const s = String(status).toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_').trim()
  return s === TASK_STATUS.IN_PROGRESS
}

/** Normalize task status for chart counts (approved = pending_approval). */
function normalizeTaskStatus(status) {
  if (!status) return null
  const s = String(status).toLowerCase().trim()
  if (s === TASK_STATUS.PENDING_APPROVAL || s === 'approved') return TASK_STATUS.PENDING_APPROVAL
  if (s === TASK_STATUS.IN_PROGRESS) return TASK_STATUS.IN_PROGRESS
  if (s === TASK_STATUS.COMPLETED) return TASK_STATUS.COMPLETED
  if (s === TASK_STATUS.REJECTED) return TASK_STATUS.REJECTED
  return null
}

const EXPLORER_MODULE_IDS = [
  { id: 'executive', labelKey: 'executiveOverview', icon: 'fa-chart-pie' },
  { id: 'operations', labelKey: 'operations', icon: 'fa-list-check' },
  { id: 'production', labelKey: 'production', icon: 'fa-chart-line' },
  { id: 'workers', labelKey: 'workers', icon: 'fa-users' },
  { id: 'equipment', labelKey: 'equipment', icon: 'fa-wrench' },
  { id: 'inventory', labelKey: 'inventory', icon: 'fa-boxes-stacked' },
  { id: 'sessions', labelKey: 'sessions', icon: 'fa-clock' },
]

const REPORTS_VIEW_KEY = 'sarms-reports-charts-view'

export default function ReportsAnalytics() {
  const navigate = useNavigate()
  const location = useLocation()
  const { lang } = useLanguage()
  const namespace = location.pathname.startsWith('/admin') ? 'admin' : 'engineer'
  const t = (key) => getTranslation(lang, namespace, key)
  const formatMessage = (str, params) => {
    if (!params || typeof str !== 'string') return str
    return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (params[k] != null ? String(params[k]) : `{{${k}}}`))
  }
  const [chartsView, setChartsView] = useState(() => {
    try { return localStorage.getItem(REPORTS_VIEW_KEY) || 'internal' } catch { return 'internal' }
  })
  const [powerBiFullscreen, setPowerBiFullscreen] = useState(false)
  useEffect(() => {
    try { localStorage.setItem(REPORTS_VIEW_KEY, chartsView) } catch {}
  }, [chartsView])
  const {
    sessions,
    tasks,
    records,
    faults,
    inventory,
    equipment,
    maintenancePlans,
    zones: storeZones,
    workers,
  } = useAppStore()
  const zonesList = (storeZones && storeZones.length > 0) ? storeZones : getInitialZones()
  const ZONE_LABEL = useMemo(() => Object.fromEntries(zonesList.map((z) => [z.id, z.label])), [zonesList])
  /** Zones for "Active sessions by zone" chart: always use full list (A,B,C,D,Inventory) so counts match Engineer Active Workers table. */
  const sessionsChartZones = useMemo(() => getInitialZones(), [])
  const EQUIPMENT_OPTIONS = useMemo(() => (equipment || []).map((e) => ({ id: e.id, label: e.name || e.id })), [equipment])

  const [tick, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000)
    return () => clearInterval(interval)
  }, [])

  const initialFilters = useMemo(() => ({
    dateFrom: DEFAULT_DATE_FROM(),
    dateTo: DEFAULT_DATE_TO(),
    dept: '',
    zone: '',
    worker: '',
    equipment: '',
    taskStatus: '',
    faultSeverity: '',
    invCategory: '',
    sessionStatus: '',
  }), [])

  const [filters, setFilters] = useState(initialFilters)
  const [appliedFilters, setAppliedFilters] = useState(initialFilters)

  const [openExplorer, setOpenExplorer] = useState('executive')
  const [summaryModalOpen, setSummaryModalOpen] = useState(false)
  const [summaryText, setSummaryText] = useState('')
  const [drillDownOpen, setDrillDownOpen] = useState(false)
  const [drillDownPayload, setDrillDownPayload] = useState(null)
  const [summaryFilterOpen, setSummaryFilterOpen] = useState(false)
  const [activeDatePreset, setActiveDatePreset] = useState(null)
  const pageCaptureRef = useRef(null)
  const reportsContentRef = useRef(null)

  const now = Date.now()
  const allSessionsWithStatus = useMemo(
    () =>
      (sessions || []).map((s) => ({
        ...s,
        status: getSessionStatus(s, now),
        elapsedMinutes: getElapsedMinutes(s, now),
      })),
    [sessions, tick, now]
  )

  const applyFilters = () => {
    setAppliedFilters({ ...filters })
  }

  const clearFilters = () => {
    setFilters(initialFilters)
    setAppliedFilters(initialFilters)
  }

  const setDatePreset = (preset) => {
    const today = new Date().toISOString().slice(0, 10)
    let dateFrom = filters.dateFrom
    let dateTo = filters.dateTo
    switch (preset) {
      case '7':
        dateFrom = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
        dateTo = today
        break
      case '30':
        dateFrom = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
        dateTo = today
        break
      case 'month':
        dateFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
        dateTo = today
        break
      case '90':
        dateFrom = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
        dateTo = today
        break
      default:
        break
    }
    setFilters((f) => ({ ...f, dateFrom, dateTo }))
    setActiveDatePreset(preset)
  }

  const filteredTasks = useMemo(() => {
    return (tasks || []).filter((t) => {
      if (appliedFilters.zone && (t.zoneId || '') !== appliedFilters.zone) return false
      if (appliedFilters.dept && (t.departmentId || t.taskType || '') !== appliedFilters.dept) return false
      if (appliedFilters.taskStatus && (t.status || '') !== appliedFilters.taskStatus) return false
      if (appliedFilters.worker && !(t.workerIds || []).includes(appliedFilters.worker)) return false
      return true
    })
  }, [tasks, appliedFilters])

  const filteredSessions = useMemo(() => {
    return allSessionsWithStatus.filter((s) => {
      if (appliedFilters.dateFrom || appliedFilters.dateTo) {
        const startDate = (s.startTime || s.createdAt || '').toString().slice(0, 10)
        if (!inDateRange(startDate, appliedFilters.dateFrom, appliedFilters.dateTo)) return false
      }
      if (appliedFilters.zone && (s.zoneId || s.zone || '') !== appliedFilters.zone) return false
      if (appliedFilters.dept && (s.departmentId || s.department || '').toString().toLowerCase() !== appliedFilters.dept.toLowerCase()) return false
      if (appliedFilters.worker && (s.workerId || '') !== appliedFilters.worker) return false
      if (appliedFilters.sessionStatus && (s.status || '') !== appliedFilters.sessionStatus) return false
      return true
    })
  }, [allSessionsWithStatus, appliedFilters])

  /** Same data as Engineer "Monitor Active Work" table: real active sessions + virtual from IN_PROGRESS tasks. */
  const activeSessionsOnly = useMemo(() => {
    const real = (sessions || []).filter((s) => !isSessionCompleted(s))
    const taskIdsWithActive = new Set(real.map((s) => String(s.taskId)).filter(Boolean))
    const virtual = []
    ;(tasks || []).forEach((task) => {
      if (!isTaskInProgress(task.status)) return
      if (task.id != null && taskIdsWithActive.has(String(task.id))) return
      const dept = getDepartment(task.departmentId)
      const deptId = (task.departmentId || task.taskType || '').toLowerCase()
      const taskLabel = getTasksForDepartment(deptId)?.find((t) => t.id === task.taskId)
      const zoneIdNorm = task.zoneId != null ? String(task.zoneId).toLowerCase() : ''
      const zoneLabel = ZONE_LABEL[zoneIdNorm] ?? (zoneIdNorm === 'inventory' ? 'Inventory' : zoneIdNorm ? `Zone ${zoneIdNorm.toUpperCase()}` : '—')
      const workerIds = Array.isArray(task.workerIds) ? task.workerIds : []
      const base = {
        taskId: task.id,
        departmentId: deptId || task.departmentId,
        department: dept?.labelEn ?? task.departmentId ?? '—',
        task: taskLabel?.labelEn ?? task.taskId ?? '—',
        zoneId: zoneIdNorm || task.zoneId,
        zone: zoneLabel,
        linesArea: task.linesArea || '—',
        startTime: task.createdAt || new Date().toISOString(),
        expectedMinutes: task.estimatedMinutes || 60,
        assignedByEngineer: false,
      }
      const workerList = workers && workers.length > 0 ? workers : WORKER_OPTIONS
      if (workerIds.length === 0) {
        virtual.push({ id: `task-${task.id}`, workerId: '', workerName: '—', ...base })
      } else {
        workerIds.forEach((wId) => {
          const w = (workerList || []).find((x) => String(x.id) === String(wId))
          virtual.push({
            id: `task-${task.id}-${wId}`,
            workerId: String(wId),
            workerName: w?.fullName ?? String(wId),
            ...base,
          })
        })
      }
    })
    return [...real, ...virtual]
  }, [sessions, tasks, workers, ZONE_LABEL])

  /** Active sessions with status (On time / Delayed / Flagged) – same as Engineer Active Workers table. */
  const activeSessionsWithStatus = useMemo(() => {
    const now = Date.now()
    return activeSessionsOnly.map((s) => ({ ...s, status: getSessionStatus(s, now) }))
  }, [activeSessionsOnly, tick])

  const filteredMaintenance = useMemo(() => {
    const list = maintenancePlans || []
    if (!appliedFilters.equipment) return list
    return list.filter((p) => (p.equipmentId || '') === appliedFilters.equipment)
  }, [maintenancePlans, appliedFilters.equipment])

  const filteredRecords = useMemo(() => {
    const taskLabel = appliedFilters.taskStatus ? null : (appliedFilters.worker ? WORKER_OPTIONS.find((w) => w.id === appliedFilters.worker)?.fullName : null)
    return (records || []).filter((r) => {
      if (!inDateRange(r.dateTime || r.createdAt, appliedFilters.dateFrom, appliedFilters.dateTo)) return false
      if (appliedFilters.dept && (r.department || '').toLowerCase() !== appliedFilters.dept.toLowerCase()) return false
      if (appliedFilters.zone) {
        const rZone = (r.zone || r.zoneId || '').toString().trim()
        const zLabel = (ZONE_LABEL[appliedFilters.zone] || '').toString().trim()
        if (rZone !== appliedFilters.zone && rZone !== zLabel) return false
      }
      if (appliedFilters.worker && (r.worker || '').trim() !== (WORKER_OPTIONS.find((w) => w.id === appliedFilters.worker)?.fullName || '').trim()) return false
      return true
    })
  }, [records, appliedFilters, ZONE_LABEL])

  const filteredFaults = useMemo(() => {
    return (faults || []).filter((f) => {
      if (appliedFilters.equipment && (f.equipmentId || '') !== appliedFilters.equipment) return false
      if (appliedFilters.faultSeverity && (f.severity || '') !== appliedFilters.faultSeverity) return false
      return true
    })
  }, [faults, appliedFilters])

  const filteredInventory = useMemo(() => {
    return (inventory || []).filter((i) => {
      if (appliedFilters.invCategory && (i.category || '') !== appliedFilters.invCategory) return false
      return true
    })
  }, [inventory, appliedFilters])

  const inventoryWithStatus = useMemo(
    () => filteredInventory.map((i) => ({ ...i, status: getInventoryStatus(i) })),
    [filteredInventory]
  )

  const activeFilterLabels = useMemo(() => {
    const arr = []
    if (appliedFilters.dateFrom || appliedFilters.dateTo) arr.push('Date')
    if (appliedFilters.dept) arr.push('Department')
    if (appliedFilters.zone) arr.push('Zone')
    if (appliedFilters.worker) arr.push('Worker')
    if (appliedFilters.equipment) arr.push('Equipment')
    if (appliedFilters.taskStatus) arr.push('Task status')
    if (appliedFilters.faultSeverity) arr.push('Fault severity')
    if (appliedFilters.invCategory) arr.push('Inventory category')
    if (appliedFilters.sessionStatus) arr.push('Session status')
    return arr
  }, [appliedFilters])

  /** Production by unit; dominant = unit with largest total; byUnit for switcher. */
  const productionByUnitAndDominant = useMemo(() => {
    const prodRecords = filteredRecords.filter((r) => r.recordType === 'production')
    const byUnit = {}
    prodRecords.forEach((r) => {
      const u = (r.unit || 'kg').toString().trim() || 'kg'
      byUnit[u] = (byUnit[u] || 0) + (Number(r.quantity) || 0)
    })
    const entries = Object.entries(byUnit).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    const dominant = entries[0]
    return {
      byUnit,
      dominantUnit: dominant ? dominant[0] : 'kg',
      dominantTotal: dominant ? dominant[1] : 0,
    }
  }, [filteredRecords])

  const [selectedProductionUnit, setSelectedProductionUnit] = useState(null)
  const [productionUnitDropdownOpen, setProductionUnitDropdownOpen] = useState(false)
  const productionUnitDropdownRef = useRef(null)
  useEffect(() => {
    if (!productionUnitDropdownOpen) return
    const close = (e) => {
      if (productionUnitDropdownRef.current && !productionUnitDropdownRef.current.contains(e.target)) setProductionUnitDropdownOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [productionUnitDropdownOpen])

  const displayedProductionUnit = selectedProductionUnit ?? productionByUnitAndDominant.dominantUnit
  const displayedProductionTotal = selectedProductionUnit != null
    ? (productionByUnitAndDominant.byUnit[selectedProductionUnit] ?? 0)
    : productionByUnitAndDominant.dominantTotal
  const productionUnitOptions = useMemo(() => {
    const entries = Object.entries(productionByUnitAndDominant.byUnit).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    if (entries.length > 0) return entries.map(([u]) => u)
    if (productionByUnitAndDominant.dominantUnit) return [productionByUnitAndDominant.dominantUnit]
    return ['kg']
  }, [productionByUnitAndDominant.byUnit, productionByUnitAndDominant.dominantUnit])

  const miniMetrics = useMemo(() => {
    const openFaults = filteredFaults.filter((f) => (f.status || FAULT_STATUS_OPEN) === FAULT_STATUS_OPEN).length
    const delayedTasks = filteredSessions.filter((s) => s.status === SESSION_STATUS.DELAYED).length
    const criticalInventory = inventoryWithStatus.filter((i) => i.status === INVENTORY_STATUS.CRITICAL).length
    const activeSessionsCount = filteredSessions.filter((s) => !isSessionCompleted(s)).length
    return {
      totalProduction: productionByUnitAndDominant.dominantTotal,
      totalProductionUnit: productionByUnitAndDominant.dominantUnit,
      openFaults,
      delayedTasks,
      criticalInventory,
      activeSessions: activeSessionsCount,
    }
  }, [filteredRecords, filteredFaults, filteredSessions, inventoryWithStatus, productionByUnitAndDominant])

  const equipmentById = useMemo(() => Object.fromEntries((equipment || []).map((e) => [e.id, e])), [equipment])

  const overviewData = useMemo(
    () =>
      buildOverviewData({
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
      }),
    [
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
    ]
  )

  const autoInsight = useMemo(() => getAutoInsight(overviewData), [overviewData])

  const prevPeriodMetrics = useMemo(() => {
    const { dateFrom, dateTo } = appliedFilters
    if (!dateFrom || !dateTo) return null
    const from = new Date(dateFrom)
    const to = new Date(dateTo)
    const days = Math.round((to - from) / 86400000) + 1
    const prevTo = new Date(from)
    prevTo.setDate(prevTo.getDate() - 1)
    const prevFrom = new Date(prevTo)
    prevFrom.setDate(prevFrom.getDate() - days + 1)
    const prevFromStr = prevFrom.toISOString().slice(0, 10)
    const prevToStr = prevTo.toISOString().slice(0, 10)
    const inPrevRange = (iso) => {
      const d = (iso || '').toString().slice(0, 10)
      return d >= prevFromStr && d <= prevToStr
    }
    let prevRecordsList = (records || []).filter((r) => inPrevRange(r.dateTime || r.createdAt))
    if (appliedFilters.dept) {
      prevRecordsList = prevRecordsList.filter((r) => (r.department || '').toLowerCase() === appliedFilters.dept.toLowerCase())
    }
    if (appliedFilters.zone) {
      const zLabel = ZONE_LABEL[appliedFilters.zone] || ''
      prevRecordsList = prevRecordsList.filter((r) => (r.zone || r.zoneId || '').toString().trim() === appliedFilters.zone || (r.zone || '').toString().trim() === zLabel)
    }
    if (appliedFilters.worker) {
      const wName = WORKER_OPTIONS.find((w) => w.id === appliedFilters.worker)?.fullName || ''
      prevRecordsList = prevRecordsList.filter((r) => (r.worker || '').trim() === wName.trim())
    }
    const prevSessions = allSessionsWithStatus.filter((s) => {
      const d = (s.startTime || s.createdAt || '').toString().slice(0, 10)
      if (d < prevFromStr || d > prevToStr) return false
      if (appliedFilters.zone && (s.zoneId || s.zone || '') !== appliedFilters.zone) return false
      if (appliedFilters.dept && (s.departmentId || s.department || '').toString().toLowerCase() !== appliedFilters.dept.toLowerCase()) return false
      if (appliedFilters.worker && (s.workerId || '') !== appliedFilters.worker) return false
      if (appliedFilters.sessionStatus && (s.status || '') !== appliedFilters.sessionStatus) return false
      return true
    })
    const dominantUnit = productionByUnitAndDominant.dominantUnit
    const prevProd = prevRecordsList
      .filter((r) => r.recordType === 'production' && ((r.unit || 'kg').toString().trim() || 'kg') === dominantUnit)
      .reduce((s, r) => s + (Number(r.quantity) || 0), 0)
    const prevDelayed = prevSessions.filter((s) => s.status === SESSION_STATUS.DELAYED).length
    const prevOverdue = (filteredMaintenance || []).filter((p) => (p.plannedDate || '').slice(0, 10) < prevToStr).length
    const openFaultsPrev = (faults || []).filter((f) => {
      if (appliedFilters.equipment && (f.equipmentId || '') !== appliedFilters.equipment) return false
      if (appliedFilters.faultSeverity && (f.severity || '') !== appliedFilters.faultSeverity) return false
      return (f.status || FAULT_STATUS_OPEN) === FAULT_STATUS_OPEN
    }).length
    return {
      totalProduction: prevProd,
      delayedTasks: prevDelayed,
      openFaults: openFaultsPrev,
      overdueMaintenance: prevOverdue,
    }
  }, [appliedFilters, records, allSessionsWithStatus, filteredMaintenance, faults, ZONE_LABEL, productionByUnitAndDominant])

  const currentOverdueMaintenance = useMemo(
    () => (filteredMaintenance || []).filter((p) => (p.plannedDate || '').slice(0, 10) < (appliedFilters?.dateTo || new Date().toISOString().slice(0, 10))).length,
    [filteredMaintenance, appliedFilters?.dateTo]
  )

  const trendComparison = useMemo(() => {
    if (!prevPeriodMetrics) return null
    return {
      productionChange: percentChange(miniMetrics.totalProduction, prevPeriodMetrics.totalProduction),
      delayedChange: percentChange(miniMetrics.delayedTasks, prevPeriodMetrics.delayedTasks),
      faultsChange: percentChange(miniMetrics.openFaults, prevPeriodMetrics.openFaults),
      maintenanceChange: percentChange(currentOverdueMaintenance, prevPeriodMetrics.overdueMaintenance),
    }
  }, [prevPeriodMetrics, miniMetrics, currentOverdueMaintenance])

  function handleDrillDown(payload) {
    if (!payload) return
    setDrillDownPayload(payload)
    setDrillDownOpen(true)
  }

  const productionTrendChartData = useMemo(
    () =>
      overviewData?.productionTrend
        ? {
            labels: overviewData.productionTrend.dates,
            datasets: [{ label: 'Production', data: overviewData.productionTrend.values, borderColor: COLOR.GREEN, backgroundColor: COLOR.GREEN + '20', fill: true, tension: 0.3 }],
          }
        : { labels: [], datasets: [{ label: 'Production', data: [0], borderColor: COLOR.GREEN, backgroundColor: COLOR.GREEN + '20', fill: true, tension: 0.3 }] },
    [overviewData]
  )

  /** Production by department: this period (last 7 days) vs previous period (7 days before) for comparison. */
  const productionComparisonByDept = useMemo(() => {
    const prodRecords = (records || []).filter((r) => r.recordType === 'production')
    const toDate = (iso) => (iso ? String(iso).slice(0, 10) : '')
    const today = new Date().toISOString().slice(0, 10)
    const rangeEnd = appliedFilters.dateTo && appliedFilters.dateTo <= today ? appliedFilters.dateTo : today
    const rangeStart = appliedFilters.dateFrom || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const end = new Date(rangeEnd + 'T12:00:00')
    const thisPeriodEnd = new Date(end)
    const thisPeriodStart = new Date(end)
    thisPeriodStart.setDate(thisPeriodStart.getDate() - 6)
    const prevPeriodEnd = new Date(end)
    prevPeriodEnd.setDate(prevPeriodEnd.getDate() - 7)
    const prevPeriodStart = new Date(end)
    prevPeriodStart.setDate(prevPeriodStart.getDate() - 13)
    const thisFrom = thisPeriodStart.toISOString().slice(0, 10)
    const thisTo = thisPeriodEnd.toISOString().slice(0, 10)
    const prevFrom = prevPeriodStart.toISOString().slice(0, 10)
    const prevTo = prevPeriodEnd.toISOString().slice(0, 10)
    const inRange = (r) => {
      const d = toDate(r.dateTime || r.createdAt)
      if (!d) return false
      if (appliedFilters.dateFrom && d < appliedFilters.dateFrom) return false
      if (appliedFilters.dateTo && d > appliedFilters.dateTo) return false
      if (appliedFilters.dept && (r.department || '').toLowerCase() !== appliedFilters.dept.toLowerCase()) return false
      if (appliedFilters.zone) {
        const rZone = (r.zone || r.zoneId || '').toString().trim()
        const zLabel = (ZONE_LABEL[appliedFilters.zone] || '').toString().trim()
        if (rZone !== appliedFilters.zone && rZone !== zLabel) return false
      }
      if (appliedFilters.worker && (r.worker || '').trim() !== (WORKER_OPTIONS.find((w) => w.id === appliedFilters.worker)?.fullName || '').trim()) return false
      return true
    }
    const byDept = (from, to) => {
      const list = prodRecords.filter((r) => {
        if (!inRange(r)) return false
        const d = toDate(r.dateTime || r.createdAt)
        return d >= from && d <= to
      })
      return DEPARTMENT_OPTIONS.map((d) =>
        list.reduce((s, r) => ((r.department || '').toLowerCase() === (d.value || '').toLowerCase() ? s + (Number(r.quantity) || 0) : s), 0)
      )
    }
    const thisWeek = byDept(thisFrom, thisTo)
    const lastWeek = byDept(prevFrom, prevTo)
    const labels = DEPARTMENT_OPTIONS.map((d) => d.label)
    const pctChanges = labels.map((_, i) => percentChange(thisWeek[i], lastWeek[i]))
    return { labels, thisWeek, lastWeek, pctChanges }
  }, [records, appliedFilters, ZONE_LABEL])

  /** Production by zone: this period vs previous (all zones except Inventory). Fixed list so Zone A/B/C/D always appear. */
  const productionZonesForCharts = useMemo(() => {
    return getInitialZones().filter((z) => (z.id || '').toString().toLowerCase() !== 'inventory')
  }, [])

  const productionComparisonByZone = useMemo(() => {
    const zonesForChart = productionZonesForCharts
    const prodRecords = (records || []).filter((r) => r.recordType === 'production')
    const toDate = (iso) => (iso ? String(iso).slice(0, 10) : '')
    const today = new Date().toISOString().slice(0, 10)
    const rangeEnd = appliedFilters.dateTo && appliedFilters.dateTo <= today ? appliedFilters.dateTo : today
    const end = new Date(rangeEnd + 'T12:00:00')
    const thisPeriodStart = new Date(end)
    thisPeriodStart.setDate(thisPeriodStart.getDate() - 6)
    const prevPeriodEnd = new Date(end)
    prevPeriodEnd.setDate(prevPeriodEnd.getDate() - 7)
    const prevPeriodStart = new Date(end)
    prevPeriodStart.setDate(prevPeriodStart.getDate() - 13)
    const thisFrom = thisPeriodStart.toISOString().slice(0, 10)
    const thisTo = end.toISOString().slice(0, 10)
    const prevFrom = prevPeriodStart.toISOString().slice(0, 10)
    const prevTo = prevPeriodEnd.toISOString().slice(0, 10)
    const inRange = (r) => {
      const d = toDate(r.dateTime || r.createdAt)
      if (!d) return false
      if (appliedFilters.dateFrom && d < appliedFilters.dateFrom) return false
      if (appliedFilters.dateTo && d > appliedFilters.dateTo) return false
      if (appliedFilters.dept && (r.department || '').toLowerCase() !== appliedFilters.dept.toLowerCase()) return false
      if (appliedFilters.zone) {
        const rZone = (r.zone || r.zoneId || '').toString().trim()
        const zLabel = (ZONE_LABEL[appliedFilters.zone] || '').toString().trim()
        if (rZone !== appliedFilters.zone && rZone !== zLabel) return false
      }
      if (appliedFilters.worker && (r.worker || '').trim() !== (WORKER_OPTIONS.find((w) => w.id === appliedFilters.worker)?.fullName || '').trim()) return false
      return true
    }
    const matchZone = (r, z) => {
      const id = (z.id || '').toString().toLowerCase()
      const label = (z.label || ZONE_LABEL[z.id] || z.id).toString()
      const rZone = (r.zoneId || r.zone || '').toString().trim()
      const rNorm = rZone.toLowerCase()
      return rNorm === id || rZone === label || (ZONE_LABEL[z.id] && rZone === ZONE_LABEL[z.id])
    }
    const byZone = (from, to) =>
      zonesForChart.map((z) => {
        const list = prodRecords.filter((r) => {
          if (!inRange(r)) return false
          const d = toDate(r.dateTime || r.createdAt)
          return d >= from && d <= to
        })
        return list.reduce((s, r) => (matchZone(r, z) ? s + (Number(r.quantity) || 0) : s), 0)
      })
    const thisWeek = byZone(thisFrom, thisTo)
    const lastWeek = byZone(prevFrom, prevTo)
    const labels = zonesForChart.map((z) => z.label || ZONE_LABEL[z.id] || z.id)
    const pctChanges = labels.map((_, i) => percentChange(thisWeek[i], lastWeek[i]))
    return { labels, thisWeek, lastWeek, pctChanges }
  }, [records, appliedFilters, ZONE_LABEL, productionZonesForCharts])

  const inventoryDoughnutChartData = useMemo(
    () =>
      overviewData?.inventoryHealth
        ? {
            labels: ['Normal', 'Low', 'Critical'],
            datasets: [
              {
                data: [overviewData.inventoryHealth.normal, overviewData.inventoryHealth.low, overviewData.inventoryHealth.critical],
                backgroundColor: [COLOR.GREEN, COLOR.YELLOW, COLOR.RED],
                borderWidth: 2,
                borderColor: '#fff',
              },
            ],
          }
        : null,
    [overviewData]
  )

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
  }

  const stackedBarOptions = {
    ...chartOptions,
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, font: { size: 11 } } },
      y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 10 } } },
    },
  }

  const horizontalBarOptions = {
    ...chartOptions,
    indexAxis: 'y',
    scales: {
      x: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 10 } } },
      y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
    },
  }

  const lineOptions = {
    ...chartOptions,
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } },
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 10 } } },
    },
  }

  /** Bar chart with integer y-axis (1, 2, 3, …) for counts (e.g. sessions per worker). */
  const barIntegerYOptions = {
    ...chartOptions,
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.06)' },
        ticks: {
          stepSize: 1,
          font: { size: 10 },
          callback: (value) => (Number.isInteger(value) ? value : ''),
        },
      },
    },
  }

  const radarOptions = {
    ...chartOptions,
    scales: {
      r: {
        beginAtZero: true,
        max: 100,
        ticks: { stepSize: 25, font: { size: 9 } },
        pointLabels: { font: { size: 10 } },
      },
    },
  }

  const doughnutOptions = { ...chartOptions }

  /** Grouped bar (this week vs last week), not stacked. */
  const groupedBarOptions = {
    ...chartOptions,
    scales: {
      x: { stacked: false, grid: { display: false }, ticks: { maxRotation: 0, font: { size: 11 } } },
      y: { stacked: false, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 10 } } },
    },
    plugins: {
      ...chartOptions.plugins,
      tooltip: {
        callbacks: {
          afterBody: (items) => {
            if (!items.length || !productionComparisonByDept) return ''
            const i = items[0].dataIndex
            const pct = productionComparisonByDept.pctChanges[i]
            if (pct == null || pct === 0) return ''
            const sign = pct > 0 ? '+' : ''
            return `(${sign}${pct}% vs previous period)`
          },
        },
      },
    },
  }

  /** Grouped bar by zone: tooltip uses productionComparisonByZone. */
  const groupedBarOptionsZone = {
    ...chartOptions,
    scales: {
      x: { stacked: false, grid: { display: false }, ticks: { maxRotation: 0, font: { size: 11 } } },
      y: { stacked: false, beginAtZero: true, grid: { color: CHART_GRID }, ticks: { font: { size: 10 } } },
    },
    plugins: {
      ...chartOptions.plugins,
      tooltip: {
        callbacks: {
          afterBody: (items) => {
            if (!items.length || !productionComparisonByZone) return ''
            const i = items[0].dataIndex
            const pct = productionComparisonByZone.pctChanges[i]
            if (pct == null || pct === 0) return ''
            const sign = pct > 0 ? '+' : ''
            return `(${sign}${pct}% vs previous period)`
          },
        },
      },
    },
  }

  /** Horizontal bar chart with integer x-axis (for counts). */
  const horizontalBarIntegerOptions = {
    ...chartOptions,
    indexAxis: 'y',
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: CHART_GRID },
        ticks: { stepSize: 1, font: { size: 10 }, callback: (value) => (Number.isInteger(value) ? value : '') },
      },
      y: { grid: { display: false }, ticks: { font: { size: 11 } } },
    },
  }

  function compileSummary() {
    const lines = [
      `SARMS Analytical Summary – ${new Date().toLocaleDateString()}`,
      '',
      `Period: ${appliedFilters.dateFrom} to ${appliedFilters.dateTo}`,
      `Total production: ${displayedProductionTotal} ${displayedProductionUnit || 'units'}`,
      `Open faults: ${miniMetrics.openFaults}`,
      `Delayed tasks (sessions): ${miniMetrics.delayedTasks}`,
      `Critical inventory items: ${miniMetrics.criticalInventory}`,
      `Active sessions: ${miniMetrics.activeSessions}`,
      '',
      `Tasks (filtered): ${filteredTasks.length}`,
      `Records (filtered): ${filteredRecords.length}`,
    ]
    setSummaryText(lines.join('\n'))
    setSummaryModalOpen(true)
  }

  function exportPDF() {
    const el = reportsContentRef.current
    if (!el) return
    html2canvas(el, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()
      const margin = 10
      const w = pdfW - margin * 2
      const h = (canvas.height * w) / canvas.width
      const CLR = { black: [0, 0, 0], green: [40, 130, 70], red: [185, 55, 55], gray: [110, 110, 110] }
      const writeSegments = (segments, startY, lineHeight) => {
        let x = margin
        let yy = startY
        segments.forEach(({ text, color }) => {
          pdf.setTextColor(...(color || CLR.black))
          const s = String(text)
          pdf.text(s, x, yy)
          x += pdf.getTextWidth(s)
        })
        pdf.setTextColor(...CLR.black)
        return startY + lineHeight
      }

      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.text('General Report', margin, 12)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.text(new Date().toLocaleString(), margin, 18)

      let y = 24
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Filters applied:', margin, y)
      y += 5
      const dateRange = (appliedFilters.dateFrom || appliedFilters.dateTo) ? `${appliedFilters.dateFrom || '—'} to ${appliedFilters.dateTo || '—'}` : 'All'
      const deptLabel = appliedFilters.dept ? (DEPARTMENT_OPTIONS.find((d) => d.value === appliedFilters.dept)?.label || appliedFilters.dept) : 'All'
      const zoneLabelVal = appliedFilters.zone ? (ZONE_LABEL[appliedFilters.zone] || appliedFilters.zone) : 'All'
      const workerLabel = appliedFilters.worker ? (WORKER_OPTIONS.find((w) => w.id === appliedFilters.worker)?.fullName || appliedFilters.worker) : 'All'
      const equipmentLabel = appliedFilters.equipment ? (EQUIPMENT_OPTIONS.find((e) => e.id === appliedFilters.equipment)?.label || appliedFilters.equipment) : 'All'
      const taskStatusLabel = appliedFilters.taskStatus ? (TASK_STATUS_LABELS[appliedFilters.taskStatus] || appliedFilters.taskStatus) : 'All'
      const faultSevLabel = appliedFilters.faultSeverity ? (SEVERITY_OPTIONS.find((s) => s.id === appliedFilters.faultSeverity)?.label || appliedFilters.faultSeverity) : 'All'
      const invCatLabel = appliedFilters.invCategory ? (INVENTORY_CATEGORIES.find((c) => c.id === appliedFilters.invCategory)?.label || appliedFilters.invCategory) : 'All'
      const sessionStatusLabel = appliedFilters.sessionStatus ? (SESSION_STATUS_LABELS[appliedFilters.sessionStatus] || appliedFilters.sessionStatus) : 'All'
      const moduleLabel = EXPLORER_MODULE_IDS.find((m) => m.id === openExplorer)
      const moduleLabelText = moduleLabel ? t(moduleLabel.labelKey) : openExplorer
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      const filterLine1 = `Date: ${dateRange}   ·   Department: ${deptLabel}   ·   Zone: ${zoneLabelVal}   ·   Worker: ${workerLabel}`
      const filterLine2 = `Equipment: ${equipmentLabel}   ·   Task status: ${taskStatusLabel}   ·   Fault severity: ${faultSevLabel}   ·   Inventory: ${invCatLabel}   ·   Session status: ${sessionStatusLabel}`
      const filterLine3 = `Current view: ${moduleLabelText}`
      const lineH = 5
      const split1 = pdf.splitTextToSize(filterLine1, w)
      split1.forEach((line) => { pdf.text(line, margin, y); y += lineH })
      const split2 = pdf.splitTextToSize(filterLine2, w)
      split2.forEach((line) => { pdf.text(line, margin, y); y += lineH })
      pdf.text(filterLine3, margin, y); y += lineH
      y += 4
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.text('KPI', margin, y)
      y += 5
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      const lineHk = 6
      y = writeSegments([
        { text: 'Total production:  ', color: null },
        { text: displayedProductionTotal, color: CLR.green },
        { text: `  ${displayedProductionUnit || 'units'}    ·    `, color: null },
        { text: 'Open faults:  ', color: null },
        { text: miniMetrics.openFaults, color: miniMetrics.openFaults > 0 ? CLR.red : CLR.gray },
        { text: '    ·    ', color: null },
        { text: 'Delayed tasks:  ', color: null },
        { text: miniMetrics.delayedTasks, color: miniMetrics.delayedTasks > 0 ? CLR.red : CLR.gray },
      ], y, lineHk)
      y = writeSegments([
        { text: 'Critical inventory:  ', color: null },
        { text: miniMetrics.criticalInventory, color: miniMetrics.criticalInventory > 0 ? CLR.red : CLR.gray },
        { text: '    ·    ', color: null },
        { text: 'Active sessions:  ', color: null },
        { text: miniMetrics.activeSessions, color: CLR.green },
        { text: '    ·    ', color: null },
        { text: 'Overdue maintenance:  ', color: null },
        { text: currentOverdueMaintenance, color: currentOverdueMaintenance > 0 ? CLR.red : CLR.gray },
      ], y, lineHk)
      if (trendComparison != null) {
        pdf.setFontSize(8)
        const tc = trendComparison
        y = writeSegments([
          { text: '(Production ', color: null },
          { text: `${tc.productionChange >= 0 ? '+' : ''}${tc.productionChange}%`, color: tc.productionChange >= 0 ? CLR.green : CLR.red },
          { text: '   Faults ', color: null },
          { text: `${tc.faultsChange >= 0 ? '+' : ''}${tc.faultsChange}%`, color: tc.faultsChange > 0 ? CLR.red : tc.faultsChange < 0 ? CLR.green : CLR.gray },
          { text: '   Delayed ', color: null },
          { text: `${tc.delayedChange >= 0 ? '+' : ''}${tc.delayedChange}%`, color: tc.delayedChange > 0 ? CLR.red : tc.delayedChange < 0 ? CLR.green : CLR.gray },
          { text: '   Maintenance ', color: null },
          { text: `${tc.maintenanceChange >= 0 ? '+' : ''}${tc.maintenanceChange}%`, color: tc.maintenanceChange > 0 ? CLR.red : tc.maintenanceChange < 0 ? CLR.green : CLR.gray },
          { text: ' vs previous period)', color: null },
        ], y, 4)
        pdf.setFontSize(9)
      }
      y += 3
      pdf.setDrawColor(220, 220, 220)
      pdf.line(margin, y, margin + w, y)
      y += 4
      const headerH = y
      const imgH = Math.min(h, pdfH - headerH - 4)
      const imgW = (canvas.width * imgH) / canvas.height
      const imgX = margin + (w - imgW) / 2
      pdf.addImage(imgData, 'PNG', imgX, headerH, imgW, imgH)
      let statsY = headerH + imgH + 6
      if (statsY > pdfH - 15) {
        pdf.addPage(pdf.internal.pageSize.getWidth() > pdf.internal.pageSize.getHeight() ? 'l' : 'p', 'a4')
        statsY = margin
      }
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.text('Statistics (chart data)', margin, statsY)
      statsY += 5
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      const lineH2 = 4.5
      const op = overviewData?.operationalStatus
      if (op) {
        const p0 = op.tasks?.[0] ?? 0
        const p1 = op.tasks?.[1] ?? 0
        const p2 = op.tasks?.[2] ?? 0
        statsY = writeSegments([
          { text: 'Tasks — Pending:  ', color: null },
          { text: p0, color: CLR.gray },
          { text: '   In progress:  ', color: null },
          { text: p1, color: CLR.gray },
          { text: '   Completed:  ', color: null },
          { text: p2, color: CLR.green },
        ], statsY, lineH2)
        const s1 = op.sessions?.[1] ?? 0
        const s3 = op.sessions?.[3] ?? 0
        statsY = writeSegments([
          { text: 'Sessions — Active:  ', color: null },
          { text: s1, color: CLR.green },
          { text: '   Delayed:  ', color: null },
          { text: s3, color: s3 > 0 ? CLR.red : CLR.gray },
        ], statsY, lineH2)
        const faults = op.faults?.[1] ?? 0
        statsY = writeSegments([
          { text: 'Open faults:  ', color: null },
          { text: faults, color: faults > 0 ? CLR.red : CLR.gray },
        ], statsY, lineH2)
      }
      statsY = writeSegments([
        { text: 'Filtered tasks:  ', color: null },
        { text: filteredTasks.length, color: CLR.gray },
        { text: '   ·   Filtered sessions:  ', color: null },
        { text: filteredSessions.length, color: CLR.gray },
        { text: '   ·   Filtered records:  ', color: null },
        { text: filteredRecords.length, color: CLR.gray },
      ], statsY, lineH2)
      if (overviewData?.zoneDistribution?.labels?.length) {
        statsY += 2
        overviewData.zoneDistribution.labels.slice(0, 8).forEach((label, i) => {
          const t = overviewData.zoneDistribution.tasks?.[i] ?? 0
          const s = overviewData.zoneDistribution.sessions?.[i] ?? 0
          const f = overviewData.zoneDistribution.faults?.[i] ?? 0
          statsY = writeSegments([
            { text: `${label}: tasks  `, color: null },
            { text: t, color: CLR.gray },
            { text: '   sessions  ', color: null },
            { text: s, color: CLR.gray },
            { text: '   faults  ', color: null },
            { text: f, color: f > 0 ? CLR.red : CLR.gray },
          ], statsY, lineH2)
        })
      }
      if (overviewData?.inventoryHealth) {
        const ih = overviewData.inventoryHealth
        statsY = writeSegments([
          { text: 'Inventory — Normal:  ', color: null },
          { text: ih.normal, color: CLR.green },
          { text: '   Low:  ', color: null },
          { text: ih.low, color: CLR.gray },
          { text: '   Critical:  ', color: null },
          { text: ih.critical, color: ih.critical > 0 ? CLR.red : CLR.gray },
        ], statsY, lineH2)
      }
      if (overviewData?.equipmentLoad) {
        const el = overviewData.equipmentLoad
        statsY = writeSegments([
          { text: 'Equipment — Open faults:  ', color: null },
          { text: el.openFaults, color: el.openFaults > 0 ? CLR.red : CLR.gray },
          { text: '   Scheduled:  ', color: null },
          { text: el.scheduledMaintenance, color: CLR.gray },
          { text: '   Overdue:  ', color: null },
          { text: el.overdueMaintenance, color: el.overdueMaintenance > 0 ? CLR.red : CLR.gray },
          { text: '   Active:  ', color: null },
          { text: `${Math.round(el.activeEquipmentPct || 0)}%`, color: CLR.green },
        ], statsY, lineH2)
      }
      if (openExplorer === 'operations') {
        const pending = filteredTasks.filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.PENDING_APPROVAL).length
        const inProg = filteredTasks.filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.IN_PROGRESS).length
        const done = filteredTasks.filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.COMPLETED).length
        statsY = writeSegments([
          { text: 'Tasks by status — Pending:  ', color: null },
          { text: pending, color: CLR.gray },
          { text: '   In progress:  ', color: null },
          { text: inProg, color: CLR.gray },
          { text: '   Completed:  ', color: null },
          { text: done, color: CLR.green },
        ], statsY, lineH2)
      }
      if (openExplorer === 'sessions') {
        const onTime = filteredSessions.filter((s) => s.status === SESSION_STATUS.ON_TIME).length
        const delayed = filteredSessions.filter((s) => s.status === SESSION_STATUS.DELAYED).length
        const flagged = filteredSessions.filter((s) => s.status === SESSION_STATUS.FLAGGED).length
        statsY = writeSegments([
          { text: 'Sessions — On time:  ', color: null },
          { text: onTime, color: CLR.green },
          { text: '   Delayed:  ', color: null },
          { text: delayed, color: delayed > 0 ? CLR.red : CLR.gray },
          { text: '   Flagged:  ', color: null },
          { text: flagged, color: flagged > 0 ? CLR.red : CLR.gray },
        ], statsY, lineH2)
      }
      if (openExplorer === 'production' && overviewData?.productionTrend) {
        const pt = overviewData.productionTrend
        const totalProd = (pt.values || []).reduce((s, v) => s + Number(v), 0)
        const daysCount = (pt.dates || []).length
        statsY = writeSegments([
          { text: 'Production — Total:  ', color: null },
          { text: totalProd, color: CLR.green },
          { text: ' units   Days with data:  ', color: null },
          { text: daysCount, color: CLR.gray },
        ], statsY, lineH2)
      }
      if (overviewData?.riskMetrics?.values?.length) {
        const rv = overviewData.riskMetrics.values
        statsY = writeSegments([
          { text: 'Risk — Delayed %:  ', color: null },
          { text: `${Math.round(rv[0])}%`, color: rv[0] > 25 ? CLR.red : rv[0] > 0 ? CLR.gray : CLR.green },
          { text: '   Critical faults %:  ', color: null },
          { text: `${Math.round(rv[1])}%`, color: rv[1] > 25 ? CLR.red : CLR.gray },
          { text: '   Critical inv %:  ', color: null },
          { text: `${Math.round(rv[2])}%`, color: rv[2] > 25 ? CLR.red : CLR.gray },
        ], statsY, lineH2)
        statsY = writeSegments([
          { text: 'Worker delay %:  ', color: null },
          { text: `${Math.round(rv[3])}%`, color: rv[3] > 25 ? CLR.red : CLR.gray },
          { text: '   Overdue maint %:  ', color: null },
          { text: `${Math.round(rv[4])}%`, color: rv[4] > 25 ? CLR.red : CLR.gray },
        ], statsY, lineH2)
      }
      pdf.save(`General-Report-${new Date().toISOString().slice(0, 10)}.pdf`)
    }).catch(() => {})
  }

  function exportExcel() {
    const headers = ['Type', 'Date', 'Worker', 'Zone', 'Details', 'Quantity/Outcome']
    const rows = filteredRecords.map((r) => [
      r.recordType || '',
      r.dateTime || r.createdAt || '',
      r.worker || '',
      r.zone || '',
      r.notes || r.task || '',
      r.quantity ?? r.qualityOutcome ?? '',
    ])
    const csv = [headers.join(','), ...rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `SARMS-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div ref={pageCaptureRef} className={`${shell.page} ${styles.pageExtend}`}>
      <header className={shell.pageHeader}>
        <div className={shell.pageHeaderTitleBlock}>
          <h1 className={shell.pageTitle}>{t('pageTitleReports')}</h1>
          <p className={shell.pageSubtitle}>{t('pageSubtitleReports')}</p>
        </div>
        <div className={shell.pageHeaderHealth}>
          <SystemHealthScore overviewData={overviewData} />
        </div>
      </header>

      {/* Summary Filter – collapsible, default collapsed, above cards */}
      <section className={styles.summaryFilterSection}>
        <button
          type="button"
          className={styles.summaryFilterHeader}
          onClick={() => setSummaryFilterOpen((o) => !o)}
          aria-expanded={summaryFilterOpen}
        >
          <span className={styles.summaryFilterTitle}><i className="fas fa-filter fa-fw" /> {t('summaryFilter')}</span>
          <span className={styles.summaryFilterCaret} aria-hidden>{summaryFilterOpen ? '▼' : '▶'}</span>
        </button>
        {summaryFilterOpen && (
          <div className={styles.summaryFilterBody}>
            <div className={styles.datePresets}>
              <span className={styles.datePresetsLabel}>{t('quickRange')}</span>
              {['7', '30', 'month', '90'].map((p) => (
                <button key={p} type="button" className={`${styles.presetBtn} ${activeDatePreset === p ? styles.presetBtnActive : ''}`} onClick={() => setDatePreset(p)} aria-pressed={activeDatePreset === p}>
                  {p === '7' && t('periodLast7Days')}
                  {p === '30' && t('periodLast30Days')}
                  {p === 'month' && t('periodThisMonth')}
                  {p === '90' && t('last3Months')}
                </button>
              ))}
            </div>
            <div className={styles.filtersGrid}>
              <div className={styles.filterGroup}>
                <label>{t('dateFrom')}</label>
                <input type="date" value={filters.dateFrom} onChange={(e) => { setFilters((f) => ({ ...f, dateFrom: e.target.value })); setActiveDatePreset(null); }} className={styles.input} />
              </div>
              <div className={styles.filterGroup}>
                <label>{t('dateTo')}</label>
                <input type="date" value={filters.dateTo} onChange={(e) => { setFilters((f) => ({ ...f, dateTo: e.target.value })); setActiveDatePreset(null); }} className={styles.input} />
              </div>
              <div className={styles.filterGroup}>
                <label>{t('department')}</label>
                <select value={filters.dept} onChange={(e) => setFilters((f) => ({ ...f, dept: e.target.value }))} className={styles.select}>
                  <option value="">{t('allDepartments')}</option>
                  {DEPARTMENT_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>{t('zone')}</label>
                <select value={filters.zone} onChange={(e) => setFilters((f) => ({ ...f, zone: e.target.value }))} className={styles.select}>
                  <option value="">{t('allZones')}</option>
                  {zonesList.map((z) => (
                    <option key={z.id} value={z.id}>{z.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>{t('worker')}</label>
                <select value={filters.worker} onChange={(e) => setFilters((f) => ({ ...f, worker: e.target.value }))} className={styles.select}>
                  <option value="">{t('allWorkers')}</option>
                  {WORKER_OPTIONS.map((w) => (
                    <option key={w.id} value={w.id}>{w.fullName}</option>
                  ))}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>{t('equipment')}</label>
                <select value={filters.equipment} onChange={(e) => setFilters((f) => ({ ...f, equipment: e.target.value }))} className={styles.select}>
                  <option value="">{t('allEquipment')}</option>
                  {EQUIPMENT_OPTIONS.map((e) => (
                    <option key={e.id} value={e.id}>{e.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>{t('taskStatus')}</label>
                <select value={filters.taskStatus} onChange={(e) => setFilters((f) => ({ ...f, taskStatus: e.target.value }))} className={styles.select}>
                  <option value="">{t('allStatuses')}</option>
                  {Object.entries(TASK_STATUS_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>{t('faultSeverity')}</label>
                <select value={filters.faultSeverity} onChange={(e) => setFilters((f) => ({ ...f, faultSeverity: e.target.value }))} className={styles.select}>
                  <option value="">{t('allSeverities')}</option>
                  {SEVERITY_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>{t('inventoryCategory')}</label>
                <select value={filters.invCategory} onChange={(e) => setFilters((f) => ({ ...f, invCategory: e.target.value }))} className={styles.select}>
                  <option value="">{t('allCategories')}</option>
                  {INVENTORY_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>{t('sessionStatus')}</label>
                <select value={filters.sessionStatus} onChange={(e) => setFilters((f) => ({ ...f, sessionStatus: e.target.value }))} className={styles.select}>
                  <option value="">All statuses</option>
                  <option value={SESSION_STATUS.ON_TIME}>On time</option>
                  <option value={SESSION_STATUS.DELAYED}>Delayed</option>
                  <option value={SESSION_STATUS.FLAGGED}>Flagged</option>
                </select>
              </div>
            </div>
            <div className={styles.filterActions}>
              <button type="button" className={styles.applyBtn} onClick={applyFilters}>Apply filters</button>
              <button type="button" className={styles.clearBtn} onClick={clearFilters}>Clear filters</button>
            </div>
            {activeFilterLabels.length > 0 && (
              <div className={styles.filterStateIndicator}>
                <span className={styles.filterStateLabel}>Active filters:</span>
                {activeFilterLabels.map((l) => (
                  <span key={l} className={styles.filterStateChip}>{l}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* KPI cards below Summary Filter – same spec as Equipment / Monitor */}
      <section className={shell.statGrid}>
        <div className={`${styles.summaryKpiCard} ${styles.summaryKpiCardProduction}`}>
          <span className={styles.metricLabel}>{t('totalProduction')}</span>
          <div className={styles.summaryKpiCardBody}>
            <div className={styles.productionValueRow} ref={productionUnitDropdownRef}>
              <span className={styles.metricValue}>{displayedProductionTotal}</span>
              <div className={styles.productionUnitWrap}>
                <button
                  type="button"
                  className={styles.productionUnitBtn}
                  onClick={(e) => { e.stopPropagation(); setProductionUnitDropdownOpen((o) => !o) }}
                  title="Change unit"
                  aria-expanded={productionUnitDropdownOpen}
                  aria-haspopup="listbox"
                >
                  {displayedProductionUnit}
                  <i className={`fas fa-fw ${productionUnitDropdownOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`} />
                </button>
                {productionUnitDropdownOpen && productionUnitOptions.length > 0 && (
                  <ul className={styles.productionUnitDropdown} role="listbox">
                    {productionUnitOptions.map((u) => (
                      <li key={u}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={u === displayedProductionUnit}
                          className={u === displayedProductionUnit ? `${styles.productionUnitOption} ${styles.productionUnitOptionActive}` : styles.productionUnitOption}
                          onClick={(e) => { e.stopPropagation(); setSelectedProductionUnit(u); setProductionUnitDropdownOpen(false) }}
                        >
                          {u} ({productionByUnitAndDominant.byUnit[u] ?? 0})
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {trendComparison != null && (
              <span className={`${styles.trendIndicator} ${trendComparison.productionChange > 0 ? styles.trendUp : trendComparison.productionChange < 0 ? styles.trendDown : styles.trendFlat}`}>
                {trendComparison.productionChange > 0 ? '↑' : trendComparison.productionChange < 0 ? '↓' : '—'} {trendComparison.productionChange > 0 ? '+' : ''}{trendComparison.productionChange}%
              </span>
            )}
          </div>
        </div>
        <div className={styles.summaryKpiCard}>
          <span className={styles.metricLabel}>{t('openFaults')}</span>
          <div className={styles.summaryKpiCardBody}>
            <span className={styles.metricValue}>{miniMetrics.openFaults}</span>
            {trendComparison != null && (
              <span className={`${styles.trendIndicator} ${trendComparison.faultsChange > 0 ? styles.trendDown : trendComparison.faultsChange < 0 ? styles.trendUp : styles.trendFlat}`}>
                {trendComparison.faultsChange > 0 ? '↑' : trendComparison.faultsChange < 0 ? '↓' : '—'} {trendComparison.faultsChange > 0 ? '+' : ''}{trendComparison.faultsChange}%
              </span>
            )}
          </div>
        </div>
        <div className={styles.summaryKpiCard}>
          <span className={styles.metricLabel}>{t('delayedTasks')}</span>
          <div className={styles.summaryKpiCardBody}>
            <span className={styles.metricValue}>{miniMetrics.delayedTasks}</span>
            {trendComparison != null && (
              <span className={`${styles.trendIndicator} ${trendComparison.delayedChange > 0 ? styles.trendDown : trendComparison.delayedChange < 0 ? styles.trendUp : styles.trendFlat}`}>
                {trendComparison.delayedChange > 0 ? '↑' : trendComparison.delayedChange < 0 ? '↓' : '—'} {trendComparison.delayedChange > 0 ? '+' : ''}{trendComparison.delayedChange}%
              </span>
            )}
          </div>
        </div>
        <div className={styles.summaryKpiCard}>
          <span className={styles.metricLabel}>{t('criticalInventory')}</span>
          <div className={styles.summaryKpiCardBody}>
            <span className={styles.metricValue}>{miniMetrics.criticalInventory}</span>
          </div>
        </div>
        <div className={styles.summaryKpiCard}>
          <span className={styles.metricLabel}>{t('activeSessions')}</span>
          <div className={styles.summaryKpiCardBody}>
            <span className={styles.metricValue}>{miniMetrics.activeSessions}</span>
          </div>
        </div>
        <div className={styles.summaryKpiCard}>
          <span className={styles.metricLabel}>{t('overdueMaintenance')}</span>
          <div className={styles.summaryKpiCardBody}>
            <span className={styles.metricValue}>{currentOverdueMaintenance}</span>
            {trendComparison != null && (
              <span className={`${styles.trendIndicator} ${trendComparison.maintenanceChange > 0 ? styles.trendDown : trendComparison.maintenanceChange < 0 ? styles.trendUp : styles.trendFlat}`}>
                {trendComparison.maintenanceChange > 0 ? '↑' : trendComparison.maintenanceChange < 0 ? '↓' : '—'} {trendComparison.maintenanceChange > 0 ? '+' : ''}{trendComparison.maintenanceChange}%
              </span>
            )}
          </div>
        </div>
      </section>

      <DrillDownModal
        open={drillDownOpen}
        onClose={() => { setDrillDownOpen(false); setDrillDownPayload(null) }}
        payload={drillDownPayload}
        filteredTasks={filteredTasks}
        filteredSessions={filteredSessions}
        filteredFaults={filteredFaults}
        filteredRecords={filteredRecords}
        inventoryWithStatus={inventoryWithStatus}
        filteredMaintenance={filteredMaintenance}
        ZONE_LABEL={ZONE_LABEL}
      />

      <section className={`${shell.surfaceCard} ${styles.explorerSection}`}>
        <div className={styles.explorerSectionHeader}>
          <h2 className={`${shell.sectionHeading} ${styles.sectionTitleMerge}`}>{t('analyticsCharts')}</h2>
          <div className={styles.chartsViewTabs}>
            <button
              type="button"
              className={chartsView === 'internal' ? styles.chartsViewTabActive : styles.chartsViewTab}
              onClick={() => setChartsView('internal')}
            >
              {t('internalCharts')}
            </button>
            <button
              type="button"
              className={chartsView === 'powerbi' ? styles.chartsViewTabActive : styles.chartsViewTab}
              onClick={() => setChartsView('powerbi')}
            >
              {t('powerBiReports')}
            </button>
          </div>
        </div>

        {/* Content: Internal charts or Power BI */}
        {chartsView === 'powerbi' && (
          <div className={styles.powerBiBlock}>
            <div className={styles.powerBiControls}>
              <button type="button" className={styles.powerBiControlBtn} onClick={() => setPowerBiFullscreen((f) => !f)}>
                {powerBiFullscreen ? t('exitFullscreen') : t('fullscreen')}
              </button>
            </div>
            <div className={powerBiFullscreen ? styles.powerBiFrameFullscreen : styles.powerBiFrameWrap}>
              {powerBiFullscreen && (
                <div className={styles.powerBiFullscreenBar}>
                  <button type="button" className={styles.powerBiControlBtn} onClick={() => setPowerBiFullscreen(false)}>
                    {t('exitFullscreen')}
                  </button>
                </div>
              )}
              {getPowerBiEmbedUrl() ? (
                <iframe title="Power BI Analytics" src={getPowerBiEmbedUrl()} className={styles.powerBiIframe} allowFullScreen />
              ) : (
                <div className={styles.powerBiPlaceholder}>
                  <p>{t('powerBiNotConfigured')}</p>
                  <p className={styles.powerBiHint}>{t('powerBiHintConfig')} <code>src/config/powerBi.js</code></p>
                  <p className={styles.powerBiHint}>{t('powerBiHintSteps')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content: Executive overview (default) or selected module – Internal Charts only */}
        {chartsView === 'internal' && (
          <div ref={reportsContentRef}>
            {openExplorer === 'executive' && (
              <>
                <ExecutiveOverview data={overviewData} t={t} onDrillDown={handleDrillDown} zoneIds={zonesList.map((z) => z.id)} />
                <div className={styles.autoInsightBox} data-type={autoInsight?.type ?? 'stable'}>
                  <span className={styles.autoInsightIcon}>
                    {autoInsight?.type === 'warning' && <i className="fas fa-exclamation-triangle" />}
                    {autoInsight?.type === 'risk' && <i className="fas fa-times-circle" />}
                    {(autoInsight?.type === 'stable' || !autoInsight?.type) && <i className="fas fa-check-circle" />}
                  </span>
                  <span className={styles.autoInsightText}>
                    {autoInsight?.messageKey
                      ? (autoInsight.messageParams
                          ? formatMessage(t(autoInsight.messageKey), autoInsight.messageParams)
                          : t(autoInsight.messageKey))
                      : t('calculating')}
                  </span>
                </div>
              </>
            )}
            {openExplorer === 'operations' && (
          <div className={styles.explorerBlock}>
            <div className={`${styles.explorerCharts} ${styles.explorerChartsOperations}`}>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>{t('tasksByStatus')}</h4>
                <div className={styles.chartContainer}>
                  <Bar
                    data={{
                      labels: [TASK_STATUS_LABELS[TASK_STATUS.PENDING_APPROVAL], TASK_STATUS_LABELS[TASK_STATUS.IN_PROGRESS], TASK_STATUS_LABELS[TASK_STATUS.COMPLETED]],
                      datasets: [{
                        label: t('tasks'),
                        data: [
                          filteredTasks.filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.PENDING_APPROVAL).length,
                          filteredTasks.filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.IN_PROGRESS).length,
                          filteredTasks.filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.COMPLETED).length,
                        ],
                        backgroundColor: [COLOR.NEUTRAL, COLOR.SOFT_BLUE, COLOR.GREEN],
                      }],
                    }}
                    options={barIntegerYOptions}
                  />
                </div>
              </div>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>{t('tasksByZone')}</h4>
                <div className={styles.chartContainer}>
                  <Doughnut
                    data={(() => {
                      const zoneCounts = zonesList.map((z) => ({
                        label: ZONE_LABEL[z.id] || z.id,
                        count: filteredTasks.filter((t) => normalizeTaskStatus(t.status) !== TASK_STATUS.REJECTED && (t.zoneId || '') === z.id).length,
                      }))
                      const sorted = [...zoneCounts].sort((a, b) => b.count - a.count)
                      const loadColors = [COLOR.GREEN, COLOR.LIGHT_GREEN, COLOR.SOFT_BLUE, COLOR.YELLOW, COLOR.NEUTRAL]
                      return {
                        labels: sorted.map((x) => x.label),
                        datasets: [{
                          data: sorted.map((x) => x.count),
                          backgroundColor: sorted.map((_, i) => loadColors[Math.min(i, loadColors.length - 1)]),
                          borderWidth: 2,
                          borderColor: '#fff',
                        }],
                      }
                    })()}
                    options={doughnutOptions}
                  />
                </div>
              </div>
            </div>
          </div>
            )}
            {openExplorer === 'production' && (
          <div className={styles.explorerBlock}>
            <div className={`${styles.explorerCharts} ${styles.explorerChartsProduction}`}>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>{t('productionThisPeriodVsPrevious')}</h4>
                <div className={styles.chartContainer}>
                  <Bar
                    data={{
                      labels: productionComparisonByZone.labels,
                      datasets: [
                        {
                          label: 'This period (last 7 days)',
                          data: productionComparisonByZone.thisWeek,
                          backgroundColor: COLOR.GREEN,
                          hoverBackgroundColor: HOVER.GREEN,
                        },
                        {
                          label: 'Previous period (7 days before)',
                          data: productionComparisonByZone.lastWeek,
                          backgroundColor: COLOR.NEUTRAL,
                          hoverBackgroundColor: HOVER.NEUTRAL,
                        },
                      ],
                    }}
                    options={groupedBarOptionsZone}
                  />
                </div>
              </div>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>{t('productionByZone')}</h4>
                <div className={styles.chartContainer}>
                  <Doughnut
                    data={(() => {
                      const prodRecords = filteredRecords.filter((r) => r.recordType === 'production')
                      const zoneTotals = productionZonesForCharts.map((z) => {
                        const id = (z.id || '').toString().toLowerCase()
                        const label = (z.label || ZONE_LABEL[z.id] || z.id).toString()
                        const total = prodRecords.reduce((s, r) => {
                          const rZone = (r.zoneId || r.zone || '').toString().trim()
                          const rNorm = rZone.toLowerCase()
                          const match = rNorm === id || rZone === label || (ZONE_LABEL[z.id] && rZone === ZONE_LABEL[z.id])
                          return match ? s + (Number(r.quantity) || 0) : s
                        }, 0)
                        return { label, total }
                      })
                      const zoneColors = [COLOR.GREEN, '#7fa77f', COLOR.LIGHT_GREEN, COLOR.SOFT_BLUE]
                      const zoneHoverColors = [HOVER.GREEN, HOVER.OLIVE_SOFT, HOVER.LIGHT_GREEN, HOVER.SOFT_BLUE]
                      return {
                        labels: zoneTotals.map((x) => x.label),
                        datasets: [{
                          data: zoneTotals.map((x) => (x.total > 0 ? x.total : 1)),
                          backgroundColor: zoneTotals.map((_, i) => zoneColors[Math.min(i, zoneColors.length - 1)]),
                          hoverBackgroundColor: zoneTotals.map((_, i) => zoneHoverColors[Math.min(i, zoneHoverColors.length - 1)]),
                          borderWidth: 2,
                          borderColor: '#fff',
                        }],
                      }
                    })()}
                    options={doughnutOptions}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
            {openExplorer === 'workers' && (
          <div className={styles.explorerBlock}>
            <div className={`${styles.explorerCharts} ${styles.explorerChartsWorkers}`}>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>{t('tasksPerWorker')}</h4>
                <div className={styles.chartContainer}>
                  <Bar
                    data={(() => {
                      const byWorker = {}
                      filteredTasks.filter((t) => normalizeTaskStatus(t.status) !== TASK_STATUS.REJECTED).forEach((t) => {
                        const ids = Array.isArray(t.workerIds) ? t.workerIds : []
                        ids.forEach((wid) => {
                          if (!wid) return
                          if (!byWorker[wid]) byWorker[wid] = 0
                          byWorker[wid] += 1
                        })
                      })
                      const sorted = Object.entries(byWorker)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 8)
                      if (sorted.length === 0) {
                        return {
                          labels: [t('noTaskAssignments')],
                          datasets: [{ label: 'Tasks', data: [0], backgroundColor: COLOR.NEUTRAL, hoverBackgroundColor: HOVER.NEUTRAL }],
                        }
                      }
                      return {
                        labels: sorted.map(([wid]) => WORKER_OPTIONS.find((w) => w.id === wid)?.fullName || wid),
                        datasets: [{
                          label: 'Tasks',
                          data: sorted.map(([, c]) => c),
                          backgroundColor: COLOR.GREEN,
                          hoverBackgroundColor: HOVER.GREEN,
                        }],
                      }
                    })()}
                    options={horizontalBarIntegerOptions}
                  />
                </div>
              </div>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>{t('sessionStatus')}</h4>
                <div className={styles.chartContainer}>
                  <Doughnut
                    data={{
                      labels: [t('onTime'), t('delayed'), t('flagged')],
                      datasets: [{
                        data: [
                          filteredSessions.filter((s) => s.status === SESSION_STATUS.ON_TIME).length,
                          filteredSessions.filter((s) => s.status === SESSION_STATUS.DELAYED).length,
                          filteredSessions.filter((s) => s.status === SESSION_STATUS.FLAGGED).length,
                        ],
                        backgroundColor: [COLOR.GREEN, COLOR.YELLOW, COLOR.RED],
                        hoverBackgroundColor: [HOVER.GREEN, HOVER.ORANGE, HOVER.RED],
                        borderWidth: 2,
                        borderColor: '#fff',
                      }],
                    }}
                    options={doughnutOptions}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
            {openExplorer === 'equipment' && (
          <div className={styles.explorerBlock}>
            <div className={`${styles.explorerCharts} ${styles.explorerChartsEquipment}`}>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>{t('faultsByCategory')}</h4>
                <div className={styles.chartContainer}>
                  <Doughnut
                    data={(() => {
                      const categoryCounts = FAULT_CATEGORIES.map((c) => ({
                        label: c.label,
                        count: filteredFaults.filter((f) => f.category === c.id).length,
                      })).filter((x) => x.count > 0)
                      const sorted = [...categoryCounts].sort((a, b) => b.count - a.count)
                      const faultSegmentColors = [COLOR.GREEN, COLOR.SOFT_BLUE, COLOR.YELLOW, COLOR.LIGHT_GREEN, COLOR.NEUTRAL]
                      const faultSegmentHover = [HOVER.GREEN, HOVER.SOFT_BLUE, HOVER.ORANGE, HOVER.LIGHT_GREEN, HOVER.NEUTRAL]
                      if (sorted.length === 0) {
                        return {
                          labels: ['No faults'],
                          datasets: [{ data: [1], backgroundColor: [COLOR.NEUTRAL], hoverBackgroundColor: [HOVER.NEUTRAL], borderWidth: 2, borderColor: '#fff' }],
                        }
                      }
                      return {
                        labels: sorted.map((x) => x.label),
                        datasets: [{
                          data: sorted.map((x) => x.count),
                          backgroundColor: sorted.map((_, i) => faultSegmentColors[Math.min(i, faultSegmentColors.length - 1)]),
                          hoverBackgroundColor: sorted.map((_, i) => faultSegmentHover[Math.min(i, faultSegmentHover.length - 1)]),
                          borderWidth: 2,
                          borderColor: '#fff',
                        }],
                      }
                    })()}
                    options={doughnutOptions}
                  />
                </div>
              </div>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>{t('mostFailingEquipment')}</h4>
                <div className={styles.chartContainer}>
                  <Radar
                    data={(() => {
                      if (!filteredFaults.length) {
                        return {
                          labels: ['No data'],
                          datasets: [{ label: 'Fault count', data: [0], backgroundColor: COLOR.NEUTRAL + '33', borderColor: COLOR.NEUTRAL, borderWidth: 2, pointBackgroundColor: COLOR.NEUTRAL, pointHoverBackgroundColor: HOVER.NEUTRAL, faultDates: [] }],
                        }
                      }
                      const byEquipment = {}
                      filteredFaults.forEach((f) => {
                        const eid = f.equipmentId || 'unknown'
                        if (!byEquipment[eid]) {
                          byEquipment[eid] = { name: f.equipmentName || eid, count: 0, dates: [] }
                        }
                        byEquipment[eid].count += 1
                        const iso = f.createdAt || f.reportedAt || f.date
                        if (iso) byEquipment[eid].dates.push(iso)
                      })
                      const sorted = Object.entries(byEquipment)
                        .map(([eid, o]) => ({ equipmentId: eid, name: o.name, count: o.count, dates: o.dates.sort() }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 8)
                      return {
                        labels: sorted.map((x) => x.name),
                        datasets: [{
                          label: 'Fault count',
                          data: sorted.map((x) => x.count),
                          faultDates: sorted.map((x) => x.dates),
                          backgroundColor: COLOR.GREEN + '44',
                          borderColor: COLOR.GREEN,
                          borderWidth: 2,
                          pointBackgroundColor: COLOR.GREEN,
                          pointBorderColor: '#fff',
                          pointHoverBackgroundColor: HOVER.GREEN,
                        }],
                      }
                    })()}
                    options={{
                      ...radarOptions,
                      scales: {
                        r: {
                          beginAtZero: true,
                          suggestedMax: 12,
                          grid: { color: CHART_GRID },
                          ticks: { stepSize: 1, font: { size: 9 } },
                          pointLabels: { font: { size: 10 } },
                        },
                      },
                      plugins: {
                        ...radarOptions.plugins,
                        tooltip: {
                          callbacks: {
                            label: (ctx) => `${ctx.label}: ${ctx.raw} fault${ctx.raw !== 1 ? 's' : ''}`,
                            afterBody: (items) => {
                              const ctx = items[0]
                              const ds = ctx.dataset
                              const dates = ds.faultDates?.[ctx.dataIndex]
                              if (!dates || !dates.length) return ''
                              const formatted = dates
                                .slice()
                                .sort()
                                .map((d) => new Date(d).toLocaleDateString(undefined, { dateStyle: 'short' }))
                              return ['', 'Dates:'].concat(formatted)
                            },
                          },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
            {openExplorer === 'inventory' && (
          <div className={styles.explorerBlock}>
            <div className={`${styles.explorerCharts} ${styles.explorerChartsInventory}`}>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>{t('itemsByCategory')}</h4>
                <div className={styles.chartContainer}>
                  <Pie
                    data={(() => {
                      const categoryCounts = INVENTORY_CATEGORIES.map((c) => ({
                        label: c.label,
                        count: inventoryWithStatus.filter((i) => i.category === c.id).length,
                      }))
                      const categoryColors = [COLOR.GREEN, COLOR.SOFT_BLUE, COLOR.LIGHT_GREEN, COLOR.NEUTRAL, COLOR.YELLOW]
                      const categoryHover = [HOVER.GREEN, HOVER.SOFT_BLUE, HOVER.LIGHT_GREEN, HOVER.NEUTRAL, HOVER.ORANGE]
                      return {
                        labels: categoryCounts.map((x) => x.label),
                        datasets: [{
                          data: categoryCounts.map((x) => x.count),
                          backgroundColor: categoryCounts.map((_, i) => categoryColors[Math.min(i, categoryColors.length - 1)]),
                          hoverBackgroundColor: categoryCounts.map((_, i) => categoryHover[Math.min(i, categoryHover.length - 1)]),
                          borderWidth: 2,
                          borderColor: '#fff',
                        }],
                      }
                    })()}
                    options={doughnutOptions}
                  />
                </div>
              </div>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>{t('criticalAndLowProducts')}</h4>
                <div className={styles.chartContainer}>
                  {(() => {
                    const critical = inventoryWithStatus.filter((i) => i.status === INVENTORY_STATUS.CRITICAL)
                    const low = inventoryWithStatus.filter((i) => i.status === INVENTORY_STATUS.LOW)
                    const line = (item) => `${item.name || item.id} — ${Number(item.quantity)} ${item.unit || ''}`.trim()
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                          <strong style={{ color: COLOR.RED, fontSize: '0.85rem' }}>Critical ({critical.length})</strong>
                          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem', fontSize: '0.8rem', color: '#374151' }}>
                            {critical.length === 0 ? <li>None</li> : critical.map((i) => <li key={i.id}>{line(i)}</li>)}
                          </ul>
                        </div>
                        <div>
                          <strong style={{ color: COLOR.ORANGE, fontSize: '0.85rem' }}>Low ({low.length})</strong>
                          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem', fontSize: '0.8rem', color: '#374151' }}>
                            {low.length === 0 ? <li>None</li> : low.map((i) => <li key={i.id}>{line(i)}</li>)}
                          </ul>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}
            {openExplorer === 'sessions' && (
          <div className={styles.explorerBlock}>
            <div className={`${styles.explorerCharts} ${styles.explorerChartsSessions}`}>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>{t('activeSessionsByZone')}</h4>
                <div className={styles.chartContainer}>
                  <Bar
                    data={{
                      labels: sessionsChartZones.map((z) => z.label || z.id),
                      datasets: [{
                        label: 'Active',
                        data: sessionsChartZones.map((z) => activeSessionsOnly.filter((s) => sessionInZone(s, z)).length),
                        backgroundColor: COLOR.GREEN,
                        hoverBackgroundColor: HOVER.GREEN,
                      }],
                    }}
                    options={horizontalBarIntegerOptions}
                  />
                </div>
              </div>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>{t('sessionsByDepartment')}</h4>
                <div className={styles.chartContainer}>
                  <Doughnut
                    data={{
                      labels: DEPARTMENT_OPTIONS.map((d) => d.label),
                      datasets: [{
                        data: DEPARTMENT_OPTIONS.map((d) => activeSessionsOnly.filter((s) => (s.departmentId || s.department || '').toLowerCase() === d.value.toLowerCase()).length),
                        backgroundColor: [COLOR.GREEN, COLOR.YELLOW, COLOR.SOFT_BLUE],
                        hoverBackgroundColor: [HOVER.GREEN, HOVER.ORANGE, HOVER.SOFT_BLUE],
                        borderWidth: 2,
                        borderColor: '#fff',
                      }],
                    }}
                    options={doughnutOptions}
                  />
                </div>
              </div>
            </div>
          </div>
            )}
          </div>
        )}

        {/* Tabs below content: Executive overview (default), Operations, Production, … + Export PDF – Internal only */}
        {chartsView === 'internal' && (
        <div className={styles.explorerBar}>
          {EXPLORER_MODULE_IDS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={openExplorer === m.id ? `${styles.explorerBtn} ${styles.explorerBtnActive}` : styles.explorerBtn}
              onClick={() => setOpenExplorer(m.id)}
            >
              <i className={`fas ${m.icon} fa-fw`} /> {t(m.labelKey)}
            </button>
          ))}
          <button type="button" className={styles.explorerBtnExport} onClick={exportPDF} title="Export report based on current filters and data">
            <i className="fas fa-file-pdf fa-fw" /> {t('exportPdf')}
          </button>
        </div>
        )}
      </section>

      {summaryModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setSummaryModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Daily summary</h3>
            <pre className={styles.summaryPre}>{summaryText}</pre>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setSummaryModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

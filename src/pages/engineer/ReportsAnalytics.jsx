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
import { Bar, Line, Radar, Doughnut } from 'react-chartjs-2'
import { DEPARTMENT_OPTIONS, SEED_WORKERS } from '../../data/engineerWorkers'
import { TASK_STATUS, TASK_STATUS_LABELS } from '../../data/assignTask'
import { getInitialZones, getTaskById, TASKS_BY_DEPARTMENT, INVENTORY_TASKS } from '../../data/workerFlow'
import { getInventoryStatus, INVENTORY_CATEGORIES, INVENTORY_STATUS } from '../../data/inventory'
import { FAULT_CATEGORIES, SEVERITY_OPTIONS, FAULT_STATUS_OPEN } from '../../data/faults'
import { getSessionStatus, getElapsedMinutes, SESSION_STATUS, SESSION_STATUS_LABELS } from '../../data/monitorActive'
import { useAppStore } from '../../context/AppStoreContext'
import ExecutiveOverview from '../../components/analytics/ExecutiveOverview'
import SystemHealthScore from '../../components/analytics/SystemHealthScore'
import DrillDownModal from '../../components/analytics/DrillDownModal'
import { buildOverviewData, getAutoInsight, percentChange } from '../../utils/analyticsOverview'
import { jsPDF } from 'jspdf'
import styles from './ReportsAnalytics.module.css'

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

const COLOR = { GREEN: '#34d399', YELLOW: '#fde047', RED: '#f87171', NEUTRAL: '#94a3b8', ORANGE: '#fb923c', LIGHT_GREEN: '#6ee7b7' }

function inDateRange(iso, from, to) {
  if (!from && !to) return true
  const d = new Date(iso).toISOString().slice(0, 10)
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

const EXPLORER_MODULES = [
  { id: 'executive', label: 'Executive overview', icon: 'fa-chart-pie' },
  { id: 'operations', label: 'Operations', icon: 'fa-list-check' },
  { id: 'production', label: 'Production', icon: 'fa-chart-line' },
  { id: 'workers', label: 'Workers', icon: 'fa-users' },
  { id: 'equipment', label: 'Equipment', icon: 'fa-wrench' },
  { id: 'inventory', label: 'Inventory', icon: 'fa-boxes-stacked' },
  { id: 'sessions', label: 'Sessions', icon: 'fa-clock' },
]

const REPORTS_VIEW_KEY = 'sarms-reports-charts-view'

export default function ReportsAnalytics() {
  const navigate = useNavigate()
  const location = useLocation()
  const { lang } = useLanguage()
  const namespace = location.pathname.startsWith('/admin') ? 'admin' : 'engineer'
  const t = (key) => getTranslation(lang, namespace, key)
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
  } = useAppStore()
  const zonesList = (storeZones && storeZones.length > 0) ? storeZones : getInitialZones()
  const ZONE_LABEL = useMemo(() => Object.fromEntries(zonesList.map((z) => [z.id, z.label])), [zonesList])
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
  const pageCaptureRef = useRef(null)

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

  const miniMetrics = useMemo(() => {
    const prodRecords = filteredRecords.filter((r) => r.recordType === 'production')
    const totalProduction = prodRecords.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
    const openFaults = filteredFaults.filter((f) => (f.status || FAULT_STATUS_OPEN) === FAULT_STATUS_OPEN).length
    const delayedTasks = filteredSessions.filter((s) => s.status === SESSION_STATUS.DELAYED).length
    const criticalInventory = inventoryWithStatus.filter((i) => i.status === INVENTORY_STATUS.CRITICAL).length
    const activeSessionsCount = filteredSessions.filter((s) => !s.completedAt).length
    return {
      totalProduction,
      openFaults,
      delayedTasks,
      criticalInventory,
      activeSessions: activeSessionsCount,
    }
  }, [filteredRecords, filteredFaults, filteredSessions, inventoryWithStatus])

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
    const prevProd = prevRecordsList.filter((r) => r.recordType === 'production').reduce((s, r) => s + (Number(r.quantity) || 0), 0)
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
  }, [appliedFilters, records, allSessionsWithStatus, filteredMaintenance, faults, ZONE_LABEL])

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

  /** Horizontal bar chart with integer x-axis (for counts). */
  const horizontalBarIntegerOptions = {
    ...chartOptions,
    indexAxis: 'y',
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.06)' },
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
      `Total production: ${miniMetrics.totalProduction} units`,
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
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const margin = 18
    const lineHeight = 6
    const sectionGap = 4
    let y = margin
    const maxY = 277

    const addLine = (text, fontSize = 10, isBold = false) => {
      if (y > maxY) { pdf.addPage(); y = margin }
      pdf.setFontSize(fontSize)
      pdf.setFont('helvetica', isBold ? 'bold' : 'normal')
      pdf.text(text, margin, y)
      y += lineHeight + (fontSize > 10 ? 1 : 0)
    }

    const addSection = (title) => {
      y += sectionGap
      if (y > maxY) { pdf.addPage(); y = margin }
      addLine(title, 12, true)
      y += 2
    }

    // Title & date
    addLine('SARMS General Report', 16, true)
    addLine(`Generated: ${new Date().toLocaleString()}`, 9)
    y += sectionGap

    // Active filters
    addSection('1. Active filters')
    const filterLines = []
    if (appliedFilters.dateFrom || appliedFilters.dateTo) {
      filterLines.push(`Date range: ${appliedFilters.dateFrom || '—'} to ${appliedFilters.dateTo || '—'}`)
    }
    if (appliedFilters.dept) {
      filterLines.push(`Department: ${DEPARTMENT_OPTIONS.find((d) => d.value === appliedFilters.dept)?.label || appliedFilters.dept}`)
    }
    if (appliedFilters.zone) {
      filterLines.push(`Zone: ${ZONE_LABEL[appliedFilters.zone] || appliedFilters.zone}`)
    }
    if (appliedFilters.worker) {
      filterLines.push(`Worker: ${WORKER_OPTIONS.find((w) => w.id === appliedFilters.worker)?.fullName || appliedFilters.worker}`)
    }
    if (appliedFilters.equipment) {
      filterLines.push(`Equipment: ${EQUIPMENT_OPTIONS.find((e) => e.id === appliedFilters.equipment)?.label || appliedFilters.equipment}`)
    }
    if (appliedFilters.taskStatus) {
      filterLines.push(`Task status: ${TASK_STATUS_LABELS[appliedFilters.taskStatus] || appliedFilters.taskStatus}`)
    }
    if (appliedFilters.faultSeverity) {
      filterLines.push(`Fault severity: ${SEVERITY_OPTIONS.find((s) => s.id === appliedFilters.faultSeverity)?.label || appliedFilters.faultSeverity}`)
    }
    if (appliedFilters.invCategory) {
      filterLines.push(`Inventory category: ${INVENTORY_CATEGORIES.find((c) => c.id === appliedFilters.invCategory)?.label || appliedFilters.invCategory}`)
    }
    if (appliedFilters.sessionStatus) {
      filterLines.push(`Session status: ${SESSION_STATUS_LABELS[appliedFilters.sessionStatus] || appliedFilters.sessionStatus}`)
    }
    if (filterLines.length === 0) filterLines.push('None (all data in range)')
    filterLines.forEach((line) => addLine(line))

    // Current view (module)
    addSection('2. Current view')
    const moduleLabel = EXPLORER_MODULES.find((m) => m.id === openExplorer)?.label || openExplorer
    addLine(moduleLabel)

    // Summary (filtered data)
    addSection('3. Summary (filtered data)')
    const op = overviewData?.operationalStatus
    if (op) {
      addLine(`Tasks — Pending: ${op.tasks?.[0] ?? 0}, In progress: ${op.tasks?.[1] ?? 0}, Completed: ${op.tasks?.[2] ?? 0}`)
      addLine(`Sessions — Active: ${op.sessions?.[1] ?? 0}, Delayed: ${op.sessions?.[3] ?? 0}`)
      addLine(`Open faults: ${op.faults?.[1] ?? 0}`)
    }
    addLine(`Total production (units): ${miniMetrics.totalProduction}`)
    addLine(`Active sessions: ${miniMetrics.activeSessions}`)
    addLine(`Critical inventory items: ${miniMetrics.criticalInventory}`)
    addLine(`Filtered tasks count: ${filteredTasks.length}`)
    addLine(`Filtered records count: ${filteredRecords.length}`)

    if (overviewData?.riskMetrics?.values?.length) {
      y += 2
      addLine('Risk metrics (%):', 10, true)
      const labels = overviewData.riskMetrics.labels || []
      overviewData.riskMetrics.values.forEach((v, i) => {
        addLine(`  ${labels[i] || ''}: ${Math.round(v)}%`)
      })
    }
    if (overviewData?.inventoryHealth) {
      const ih = overviewData.inventoryHealth
      addLine(`Inventory health — Normal: ${ih.normal}, Low: ${ih.low}, Critical: ${ih.critical}`)
    }
    if (overviewData?.equipmentLoad) {
      const el = overviewData.equipmentLoad
      addLine(`Equipment — Open faults: ${el.openFaults}, Scheduled maintenance: ${el.scheduledMaintenance}, Overdue: ${el.overdueMaintenance}, Active: ${Math.round(el.activeEquipmentPct || 0)}%`)
    }
    if (overviewData?.zoneDistribution?.labels?.length) {
      y += 2
      addLine('By zone (tasks / sessions / faults):', 10, true)
      overviewData.zoneDistribution.labels.forEach((label, i) => {
        const t = overviewData.zoneDistribution.tasks?.[i] ?? 0
        const s = overviewData.zoneDistribution.sessions?.[i] ?? 0
        const f = overviewData.zoneDistribution.faults?.[i] ?? 0
        addLine(`  ${label}: ${t} / ${s} / ${f}`)
      })
    }

    // Insight
    if (autoInsight?.message) {
      addSection('4. Insight')
      addLine(autoInsight.message)
    }

    pdf.save(`SARMS-report-${appliedFilters.dateFrom || 'all'}-to-${appliedFilters.dateTo || 'all'}-${Date.now()}.pdf`)
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
    <div ref={pageCaptureRef} className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderTitleBlock}>
          <h1 className={styles.pageTitle}>Analytics &amp; Reports</h1>
          <p className={styles.pageSubtitle}>Centralized analytical command center — operations, production, tasks, faults, workers, equipment, and inventory.</p>
        </div>
        <div className={styles.pageHeaderHealth}>
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
          <span className={styles.summaryFilterTitle}><i className="fas fa-filter fa-fw" /> Summary Filter</span>
          <span className={styles.summaryFilterCaret} aria-hidden>{summaryFilterOpen ? '▼' : '▶'}</span>
        </button>
        {summaryFilterOpen && (
          <div className={styles.summaryFilterBody}>
            <div className={styles.datePresets}>
              <span className={styles.datePresetsLabel}>Quick range:</span>
              {['7', '30', 'month', '90'].map((p) => (
                <button key={p} type="button" className={styles.presetBtn} onClick={() => setDatePreset(p)}>
                  {p === '7' && 'Last 7 days'}
                  {p === '30' && 'Last 30 days'}
                  {p === 'month' && 'This month'}
                  {p === '90' && 'Last 3 months'}
                </button>
              ))}
            </div>
            <div className={styles.filtersGrid}>
              <div className={styles.filterGroup}>
                <label>Date from</label>
                <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} className={styles.input} />
              </div>
              <div className={styles.filterGroup}>
                <label>Date to</label>
                <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} className={styles.input} />
              </div>
              <div className={styles.filterGroup}>
                <label>Department</label>
                <select value={filters.dept} onChange={(e) => setFilters((f) => ({ ...f, dept: e.target.value }))} className={styles.select}>
                  <option value="">All departments</option>
                  {DEPARTMENT_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>Zone</label>
                <select value={filters.zone} onChange={(e) => setFilters((f) => ({ ...f, zone: e.target.value }))} className={styles.select}>
                  <option value="">All zones</option>
                  {zonesList.map((z) => (
                    <option key={z.id} value={z.id}>{z.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>Worker</label>
                <select value={filters.worker} onChange={(e) => setFilters((f) => ({ ...f, worker: e.target.value }))} className={styles.select}>
                  <option value="">All workers</option>
                  {WORKER_OPTIONS.map((w) => (
                    <option key={w.id} value={w.id}>{w.fullName}</option>
                  ))}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>Equipment</label>
                <select value={filters.equipment} onChange={(e) => setFilters((f) => ({ ...f, equipment: e.target.value }))} className={styles.select}>
                  <option value="">All equipment</option>
                  {EQUIPMENT_OPTIONS.map((e) => (
                    <option key={e.id} value={e.id}>{e.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>Task status</label>
                <select value={filters.taskStatus} onChange={(e) => setFilters((f) => ({ ...f, taskStatus: e.target.value }))} className={styles.select}>
                  <option value="">All statuses</option>
                  {Object.entries(TASK_STATUS_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>Fault severity</label>
                <select value={filters.faultSeverity} onChange={(e) => setFilters((f) => ({ ...f, faultSeverity: e.target.value }))} className={styles.select}>
                  <option value="">All severities</option>
                  {SEVERITY_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>Inventory category</label>
                <select value={filters.invCategory} onChange={(e) => setFilters((f) => ({ ...f, invCategory: e.target.value }))} className={styles.select}>
                  <option value="">All categories</option>
                  {INVENTORY_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>Session status</label>
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
      <section className={styles.summaryCardsWrap}>
        <div className={styles.summaryKpiCard}>
          <span className={styles.metricLabel}>Total production</span>
          <div className={styles.summaryKpiCardBody}>
            <span className={styles.metricValue}>{miniMetrics.totalProduction}</span>
            <span className={styles.metricUnit}>units</span>
            {trendComparison != null && (
              <span className={`${styles.trendIndicator} ${trendComparison.productionChange > 0 ? styles.trendUp : trendComparison.productionChange < 0 ? styles.trendDown : styles.trendFlat}`}>
                {trendComparison.productionChange > 0 ? '↑' : trendComparison.productionChange < 0 ? '↓' : '—'} {trendComparison.productionChange > 0 ? '+' : ''}{trendComparison.productionChange}%
              </span>
            )}
          </div>
        </div>
        <div className={styles.summaryKpiCard}>
          <span className={styles.metricLabel}>Open faults</span>
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
          <span className={styles.metricLabel}>Delayed tasks</span>
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
          <span className={styles.metricLabel}>Critical inventory</span>
          <div className={styles.summaryKpiCardBody}>
            <span className={styles.metricValue}>{miniMetrics.criticalInventory}</span>
          </div>
        </div>
        <div className={styles.summaryKpiCard}>
          <span className={styles.metricLabel}>Active sessions</span>
          <div className={styles.summaryKpiCardBody}>
            <span className={styles.metricValue}>{miniMetrics.activeSessions}</span>
          </div>
        </div>
        <div className={styles.summaryKpiCard}>
          <span className={styles.metricLabel}>Overdue maintenance</span>
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

      <section className={styles.explorerSection}>
        <div className={styles.explorerSectionHeader}>
          <h2 className={styles.sectionTitle}>Analytics charts</h2>
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
        {chartsView === 'internal' && openExplorer === 'executive' && (
          <>
            <ExecutiveOverview data={overviewData} onDrillDown={handleDrillDown} zoneIds={zonesList.map((z) => z.id)} />
            <div className={styles.autoInsightBox} data-type={autoInsight?.type ?? 'stable'}>
              <span className={styles.autoInsightIcon}>
                {autoInsight?.type === 'warning' && <i className="fas fa-exclamation-triangle" />}
                {autoInsight?.type === 'risk' && <i className="fas fa-times-circle" />}
                {(autoInsight?.type === 'stable' || !autoInsight?.type) && <i className="fas fa-check-circle" />}
              </span>
              <span className={styles.autoInsightText}>{autoInsight?.message ?? 'Calculating…'}</span>
            </div>
          </>
        )}
        {chartsView === 'internal' && openExplorer === 'operations' && (
          <div className={styles.explorerBlock}>
            <h3 className={styles.explorerBlockTitle}>Operations — tasks by status, zone, department</h3>
            <div className={styles.explorerCharts}>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>Tasks by status</h4>
                <div className={styles.chartContainer}>
                  <Bar
                    data={{
                      labels: [TASK_STATUS_LABELS[TASK_STATUS.PENDING_APPROVAL], TASK_STATUS_LABELS[TASK_STATUS.IN_PROGRESS], TASK_STATUS_LABELS[TASK_STATUS.COMPLETED]],
                      datasets: [{
                        label: 'Tasks',
                        data: [
                          filteredTasks.filter((t) => t.status === TASK_STATUS.PENDING_APPROVAL).length,
                          filteredTasks.filter((t) => t.status === TASK_STATUS.IN_PROGRESS).length,
                          filteredTasks.filter((t) => t.status === TASK_STATUS.COMPLETED).length,
                        ],
                        backgroundColor: [COLOR.RED + 'cc', COLOR.ORANGE + 'cc', COLOR.GREEN + 'cc'],
                      }],
                    }}
                    options={barIntegerYOptions}
                  />
                </div>
              </div>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>Tasks by zone</h4>
                <div className={styles.chartContainer}>
                  <Doughnut
                    data={(() => {
                      const zoneCounts = zonesList.map((z) => ({
                        label: ZONE_LABEL[z.id] || z.id,
                        count: filteredTasks.filter((t) => (t.zoneId || '') === z.id).length,
                      }))
                      const sorted = [...zoneCounts].sort((a, b) => b.count - a.count)
                      const loadColors = [COLOR.RED, COLOR.ORANGE, COLOR.YELLOW, COLOR.LIGHT_GREEN, COLOR.GREEN]
                      return {
                        labels: sorted.map((x) => x.label),
                        datasets: [{
                          data: sorted.map((x) => x.count),
                          backgroundColor: sorted.map((_, i) => loadColors[Math.min(i, loadColors.length - 1)] + 'cc'),
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
                <h4 className={styles.chartCardTitle}>Tasks by department</h4>
                <div className={styles.chartContainer}>
                  <Bar
                    data={(() => {
                      const deptCounts = DEPARTMENT_OPTIONS.map((d) => ({
                        label: d.label,
                        count: filteredTasks.filter((t) => (t.departmentId || t.taskType || '').toString().toLowerCase() === (d.value || '').toLowerCase()).length,
                      }))
                      const max = Math.max(1, ...deptCounts.map((x) => x.count))
                      const loadColors = [COLOR.RED + 'cc', COLOR.ORANGE + 'cc', COLOR.YELLOW + 'cc', COLOR.LIGHT_GREEN + 'cc', COLOR.GREEN + 'cc']
                      return {
                        labels: deptCounts.map((x) => x.label),
                        datasets: [{
                          label: 'Tasks',
                          data: deptCounts.map((x) => x.count),
                          backgroundColor: deptCounts.map((x) => {
                            const rank = max > 0 ? (x.count / max) : 0
                            if (rank >= 0.8) return loadColors[0]
                            if (rank >= 0.5) return loadColors[1]
                            if (rank >= 0.25) return loadColors[2]
                            if (rank > 0) return loadColors[3]
                            return loadColors[4]
                          }),
                        }],
                      }
                    })()}
                    options={barIntegerYOptions}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
        {chartsView === 'internal' && openExplorer === 'production' && (
          <div className={styles.explorerBlock}>
            <h3 className={styles.explorerBlockTitle}>Production — by department and trend</h3>
            <div className={styles.explorerCharts}>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>Production by department</h4>
                <div className={styles.chartContainer}>
                  <Bar
                    data={(() => {
                      const prodRecords = filteredRecords.filter((r) => r.recordType === 'production')
                      const deptTotals = DEPARTMENT_OPTIONS.map((d) => ({
                        label: d.label,
                        total: prodRecords.reduce((s, r) => (r.department || '').toLowerCase() === (d.value || '').toLowerCase() ? s + (Number(r.quantity) || 0) : s, 0),
                      }))
                      const maxTotal = Math.max(1, ...deptTotals.map((x) => x.total))
                      const loadColors = [COLOR.RED + 'cc', COLOR.ORANGE + 'cc', COLOR.YELLOW + 'cc', COLOR.LIGHT_GREEN + 'cc', COLOR.GREEN + 'cc']
                      return {
                        labels: deptTotals.map((x) => x.label),
                        datasets: [{
                          label: 'Units',
                          data: deptTotals.map((x) => x.total),
                          backgroundColor: deptTotals.map((x) => {
                            const rank = x.total / maxTotal
                            if (rank >= 0.8) return loadColors[0]
                            if (rank >= 0.5) return loadColors[1]
                            if (rank >= 0.25) return loadColors[2]
                            if (rank > 0) return loadColors[3]
                            return loadColors[4]
                          }),
                        }],
                      }
                    })()}
                    options={barIntegerYOptions}
                  />
                </div>
              </div>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>Production by zone</h4>
                <div className={styles.chartContainer}>
                  <Doughnut
                    data={(() => {
                      const prodRecords = filteredRecords.filter((r) => r.recordType === 'production')
                      const zoneTotals = zonesList.map((z) => {
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
                      const withData = zoneTotals.filter((x) => x.total > 0).sort((a, b) => b.total - a.total)
                      const loadColors = [COLOR.RED, COLOR.ORANGE, COLOR.YELLOW, COLOR.LIGHT_GREEN, COLOR.GREEN]
                      return {
                        labels: withData.length > 0 ? withData.map((x) => x.label) : ['No production by zone'],
                        datasets: [{
                          data: withData.length > 0 ? withData.map((x) => x.total) : [1],
                          backgroundColor: withData.length > 0
                            ? withData.map((_, i) => loadColors[Math.min(i, loadColors.length - 1)] + 'cc')
                            : [COLOR.NEUTRAL + '99'],
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
                <h4 className={styles.chartCardTitle}>Production trend</h4>
                <div className={styles.chartContainer}>
                  <Line data={productionTrendChartData} options={lineOptions} />
                </div>
              </div>
            </div>
          </div>
        )}
        {chartsView === 'internal' && openExplorer === 'workers' && (
          <div className={styles.explorerBlock}>
            <h3 className={styles.explorerBlockTitle}>Workers — sessions and tasks per worker</h3>
            <div className={styles.explorerCharts}>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>Sessions by worker</h4>
                <div className={styles.chartContainer}>
                  <Bar
                    data={(() => {
                      const workerIds = [...new Set(filteredSessions.map((s) => s.workerId))].filter(Boolean).slice(0, 8)
                      const counts = workerIds.map((wid) => filteredSessions.filter((s) => s.workerId === wid).length)
                      const maxCount = Math.max(1, ...counts)
                      const loadColors = [COLOR.RED + 'cc', COLOR.ORANGE + 'cc', COLOR.YELLOW + 'cc', COLOR.LIGHT_GREEN + 'cc', COLOR.GREEN + 'cc']
                      return {
                        labels: workerIds.map((wid) => filteredSessions.find((s) => s.workerId === wid)?.workerName || WORKER_OPTIONS.find((w) => w.id === wid)?.fullName || wid),
                        datasets: [{
                          label: 'Sessions',
                          data: counts,
                          backgroundColor: counts.map((c) => {
                            const rank = c / maxCount
                            if (rank >= 0.8) return loadColors[0]
                            if (rank >= 0.5) return loadColors[1]
                            if (rank >= 0.25) return loadColors[2]
                            if (rank > 0) return loadColors[3]
                            return loadColors[4]
                          }),
                        }],
                      }
                    })()}
                    options={barIntegerYOptions}
                  />
                </div>
              </div>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>Session status (on time / delayed / flagged)</h4>
                <div className={styles.chartContainer}>
                  <Doughnut
                    data={{
                      labels: ['On time', 'Delayed', 'Flagged'],
                      datasets: [{
                        data: [
                          filteredSessions.filter((s) => s.status === SESSION_STATUS.ON_TIME).length,
                          filteredSessions.filter((s) => s.status === SESSION_STATUS.DELAYED).length,
                          filteredSessions.filter((s) => s.status === SESSION_STATUS.FLAGGED).length,
                        ],
                        backgroundColor: [COLOR.GREEN, COLOR.YELLOW, COLOR.RED],
                        borderWidth: 2,
                        borderColor: '#fff',
                      }],
                    }}
                    options={doughnutOptions}
                  />
                </div>
              </div>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>Tasks per worker</h4>
                <div className={styles.chartContainer}>
                  <Bar
                    data={(() => {
                      const byWorker = {}
                      filteredTasks.forEach((t) => {
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
                          labels: ['No task assignments'],
                          datasets: [{ label: 'Tasks', data: [0], backgroundColor: [COLOR.NEUTRAL + '99'] }],
                        }
                      }
                      const maxCount = Math.max(1, ...sorted.map(([, c]) => c))
                      const loadColors = [COLOR.RED + 'cc', COLOR.ORANGE + 'cc', COLOR.YELLOW + 'cc', COLOR.LIGHT_GREEN + 'cc', COLOR.GREEN + 'cc']
                      return {
                        labels: sorted.map(([wid]) => WORKER_OPTIONS.find((w) => w.id === wid)?.fullName || wid),
                        datasets: [{
                          label: 'Tasks',
                          data: sorted.map(([, c]) => c),
                          backgroundColor: sorted.map(([, c]) => {
                            const rank = c / maxCount
                            if (rank >= 0.8) return loadColors[0]
                            if (rank >= 0.5) return loadColors[1]
                            if (rank >= 0.25) return loadColors[2]
                            if (rank > 0) return loadColors[3]
                            return loadColors[4]
                          }),
                        }],
                      }
                    })()}
                    options={barIntegerYOptions}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
        {chartsView === 'internal' && openExplorer === 'equipment' && (
          <div className={styles.explorerBlock}>
            <h3 className={styles.explorerBlockTitle}>Equipment — faults by category, severity, and trend</h3>
            <div className={styles.explorerCharts}>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>Faults by category</h4>
                <div className={styles.chartContainer}>
                  <Doughnut
                    data={(() => {
                      const categoryCounts = FAULT_CATEGORIES.map((c) => ({
                        label: c.label,
                        count: filteredFaults.filter((f) => f.category === c.id).length,
                      })).filter((x) => x.count > 0)
                      const sorted = [...categoryCounts].sort((a, b) => b.count - a.count)
                      const loadColors = [COLOR.RED, COLOR.ORANGE, COLOR.YELLOW, COLOR.LIGHT_GREEN, COLOR.GREEN]
                      if (sorted.length === 0) {
                        return {
                          labels: ['No faults'],
                          datasets: [{ data: [1], backgroundColor: [COLOR.NEUTRAL + '99'], borderWidth: 2, borderColor: '#fff' }],
                        }
                      }
                      return {
                        labels: sorted.map((x) => x.label),
                        datasets: [{
                          data: sorted.map((x) => x.count),
                          backgroundColor: sorted.map((_, i) => loadColors[Math.min(i, loadColors.length - 1)] + 'cc'),
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
                <h4 className={styles.chartCardTitle}>Faults by equipment</h4>
                <div className={styles.chartContainer}>
                  <Bar
                    data={(() => {
                      if (!filteredFaults.length) {
                        return {
                          labels: ['No data'],
                          datasets: [{ label: 'Faults', data: [0], backgroundColor: [COLOR.NEUTRAL + '99'] }],
                        }
                      }
                      const equipmentIds = [...new Set(filteredFaults.map((f) => f.equipmentId))].slice(0, 6)
                      const counts = equipmentIds.map((eid) => filteredFaults.filter((f) => f.equipmentId === eid).length)
                      const labels = equipmentIds.map((eid) => filteredFaults.find((f) => f.equipmentId === eid)?.equipmentName || eid)
                      const maxCount = Math.max(1, ...counts)
                      const loadColors = [COLOR.RED + 'cc', COLOR.ORANGE + 'cc', COLOR.YELLOW + 'cc', COLOR.LIGHT_GREEN + 'cc', COLOR.GREEN + 'cc']
                      return {
                        labels,
                        datasets: [{
                          label: 'Faults',
                          data: counts,
                          backgroundColor: counts.map((c) => {
                            const rank = c / maxCount
                            if (rank >= 0.8) return loadColors[0]
                            if (rank >= 0.5) return loadColors[1]
                            if (rank >= 0.25) return loadColors[2]
                            if (rank > 0) return loadColors[3]
                            return loadColors[4]
                          }),
                        }],
                      }
                    })()}
                    options={barIntegerYOptions}
                  />
                </div>
              </div>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>Faults by severity</h4>
                <div className={styles.chartContainer}>
                  <Doughnut
                    data={{
                      labels: SEVERITY_OPTIONS.map((s) => s.label),
                      datasets: [{
                        data: SEVERITY_OPTIONS.map((s) => filteredFaults.filter((f) => f.severity === s.id).length),
                        backgroundColor: [COLOR.GREEN + 'cc', COLOR.YELLOW + 'cc', COLOR.ORANGE + 'cc', COLOR.RED + 'cc'],
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
        {chartsView === 'internal' && openExplorer === 'inventory' && (
          <div className={styles.explorerBlock}>
            <h3 className={styles.explorerBlockTitle}>Inventory — by category and status</h3>
            <div className={styles.explorerCharts}>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>Items by category</h4>
                <div className={styles.chartContainer}>
                  <Bar
                    data={(() => {
                      const categoryCounts = INVENTORY_CATEGORIES.map((c) => ({
                        label: c.label,
                        count: inventoryWithStatus.filter((i) => i.category === c.id).length,
                      }))
                      const maxCount = Math.max(1, ...categoryCounts.map((x) => x.count))
                      const loadColors = [COLOR.RED + 'cc', COLOR.ORANGE + 'cc', COLOR.YELLOW + 'cc', COLOR.LIGHT_GREEN + 'cc', COLOR.GREEN + 'cc']
                      return {
                        labels: categoryCounts.map((x) => x.label),
                        datasets: [{
                          label: 'Items',
                          data: categoryCounts.map((x) => x.count),
                          backgroundColor: categoryCounts.map((x) => {
                            const rank = x.count / maxCount
                            if (rank >= 0.8) return loadColors[0]
                            if (rank >= 0.5) return loadColors[1]
                            if (rank >= 0.25) return loadColors[2]
                            if (rank > 0) return loadColors[3]
                            return loadColors[4]
                          }),
                        }],
                      }
                    })()}
                    options={barIntegerYOptions}
                  />
                </div>
              </div>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>Inventory health (doughnut)</h4>
                <div className={styles.chartContainer}>
                  <Doughnut data={inventoryDoughnutChartData || { labels: ['Normal', 'Low', 'Critical'], datasets: [{ data: [0, 0, 0], backgroundColor: [COLOR.GREEN, COLOR.YELLOW, COLOR.RED], borderWidth: 2, borderColor: '#fff' }] }} options={doughnutOptions} />
                </div>
              </div>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>Items by status</h4>
                <div className={styles.chartContainer}>
                  <Bar
                    data={{
                      labels: ['Normal', 'Low', 'Critical'],
                      datasets: [{
                        label: 'Items',
                        data: [
                          inventoryWithStatus.filter((i) => i.status === INVENTORY_STATUS.NORMAL).length,
                          inventoryWithStatus.filter((i) => i.status === INVENTORY_STATUS.LOW).length,
                          inventoryWithStatus.filter((i) => i.status === INVENTORY_STATUS.CRITICAL).length,
                        ],
                        backgroundColor: [COLOR.GREEN + 'cc', COLOR.YELLOW + 'cc', COLOR.RED + 'cc'],
                      }],
                    }}
                    options={barIntegerYOptions}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
        {chartsView === 'internal' && openExplorer === 'sessions' && (
          <div className={styles.explorerBlock}>
            <h3 className={styles.explorerBlockTitle}>Sessions — by zone, department, status</h3>
            <div className={styles.explorerCharts}>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>Sessions by zone</h4>
                <div className={styles.chartContainer}>
                  <Bar
                    data={{
                      labels: zonesList.map((z) => ZONE_LABEL[z.id] || z.id),
                      datasets: [{
                        label: 'Sessions',
                        data: zonesList.map((z) => filteredSessions.filter((s) => (s.zoneId || s.zone) === z.id || (s.zoneId || s.zone) === z.label).length),
                        backgroundColor: COLOR.GREEN + 'cc',
                      }],
                    }}
                    options={horizontalBarIntegerOptions}
                  />
                </div>
              </div>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>Sessions by department</h4>
                <div className={styles.chartContainer}>
                  <Doughnut
                    data={{
                      labels: DEPARTMENT_OPTIONS.map((d) => d.label),
                      datasets: [{
                        data: DEPARTMENT_OPTIONS.map((d) => filteredSessions.filter((s) => (s.departmentId || s.department || '').toLowerCase() === d.value.toLowerCase()).length),
                        backgroundColor: [COLOR.GREEN + 'cc', COLOR.YELLOW + 'cc', '#93c5fdcc'],
                        borderWidth: 2,
                        borderColor: '#fff',
                      }],
                    }}
                    options={doughnutOptions}
                  />
                </div>
              </div>
              <div className={styles.chartCard}>
                <h4 className={styles.chartCardTitle}>Session status</h4>
                <div className={styles.chartContainer}>
                  <Bar
                    data={{
                      labels: ['On time', 'Delayed', 'Flagged'],
                      datasets: [{
                        label: 'Sessions',
                        data: [
                          filteredSessions.filter((s) => s.status === SESSION_STATUS.ON_TIME).length,
                          filteredSessions.filter((s) => s.status === SESSION_STATUS.DELAYED).length,
                          filteredSessions.filter((s) => s.status === SESSION_STATUS.FLAGGED).length,
                        ],
                        backgroundColor: [COLOR.GREEN + 'cc', COLOR.YELLOW + 'cc', COLOR.RED + 'cc'],
                      }],
                    }}
                    options={barIntegerYOptions}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs below content: Executive overview (default), Operations, Production, … + Export PDF – Internal only */}
        {chartsView === 'internal' && (
        <div className={styles.explorerBar}>
          {EXPLORER_MODULES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={openExplorer === m.id ? `${styles.explorerBtn} ${styles.explorerBtnActive}` : styles.explorerBtn}
              onClick={() => setOpenExplorer(m.id)}
            >
              <i className={`fas ${m.icon} fa-fw`} /> {m.label}
            </button>
          ))}
          <button type="button" className={styles.explorerBtnExport} onClick={exportPDF} title="Export report based on current filters and data">
            <i className="fas fa-file-pdf fa-fw" /> Export PDF
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

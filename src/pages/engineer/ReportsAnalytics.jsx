import { useState, useMemo, useEffect } from 'react'
import { DEPARTMENT_OPTIONS, SEED_WORKERS } from '../../data/engineerWorkers'
import { TASK_STATUS, TASK_STATUS_LABELS } from '../../data/assignTask'
import { getInitialZones, getTaskById, TASKS_BY_DEPARTMENT, INVENTORY_TASKS } from '../../data/workerFlow'
import { getInventoryStatus } from '../../data/inventory'
import { getSessionStatus, getElapsedMinutes, SESSION_STATUS, SESSION_STATUS_LABELS } from '../../data/monitorActive'
import { useAppStore } from '../../context/AppStoreContext'
import styles from './ReportsAnalytics.module.css'

/** All tasks (Farming + Maintenance + Inventory) for filter dropdown. */
const ALL_TASK_OPTIONS = (() => {
  const list = []
  Object.values(TASKS_BY_DEPARTMENT).forEach((arr) => arr.forEach((t) => list.push({ id: t.id, label: t.labelEn })))
  INVENTORY_TASKS.forEach((t) => list.push({ id: t.id, label: t.labelEn }))
  return list
})()

const RECORD_TYPE_OPTIONS = [
  { id: '', label: 'All records' },
  { id: 'production', label: 'Production' },
  { id: 'inventory', label: 'Inventory' },
]

/** Workers who can have records/tasks (worker + engineer). */
const WORKER_OPTIONS = SEED_WORKERS.filter((w) => w.role === 'worker' || w.role === 'engineer')

const DEFAULT_DATE_FROM = () => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
const DEFAULT_DATE_TO = () => new Date().toISOString().slice(0, 10)

const CHART_COLORS = ['#8b6b5c', '#b89a4a', '#6b7b8a', '#5c7b5c', '#8b95a0']

function inDateRange(iso, from, to) {
  if (!from && !to) return true
  const d = new Date(iso).toISOString().slice(0, 10)
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

export default function ReportsAnalytics() {
  const { sessions, tasks, records, faults, inventory, zones: storeZones } = useAppStore()
  const zonesList = (storeZones && storeZones.length > 0) ? storeZones : getInitialZones()
  const ZONE_LABEL = useMemo(() => Object.fromEntries(zonesList.map((z) => [z.id, z.label])), [zonesList])
  const [tick, setTick] = useState(0)
  const [dateFrom, setDateFrom] = useState(DEFAULT_DATE_FROM())

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000)
    return () => clearInterval(interval)
  }, [])

  const now = Date.now()
  const sessionsWithStatus = useMemo(
    () =>
      (sessions || []).map((s) => ({
        ...s,
        status: getSessionStatus(s, now),
        elapsedMinutes: getElapsedMinutes(s, now),
      })),
    [sessions, tick, now]
  )
  const analyticsByZone = useMemo(() => {
    const map = {}
    sessionsWithStatus.forEach((s) => {
      const z = s.zone || s.zoneId || 'Other'
      map[z] = (map[z] || 0) + 1
    })
    return Object.entries(map).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  }, [sessionsWithStatus])
  const analyticsByDept = useMemo(() => {
    const map = {}
    sessionsWithStatus.forEach((s) => {
      const d = s.department || s.departmentId || 'Other'
      map[d] = (map[d] || 0) + 1
    })
    return Object.entries(map).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  }, [sessionsWithStatus])
  const analyticsByStatus = useMemo(
    () => [
      { id: SESSION_STATUS.ON_TIME, label: SESSION_STATUS_LABELS[SESSION_STATUS.ON_TIME], count: sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.ON_TIME).length },
      { id: SESSION_STATUS.DELAYED, label: SESSION_STATUS_LABELS[SESSION_STATUS.DELAYED], count: sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.DELAYED).length },
      { id: SESSION_STATUS.FLAGGED, label: SESSION_STATUS_LABELS[SESSION_STATUS.FLAGGED], count: sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.FLAGGED).length },
    ],
    [sessionsWithStatus]
  )
  const maxZone = Math.max(1, ...analyticsByZone.map((x) => x.count))
  const maxDept = Math.max(1, ...analyticsByDept.map((x) => x.count))
  const maxStatus = Math.max(1, ...analyticsByStatus.map((x) => x.count))
  const [dateTo, setDateTo] = useState(DEFAULT_DATE_TO())
  const [filterDept, setFilterDept] = useState('')
  const [filterZone, setFilterZone] = useState('')
  const [filterRecordType, setFilterRecordType] = useState('')
  const [filterWorker, setFilterWorker] = useState('')
  const [filterTask, setFilterTask] = useState('')
  const [filterTaskStatus, setFilterTaskStatus] = useState('')
  const [filterBatch, setFilterBatch] = useState('')
  const [summaryModalOpen, setSummaryModalOpen] = useState(false)
  const [summaryText, setSummaryText] = useState('')

  const batchOptions = useMemo(() => {
    const ids = new Set()
    tasks.forEach((t) => { if (t.batchId) ids.add(t.batchId) })
    return Array.from(ids).sort().map((id) => ({ id, label: `Batch ${id}` }))
  }, [tasks])

  const filteredRecords = useMemo(() => {
    const taskLabel = filterTask ? getTaskById(filterTask)?.labelEn : null
    return records.filter((r) => {
      if (!inDateRange(r.dateTime || r.createdAt, dateFrom, dateTo)) return false
      if (filterRecordType && r.recordType !== filterRecordType) return false
      if (filterDept) {
        const rDept = (r.department || '').toLowerCase()
        const matchDept = filterDept.toLowerCase()
        if (rDept !== matchDept) return false
      }
      if (filterZone) {
        const rZone = (r.zone || r.zoneId || '').toString().trim()
        const zoneLabel = (ZONE_LABEL[filterZone] || '').toString().trim()
        if (rZone !== filterZone && rZone !== zoneLabel) return false
      }
      if (filterWorker) {
        const w = WORKER_OPTIONS.find((x) => x.id === filterWorker)
        if (w && (r.worker || '').trim() !== (w.fullName || '').trim()) return false
      }
      if (taskLabel && (r.task || '').trim() !== taskLabel.trim()) return false
      return true
    })
  }, [records, dateFrom, dateTo, filterRecordType, filterDept, filterZone, filterWorker, filterTask, ZONE_LABEL])

  const summary = useMemo(() => {
    const productionRecords = filteredRecords.filter((r) => r.recordType === 'production')
    const totalProduction = productionRecords.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
    const inventoryWithStatus = inventory.map((i) => ({ ...i, status: getInventoryStatus(i) }))
    const inventoryAlerts = inventoryWithStatus.filter((i) => i.status !== 'normal').length
    return {
      totalProduction,
      openFaults: faults.length,
      inventoryAlerts,
    }
  }, [filteredRecords, faults.length, inventory])

  const productionByDept = useMemo(() => {
    const byDept = {}
    filteredRecords
      .filter((r) => r.recordType === 'production')
      .forEach((r) => {
        const dept = r.department || 'Other'
        byDept[dept] = (byDept[dept] || 0) + (Number(r.quantity) || 0)
      })
    const series = DEPARTMENT_OPTIONS.map((d) => ({ label: d.label, value: byDept[d.label] || 0 }))
    return series.some((x) => x.value > 0) ? series : [{ label: 'No data', value: 0 }]
  }, [filteredRecords])

  const faultsByEquipment = useMemo(() => {
    const byEq = {}
    faults.forEach((f) => {
      const name = f.equipmentName || f.equipmentId || 'Other'
      byEq[name] = (byEq[name] || 0) + 1
    })
    const names = Object.keys(byEq)
    return names.length
      ? names.map((name, i) => ({ label: name, value: byEq[name], color: CHART_COLORS[i % CHART_COLORS.length] }))
      : [{ label: 'No faults', value: 1, color: '#94a3b8' }]
  }, [faults])

  const prodMax = Math.max(...productionByDept.map((d) => d.value), 1)
  const faultsTotal = faultsByEquipment.reduce((s, d) => s + d.value, 0)

  /* Task analytics: filter by zone, department, status, batch, worker */
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterZone && (t.zoneId || '') !== filterZone) return false
      if (filterDept && (t.departmentId || t.taskType || '') !== filterDept) return false
      if (filterTaskStatus && (t.status || '') !== filterTaskStatus) return false
      if (filterBatch && (t.batchId || '') !== filterBatch) return false
      if (filterWorker && !(t.workerIds || []).includes(filterWorker)) return false
      return true
    })
  }, [tasks, filterZone, filterDept, filterTaskStatus, filterBatch, filterWorker])

  const tasksByStatus = useMemo(() => {
    const s = {
      [TASK_STATUS.PENDING_APPROVAL]: 0,
      [TASK_STATUS.IN_PROGRESS]: 0,
      [TASK_STATUS.COMPLETED]: 0,
    }
    filteredTasks.forEach((t) => { s[t.status] = (s[t.status] || 0) + 1 })
    return [
      { label: TASK_STATUS_LABELS[TASK_STATUS.PENDING_APPROVAL], value: s[TASK_STATUS.PENDING_APPROVAL] ?? 0 },
      { label: TASK_STATUS_LABELS[TASK_STATUS.IN_PROGRESS], value: s[TASK_STATUS.IN_PROGRESS] ?? 0 },
      { label: TASK_STATUS_LABELS[TASK_STATUS.COMPLETED], value: s[TASK_STATUS.COMPLETED] ?? 0 },
    ]
  }, [filteredTasks])
  const tasksByZone = useMemo(() => {
    const byZone = {}
    filteredTasks.forEach((t) => {
      const z = t.zoneId || 'other'
      byZone[z] = (byZone[z] || 0) + 1
    })
    return zonesList.map((z) => ({ label: ZONE_LABEL[z.id] ?? z.id, value: byZone[z.id] || 0 }))
  }, [filteredTasks, zonesList, ZONE_LABEL])
  const tasksByDepartment = useMemo(() => {
    const byDept = {}
    filteredTasks.forEach((t) => {
      const dept = t.departmentId || t.taskType || 'other'
      byDept[dept] = (byDept[dept] || 0) + 1
    })
    return DEPARTMENT_OPTIONS.map((d) => ({ label: d.label, value: byDept[d.value] || 0 }))
  }, [filteredTasks])
  const tasksStatusMax = Math.max(...tasksByStatus.map((d) => d.value), 1)
  const tasksZoneMax = Math.max(...tasksByZone.map((d) => d.value), 1)
  const tasksDeptMax = Math.max(...tasksByDepartment.map((d) => d.value), 1)

  function applyFilters() {}

  function clearFilters() {
    setDateFrom(DEFAULT_DATE_FROM())
    setDateTo(DEFAULT_DATE_TO())
    setFilterDept('')
    setFilterZone('')
    setFilterRecordType('')
    setFilterWorker('')
    setFilterTask('')
    setFilterTaskStatus('')
    setFilterBatch('')
  }

  function setDatePreset(preset) {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    switch (preset) {
      case '7':
        setDateFrom(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
        setDateTo(today)
        break
      case '30':
        setDateFrom(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
        setDateTo(today)
        break
      case 'month':
        const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
        setDateFrom(first)
        setDateTo(today)
        break
      case '90':
        setDateFrom(new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10))
        setDateTo(today)
        break
      default:
        break
    }
  }

  function compileSummary() {
    const lines = [
      `SARMS Daily Summary – ${new Date().toLocaleDateString()}`,
      '',
      `Period: ${dateFrom} to ${dateTo}`,
      `Total production: ${summary.totalProduction} units`,
      `Open faults: ${summary.openFaults}`,
      `Inventory alerts: ${summary.inventoryAlerts}`,
      '',
      `Tasks (filtered): ${filteredTasks.length}`,
      `Records (filtered): ${filteredRecords.length}`,
    ]
    setSummaryText(lines.join('\n'))
    setSummaryModalOpen(true)
  }

  function exportPDF() {
    const content = document.getElementById('report-print-area')
    if (!content) return
    const win = window.open('', '_blank')
    win.document.write(`
      <!DOCTYPE html><html><head><title>SARMS Report ${new Date().toISOString().slice(0, 10)}</title>
      <style>body{font-family:sans-serif;padding:24px;max-width:800px;margin:0 auto} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ddd;padding:8px} th{background:#f5f5f5}</style>
      </head><body>
      <h1><i className="fas fa-file-lines fa-fw" /> SARMS Report</h1>
      <p>Generated: ${new Date().toLocaleString()}</p>
      <p>Period: ${dateFrom} to ${dateTo}</p>
      <h2><i className="fas fa-chart-pie fa-fw" /> Summary</h2>
      <ul>
        <li>Total production: ${summary.totalProduction} units</li>
        <li>Open faults: ${summary.openFaults}</li>
        <li>Inventory alerts: ${summary.inventoryAlerts}</li>
      </ul>
      </body></html>
    `)
    win.document.close()
    win.print()
    win.close()
  }

  function exportExcel() {
    const headers = ['Type', 'Date', 'Worker', 'Zone', 'Details', 'Quantity/Outcome']
    const rows = filteredRecords.map((r) => {
      const details = [r.notes || r.task || '']
      if (r.engineerNotes) details.push(`[Engineer notes]: ${r.engineerNotes}`)
      return [
        r.recordType || '',
        r.dateTime || r.createdAt || '',
        r.worker || '',
        r.zone || '',
        details.join(' '),
        r.quantity ?? r.qualityOutcome ?? '',
      ]
    })
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
    <div className={styles.page}>
      <div id="report-print-area" style={{ display: 'none' }} aria-hidden="true" />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><i className="fas fa-filter fa-fw" /> Filters</h2>
        <div className={styles.datePresets}>
          <span className={styles.datePresetsLabel}>Quick range:</span>
          <button type="button" className={styles.presetBtn} onClick={() => setDatePreset('7')}>Last 7 days</button>
          <button type="button" className={styles.presetBtn} onClick={() => setDatePreset('30')}>Last 30 days</button>
          <button type="button" className={styles.presetBtn} onClick={() => setDatePreset('month')}>This month</button>
          <button type="button" className={styles.presetBtn} onClick={() => setDatePreset('90')}>Last 3 months</button>
        </div>
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label>Date range</label>
            <div className={styles.dateRow}>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={styles.input} />
              <span className={styles.dateSep}>to</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={styles.input} />
            </div>
          </div>
          <div className={styles.filterGroup}>
            <label>Department</label>
            <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className={styles.select}>
              <option value="">All departments</option>
              {DEPARTMENT_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label>Zone</label>
            <select value={filterZone} onChange={(e) => setFilterZone(e.target.value)} className={styles.select}>
              <option value="">All zones</option>
              {zonesList.map((z) => (
                <option key={z.id} value={z.id}>{z.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label>Record type</label>
            <select value={filterRecordType} onChange={(e) => setFilterRecordType(e.target.value)} className={styles.select}>
              {RECORD_TYPE_OPTIONS.map((r) => (
                <option key={r.id || 'all'} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label>Worker</label>
            <select value={filterWorker} onChange={(e) => setFilterWorker(e.target.value)} className={styles.select}>
              <option value="">All workers</option>
              {WORKER_OPTIONS.map((w) => (
                <option key={w.id} value={w.id}>{w.fullName}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label>Task</label>
            <select value={filterTask} onChange={(e) => setFilterTask(e.target.value)} className={styles.select}>
              <option value="">All tasks</option>
              {ALL_TASK_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label>Task status</label>
            <select value={filterTaskStatus} onChange={(e) => setFilterTaskStatus(e.target.value)} className={styles.select}>
              <option value="">All statuses</option>
              {Object.entries(TASK_STATUS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label>Batch</label>
            <select value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)} className={styles.select}>
              <option value="">All batches</option>
              {batchOptions.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.filterActions}>
          <button type="button" className={styles.applyBtn} onClick={applyFilters}>
            Apply filters
          </button>
          <button type="button" className={styles.clearBtn} onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Summary</h2>
        <div className={styles.cards}>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Total production</span>
            <span className={styles.cardValue}>{summary.totalProduction} units</span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Open faults</span>
            <span className={styles.cardValue}>{summary.openFaults}</span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Inventory alerts</span>
            <span className={styles.cardValue}>{summary.inventoryAlerts}</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><i className="fas fa-chart-column fa-fw" /> Sessions analytics</h2>
        <p className={styles.sectionDesc}>Active work sessions by zone, department, and status (from Monitor Active Work).</p>
        <div className={styles.chartsGrid}>
          <div className={styles.chartWrap}>
            <h3 className={styles.chartTitle}>Sessions by zone</h3>
            <div className={styles.barChart}>
              {analyticsByZone.map((row, i) => (
                <div key={i} className={styles.barRow}>
                  <span className={styles.barLabel}>{row.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(row.count / maxZone) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{row.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.chartWrap}>
            <h3 className={styles.chartTitle}>Sessions by department</h3>
            <div className={styles.barChart}>
              {analyticsByDept.map((row, i) => (
                <div key={i} className={styles.barRow}>
                  <span className={styles.barLabel}>{row.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(row.count / maxDept) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{row.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.chartWrap}>
            <h3 className={styles.chartTitle}>Sessions by status</h3>
            <div className={styles.barChart}>
              {analyticsByStatus.map((row) => (
                <div key={row.id} className={styles.barRow}>
                  <span className={styles.barLabel}>{row.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(row.count / maxStatus) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{row.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><i className="fas fa-chart-column fa-fw" /> Analytics charts</h2>
        <div className={styles.chartsGrid}>
          <div className={styles.chartWrap}>
            <h3 className={styles.chartTitle}>Production by department</h3>
            <div className={styles.barChart}>
              {productionByDept.map((d) => (
                <div key={d.label} className={styles.barRow}>
                  <span className={styles.barLabel}>{d.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(d.value / prodMax) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.chartWrap}>
            <h3 className={styles.chartTitle}>Faults by equipment</h3>
            <div
              className={styles.pieChart}
              style={{
                background: faultsTotal
                  ? `conic-gradient(${faultsByEquipment.map((d, i) => {
                      const start = (faultsByEquipment.slice(0, i).reduce((s, x) => s + x.value, 0) / faultsTotal) * 100
                      const end = (faultsByEquipment.slice(0, i + 1).reduce((s, x) => s + x.value, 0) / faultsTotal) * 100
                      return `${d.color} ${start}% ${end}%`
                    }).join(', ')})`
                  : '#e2e8f0',
              }}
            />
            <ul className={styles.pieLegend}>
              {faultsByEquipment.map((d) => (
                <li key={d.label} className={styles.pieLegendItem}>
                  <span className={styles.pieLegendDot} style={{ background: d.color }} />
                  <span>{d.label}</span>
                  <span className={styles.pieLegendValue}>{d.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Task analytics</h2>
        <p className={styles.sectionDesc}>Tasks across all zones and batches (Assign Task overview).</p>
        <div className={styles.chartsGrid}>
          <div className={styles.chartWrap}>
            <h3 className={styles.chartTitle}>Tasks by status</h3>
            <div className={styles.barChart}>
              {tasksByStatus.map((d) => (
                <div key={d.label} className={styles.barRow}>
                  <span className={styles.barLabel}>{d.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(d.value / tasksStatusMax) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.chartWrap}>
            <h3 className={styles.chartTitle}>Tasks by zone</h3>
            <div className={styles.barChart}>
              {tasksByZone.map((d) => (
                <div key={d.label} className={styles.barRow}>
                  <span className={styles.barLabel}>{d.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(d.value / tasksZoneMax) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.chartWrap}>
            <h3 className={styles.chartTitle}>Tasks by department</h3>
            <div className={styles.barChart}>
              {tasksByDepartment.map((d) => (
                <div key={d.label} className={styles.barRow}>
                  <span className={styles.barLabel}>{d.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(d.value / tasksDeptMax) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><i className="fas fa-bolt fa-fw" /> Report actions</h2>
        <div className={styles.actions}>
          <button type="button" className={styles.btnPrimary} onClick={compileSummary}>
            Compile daily summary
          </button>
          <button type="button" className={styles.btnSecondary} onClick={exportPDF}>
            Export PDF
          </button>
          <button type="button" className={styles.btnSecondary} onClick={exportExcel}>
            Export Excel
          </button>
        </div>
        <p className={styles.exportHint}>Exported reports respect active filters. Files are timestamped.</p>
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

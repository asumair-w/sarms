import { useState, useMemo } from 'react'
import { DEPARTMENT_OPTIONS } from '../../data/engineerWorkers'
import { ZONES } from '../../data/assignTask'
import { getInventoryStatus } from '../../data/inventory'
import { useAppStore } from '../../context/AppStoreContext'
import styles from './ReportsAnalytics.module.css'

const RECORD_TYPE_OPTIONS = [
  { id: '', label: 'All records' },
  { id: 'production', label: 'Production' },
  { id: 'quality', label: 'Quality' },
  { id: 'fault_maintenance', label: 'Faults' },
  { id: 'inventory', label: 'Inventory' },
]

const CHART_COLORS = ['#8b6b5c', '#b89a4a', '#6b7b8a', '#5c7b5c', '#8b95a0']

function inDateRange(iso, from, to) {
  if (!from && !to) return true
  const d = new Date(iso).toISOString().slice(0, 10)
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

export default function ReportsAnalytics() {
  const { tasks, records, faults, inventory } = useAppStore()
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))
  const [filterDept, setFilterDept] = useState('')
  const [filterZone, setFilterZone] = useState('')
  const [filterRecordType, setFilterRecordType] = useState('')
  const [summaryModalOpen, setSummaryModalOpen] = useState(false)
  const [summaryText, setSummaryText] = useState('')

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (!inDateRange(r.dateTime || r.createdAt, dateFrom, dateTo)) return false
      if (filterRecordType && r.recordType !== filterRecordType) return false
      return true
    })
  }, [records, dateFrom, dateTo, filterRecordType])

  const summary = useMemo(() => {
    const productionRecords = filteredRecords.filter((r) => r.recordType === 'production')
    const totalProduction = productionRecords.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
    const qualityIssues = filteredRecords.filter((r) => r.recordType === 'quality').length
    const inventoryWithStatus = inventory.map((i) => ({ ...i, status: getInventoryStatus(i) }))
    const inventoryAlerts = inventoryWithStatus.filter((i) => i.status !== 'normal').length
    return {
      totalProduction,
      qualityIssues,
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
    return DEPARTMENT_OPTIONS.map((d) => ({ label: d.label, value: byDept[d.label] || 0 })).filter((x) => x.value > 0).length
      ? DEPARTMENT_OPTIONS.map((d) => ({ label: d.label, value: byDept[d.label] || 0 }))
      : [{ label: 'No data', value: 0 }]
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

  const qualityByZone = useMemo(() => {
    const byZone = {}
    filteredRecords
      .filter((r) => r.recordType === 'quality')
      .forEach((r) => {
        const z = r.zone || 'Other'
        byZone[z] = (byZone[z] || 0) + 1
      })
    return ZONES.map((z) => ({ zone: z.label, issues: byZone[z.label] || 0 }))
  }, [filteredRecords])

  const prodMax = Math.max(...productionByDept.map((d) => d.value), 1)
  const qualityMax = Math.max(...qualityByZone.map((z) => z.issues), 1)
  const faultsTotal = faultsByEquipment.reduce((s, d) => s + d.value, 0)

  function applyFilters() {}

  function compileSummary() {
    const lines = [
      `SARMS Daily Summary – ${new Date().toLocaleDateString()}`,
      '',
      `Period: ${dateFrom} to ${dateTo}`,
      `Total production: ${summary.totalProduction} units`,
      `Quality issues: ${summary.qualityIssues}`,
      `Open faults: ${summary.openFaults}`,
      `Inventory alerts: ${summary.inventoryAlerts}`,
      '',
      `Tasks (total): ${tasks.length}`,
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
      <h1>SARMS Report</h1>
      <p>Generated: ${new Date().toLocaleString()}</p>
      <p>Period: ${dateFrom} to ${dateTo}</p>
      <h2>Summary</h2>
      <ul>
        <li>Total production: ${summary.totalProduction} units</li>
        <li>Quality issues: ${summary.qualityIssues}</li>
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
    <div className={styles.page}>
      <div id="report-print-area" style={{ display: 'none' }} aria-hidden="true" />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Filters</h2>
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
              {ZONES.map((z) => (
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
        </div>
        <button type="button" className={styles.applyBtn} onClick={applyFilters}>
          Apply filters
        </button>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Summary</h2>
        <div className={styles.cards}>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Total production</span>
            <span className={styles.cardValue}>{summary.totalProduction} units</span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Quality issues</span>
            <span className={styles.cardValue}>{summary.qualityIssues}</span>
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
        <h2 className={styles.sectionTitle}>Analytics charts</h2>
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
          <div className={styles.chartWrap}>
            <h3 className={styles.chartTitle}>Quality issues by zone</h3>
            <div className={styles.lineChart}>
              {qualityByZone.map((z) => (
                <div key={z.zone} className={styles.lineRow}>
                  <span className={styles.barLabel}>{z.zone}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(z.issues / qualityMax) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{z.issues}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Report actions</h2>
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

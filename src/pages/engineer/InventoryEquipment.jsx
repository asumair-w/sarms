import { useState, useMemo, useEffect } from 'react'
import {
  INVENTORY_CATEGORIES,
  INVENTORY_STATUS,
  getInventoryStatus,
} from '../../data/inventory'
import { FAULT_TYPE_PREVENTIVE_ALERT, FAULT_STATUS_OPEN } from '../../data/faults'
import { getInitialZones } from '../../data/workerFlow'
import { useAppStore } from '../../context/AppStoreContext'
import styles from './InventoryEquipment.module.css'

/** Today's date (local timezone) as YYYY-MM-DD for comparison */
function getTodayLocal() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

/** Add interval days to date string YYYY-MM-DD (local) */
function addDaysLocal(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

/** Remaining days until nextInspection (positive = future, 0 = today, negative = overdue) */
function remainingDays(nextInspectionStr, todayStr) {
  if (!nextInspectionStr) return null
  const a = new Date(nextInspectionStr + 'T12:00:00').getTime()
  const b = new Date(todayStr + 'T12:00:00').getTime()
  return Math.floor((a - b) / 86400000)
}

/** Cycle progress %: (today - last) / (next - last) * 100. Returns null if no schedule. >= 100 when overdue. */
function cycleProgressPercent(lastStr, nextStr, todayStr) {
  if (!lastStr || !nextStr) return null
  const last = new Date(lastStr + 'T12:00:00').getTime()
  const next = new Date(nextStr + 'T12:00:00').getTime()
  const today = new Date(todayStr + 'T12:00:00').getTime()
  const span = next - last
  if (span <= 0) return null
  return Math.max(0, ((today - last) / span) * 100)
}

/** Age in years from createdAt (ISO string). */
function ageYears(createdAt) {
  if (!createdAt) return null
  const created = new Date(createdAt).getTime()
  const now = Date.now()
  return (now - created) / (365.25 * 24 * 60 * 60 * 1000)
}

const CAT_LABELS = Object.fromEntries(INVENTORY_CATEGORIES.map((c) => [c.id, c.label]))
const STATUS_LABELS = { [INVENTORY_STATUS.NORMAL]: 'Normal', [INVENTORY_STATUS.LOW]: 'Low', [INVENTORY_STATUS.CRITICAL]: 'Critical' }

export default function InventoryEquipment() {
  const { inventory, equipment, updateInventoryItem, addInventoryItem, removeInventoryItem, faults, maintenancePlans, addFault, updateFault, records, zones: storeZones } = useAppStore()
  const zonesList = (storeZones && storeZones.length > 0) ? storeZones : getInitialZones()
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [harvestOpen, setHarvestOpen] = useState(false)
  const [selectedWidget, setSelectedWidget] = useState(null) // 'total' | 'normal' | 'low' | 'critical' | 'harvest' | 'equipment'
  const [harvestFilterZone, setHarvestFilterZone] = useState('')
  const [harvestFilterSearch, setHarvestFilterSearch] = useState('')
  const [harvestFilterPeriod, setHarvestFilterPeriod] = useState('all')
  const [harvestDateFrom, setHarvestDateFrom] = useState('')
  const [harvestDateTo, setHarvestDateTo] = useState('')
  const [viewHarvestImage, setViewHarvestImage] = useState(null)
  const [updateModal, setUpdateModal] = useState(null)
  const [qtyMode, setQtyMode] = useState('set')
  const [qtyValue, setQtyValue] = useState('')
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', category: 'supplies', customCategory: '', quantity: 0, unit: 'units', minQty: 0, warningQty: 10 })
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [editItem, setEditItem] = useState(null)
  const [summaryHarvestMonth, setSummaryHarvestMonth] = useState('this') // 'this' | 'last'

  const inventoryWithStatus = useMemo(
    () => inventory.map((i) => ({ ...i, status: getInventoryStatus(i) })),
    [inventory]
  )
  const filteredInventory = useMemo(() => {
    let list = inventoryWithStatus
    if (filterCategory) {
      if (filterCategory === 'other') list = list.filter((i) => i.category === 'other')
      else list = list.filter((i) => i.category === filterCategory)
    }
    if (filterStatus) list = list.filter((i) => (i.status || '') === filterStatus)
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase()
      list = list.filter(
        (i) =>
          (i.name || '').toLowerCase().includes(q) ||
          (i.unit || '').toLowerCase().includes(q) ||
          (i.category === 'other' && (i.customCategory || '').toLowerCase().includes(q)) ||
          (CAT_LABELS[i.category] || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [inventoryWithStatus, filterCategory, filterStatus, filterSearch])

  function openQuantityModal(item) {
    setUpdateModal(item)
    setQtyMode('set')
    setQtyValue(String(item.quantity ?? 0))
  }

  function handleUpdateQuantity(e) {
    e.preventDefault()
    if (!updateModal) return
    const current = Number(updateModal.quantity) || 0
    let newQty
    if (qtyMode === 'set') {
      newQty = Number(qtyValue)
      if (Number.isNaN(newQty) || newQty < 0) return
    } else {
      const delta = Number(qtyValue) || 0
      newQty = current + delta
      if (newQty < 0) return
    }
    updateInventoryItem(updateModal.id, { quantity: newQty })
    setUpdateModal(null)
    setQtyValue('')
  }

  function handleAddItem(e) {
    e.preventDefault()
    if (!newItem.name.trim()) return
    const category = newItem.category === 'other' ? 'other' : newItem.category
    const customCategory = newItem.category === 'other' ? (newItem.customCategory || '').trim() || undefined : undefined
    addInventoryItem({
      id: `inv${Date.now()}`,
      name: newItem.name.trim(),
      category,
      ...(customCategory != null && customCategory !== '' && { customCategory }),
      quantity: Number(newItem.quantity) || 0,
      unit: newItem.unit,
      minQty: Number(newItem.minQty) || 0,
      warningQty: Number(newItem.warningQty) || 0,
      lastUpdated: new Date().toISOString(),
    })
    setNewItem({ name: '', category: 'supplies', customCategory: '', quantity: 0, unit: 'units', minQty: 0, warningQty: 10 })
    setAddItemOpen(false)
  }

  function handleDeleteItem(item) {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    removeInventoryItem(item.id)
  }

  const categoryLabel = (i) => (i.category === 'other' && (i.customCategory || '')) ? i.customCategory : (CAT_LABELS[i.category] ?? i.category)

  function exportInventoryCSV() {
    const headers = ['Item name', 'Category', 'Quantity', 'Unit', 'Status', 'Last updated']
    const rows = filteredInventory.map((i) => [
      i.name ?? '',
      categoryLabel(i),
      i.quantity ?? '',
      i.unit ?? '',
      STATUS_LABELS[i.status] ?? i.status ?? '',
      i.lastUpdated ? new Date(i.lastUpdated).toLocaleString() : '',
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportInventoryPDF() {
    const dateStr = new Date().toISOString().slice(0, 10)
    const rows = filteredInventory.map((i) => `
      <tr>
        <td>${escapeHtml(i.name ?? '')}</td>
        <td>${escapeHtml(categoryLabel(i))}</td>
        <td>${escapeHtml(String(i.quantity ?? ''))}</td>
        <td>${escapeHtml(i.unit ?? '')}</td>
        <td>${escapeHtml(STATUS_LABELS[i.status] ?? i.status ?? '')}</td>
        <td>${escapeHtml(i.lastUpdated ? new Date(i.lastUpdated).toLocaleString() : '')}</td>
      </tr>
    `).join('')
    const html = `
<!DOCTYPE html>
<html dir="ltr">
<head>
  <meta charset="utf-8">
  <title>Inventory – ${dateStr}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; color: #1e293b; }
    h1 { font-size: 1.5rem; margin: 0 0 1rem; }
    .meta { color: #64748b; font-size: 0.9rem; margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; }
    tr:nth-child(even) { background: #f8fafc; }
  </style>
</head>
<body>
  <h1>Inventory</h1>
  <p class="meta">Generated ${new Date().toLocaleString()} · ${filteredInventory.length} item(s)</p>
  <table>
    <thead><tr><th>Item name</th><th>Category</th><th>Quantity</th><th>Unit</th><th>Status</th><th>Last updated</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="meta" style="margin-top:1rem;">Use the browser print dialog and choose &quot;Save as PDF&quot; to save as PDF.</p>
</body>
</html>`
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.onafterprint = () => win.close(); }, 250)
  }

  function escapeHtml(s) {
    const div = document.createElement('div')
    div.textContent = s
    return div.innerHTML
  }

  function handleSaveEdit(e) {
    e.preventDefault()
    if (!editItem || !editItem.name?.trim()) return
    const category = editItem.category === 'other' ? 'other' : editItem.category
    const customCategory = editItem.category === 'other' ? (editItem.customCategory || '').trim() || undefined : undefined
    updateInventoryItem(editItem.id, {
      name: editItem.name.trim(),
      category,
      ...(customCategory != null && customCategory !== '' ? { customCategory } : { customCategory: undefined }),
      quantity: Number(editItem.quantity) >= 0 ? Number(editItem.quantity) : 0,
      unit: editItem.unit || 'units',
      minQty: Number(editItem.minQty) >= 0 ? Number(editItem.minQty) : 0,
      warningQty: Number(editItem.warningQty) >= 0 ? Number(editItem.warningQty) : 0,
      lastUpdated: new Date().toISOString(),
    })
    setEditItem(null)
  }

  const summaryCounts = useMemo(() => {
    const normal = inventoryWithStatus.filter((i) => i.status === INVENTORY_STATUS.NORMAL).length
    const low = inventoryWithStatus.filter((i) => i.status === INVENTORY_STATUS.LOW).length
    const critical = inventoryWithStatus.filter((i) => i.status === INVENTORY_STATUS.CRITICAL).length
    return {
      total: inventoryWithStatus.length,
      normal,
      low,
      critical,
      needsRefill: low + critical,
    }
  }, [inventoryWithStatus])

  const harvestRecords = useMemo(
    () =>
      (records || [])
        .filter((r) => r.source === 'harvest_form')
        .sort((a, b) => new Date(b.dateTime || b.createdAt || 0) - new Date(a.dateTime || a.createdAt || 0)),
    [records]
  )

  const harvestRecordsInSummaryMonth = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    if (summaryHarvestMonth === 'last') {
      const start = new Date(y, m - 1, 1).getTime()
      const end = new Date(y, m, 0, 23, 59, 59).getTime()
      return harvestRecords.filter((r) => {
        const t = new Date(r.dateTime || r.createdAt || 0).getTime()
        return t >= start && t <= end
      })
    }
    const start = new Date(y, m, 1).getTime()
    const end = now.getTime()
    return harvestRecords.filter((r) => {
      const t = new Date(r.dateTime || r.createdAt || 0).getTime()
      return t >= start && t <= end
    })
  }, [harvestRecords, summaryHarvestMonth])

  const harvestTopProduct = useMemo(() => {
    if (harvestRecordsInSummaryMonth.length === 0) return null
    const byUnit = {}
    harvestRecordsInSummaryMonth.forEach((r) => {
      const u = r.unit || 'units'
      byUnit[u] = (byUnit[u] || 0) + (Number(r.quantity) || 0)
    })
    const entries = Object.entries(byUnit).sort((a, b) => b[1] - a[1])
    const top = entries[0]
    return top ? { unit: top[0], total: top[1] } : null
  }, [harvestRecordsInSummaryMonth])

  const filteredHarvestRecords = useMemo(() => {
    let list = harvestRecords
    if (harvestFilterZone) list = list.filter((r) => (r.zoneId || r.zone || '') === harvestFilterZone)
    if (harvestFilterSearch.trim()) {
      const q = harvestFilterSearch.trim().toLowerCase()
      list = list.filter(
        (r) =>
          (r.zone || '').toLowerCase().includes(q) ||
          (r.linesArea || r.lines || '').toLowerCase().includes(q) ||
          (r.notes || '').toLowerCase().includes(q) ||
          String(r.quantity || '').includes(q) ||
          (r.unit || '').toLowerCase().includes(q)
      )
    }
    const now = Date.now()
    const toDate = (d) => (d ? new Date(d).getTime() : now)
    if (harvestFilterPeriod === '7d') {
      const from = now - 7 * 24 * 60 * 60 * 1000
      list = list.filter((r) => toDate(r.dateTime || r.createdAt) >= from)
    } else if (harvestFilterPeriod === '30d') {
      const from = now - 30 * 24 * 60 * 60 * 1000
      list = list.filter((r) => toDate(r.dateTime || r.createdAt) >= from)
    } else if (harvestFilterPeriod === 'custom') {
      if (harvestDateFrom) {
        const from = new Date(harvestDateFrom).getTime()
        list = list.filter((r) => toDate(r.dateTime || r.createdAt) >= from)
      }
      if (harvestDateTo) {
        const to = new Date(harvestDateTo + 'T23:59:59').getTime()
        list = list.filter((r) => toDate(r.dateTime || r.createdAt) <= to)
      }
    }
    return list
  }, [harvestRecords, harvestFilterZone, harvestFilterSearch, harvestFilterPeriod, harvestDateFrom, harvestDateTo])

  const equipmentWithInspection = useMemo(() => {
    const today = getTodayLocal()
    return equipment.map((e) => {
      const interval = e.inspectionInterval != null ? Number(e.inspectionInterval) : null
      const last = e.lastInspection || null
      const next = e.nextInspection || (last && interval != null ? addDaysLocal(last, interval) : null)
      const days = next != null ? remainingDays(next, today) : null
      let inspectionStatus = null // 'ok' | 'due_soon' | 'overdue'
      if (days != null) {
        if (days > 7) inspectionStatus = 'ok'
        else if (days >= 0) inspectionStatus = 'due_soon'
        else inspectionStatus = 'overdue'
      }
      const progress = cycleProgressPercent(last, next, today)
      const age = ageYears(e.createdAt)
      return {
        ...e,
        inspectionInterval: interval,
        nextInspection: next,
        remainingDays: days,
        inspectionStatus,
        cycleProgress: progress,
        ageYears: age,
      }
    })
  }, [equipment])

  useEffect(() => {
    if (!selectedWidget) return
    const onKey = (e) => { if (e.key === 'Escape') setSelectedWidget(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedWidget])

  useEffect(() => {
    const today = getTodayLocal()
    equipmentWithInspection.forEach((e) => {
      if (e.remainingDays == null || e.remainingDays > 7) return
      const openPreventive = faults.find(
        (f) => f.equipmentId === e.id && f.type === FAULT_TYPE_PREVENTIVE_ALERT && (f.status || FAULT_STATUS_OPEN) === FAULT_STATUS_OPEN
      )
      const isOverdue = e.remainingDays < 0
      if (openPreventive) {
        if (isOverdue && (openPreventive.severity !== 'high' || openPreventive.description !== 'Inspection overdue')) {
          updateFault(openPreventive.id, { severity: 'high', description: 'Inspection overdue' })
        }
        return
      }
      addFault({
        id: `F-PMA-${e.id}-${Date.now()}`,
        equipmentId: e.id,
        equipmentName: e.name,
        type: FAULT_TYPE_PREVENTIVE_ALERT,
        category: 'other',
        severity: isOverdue ? 'high' : 'medium',
        status: FAULT_STATUS_OPEN,
        stopWork: false,
        description: isOverdue ? 'Inspection overdue' : 'Inspection due within 7 days',
        createdAt: new Date().toISOString(),
        auto_generated: true,
      })
    })
  }, [equipmentWithInspection, faults, addFault, updateFault])

  return (
    <div className={styles.page}>
      <section className={styles.summarySection}>
        <h2 className={styles.summaryTitle}><i className="fas fa-chart-pie fa-fw" /> Summary</h2>
        <div className={styles.summaryCards}>
          <button type="button" className={`${styles.summaryCard} ${styles.summaryCardStock}`} onClick={() => setSelectedWidget(selectedWidget === 'stock' ? null : 'stock')} aria-pressed={selectedWidget === 'stock'}>
            <span className={styles.summaryCardLabel}>Stock</span>
            <span className={styles.summaryCardStockRow}><em>Critical:</em> {summaryCounts.critical}</span>
            <span className={styles.summaryCardStockRow}><em>Low:</em> {summaryCounts.low}</span>
            <span className={styles.summaryCardStockRow}><em>Needs refill:</em> {summaryCounts.needsRefill}</span>
          </button>
          <button type="button" className={`${styles.summaryCard} ${styles.summaryCardHarvest}`} onClick={() => setSelectedWidget(selectedWidget === 'harvest' ? null : 'harvest')} aria-pressed={selectedWidget === 'harvest'}>
            <span className={styles.summaryCardLabel}>Harvest</span>
            <div className={styles.summaryCardHarvestFilter}>
              <select value={summaryHarvestMonth} onChange={(e) => { e.stopPropagation(); setSummaryHarvestMonth(e.target.value); }} className={styles.summaryHarvestSelect} onClick={(e) => e.stopPropagation()}>
                <option value="this">This month</option>
                <option value="last">Last month</option>
              </select>
            </div>
            <span className={styles.summaryCardValue}>
              {harvestTopProduct ? `${harvestTopProduct.total} ${harvestTopProduct.unit}` : '—'}
            </span>
            <span className={styles.summaryCardSub}>Top product</span>
          </button>
        </div>
      </section>

      {selectedWidget && (
        <div className={styles.modalOverlay} onClick={() => setSelectedWidget(null)}>
          <div className={styles.summaryPopupModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.widgetListHeader}>
              <h3 className={styles.modalTitle}>
                {selectedWidget === 'stock' && 'Stock – Critical, Low & Needs refill'}
                {selectedWidget === 'harvest' && `Harvest – Top product (${summaryHarvestMonth === 'this' ? 'This month' : 'Last month'})`}
              </h3>
              <button type="button" className={styles.widgetListClose} onClick={() => setSelectedWidget(null)} aria-label="Close">×</button>
            </div>
            <div className={styles.widgetListContent}>
              {selectedWidget === 'stock' && (
                summaryCounts.needsRefill === 0 ? <p className={styles.widgetListEmpty}>No items needing refill.</p> : (
                  <table className={styles.table}>
                    <thead><tr><th>Item name</th><th>Category</th><th>Quantity</th><th>Unit</th><th>Status</th><th>Min / Warning</th></tr></thead>
                    <tbody>
                      {inventoryWithStatus.filter((i) => i.status !== INVENTORY_STATUS.NORMAL).map((i) => (
                        <tr key={i.id}>
                          <td>{i.name}</td>
                          <td>{categoryLabel(i)}</td>
                          <td>{i.quantity}</td>
                          <td>{i.unit}</td>
                          <td><span className={styles.statusBadge} data-status={i.status}>{STATUS_LABELS[i.status]}</span></td>
                          <td>{i.minQty} / {i.warningQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
              {selectedWidget === 'harvest' && (
                harvestRecordsInSummaryMonth.length === 0 ? <p className={styles.widgetListEmpty}>No harvest records for this period. Add from Record Production.</p> : (
                  <>
                    {harvestTopProduct && <p className={styles.widgetListSummary}>Most harvested: <strong>{harvestTopProduct.total} {harvestTopProduct.unit}</strong></p>}
                    <table className={styles.table}>
                      <thead><tr><th>Zone</th><th>Lines / Area</th><th>Date &amp; time</th><th>Quantity</th><th>Unit</th><th>Comment</th></tr></thead>
                      <tbody>
                        {harvestRecordsInSummaryMonth.map((r) => (
                          <tr key={r.id}>
                            <td>{r.zone || r.zoneId || '—'}</td>
                            <td>{r.linesArea || r.lines || '—'}</td>
                            <td>{r.dateTime ? new Date(r.dateTime).toLocaleString() : (r.createdAt ? new Date(r.createdAt).toLocaleString() : '—')}</td>
                            <td>{r.quantity != null ? r.quantity : '—'}</td>
                            <td>{r.unit || '—'}</td>
                            <td className={styles.cellNotes}>{r.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )
              )}
            </div>
          </div>
        </div>
      )}
      <section className={styles.section}>
        <button type="button" className={styles.sectionHeader} onClick={() => setInventoryOpen((o) => !o)}>
          <h2 className={styles.sectionTitle}><i className="fas fa-boxes-stacked fa-fw" /> Manage Stock</h2>
          <span className={styles.expandLabel}>{inventoryOpen ? 'Collapse' : 'Expand'}</span>
          <span className={styles.chevron}>{inventoryOpen ? '▼' : '▶'}</span>
        </button>
        {inventoryOpen && (
          <>
            <div className={styles.filtersBar}>
              <div className={styles.filtersRow}>
                <span className={styles.filterLabel}>Category</span>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className={styles.filterSelect}
                  title="Filter by category"
                >
                  <option value="">All</option>
                  {INVENTORY_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.filtersRow}>
                <span className={styles.filterLabel}>Status</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className={styles.filterSelect}
                  title="Filter by status"
                >
                  <option value="">All</option>
                  <option value={INVENTORY_STATUS.NORMAL}>Normal</option>
                  <option value={INVENTORY_STATUS.LOW}>Low</option>
                  <option value={INVENTORY_STATUS.CRITICAL}>Critical</option>
                </select>
              </div>
              <div className={styles.filtersRow}>
                <span className={styles.filterLabel}>Search</span>
                <input
                  type="search"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder="Name, category, unit…"
                  className={styles.filterInput}
                />
              </div>
              <button type="button" className={styles.btnSecondary} onClick={exportInventoryCSV} disabled={filteredInventory.length === 0}>
                <i className="fas fa-file-csv fa-fw" /> CSV
              </button>
              <button type="button" className={styles.btnSecondary} onClick={exportInventoryPDF} disabled={filteredInventory.length === 0}>
                <i className="fas fa-file-pdf fa-fw" /> PDF
              </button>
              <button type="button" className={styles.btnPrimary} onClick={() => setAddItemOpen(true)}>
                Add item
              </button>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Item name</th>
                    <th>Category</th>
                    <th>Quantity</th>
                    <th>Unit</th>
                    <th>Status</th>
                    <th>Last updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.map((i) => (
                    <tr key={i.id}>
                      <td>{i.name}</td>
                      <td>{i.category === 'other' && (i.customCategory || '') ? i.customCategory : (CAT_LABELS[i.category] ?? i.category)}</td>
                      <td>{i.quantity}</td>
                      <td>{i.unit}</td>
                      <td>
                        <span className={styles.statusBadge} data-status={i.status}>
                          {STATUS_LABELS[i.status]}
                        </span>
                      </td>
                      <td>{new Date(i.lastUpdated).toLocaleString()}</td>
                      <td>
                        <button type="button" className={styles.actionLink} onClick={() => openQuantityModal(i)}>Update</button>
                        {' · '}
                        <button type="button" className={styles.actionLink} onClick={() => setEditItem({ ...i, customCategory: i.customCategory || '' })}>Edit</button>
                        {' · '}
                        <button type="button" className={styles.actionLinkDelete} onClick={() => handleDeleteItem(i)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className={styles.section}>
        <button type="button" className={styles.sectionHeader} onClick={() => setHarvestOpen((o) => !o)}>
          <h2 className={styles.sectionTitle}><i className="fas fa-wheat-awn fa-fw" /> Harvest Log</h2>
          <span className={styles.expandLabel}>{harvestOpen ? 'Collapse' : 'Expand'}</span>
          <span className={styles.chevron}>{harvestOpen ? '▼' : '▶'}</span>
        </button>
        {harvestOpen && (
          <>
            <div className={styles.harvestFilters}>
              <select
                value={harvestFilterZone}
                onChange={(e) => setHarvestFilterZone(e.target.value)}
                className={styles.filterSelect}
                title="Filter by zone"
              >
                <option value="">All zones</option>
                {zonesList.map((z) => (
                  <option key={z.id} value={z.id}>{z.label}</option>
                ))}
              </select>
              <select
                value={harvestFilterPeriod}
                onChange={(e) => setHarvestFilterPeriod(e.target.value)}
                className={styles.filterSelect}
                title="Time period"
              >
                <option value="all">All time</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="custom">Custom range</option>
              </select>
              {harvestFilterPeriod === 'custom' && (
                <>
                  <input
                    type="date"
                    value={harvestDateFrom}
                    onChange={(e) => setHarvestDateFrom(e.target.value)}
                    className={styles.filterDate}
                    title="From date"
                  />
                  <input
                    type="date"
                    value={harvestDateTo}
                    onChange={(e) => setHarvestDateTo(e.target.value)}
                    className={styles.filterDate}
                    title="To date"
                  />
                </>
              )}
              <input
                type="text"
                value={harvestFilterSearch}
                onChange={(e) => setHarvestFilterSearch(e.target.value)}
                placeholder="Search zone, lines, notes, quantity…"
                className={styles.filterInput}
              />
            </div>
            {filteredHarvestRecords.length === 0 ? (
              <p className={styles.harvestEmpty}>
                {harvestRecords.length === 0 ? 'No harvest inventory yet. Add them from Record Production (Harvest Record form).' : 'No records match the filter.'}
              </p>
            ) : (
              <div className={styles.harvestTableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Zone</th>
                      <th>Lines / Area</th>
                      <th>Date &amp; time</th>
                      <th>Quantity</th>
                      <th>Unit</th>
                      <th>Comment</th>
                      <th>Photo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHarvestRecords.map((r) => (
                      <tr key={r.id}>
                        <td>{r.zone || r.zoneId || '—'}</td>
                        <td>{r.linesArea || r.lines || '—'}</td>
                        <td>{r.dateTime ? new Date(r.dateTime).toLocaleString() : (r.createdAt ? new Date(r.createdAt).toLocaleString() : '—')}</td>
                        <td>{r.quantity != null ? r.quantity : '—'}</td>
                        <td>{r.unit || '—'}</td>
                        <td className={styles.cellNotes}>{r.notes || '—'}</td>
                        <td>
                          {r.imageData ? (
                            <button type="button" className={styles.photoThumb} onClick={() => setViewHarvestImage(r.imageData)}>
                              <img src={r.imageData} alt="" />
                            </button>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {/* Manage Equipment section moved to Log Fault page */}

      {/* Update quantity modal (set to / adjust by) */}
      {updateModal && (
        <div className={styles.modalOverlay} onClick={() => setUpdateModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Update quantity – {updateModal.name}</h3>
            <p className={styles.modalHint}>Current: {updateModal.quantity} {updateModal.unit}</p>
            <form onSubmit={handleUpdateQuantity} className={styles.modalForm}>
              <div className={styles.formRow}>
                <label>
                  <input type="radio" name="qtyMode" checked={qtyMode === 'set'} onChange={() => { setQtyMode('set'); setQtyValue(String(updateModal.quantity ?? 0)); }} />
                  {' '}Set to
                </label>
                <input
                  type="number"
                  min={0}
                  value={qtyMode === 'set' ? qtyValue : ''}
                  onChange={(e) => qtyMode === 'set' && setQtyValue(e.target.value)}
                  placeholder={String(updateModal.quantity ?? 0)}
                  className={styles.input}
                  disabled={qtyMode !== 'set'}
                />
              </div>
              <div className={styles.formRow}>
                <label>
                  <input type="radio" name="qtyMode" checked={qtyMode === 'adjust'} onChange={() => { setQtyMode('adjust'); setQtyValue(''); }} />
                  {' '}Adjust by (+/-)
                </label>
                <input
                  type="number"
                  value={qtyMode === 'adjust' ? qtyValue : ''}
                  onChange={(e) => qtyMode === 'adjust' && setQtyValue(e.target.value)}
                  placeholder="e.g. 10 or -5"
                  className={styles.input}
                  disabled={qtyMode !== 'adjust'}
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => setUpdateModal(null)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit item details modal */}
      {editItem && (
        <div className={styles.modalOverlay} onClick={() => setEditItem(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Edit item – {editItem.name}</h3>
            <form onSubmit={handleSaveEdit} className={styles.modalForm}>
              <div className={styles.formRow}>
                <label>Item name</label>
                <input
                  type="text"
                  value={editItem.name}
                  onChange={(e) => setEditItem((prev) => ({ ...prev, name: e.target.value }))}
                  required
                  className={styles.input}
                />
              </div>
              <div className={styles.formRow}>
                <label>Category</label>
                <select
                  value={editItem.category}
                  onChange={(e) => setEditItem((prev) => ({ ...prev, category: e.target.value, customCategory: e.target.value === 'other' ? prev.customCategory : '' }))}
                  className={styles.input}
                >
                  {INVENTORY_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              {editItem.category === 'other' && (
                <div className={styles.formRow}>
                  <label>Custom category name</label>
                  <input
                    type="text"
                    value={editItem.customCategory || ''}
                    onChange={(e) => setEditItem((prev) => ({ ...prev, customCategory: e.target.value }))}
                    placeholder="e.g. Chemicals, Spare parts"
                    className={styles.input}
                  />
                </div>
              )}
              <div className={styles.formRow}>
                <label>Quantity</label>
                <input
                  type="number"
                  min={0}
                  value={editItem.quantity}
                  onChange={(e) => setEditItem((prev) => ({ ...prev, quantity: Number(e.target.value) >= 0 ? Number(e.target.value) : 0 }))}
                  className={styles.input}
                />
              </div>
              <div className={styles.formRow}>
                <label>Unit</label>
                <input
                  type="text"
                  value={editItem.unit || ''}
                  onChange={(e) => setEditItem((prev) => ({ ...prev, unit: e.target.value }))}
                  className={styles.input}
                />
              </div>
              <div className={styles.formRow}>
                <label>Min quantity (critical)</label>
                <input
                  type="number"
                  min={0}
                  value={editItem.minQty}
                  onChange={(e) => setEditItem((prev) => ({ ...prev, minQty: Number(e.target.value) >= 0 ? Number(e.target.value) : 0 }))}
                  className={styles.input}
                />
              </div>
              <div className={styles.formRow}>
                <label>Warning level</label>
                <input
                  type="number"
                  min={0}
                  value={editItem.warningQty}
                  onChange={(e) => setEditItem((prev) => ({ ...prev, warningQty: Number(e.target.value) >= 0 ? Number(e.target.value) : 0 }))}
                  className={styles.input}
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => setEditItem(null)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add item modal */}
      {addItemOpen && (
        <div className={styles.modalOverlay} onClick={() => setAddItemOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Add item</h3>
            <form onSubmit={handleAddItem} className={styles.modalForm}>
              <div className={styles.formRow}>
                <label>Item name</label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) => setNewItem((n) => ({ ...n, name: e.target.value }))}
                  required
                  className={styles.input}
                />
              </div>
              <div className={styles.formRow}>
                <label>Category</label>
                <select value={newItem.category} onChange={(e) => setNewItem((n) => ({ ...n, category: e.target.value, customCategory: e.target.value === 'other' ? n.customCategory : '' }))} className={styles.input}>
                  {INVENTORY_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              {newItem.category === 'other' && (
                <div className={styles.formRow}>
                  <label>Custom category name</label>
                  <input
                    type="text"
                    value={newItem.customCategory}
                    onChange={(e) => setNewItem((n) => ({ ...n, customCategory: e.target.value }))}
                    placeholder="e.g. Chemicals, Spare parts"
                    className={styles.input}
                  />
                </div>
              )}
              <div className={styles.formRow}>
                <label>Quantity</label>
                <input type="number" min={0} value={newItem.quantity} onChange={(e) => setNewItem((n) => ({ ...n, quantity: Number(e.target.value) || 0 }))} className={styles.input} />
              </div>
              <div className={styles.formRow}>
                <label>Unit</label>
                <input type="text" value={newItem.unit} onChange={(e) => setNewItem((n) => ({ ...n, unit: e.target.value }))} className={styles.input} />
              </div>
              <div className={styles.formRow}>
                <label>Min quantity (critical)</label>
                <input type="number" min={0} value={newItem.minQty} onChange={(e) => setNewItem((n) => ({ ...n, minQty: Number(e.target.value) || 0 }))} className={styles.input} />
              </div>
              <div className={styles.formRow}>
                <label>Warning level</label>
                <input type="number" min={0} value={newItem.warningQty} onChange={(e) => setNewItem((n) => ({ ...n, warningQty: Number(e.target.value) || 0 }))} className={styles.input} />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => setAddItemOpen(false)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Add item</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewHarvestImage && (
        <div className={styles.imageOverlay} onClick={() => setViewHarvestImage(null)} role="dialog" aria-modal="true">
          <img src={viewHarvestImage} alt="" className={styles.imageOverlayImg} onClick={(e) => e.stopPropagation()} />
          <button type="button" className={styles.imageOverlayClose} onClick={() => setViewHarvestImage(null)} aria-label="Close">×</button>
        </div>
      )}
    </div>
  )
}

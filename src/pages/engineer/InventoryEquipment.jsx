import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  INVENTORY_CATEGORIES,
  INVENTORY_STATUS,
  INVENTORY_MOVEMENT_REASON,
  getInventoryStatus,
} from '../../data/inventory'
import { FAULT_TYPE_PREVENTIVE_ALERT, FAULT_STATUS_OPEN } from '../../data/faults'
import { getInitialZones } from '../../data/workerFlow'
import { useAppStore } from '../../context/AppStoreContext'
import { nextMovementId, nextInventoryItemId, nextFaultId } from '../../utils/idGenerators'
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
  const { inventory, inventoryMovements, equipment, updateInventoryItem, addInventoryItem, removeInventoryItem, addInventoryMovement, faults, maintenancePlans, addFault, updateFault, zones: storeZones } = useAppStore()
  const zonesList = (storeZones && storeZones.length > 0) ? storeZones : getInitialZones()
  const [inventoryOpen, setInventoryOpen] = useState(true)
  const [updateModal, setUpdateModal] = useState(null)
  const [qtyMode, setQtyMode] = useState('set')
  const [qtyValue, setQtyValue] = useState('')
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', category: 'supplies', customCategory: '', quantity: 0, unit: 'units', minQty: 0, warningQty: 10 })
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [editItem, setEditItem] = useState(null)
  const [historyModalItem, setHistoryModalItem] = useState(null)
  const [updateReason, setUpdateReason] = useState(INVENTORY_MOVEMENT_REASON.MANUAL_UPDATE)
  const [openActionsId, setOpenActionsId] = useState(null)
  const [dropdownAnchor, setDropdownAnchor] = useState(null)
  const [filterNeedsRefillOnly, setFilterNeedsRefillOnly] = useState(false)
  const [filterUpdatedLast7Days, setFilterUpdatedLast7Days] = useState(false)
  const [movementPeriod, setMovementPeriod] = useState('week') // 'week' | 'month'
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
    if (filterNeedsRefillOnly) list = list.filter((i) => i.status === INVENTORY_STATUS.CRITICAL || i.status === INVENTORY_STATUS.LOW)
    if (filterUpdatedLast7Days) {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
      list = list.filter((i) => new Date(i.lastUpdated || 0).getTime() >= cutoff)
    }
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
  }, [inventoryWithStatus, filterCategory, filterStatus, filterSearch, filterNeedsRefillOnly, filterUpdatedLast7Days])

  function openQuantityModal(item) {
    setUpdateModal(item)
    setQtyMode('set')
    setQtyValue(String(item.quantity ?? 0))
    setUpdateReason(INVENTORY_MOVEMENT_REASON.MANUAL_UPDATE)
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
    if (newQty !== current) {
      const delta = newQty - current
      addInventoryMovement({
        id: nextMovementId(inventoryMovements),
        itemId: updateModal.id,
        old_quantity: current,
        new_quantity: newQty,
        change_amount: delta,
        reason: updateReason,
        created_at: new Date().toISOString(),
        movementType: delta > 0 ? 'updated' : 'decreased', // updated = زودت كمية لصنف موجود، decreased = سحبت منه
      })
    }
    updateInventoryItem(updateModal.id, { quantity: newQty })
    setUpdateModal(null)
    setQtyValue('')
    setUpdateReason(INVENTORY_MOVEMENT_REASON.MANUAL_UPDATE)
  }

  function handleAddItem(e) {
    e.preventDefault()
    if (!newItem.name.trim()) return
    const category = newItem.category === 'other' ? 'other' : newItem.category
    const customCategory = newItem.category === 'other' ? (newItem.customCategory || '').trim() || undefined : undefined
    const itemId = nextInventoryItemId(inventory)
    const initialQty = Number(newItem.quantity) || 0
    addInventoryItem({
      id: itemId,
      name: newItem.name.trim(),
      category,
      ...(customCategory != null && customCategory !== '' && { customCategory }),
      quantity: initialQty,
      unit: newItem.unit,
      minQty: Number(newItem.minQty) || 0,
      warningQty: Number(newItem.warningQty) || 0,
      lastUpdated: new Date().toISOString(),
    })
    addInventoryMovement({
      id: nextMovementId(inventoryMovements),
      itemId,
      old_quantity: 0,
      new_quantity: initialQty,
      change_amount: initialQty,
      reason: INVENTORY_MOVEMENT_REASON.ITEM_ADDED,
      created_at: new Date().toISOString(),
      movementType: 'added', // صنف جديد فقط
    })
    setNewItem({ name: '', category: 'supplies', customCategory: '', quantity: 0, unit: 'units', minQty: 0, warningQty: 10 })
    setAddItemOpen(false)
  }

  function handleDeleteItem(item) {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    removeInventoryItem(item.id)
  }

  const categoryLabel = (i) => (i.category === 'other' && (i.customCategory || '')) ? i.customCategory : (CAT_LABELS[i.category] ?? i.category)

  function exportInventoryPDF() {
    const dateStr = new Date().toISOString().slice(0, 10)
    const generatedAt = new Date().toLocaleString()
    const filterLines = [
      `Category: ${filterCategory ? (CAT_LABELS[filterCategory] || filterCategory) : 'All'}`,
      `Status: ${filterStatus ? (STATUS_LABELS[filterStatus] || filterStatus) : 'All'}`,
      `Search: ${filterSearch.trim() || '—'}`,
    ]
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
  <title>Inventory Report – ${dateStr}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; color: #1e293b; }
    h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
    .report-meta { color: #64748b; font-size: 0.9rem; margin-bottom: 0.5rem; }
    .report-filters { font-size: 0.85rem; color: #475569; margin-bottom: 1rem; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .report-filters p { margin: 0.25rem 0; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.5rem; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; }
    tr:nth-child(even) { background: #f8fafc; }
    .report-footer { margin-top: 1rem; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 0.9rem; color: #64748b; }
    .print-hint { margin-top: 1rem; font-size: 0.8rem; color: #94a3b8; }
  </style>
</head>
<body>
  <h1>Inventory Report</h1>
  <p class="report-meta">Generated at: ${escapeHtml(generatedAt)}</p>
  <div class="report-filters">
    <p><strong>Filters applied:</strong></p>
    <p>${escapeHtml(filterLines.join(' · '))}</p>
  </div>
  <table>
    <thead><tr><th>Item name</th><th>Category</th><th>Quantity</th><th>Unit</th><th>Status</th><th>Last updated</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="report-footer">Total items exported: ${filteredInventory.length}</p>
  <p class="print-hint">Use the browser print dialog and choose &quot;Save as PDF&quot; to save as PDF.</p>
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

  const recentlyUpdatedCount = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    return inventoryWithStatus.filter((i) => new Date(i.lastUpdated || 0).getTime() >= cutoff).length
  }, [inventoryWithStatus])

  const categoryCounts = useMemo(() => {
    const counts = {}
    INVENTORY_CATEGORIES.forEach((c) => { counts[c.id] = 0 })
    const knownIds = new Set(INVENTORY_CATEGORIES.map((c) => c.id))
    inventoryWithStatus.forEach((i) => {
      const raw = i.category || 'other'
      const cat = knownIds.has(raw) ? raw : 'other'
      counts[cat] = (counts[cat] || 0) + 1
    })
    return counts
  }, [inventoryWithStatus])

  /** Stock movement in selected period (this week / this month). Uses inventoryMovements for all inventory items. */
  const stockMovementStats = useMemo(() => {
    const now = new Date()
    let cutoffMs = 0
    if (movementPeriod === 'week') {
      const startOfWeek = new Date(now)
      startOfWeek.setDate(now.getDate() - now.getDay())
      startOfWeek.setHours(0, 0, 0, 0)
      cutoffMs = startOfWeek.getTime()
    } else if (movementPeriod === 'month') {
      cutoffMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    }
    const allItemIds = new Set(inventoryWithStatus.map((i) => i.id))
    const movements = (inventoryMovements || []).filter(
      (m) =>
        allItemIds.has(m.itemId) &&
        new Date(m.created_at || 0).getTime() >= cutoffMs
    )
    let added = 0
    let updated = 0
    let decreased = 0
    movements.forEach((m) => {
      const type = m.movementType
      const oldQty = Number(m.old_quantity) || 0
      const newQty = Number(m.new_quantity) || 0
      const delta = m.change_amount ?? (newQty - oldQty)
      if (type === 'added' || (type == null && oldQty === 0)) {
        added += 1
      } else if (type === 'updated' || (type == null && delta > 0 && oldQty > 0)) {
        updated += 1
      } else if (type === 'decreased' || (type == null && delta < 0)) {
        decreased += 1
      }
    })
    if (added + updated + decreased > 0) {
      return { added, updated, decreased, hasMovement: true }
    }
    const fallbackUpdated = inventoryWithStatus.filter(
      (i) => new Date(i.lastUpdated || 0).getTime() >= cutoffMs
    ).length
    return {
      added: 0,
      updated: fallbackUpdated,
      decreased: 0,
      hasMovement: fallbackUpdated > 0,
    }
  }, [inventoryWithStatus, inventoryMovements, movementPeriod])

  function clearSummaryFilters() {
    setFilterCategory('')
    setFilterStatus('')
    setFilterSearch('')
    setFilterNeedsRefillOnly(false)
    setFilterUpdatedLast7Days(false)
  }

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
    if (!openActionsId) return
    const onDocClick = (ev) => {
      if (ev.target.closest('[data-actions-wrap]') || ev.target.closest('[data-actions-menu]')) return
      setOpenActionsId(null)
      setDropdownAnchor(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [openActionsId])

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
        id: nextFaultId(faults),
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
          <button type="button" className={`${styles.summaryCard} ${styles.summaryCardStock} ${filterNeedsRefillOnly ? styles.summaryCardActive : ''}`} onClick={() => { setFilterNeedsRefillOnly(true); setFilterUpdatedLast7Days(false); setFilterCategory(''); setFilterStatus(''); setInventoryOpen(true); }}>
            <span className={styles.summaryCardLabel}>Stock Health</span>
            <div className={styles.summaryCardBody}>
              <div className={styles.summaryRow}><span className={styles.stockCritical}>Critical</span><strong>{summaryCounts.critical}</strong></div>
              <div className={styles.summaryRow}><span className={styles.stockLow}>Low</span><strong>{summaryCounts.low}</strong></div>
              <div className={styles.summaryRow}><span className={styles.stockRefill}>Needs refill</span><strong>{summaryCounts.needsRefill}</strong></div>
            </div>
          </button>
          <div className={`${styles.summaryCard} ${styles.summaryCardTotalUpdated} ${!filterNeedsRefillOnly && !filterUpdatedLast7Days && !filterCategory && !filterStatus && !filterSearch.trim() ? styles.summaryCardActive : ''} ${filterUpdatedLast7Days ? styles.summaryCardActiveUpdated : ''}`}>
            <span className={styles.summaryCardLabel}>Items</span>
            <div className={styles.summaryCardBody}>
              <button type="button" className={styles.summaryRowBtn} onClick={() => { clearSummaryFilters(); setInventoryOpen(true); }} title="Show all items">
                <span>Total</span><strong>{summaryCounts.total}</strong>
              </button>
              <button type="button" className={styles.summaryRowBtn} onClick={() => { setFilterUpdatedLast7Days(true); setFilterNeedsRefillOnly(false); setFilterCategory(''); setFilterStatus(''); setInventoryOpen(true); }} title="Filter by last 7 days">
                <span>Updated (7d)</span><strong>{recentlyUpdatedCount}</strong>
              </button>
            </div>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryCardCategory}`}>
            <span className={styles.summaryCardLabel}>By Category</span>
            <div className={styles.summaryCardBody}>
              <div className={styles.summaryCategoryGrid}>
                {INVENTORY_CATEGORIES.map((c) => (
                  <button type="button" key={c.id} className={styles.summaryCategoryChip} onClick={() => { setFilterCategory(c.id); setFilterNeedsRefillOnly(false); setFilterUpdatedLast7Days(false); setFilterStatus(''); setInventoryOpen(true); }} title={`Filter by ${c.label}`}>
                    <span className={styles.summaryCategoryName}>{c.label}</span>
                    <span className={styles.summaryCategoryCount}>{categoryCounts[c.id] ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryCardMovement}`}>
            <span className={styles.summaryCardLabel}>Stock Movement</span>
            <div className={styles.summaryCardBody} onClick={(e) => e.stopPropagation()}>
              <div className={styles.summaryHarvestHead}>
                <select
                  value={movementPeriod}
                  onChange={(e) => setMovementPeriod(e.target.value)}
                  className={styles.summaryHarvestSelect}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Period"
                >
                  <option value="week">This week</option>
                  <option value="month">This month</option>
                </select>
              </div>
              {stockMovementStats.hasMovement ? (
                <>
                  <div className={`${styles.summaryRow} ${styles.summaryRowAdded}`}>
                    <span>Added</span>
                    <strong>{stockMovementStats.added}</strong>
                  </div>
                  <div className={`${styles.summaryRow} ${styles.summaryRowUpdated}`}>
                    <span>Updated</span>
                    <strong>{stockMovementStats.updated}</strong>
                  </div>
                  <div className={`${styles.summaryRow} ${styles.summaryRowDecreased}`}>
                    <span>Decreased</span>
                    <strong>{stockMovementStats.decreased}</strong>
                  </div>
                </>
              ) : (
                <div className={styles.summaryRowSub}>
                  No stock movement in the selected period.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

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
              <div className={styles.filtersBarActions}>
                <button type="button" className={styles.btnPrimary} onClick={() => setAddItemOpen(true)}>
                  Add item
                </button>
              </div>
              <div className={styles.filtersBarExport}>
                <button type="button" className={styles.btnSecondary} onClick={exportInventoryPDF} disabled={filteredInventory.length === 0}>
                  <i className="fas fa-file-pdf fa-fw" /> Export PDF
                </button>
              </div>
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
                        <div className={styles.actionsWrap} data-actions-wrap>
                          <button
                            type="button"
                            className={styles.actionsBtn}
                            onClick={(ev) => {
                              if (openActionsId === i.id) {
                                setOpenActionsId(null)
                                setDropdownAnchor(null)
                              } else {
                                const rect = ev.currentTarget.getBoundingClientRect()
                                setOpenActionsId(i.id)
                                setDropdownAnchor({ top: rect.bottom + 2, left: rect.left })
                              }
                            }}
                            aria-expanded={openActionsId === i.id}
                            aria-haspopup="true"
                          >
                            Actions <span className={styles.actionsCaret}>{openActionsId === i.id ? '▲' : '▼'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {openActionsId && dropdownAnchor && (() => {
        const openItem = filteredInventory.find((it) => it.id === openActionsId)
        if (!openItem) return null
        const closeMenu = () => { setOpenActionsId(null); setDropdownAnchor(null) }
        return createPortal(
          <div
            className={styles.actionsDropdown}
            data-actions-menu
            style={{
              position: 'fixed',
              top: dropdownAnchor.top,
              left: dropdownAnchor.left,
              zIndex: 9999,
            }}
          >
            <button type="button" className={styles.actionsItem} onClick={() => { openQuantityModal(openItem); closeMenu(); }}>Update quantity</button>
            <button type="button" className={styles.actionsItem} onClick={() => { setEditItem({ ...openItem, customCategory: openItem.customCategory || '' }); closeMenu(); }}>Edit</button>
            <button type="button" className={styles.actionsItem} onClick={() => { setHistoryModalItem(openItem); closeMenu(); }}>View History</button>
            <button type="button" className={`${styles.actionsItem} ${styles.actionsItemDanger}`} onClick={() => { handleDeleteItem(openItem); closeMenu(); }}>Delete</button>
          </div>,
          document.body
        )
      })()}

      {/* Harvest Log moved to Record Production page */}

      {/* Manage Equipment section moved to Log Fault page */}

      {/* Update quantity modal (set to / adjust by) */}
      {updateModal && (
        <div className={styles.modalOverlay} onClick={() => { setUpdateModal(null); setUpdateReason(INVENTORY_MOVEMENT_REASON.MANUAL_UPDATE); }}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Update quantity – {updateModal.name}</h3>
            <p className={styles.modalHint}>Current: {updateModal.quantity} {updateModal.unit}</p>
            <form onSubmit={handleUpdateQuantity} className={styles.modalForm}>
              <div className={styles.formRow}>
                <label>
                  <input type="radio" name="qtyMode" checked={qtyMode === 'set'} onChange={() => { setQtyMode('set'); setQtyValue(String(updateModal.quantity ?? 0)); setUpdateReason(INVENTORY_MOVEMENT_REASON.MANUAL_UPDATE); }} />
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
                <div className={styles.quickAddWrap}>
                  <span className={styles.quickAddLabel}>Quick add:</span>
                  {[100, 250, 500].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      className={styles.quickAddBtn}
                      onClick={() => {
                        const base = qtyMode === 'set' ? (Number(qtyValue) || 0) : (Number(updateModal.quantity) || 0)
                        const newVal = Math.max(0, base + inc)
                        setQtyMode('set')
                        setQtyValue(String(newVal))
                      }}
                    >
                      +{inc}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.formRow}>
                <label>
                  <input type="radio" name="qtyMode" checked={qtyMode === 'adjust'} onChange={() => { setQtyMode('adjust'); setQtyValue(''); setUpdateReason(INVENTORY_MOVEMENT_REASON.MANUAL_UPDATE); }} />
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
                <button type="button" className={styles.btnSecondary} onClick={() => { setUpdateModal(null); setUpdateReason(INVENTORY_MOVEMENT_REASON.MANUAL_UPDATE); }}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Update quantity</button>
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

      {/* Stock History modal */}
      {historyModalItem && (
        <div className={styles.modalOverlay} onClick={() => setHistoryModalItem(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <h3 className={styles.modalTitle}>Stock History – {historyModalItem.name}</h3>
            <div className={styles.historyTableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Old Qty</th>
                    <th>New Qty</th>
                    <th>Change</th>
                    <th>Reason</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {(inventoryMovements || [])
                    .filter((m) => m.itemId === historyModalItem.id)
                    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
                    .map((m) => (
                      <tr key={m.id}>
                        <td>{m.created_at ? new Date(m.created_at).toLocaleString() : '—'}</td>
                        <td>{m.old_quantity}</td>
                        <td>{m.new_quantity}</td>
                        <td>{m.change_amount >= 0 ? `+${m.change_amount}` : m.change_amount}</td>
                        <td>{m.reason || '—'}</td>
                        <td>{m.changed_by || '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {(inventoryMovements || []).filter((m) => m.itemId === historyModalItem.id).length === 0 && (
              <p className={styles.modalHint}>No quantity changes recorded yet.</p>
            )}
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setHistoryModalItem(null)}>Close</button>
            </div>
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

    </div>
  )
}

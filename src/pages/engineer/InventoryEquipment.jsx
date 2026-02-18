import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  INVENTORY_CATEGORIES,
  INVENTORY_STATUS,
  getInventoryStatus,
  EQUIPMENT_STATUS,
  EQUIPMENT_STATUS_LABELS,
} from '../../data/inventory'
import { getInitialZones } from '../../data/workerFlow'
import { useAppStore } from '../../context/AppStoreContext'
import styles from './InventoryEquipment.module.css'

const CAT_LABELS = Object.fromEntries(INVENTORY_CATEGORIES.map((c) => [c.id, c.label]))
const STATUS_LABELS = { [INVENTORY_STATUS.NORMAL]: 'Normal', [INVENTORY_STATUS.LOW]: 'Low', [INVENTORY_STATUS.CRITICAL]: 'Critical' }

export default function InventoryEquipment() {
  const navigate = useNavigate()
  const { inventory, equipment, updateInventoryItem, addInventoryItem, records, zones: storeZones } = useAppStore()
  const zonesList = (storeZones && storeZones.length > 0) ? storeZones : getInitialZones()
  const [inventoryOpen, setInventoryOpen] = useState(true)
  const [equipmentOpen, setEquipmentOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [harvestOpen, setHarvestOpen] = useState(true)
  const [harvestFilterZone, setHarvestFilterZone] = useState('')
  const [harvestFilterSearch, setHarvestFilterSearch] = useState('')
  const [harvestFilterPeriod, setHarvestFilterPeriod] = useState('all')
  const [harvestDateFrom, setHarvestDateFrom] = useState('')
  const [harvestDateTo, setHarvestDateTo] = useState('')
  const [viewHarvestImage, setViewHarvestImage] = useState(null)
  const [updateModal, setUpdateModal] = useState(null)
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [adjustModal, setAdjustModal] = useState(null)
  const [newItem, setNewItem] = useState({ name: '', category: 'supplies', quantity: 0, unit: 'units', minQty: 0, warningQty: 10 })
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustReason, setAdjustReason] = useState('')

  const inventoryWithStatus = useMemo(
    () => inventory.map((i) => ({ ...i, status: getInventoryStatus(i) })),
    [inventory]
  )

  function handleUpdateQty(itemId, newQty) {
    const q = Number(newQty)
    if (Number.isNaN(q) || q < 0) return
    updateInventoryItem(itemId, { quantity: q })
    setUpdateModal(null)
  }

  function handleAddItem(e) {
    e.preventDefault()
    if (!newItem.name.trim()) return
    addInventoryItem({
      id: `inv${Date.now()}`,
      name: newItem.name.trim(),
      category: newItem.category,
      quantity: Number(newItem.quantity) || 0,
      unit: newItem.unit,
      minQty: Number(newItem.minQty) || 0,
      warningQty: Number(newItem.warningQty) || 0,
      lastUpdated: new Date().toISOString(),
    })
    setNewItem({ name: '', category: 'supplies', quantity: 0, unit: 'units', minQty: 0, warningQty: 10 })
    setAddItemOpen(false)
  }

  function handleAdjustStock(itemId) {
    const item = inventory.find((i) => i.id === itemId)
    if (!item) return
    const newQty = item.quantity + Number(adjustQty)
    if (newQty < 0) return
    updateInventoryItem(itemId, { quantity: newQty })
    setAdjustModal(null)
    setAdjustQty(0)
    setAdjustReason('')
  }

  const lowCriticalCount = useMemo(
    () => inventoryWithStatus.filter((i) => i.status !== INVENTORY_STATUS.NORMAL).length,
    [inventoryWithStatus]
  )

  const analyticsByCategory = useMemo(() => {
    const map = Object.fromEntries(INVENTORY_CATEGORIES.map((c) => [c.id, 0]))
    inventoryWithStatus.forEach((i) => { if (map[i.category] !== undefined) map[i.category] += 1 })
    return INVENTORY_CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: map[c.id] || 0 }))
  }, [inventoryWithStatus])
  const analyticsByStatus = useMemo(() => {
    const map = { [INVENTORY_STATUS.NORMAL]: 0, [INVENTORY_STATUS.LOW]: 0, [INVENTORY_STATUS.CRITICAL]: 0 }
    inventoryWithStatus.forEach((i) => { if (map[i.status] !== undefined) map[i.status] += 1 })
    return [
      { id: INVENTORY_STATUS.NORMAL, label: 'Normal', count: map[INVENTORY_STATUS.NORMAL] },
      { id: INVENTORY_STATUS.LOW, label: 'Low', count: map[INVENTORY_STATUS.LOW] },
      { id: INVENTORY_STATUS.CRITICAL, label: 'Critical', count: map[INVENTORY_STATUS.CRITICAL] },
    ]
  }, [inventoryWithStatus])
  const maxCat = Math.max(1, ...analyticsByCategory.map((x) => x.count))
  const maxStatus = Math.max(1, ...analyticsByStatus.map((x) => x.count))

  const harvestRecords = useMemo(
    () =>
      (records || [])
        .filter((r) => r.source === 'harvest_form')
        .sort((a, b) => new Date(b.dateTime || b.createdAt || 0) - new Date(a.dateTime || a.createdAt || 0)),
    [records]
  )
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

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <button type="button" className={styles.sectionHeader} onClick={() => setInventoryOpen((o) => !o)}>
          <h2 className={styles.sectionTitle}><i className="fas fa-boxes-stacked fa-fw" /> Manage Inventory</h2>
          <span className={styles.expandLabel}>{inventoryOpen ? 'Collapse' : 'Expand'}</span>
          <span className={styles.chevron}>{inventoryOpen ? '▼' : '▶'}</span>
        </button>
        {inventoryOpen && (
          <>
            <div className={styles.toolbar}>
              <button type="button" className={styles.btnPrimary} onClick={() => setUpdateModal('bulk')}>
                Update quantity
              </button>
              <button type="button" className={styles.btnSecondary} onClick={() => setAddItemOpen(true)}>
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
                  {inventoryWithStatus.map((i) => (
                    <tr key={i.id}>
                      <td>{i.name}</td>
                      <td>{CAT_LABELS[i.category] ?? i.category}</td>
                      <td>{i.quantity}</td>
                      <td>{i.unit}</td>
                      <td>
                        <span className={styles.statusBadge} data-status={i.status}>
                          {STATUS_LABELS[i.status]}
                        </span>
                      </td>
                      <td>{new Date(i.lastUpdated).toLocaleString()}</td>
                      <td>
                        <button type="button" className={styles.actionLink} onClick={() => setUpdateModal(i)}>Update</button>
                        {' · '}
                        <button type="button" className={styles.actionLink} onClick={() => { setAdjustModal(i); setAdjustQty(0); setAdjustReason(''); }}>Adjust</button>
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
          <h2 className={styles.sectionTitle}><i className="fas fa-wheat-awn fa-fw" /> Harvest records</h2>
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
                {harvestRecords.length === 0 ? 'No harvest records yet. Add them from Record Production (Harvest Record form).' : 'No records match the filter.'}
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

      <section className={styles.section}>
        <button type="button" className={styles.sectionHeader} onClick={() => setEquipmentOpen((o) => !o)}>
          <h2 className={styles.sectionTitle}><i className="fas fa-wrench fa-fw" /> Manage Equipment</h2>
          <span className={styles.expandLabel}>{equipmentOpen ? 'Collapse' : 'Expand'}</span>
          <span className={styles.chevron}>{equipmentOpen ? '▼' : '▶'}</span>
        </button>
        {equipmentOpen && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Equipment name</th>
                  <th>Category</th>
                  <th>Assigned zone</th>
                  <th>Operational status</th>
                  <th>Last inspection</th>
                </tr>
              </thead>
              <tbody>
                {equipment.map((e) => (
                  <tr key={e.id}>
                    <td>{e.name}</td>
                    <td>{e.category}</td>
                    <td>{e.zone}</td>
                    <td>
                      <span className={styles.eqBadge} data-status={e.status}>
                        {EQUIPMENT_STATUS_LABELS[e.status]}
                      </span>
                    </td>
                    <td>{e.lastInspection}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <button type="button" className={styles.sectionHeader} onClick={() => setAlertsOpen((o) => !o)}>
          <h2 className={styles.sectionTitle}>Alerts &amp; thresholds</h2>
          {lowCriticalCount > 0 && <span className={styles.alertCount}>{lowCriticalCount} alert(s)</span>}
          <span className={styles.expandLabel}>{alertsOpen ? 'Collapse' : 'Expand'}</span>
          <span className={styles.chevron}>{alertsOpen ? '▼' : '▶'}</span>
        </button>
        {alertsOpen && (
          <div className={styles.alertsContent}>
            <p className={styles.alertIntro}>
              Thresholds are defined per item (minimum quantity, warning level, critical level). Alerts are shown when stock reaches these levels.
            </p>
            <ul className={styles.thresholdList}>
              {inventoryWithStatus.filter((i) => i.status !== INVENTORY_STATUS.NORMAL).length === 0 ? (
                <li className={styles.noAlerts}>No active alerts.</li>
              ) : (
                inventoryWithStatus
                  .filter((i) => i.status !== INVENTORY_STATUS.NORMAL)
                  .map((i) => (
                    <li key={i.id} className={styles.alertItem}>
                      <strong>{i.name}</strong>: {STATUS_LABELS[i.status]} (current: {i.quantity} {i.unit}, min: {i.minQty}, warning: {i.warningQty})
                    </li>
                  ))
              )}
            </ul>
          </div>
        )}
      </section>

      <section className={styles.analyticsSection}>
        <h2 className={styles.sectionTitle}><i className="fas fa-chart-column fa-fw" /> Analytics</h2>
        <div className={styles.chartsRow}>
          <div className={styles.chartWrap}>
            <div className={styles.chartCaption}>Items by category</div>
            <div className={styles.barChart}>
              {analyticsByCategory.map((row) => (
                <div key={row.id} className={styles.barRow}>
                  <span className={styles.barLabel}>{row.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(row.count / maxCat) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{row.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.chartWrap}>
            <div className={styles.chartCaption}>Items by status</div>
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
        <div className={styles.moreWrap}>
          <button type="button" className={styles.moreBtn} onClick={() => navigate('/engineer/reports')}>
            More Details
          </button>
        </div>
      </section>

      {/* Update quantity modal */}
      {updateModal && updateModal !== 'bulk' && (
        <div className={styles.modalOverlay} onClick={() => setUpdateModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Update quantity – {updateModal.name}</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const val = e.target.elements.qty.value
                handleUpdateQty(updateModal.id, val)
              }}
              className={styles.modalForm}
            >
              <label>New quantity</label>
              <input type="number" name="qty" min={0} defaultValue={updateModal.quantity} required className={styles.input} />
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => setUpdateModal(null)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {updateModal === 'bulk' && (
        <div className={styles.modalOverlay} onClick={() => setUpdateModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Update quantity</h3>
            <p className={styles.modalHint}>Select an item from the table and use &quot;Update&quot; to change its quantity.</p>
            <button type="button" className={styles.btnSecondary} onClick={() => setUpdateModal(null)}>Close</button>
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
                <select value={newItem.category} onChange={(e) => setNewItem((n) => ({ ...n, category: e.target.value }))} className={styles.input}>
                  {INVENTORY_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
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

      {/* Adjust stock modal */}
      {adjustModal && (
        <div className={styles.modalOverlay} onClick={() => setAdjustModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Adjust stock – {adjustModal.name}</h3>
            <p className={styles.modalHint}>Current: {adjustModal.quantity} {adjustModal.unit}. Enter +/- change.</p>
            <div className={styles.modalForm}>
              <div className={styles.formRow}>
                <label>Change (e.g. -5 or +10)</label>
                <input
                  type="number"
                  value={adjustQty || ''}
                  onChange={(e) => setAdjustQty(Number(e.target.value) || 0)}
                  placeholder="0"
                  className={styles.input}
                />
              </div>
              <div className={styles.formRow}>
                <label>Reason (optional)</label>
                <input type="text" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Reason for adjustment" className={styles.input} />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => setAdjustModal(null)}>Cancel</button>
                <button type="button" className={styles.btnPrimary} onClick={() => handleAdjustStock(adjustModal.id)}>
                  Apply
                </button>
              </div>
            </div>
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

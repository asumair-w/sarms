import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { EQUIPMENT_STATUS, EQUIPMENT_STATUS_LABELS } from '../../data/inventory'
import {
  FAULT_CATEGORIES,
  SEVERITY_OPTIONS,
  MAINTENANCE_TYPES,
} from '../../data/faults'
import { useAppStore } from '../../context/AppStoreContext'
import styles from './LogFaultMaintenance.module.css'

export default function LogFaultMaintenance() {
  const navigate = useNavigate()
  const { equipment, faults, maintenancePlans, addFault, addMaintenancePlan } = useAppStore()

  const analyticsByCategory = useMemo(() => {
    const map = Object.fromEntries(FAULT_CATEGORIES.map((c) => [c.id, 0]))
    faults.forEach((f) => { if (map[f.category] !== undefined) map[f.category] += 1 })
    return FAULT_CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: map[c.id] || 0 }))
  }, [faults])
  const analyticsBySeverity = useMemo(() => {
    const map = Object.fromEntries(SEVERITY_OPTIONS.map((s) => [s.id, 0]))
    faults.forEach((f) => { if (map[f.severity] !== undefined) map[f.severity] += 1 })
    return SEVERITY_OPTIONS.map((s) => ({ id: s.id, label: s.label, count: map[s.id] || 0 }))
  }, [faults])
  const analyticsByEquipment = useMemo(() => {
    const map = {}
    faults.forEach((f) => {
      const name = f.equipmentName || f.equipmentId || 'Unknown'
      map[name] = (map[name] || 0) + 1
    })
    return Object.entries(map).map(([name, count]) => ({ label: name, count })).sort((a, b) => b.count - a.count).slice(0, 6)
  }, [faults])
  const maxCategory = Math.max(1, ...analyticsByCategory.map((x) => x.count))
  const maxSeverity = Math.max(1, ...analyticsBySeverity.map((x) => x.count))
  const maxEquipment = Math.max(1, ...analyticsByEquipment.map((x) => x.count))
  const [logFaultOpen, setLogFaultOpen] = useState(false)
  const [planMaintenanceOpen, setPlanMaintenanceOpen] = useState(false)
  const [selectedEquipment, setSelectedEquipment] = useState(null)
  const [faultForm, setFaultForm] = useState({
    category: 'mechanical',
    severity: 'medium',
    stopWork: false,
    description: '',
  })
  const [maintenanceForm, setMaintenanceForm] = useState({
    plannedDate: new Date().toISOString().slice(0, 10),
    type: 'preventive',
    notes: '',
  })

  function openLogFault(eq) {
    setSelectedEquipment(eq)
    setFaultForm({ category: 'mechanical', severity: 'medium', stopWork: false, description: '' })
    setLogFaultOpen(true)
  }

  function openPlanMaintenance(eq) {
    setSelectedEquipment(eq)
    setMaintenanceForm({
      plannedDate: new Date().toISOString().slice(0, 10),
      type: 'preventive',
      notes: '',
    })
    setPlanMaintenanceOpen(true)
  }

  function submitFault(e) {
    e.preventDefault()
    if (!selectedEquipment || !faultForm.description.trim()) return
    const fault = {
      id: `F${Date.now()}`,
      equipmentId: selectedEquipment.id,
      equipmentName: selectedEquipment.name,
      category: faultForm.category,
      severity: faultForm.severity,
      stopWork: faultForm.stopWork,
      description: faultForm.description.trim(),
      createdAt: new Date().toISOString(),
    }
    addFault(fault)
    setLogFaultOpen(false)
    setSelectedEquipment(null)
  }

  function submitMaintenance(e) {
    e.preventDefault()
    if (!selectedEquipment) return
    const plan = {
      id: `MP${Date.now()}`,
      equipmentId: selectedEquipment.id,
      equipmentName: selectedEquipment.name,
      plannedDate: maintenanceForm.plannedDate,
      type: maintenanceForm.type,
      notes: maintenanceForm.notes.trim(),
      createdAt: new Date().toISOString(),
    }
    addMaintenancePlan(plan)
    setPlanMaintenanceOpen(false)
    setSelectedEquipment(null)
  }

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><i className="fas fa-list fa-fw" /> Equipment list &amp; status</h2>
        <div className={styles.equipmentList}>
          {equipment.map((eq) => (
            <div key={eq.id} className={styles.equipmentCard} data-status={eq.status}>
              <div className={styles.eqInfo}>
                <span className={styles.eqName}>{eq.name}</span>
                <span className={styles.eqId}>ID: {eq.id}</span>
                <span className={styles.eqZone}>{eq.zone} · {eq.category}</span>
                <span className={styles.eqStatus}>{EQUIPMENT_STATUS_LABELS[eq.status]}</span>
              </div>
              <div className={styles.eqActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => openLogFault(eq)}>
                  Log fault
                </button>
                <button type="button" className={styles.btnSecondary} onClick={() => openPlanMaintenance(eq)}>
                  Plan maintenance
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><i className="fas fa-triangle-exclamation fa-fw" /> Log fault panel</h2>
        <p className={styles.hint}>Select &quot;Log fault&quot; on an equipment item above to open the fault form.</p>
      </section>

      <section className={styles.analyticsSection}>
        <h2 className={styles.sectionTitle}>Analytics</h2>
        <div className={styles.chartsRow}>
          <div className={styles.chartWrap}>
            <div className={styles.chartCaption}>Faults by category</div>
            <div className={styles.barChart}>
              {analyticsByCategory.map((row) => (
                <div key={row.id} className={styles.barRow}>
                  <span className={styles.barLabel}>{row.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(row.count / maxCategory) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{row.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.chartWrap}>
            <div className={styles.chartCaption}>Faults by severity</div>
            <div className={styles.barChart}>
              {analyticsBySeverity.map((row) => (
                <div key={row.id} className={styles.barRow}>
                  <span className={styles.barLabel}>{row.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(row.count / maxSeverity) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{row.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.chartWrap}>
            <div className={styles.chartCaption}>Faults by equipment</div>
            <div className={styles.barChart}>
              {analyticsByEquipment.map((row, i) => (
                <div key={i} className={styles.barRow}>
                  <span className={styles.barLabel}>{row.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(row.count / maxEquipment) * 100}%` }} />
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

      {/* Log Fault modal */}
      {logFaultOpen && selectedEquipment && (
        <div className={styles.modalOverlay} onClick={() => setLogFaultOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Log fault – {selectedEquipment.name}</h3>
            <form onSubmit={submitFault} className={styles.form}>
              <div className={styles.formRow}>
                <label>Fault category</label>
                <select
                  value={faultForm.category}
                  onChange={(e) => setFaultForm((f) => ({ ...f, category: e.target.value }))}
                  className={styles.input}
                >
                  {FAULT_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formRow}>
                <label>Severity level</label>
                <select
                  value={faultForm.severity}
                  onChange={(e) => setFaultForm((f) => ({ ...f, severity: e.target.value }))}
                  className={styles.input}
                >
                  {SEVERITY_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formRow}>
                <label>Stop work?</label>
                <select
                  value={faultForm.stopWork ? 'yes' : 'no'}
                  onChange={(e) => setFaultForm((f) => ({ ...f, stopWork: e.target.value === 'yes' }))}
                  className={styles.input}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
              <div className={styles.formRow}>
                <label>Description</label>
                <textarea
                  value={faultForm.description}
                  onChange={(e) => setFaultForm((f) => ({ ...f, description: e.target.value }))}
                  required
                  rows={4}
                  placeholder="Describe the fault..."
                  className={styles.textarea}
                />
              </div>
              <div className={styles.formRow}>
                <label className={styles.optionalLabel}>Upload photo (optional)</label>
                <input type="file" accept="image/*" className={styles.input} />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => setLogFaultOpen(false)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Create fault</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Plan Maintenance modal */}
      {planMaintenanceOpen && selectedEquipment && (
        <div className={styles.modalOverlay} onClick={() => setPlanMaintenanceOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Plan maintenance – {selectedEquipment.name}</h3>
            <form onSubmit={submitMaintenance} className={styles.form}>
              <div className={styles.formRow}>
                <label>Planned date</label>
                <input
                  type="date"
                  value={maintenanceForm.plannedDate}
                  onChange={(e) => setMaintenanceForm((f) => ({ ...f, plannedDate: e.target.value }))}
                  required
                  className={styles.input}
                />
              </div>
              <div className={styles.formRow}>
                <label>Maintenance type</label>
                <select
                  value={maintenanceForm.type}
                  onChange={(e) => setMaintenanceForm((f) => ({ ...f, type: e.target.value }))}
                  className={styles.input}
                >
                  {MAINTENANCE_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formRow}>
                <label>Notes / instructions</label>
                <textarea
                  value={maintenanceForm.notes}
                  onChange={(e) => setMaintenanceForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder="Notes or instructions..."
                  className={styles.textarea}
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => setPlanMaintenanceOpen(false)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary}>Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(faults.length > 0 || maintenancePlans.length > 0) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}><i className="fas fa-clock-rotate-left fa-fw" /> Recent faults &amp; plans</h2>
          {faults.length > 0 && (
            <div className={styles.tableWrap}>
              <h3 className={styles.subTitle}>Faults</h3>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Equipment</th>
                    <th>Category</th>
                    <th>Severity</th>
                    <th>Stop work</th>
                    <th>Description</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {faults.map((f) => (
                    <tr key={f.id}>
                      <td>{f.equipmentName}</td>
                      <td>{FAULT_CATEGORIES.find((c) => c.id === f.category)?.label ?? f.category}</td>
                      <td>{SEVERITY_OPTIONS.find((s) => s.id === f.severity)?.label ?? f.severity}</td>
                      <td>{f.stopWork ? 'Yes' : 'No'}</td>
                      <td>{f.description}</td>
                      <td>{new Date(f.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {maintenancePlans.length > 0 && (
            <div className={styles.tableWrap}>
              <h3 className={styles.subTitle}>Maintenance plans</h3>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Equipment</th>
                    <th>Planned date</th>
                    <th>Type</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenancePlans.map((p) => (
                    <tr key={p.id}>
                      <td>{p.equipmentName}</td>
                      <td>{p.plannedDate}</td>
                      <td>{MAINTENANCE_TYPES.find((t) => t.id === p.type)?.label ?? p.type}</td>
                      <td>{p.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

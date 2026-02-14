import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { RECORD_TYPES, UNITS } from '../../data/recordEvent'
import { SEED_WORKERS } from '../../data/engineerWorkers'
import {
  DEPARTMENTS,
  INVENTORY_DEPARTMENT,
  getInitialZones,
  getTasksForDepartment,
  getTaskById,
} from '../../data/workerFlow'
import { useAppStore } from '../../context/AppStoreContext'
import styles from './RecordProduction.module.css'

const WORKERS = SEED_WORKERS.filter((w) => w.role === 'worker' || w.role === 'engineer')
/** All departments for record form: Farming, Maintenance, Inventory */
const DEPARTMENT_OPTIONS_RECORD = [...DEPARTMENTS, INVENTORY_DEPARTMENT]

const defaultForm = () => ({
  recordType: 'production',
  workerId: '',
  departmentId: '',
  taskId: '',
  zoneId: '',
  linesArea: '',
  dateTime: new Date().toISOString().slice(0, 16),
  quantity: '',
  unit: 'kg',
  qualityOutcome: 'pass',
  severity: 'medium',
  notes: '',
})

export default function RecordProduction() {
  const navigate = useNavigate()
  const { addRecord, records, zones: storeZones } = useAppStore()
  const zonesList = (storeZones && storeZones.length > 0) ? storeZones : getInitialZones()
  const ZONE_LABELS = useMemo(() => Object.fromEntries(zonesList.map((z) => [z.id, z.label])), [zonesList])
  const [form, setForm] = useState(defaultForm())
  const [saved, setSaved] = useState(null)
  const [viewImageUrl, setViewImageUrl] = useState(null)

  const tasksForDepartment = useMemo(
    () => getTasksForDepartment(form.departmentId),
    [form.departmentId]
  )

  const productionByDept = useMemo(() => {
    const list = (records || []).filter((r) => r.recordType === 'production')
    const map = {}
    list.forEach((r) => {
      const d = r.department || 'Other'
      map[d] = (map[d] || 0) + 1
    })
    return Object.entries(map).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  }, [records])
  const maxProd = Math.max(1, ...productionByDept.map((x) => x.count))

  /** Recent production records (from workers + engineer) for operations log. */
  const recentProductionRecords = useMemo(() => {
    const list = (records || []).filter((r) => r.recordType === 'production')
    return [...list].sort((a, b) => {
      const ta = new Date(a.dateTime || a.createdAt || 0).getTime()
      const tb = new Date(b.dateTime || b.createdAt || 0).getTime()
      return tb - ta
    }).slice(0, 50)
  }, [records])

  const isProduction = form.recordType === 'production'
  const isInventory = form.recordType === 'inventory'

  function handleSave(e) {
    e.preventDefault()
    if (isInventory && !form.notes.trim()) return
    const worker = WORKERS.find((w) => w.id === form.workerId)
    const dept = DEPARTMENT_OPTIONS_RECORD.find((d) => d.id === form.departmentId)
    const record = {
      id: `R${Date.now()}`,
      recordType: form.recordType,
      worker: worker?.fullName ?? form.workerId,
      department: dept?.labelEn ?? form.departmentId ?? '',
      task: getTaskById(form.taskId)?.labelEn ?? form.taskId ?? '',
      zone: ZONE_LABELS[form.zoneId] ?? form.zoneId,
      linesArea: form.linesArea,
      dateTime: form.dateTime,
      quantity: form.quantity,
      unit: form.unit,
      qualityOutcome: form.qualityOutcome,
      severity: form.severity,
      notes: form.notes,
      createdAt: new Date().toISOString(),
    }
    addRecord(record)
    setSaved(record)
    setForm(defaultForm())
  }

  function handleSaveAndNew(e) {
    e.preventDefault()
    if (isInventory && !form.notes.trim()) return
    const worker = WORKERS.find((w) => w.id === form.workerId)
    const dept = DEPARTMENT_OPTIONS_RECORD.find((d) => d.id === form.departmentId)
    const record = {
      id: `R${Date.now()}`,
      recordType: form.recordType,
      worker: worker?.fullName ?? form.workerId,
      department: dept?.labelEn ?? form.departmentId ?? '',
      task: getTaskById(form.taskId)?.labelEn ?? form.taskId ?? '',
      zone: ZONE_LABELS[form.zoneId] ?? form.zoneId,
      linesArea: form.linesArea,
      dateTime: form.dateTime,
      quantity: form.quantity,
      unit: form.unit,
      qualityOutcome: form.qualityOutcome,
      severity: form.severity,
      notes: form.notes,
      createdAt: new Date().toISOString(),
    }
    addRecord(record)
    setSaved(record)
    setForm({ ...defaultForm(), recordType: form.recordType, departmentId: form.recordType === 'inventory' ? 'inventory' : '' })
  }

  function handleCancel() {
    setForm(defaultForm())
    setSaved(null)
  }

  function selectWorker(workerId) {
    const w = WORKERS.find((x) => x.id === workerId)
    const deptId = w?.department ?? ''
    setForm((f) => ({
      ...f,
      workerId: workerId || '',
      departmentId: deptId || f.departmentId,
      taskId: '',
    }))
  }

  function onRecordTypeChange(recordType) {
    const next = { ...defaultForm(), recordType }
    if (recordType === 'inventory') {
      next.departmentId = 'inventory'
      next.taskId = ''
    }
    setForm(next)
  }

  function onZoneChange(zoneId) {
    setForm((f) => ({ ...f, zoneId }))
    if (zoneId === 'inventory') {
      setForm((f) => ({ ...f, zoneId, departmentId: 'inventory', taskId: '' }))
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><i className="fas fa-pen-to-square fa-fw" /> Record Event</h2>

        {/* Record type */}
        <div className={styles.formBlock}>
          <label className={styles.label}>Record Type</label>
          <select
            value={form.recordType}
            onChange={(e) => onRecordTypeChange(e.target.value)}
            className={styles.select}
          >
            {RECORD_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        <form onSubmit={handleSave} className={styles.form}>
          {/* Reference */}
          <div className={styles.formBlock}>
            <h3 className={styles.subTitle}>Reference information</h3>
            <div className={styles.row}>
              <div className={styles.field}>
                <label>Worker</label>
                <select
                  value={form.workerId}
                  onChange={(e) => selectWorker(e.target.value)}
                  required
                  className={styles.select}
                >
                  <option value="">Select worker</option>
                  {WORKERS.map((w) => (
                    <option key={w.id} value={w.id}>{w.fullName} ({w.employeeId})</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Department</label>
                <select
                  value={form.departmentId}
                  onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value, taskId: '' }))}
                  required
                  className={styles.select}
                >
                  <option value="">Select department</option>
                  {DEPARTMENT_OPTIONS_RECORD.map((d) => (
                    <option key={d.id} value={d.id}>{d.labelEn}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.field}>
                <label>Task</label>
                <select
                  value={form.taskId}
                  onChange={(e) => setForm((f) => ({ ...f, taskId: e.target.value }))}
                  required
                  className={styles.select}
                >
                  <option value="">Select task</option>
                  {tasksForDepartment.map((t) => (
                    <option key={t.id} value={t.id}>{t.labelEn}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Zone</label>
                <select
                  value={form.zoneId}
                  onChange={(e) => onZoneChange(e.target.value)}
                  required
                  className={styles.select}
                >
                  <option value="">Select zone</option>
                  {zonesList.map((z) => (
                    <option key={z.id} value={z.id}>{z.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.field}>
                <label>Lines / Area range</label>
                <input
                  type="text"
                  value={form.linesArea}
                  onChange={(e) => setForm((f) => ({ ...f, linesArea: e.target.value }))}
                  placeholder="e.g. 5–8"
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label>Date &amp; time</label>
                <input
                  type="datetime-local"
                  value={form.dateTime}
                  onChange={(e) => setForm((f) => ({ ...f, dateTime: e.target.value }))}
                  required
                  className={styles.input}
                />
              </div>
            </div>
          </div>

          {/* Event details by type */}
          <div className={styles.formBlock}>
            <h3 className={styles.subTitle}>Event details</h3>
            {isProduction && (
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Quantity produced</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                    required
                    className={styles.input}
                  />
                </div>
                <div className={styles.field}>
                  <label>Unit</label>
                  <select
                    value={form.unit}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    className={styles.select}
                  >
                    {UNITS.map((u) => (
                      <option key={u.id} value={u.id}>{u.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {isInventory && (
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Quantity / value (optional)</label>
                  <input
                    type="text"
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                    placeholder="As applicable"
                    className={styles.input}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className={styles.formBlock}>
            <label className={styles.label}>
              {isInventory ? 'Notes (required for Inventory)' : 'Notes (optional)'}
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder={isInventory ? 'e.g. source lines, product type, quantity…' : 'Operational or quality remarks'}
              className={styles.textarea}
              required={isInventory}
              aria-required={isInventory}
            />
            {isInventory && !form.notes.trim() && (
              <p className={styles.fieldHint}>Notes are required for Inventory records.</p>
            )}
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <button type="button" className={styles.btnSecondary} onClick={handleCancel}>
              Cancel
            </button>
            <button type="button" className={styles.btnSecondary} onClick={handleSaveAndNew}>
              Save &amp; New
            </button>
            <button type="submit" className={styles.btnPrimary}>
              Save record
            </button>
          </div>
        </form>

        {saved && (
          <div className={styles.savedBanner}>
            Record saved: {saved.id} – {saved.recordType} at {new Date(saved.dateTime).toLocaleString()}
          </div>
        )}
      </section>

      <section className={styles.operationsLogSection}>
        <h2 className={styles.sectionTitle}><i className="fas fa-list-check fa-fw" /> Operations log (worker &amp; engineer)</h2>
        <p className={styles.operationsLogDesc}>All production records from workers (task completion with notes/photo) and from this form.</p>
        {recentProductionRecords.length === 0 ? (
          <p className={styles.operationsLogEmpty}>No production records yet.</p>
        ) : (
          <div className={styles.operationsLogList}>
            {recentProductionRecords.map((r) => (
              <div key={r.id} className={styles.opsCard}>
                <div className={styles.opsRow}>
                  <span className={styles.opsLabel}>Worker</span>
                  <span className={styles.opsValue}>{r.worker || '—'}</span>
                </div>
                <div className={styles.opsRow}>
                  <span className={styles.opsLabel}>Department</span>
                  <span className={styles.opsValue}>{r.department || '—'}</span>
                </div>
                <div className={styles.opsRow}>
                  <span className={styles.opsLabel}>Task</span>
                  <span className={styles.opsValue}>{r.task || '—'}</span>
                </div>
                <div className={styles.opsRow}>
                  <span className={styles.opsLabel}>Zone</span>
                  <span className={styles.opsValue}>{r.zone || r.zoneId || '—'}</span>
                </div>
                <div className={styles.opsRow}>
                  <span className={styles.opsLabel}>Lines</span>
                  <span className={styles.opsValue}>{r.lines || r.linesArea || '—'}</span>
                </div>
                <div className={styles.opsRow}>
                  <span className={styles.opsLabel}>Date / time</span>
                  <span className={styles.opsValue}>{r.dateTime ? new Date(r.dateTime).toLocaleString() : (r.createdAt ? new Date(r.createdAt).toLocaleString() : '—')}</span>
                </div>
                {(r.duration != null || r.quantity != null) && (
                  <div className={styles.opsRow}>
                    <span className={styles.opsLabel}>{r.duration != null ? 'Duration' : 'Quantity'}</span>
                    <span className={styles.opsValue}>{r.duration != null ? `${r.duration} min` : (r.quantity != null ? `${r.quantity} ${r.unit || ''}`.trim() : '—')}</span>
                  </div>
                )}
                {r.notes && (
                  <div className={styles.opsRow}>
                    <span className={styles.opsLabel}>Notes</span>
                    <span className={styles.opsValue}>{r.notes}</span>
                  </div>
                )}
                {r.imageData && (
                  <div className={styles.opsRow}>
                    <span className={styles.opsLabel}>Photo</span>
                    <span className={styles.opsValue}>
                      <button type="button" className={styles.opsPhotoThumb} onClick={() => setViewImageUrl(r.imageData)}>
                        <img src={r.imageData} alt="" />
                      </button>
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {viewImageUrl && (
        <div className={styles.imageOverlay} onClick={() => setViewImageUrl(null)} role="dialog" aria-modal="true">
          <img src={viewImageUrl} alt="" className={styles.imageOverlayImg} onClick={(e) => e.stopPropagation()} />
          <button type="button" className={styles.imageOverlayClose} onClick={() => setViewImageUrl(null)} aria-label="Close">×</button>
        </div>
      )}

      <section className={styles.analyticsSection}>
        <h2 className={styles.sectionTitle}><i className="fas fa-chart-column fa-fw" /> Analytics</h2>
        <div className={styles.chartsRow}>
          <div className={styles.chartWrap}>
            <div className={styles.chartCaption}>Production by department</div>
            <div className={styles.barChart}>
              {productionByDept.length ? productionByDept.map((row, i) => (
                <div key={i} className={styles.barRow}>
                  <span className={styles.barLabel}>{row.label}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(row.count / maxProd) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{row.count}</span>
                </div>
              )) : <p className={styles.chartCaption}>No production records yet.</p>}
            </div>
          </div>
        </div>
        <div className={styles.moreWrap}>
          <button type="button" className={styles.moreBtn} onClick={() => navigate('/engineer/reports')}>
            More Details
          </button>
        </div>
      </section>
    </div>
  )
}

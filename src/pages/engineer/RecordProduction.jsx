import { useState, useMemo } from 'react'
import { UNITS } from '../../data/recordEvent'
import { getInitialZones } from '../../data/workerFlow'
import { getQRCodeUrl } from '../../data/engineerWorkers'
import { useAppStore } from '../../context/AppStoreContext'
import styles from './RecordProduction.module.css'

const defaultForm = () => ({
  recordType: 'production',
  zoneId: '',
  linesArea: '',
  dateTime: new Date().toISOString().slice(0, 16),
  quantity: '',
  unit: 'kg',
  notes: '',
  imageData: '',
})

export default function RecordProduction() {
  const { addRecord, records, zones: storeZones, workers: storeWorkers } = useAppStore()
  const zonesList = (storeZones && storeZones.length > 0) ? storeZones : getInitialZones()
  const ZONE_LABELS = useMemo(() => Object.fromEntries(zonesList.map((z) => [z.id, z.label])), [zonesList])
  const [form, setForm] = useState(defaultForm())
  const [saved, setSaved] = useState(null)
  const [viewImageUrl, setViewImageUrl] = useState(null)
  const [harvestSectionOpen, setHarvestSectionOpen] = useState(false)
  const [profileWorker, setProfileWorker] = useState(null)
  const [opsFilterZone, setOpsFilterZone] = useState('')
  const [opsFilterWorker, setOpsFilterWorker] = useState('')
  const [opsFilterPeriod, setOpsFilterPeriod] = useState('all')
  const [opsFilterDateFrom, setOpsFilterDateFrom] = useState('')
  const [opsFilterDateTo, setOpsFilterDateTo] = useState('')
  const [opsFilterSearch, setOpsFilterSearch] = useState('')

  /** Operations log: production records from workers (task completion), excluding Harvest Record form entries. */
  const recentProductionRecords = useMemo(() => {
    const list = (records || []).filter((r) => r.recordType === 'production' && r.source !== 'harvest_form')
    return [...list].sort((a, b) => {
      const ta = new Date(a.dateTime || a.createdAt || 0).getTime()
      const tb = new Date(b.dateTime || b.createdAt || 0).getTime()
      return tb - ta
    })
  }, [records])

  const opsLogWorkers = useMemo(() => {
    const set = new Set()
    recentProductionRecords.forEach((r) => { if (r.worker?.trim()) set.add(r.worker.trim()) })
    return [...set].sort()
  }, [recentProductionRecords])

  const filteredOpsLog = useMemo(() => {
    let list = recentProductionRecords
    if (opsFilterZone) {
      const zoneLabel = ZONE_LABELS[opsFilterZone] || opsFilterZone
      list = list.filter((r) => (r.zoneId || '') === opsFilterZone || (r.zone || '') === zoneLabel)
    }
    if (opsFilterWorker) list = list.filter((r) => (r.worker || '').trim() === opsFilterWorker)
    const toDate = (d) => (d ? new Date(d).getTime() : 0)
    const now = Date.now()
    if (opsFilterPeriod === '7d') {
      const from = now - 7 * 24 * 60 * 60 * 1000
      list = list.filter((r) => toDate(r.dateTime || r.createdAt) >= from)
    } else if (opsFilterPeriod === '30d') {
      const from = now - 30 * 24 * 60 * 60 * 1000
      list = list.filter((r) => toDate(r.dateTime || r.createdAt) >= from)
    } else if (opsFilterPeriod === 'custom') {
      if (opsFilterDateFrom) {
        const from = new Date(opsFilterDateFrom).getTime()
        list = list.filter((r) => toDate(r.dateTime || r.createdAt) >= from)
      }
      if (opsFilterDateTo) {
        const to = new Date(opsFilterDateTo + 'T23:59:59').getTime()
        list = list.filter((r) => toDate(r.dateTime || r.createdAt) <= to)
      }
    }
    if (opsFilterSearch.trim()) {
      const q = opsFilterSearch.trim().toLowerCase()
      list = list.filter(
        (r) =>
          (r.worker || '').toLowerCase().includes(q) ||
          (r.zone || '').toLowerCase().includes(q) ||
          (r.linesArea || r.lines || '').toLowerCase().includes(q) ||
          (r.notes || '').toLowerCase().includes(q) ||
          (r.engineerNotes || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [recentProductionRecords, opsFilterZone, opsFilterWorker, opsFilterPeriod, opsFilterDateFrom, opsFilterDateTo, opsFilterSearch])

  /** Previous period (same length) for % change. Same filters except time window shifted back. */
  const previousPeriodRecords = useMemo(() => {
    const toDate = (d) => (d ? new Date(d).getTime() : 0)
    const now = Date.now()
    let from = 0
    let to = now
    if (opsFilterPeriod === '7d') {
      to = now - 7 * 24 * 60 * 60 * 1000
      from = now - 14 * 24 * 60 * 60 * 1000
    } else if (opsFilterPeriod === '30d') {
      to = now - 30 * 24 * 60 * 60 * 1000
      from = now - 60 * 24 * 60 * 60 * 1000
    } else if (opsFilterPeriod === 'custom' && opsFilterDateFrom && opsFilterDateTo) {
      const currFrom = new Date(opsFilterDateFrom).getTime()
      const currTo = new Date(opsFilterDateTo + 'T23:59:59').getTime()
      const len = currTo - currFrom
      to = currFrom - 1
      from = currFrom - len
    } else if (opsFilterPeriod === 'all') {
      to = now - 30 * 24 * 60 * 60 * 1000
      from = now - 60 * 24 * 60 * 60 * 1000
    } else {
      return []
    }
    let list = recentProductionRecords.filter((r) => {
      const t = toDate(r.dateTime || r.createdAt)
      return t >= from && t <= to
    })
    if (opsFilterZone) {
      const zoneLabel = ZONE_LABELS[opsFilterZone] || opsFilterZone
      list = list.filter((r) => (r.zoneId || '') === opsFilterZone || (r.zone || '') === zoneLabel)
    }
    if (opsFilterWorker) list = list.filter((r) => (r.worker || '').trim() === opsFilterWorker)
    if (opsFilterSearch.trim()) {
      const q = opsFilterSearch.trim().toLowerCase()
      list = list.filter(
        (r) =>
          (r.worker || '').toLowerCase().includes(q) ||
          (r.zone || '').toLowerCase().includes(q) ||
          (r.linesArea || r.lines || '').toLowerCase().includes(q) ||
          (r.notes || '').toLowerCase().includes(q) ||
          (r.engineerNotes || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [recentProductionRecords, opsFilterZone, opsFilterWorker, opsFilterPeriod, opsFilterDateFrom, opsFilterDateTo, opsFilterSearch])

  const EXPECTED_AVG_MINUTES = 60
  const YELLOW_AVG_MINUTES = 120

  const kpiTotalRecords = useMemo(() => {
    const total = filteredOpsLog.length
    const previous = previousPeriodRecords.length
    const pctChange = previous !== 0 ? Math.round(((total - previous) / previous) * 100) : null
    return { total, pctChange }
  }, [filteredOpsLog.length, previousPeriodRecords.length])

  const kpiTotalLoggedTime = useMemo(() => {
    const withDuration = filteredOpsLog.filter((r) => r.duration != null)
    const totalMinutes = withDuration.reduce((s, r) => s + (Number(r.duration) || 0), 0)
    const uniqueWorkers = new Set(filteredOpsLog.map((r) => (r.worker || '').trim()).filter(Boolean)).size
    const avgPerWorkerMinutes = uniqueWorkers > 0 ? totalMinutes / uniqueWorkers : 0
    return { totalMinutes, avgPerWorkerMinutes, uniqueWorkers }
  }, [filteredOpsLog])

  const kpiAvgDuration = useMemo(() => {
    const withDuration = filteredOpsLog.filter((r) => r.duration != null)
    if (withDuration.length === 0) return { avgMinutes: 0, status: 'none' }
    const totalMinutes = withDuration.reduce((s, r) => s + (Number(r.duration) || 0), 0)
    const avgMinutes = totalMinutes / withDuration.length
    const status = avgMinutes <= EXPECTED_AVG_MINUTES ? 'ok' : avgMinutes <= YELLOW_AVG_MINUTES ? 'warn' : 'high'
    return { avgMinutes, status }
  }, [filteredOpsLog])

  const kpiTopZone = useMemo(() => {
    const byZone = {}
    filteredOpsLog.forEach((r) => {
      if (r.duration == null) return
      const key = r.zoneId || r.zone || '—'
      if (!byZone[key]) byZone[key] = { zoneId: r.zoneId, zone: r.zone || key, totalMinutes: 0 }
      byZone[key].totalMinutes += Number(r.duration) || 0
    })
    const totalMinutes = Object.values(byZone).reduce((s, x) => s + x.totalMinutes, 0)
    if (totalMinutes === 0) return null
    const top = Object.values(byZone).sort((a, b) => b.totalMinutes - a.totalMinutes)[0]
    const pct = Math.round((top.totalMinutes / totalMinutes) * 100)
    const zoneIdForFilter = top.zoneId || (zonesList.find((z) => z.label === top.zone)?.id ?? '')
    return { ...top, pct, zoneIdForFilter }
  }, [filteredOpsLog, zonesList])

  function formatMinutesToHoursMinutes(mins) {
    if (mins == null || Number.isNaN(mins)) return '0h 0m'
    const m = Math.round(Number(mins))
    const h = Math.floor(m / 60)
    const rem = m % 60
    return `${h}h ${rem}m`
  }

  function validateForm() {
    if (!form.zoneId?.trim()) return false
    if (form.quantity === '' || form.quantity == null) return false
    return true
  }

  function buildRecord() {
    return {
      id: `R${Date.now()}`,
      recordType: 'production',
      source: 'harvest_form',
      zone: ZONE_LABELS[form.zoneId] ?? form.zoneId,
      zoneId: form.zoneId,
      linesArea: form.linesArea,
      dateTime: form.dateTime,
      quantity: form.quantity,
      unit: form.unit,
      notes: form.notes,
      imageData: form.imageData || undefined,
      createdAt: new Date().toISOString(),
    }
  }

  function onImageChange(e) {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => setForm((f) => ({ ...f, imageData: reader.result || '' }))
    reader.readAsDataURL(file)
  }

  function handleSave(e) {
    e.preventDefault()
    if (!validateForm()) return
    const record = buildRecord()
    addRecord(record)
    setSaved(record)
    setForm(defaultForm())
  }

  function handleCancel() {
    setForm(defaultForm())
    setSaved(null)
  }

  function printOpsLog() {
    const prevTitle = document.title
    document.title = `Operations log – ${new Date().toISOString().slice(0, 10)}`
    window.print()
    document.title = prevTitle
  }

  function exportOpsLogCSV() {
    const headers = ['Worker', 'Zone', 'Lines', 'Date / time', 'Duration (min)', 'Quantity', 'Unit', 'Comment (worker)', 'Engineer notes']
    const rows = filteredOpsLog.map((r) => [
      r.worker ?? '',
      (r.zone || r.zoneId) ?? '',
      (r.linesArea || r.lines) ?? '',
      r.dateTime ? new Date(r.dateTime).toLocaleString() : (r.createdAt ? new Date(r.createdAt).toLocaleString() : ''),
      r.duration != null ? r.duration : '',
      r.quantity != null ? r.quantity : '',
      r.unit ?? '',
      (r.notes || '').replace(/\r?\n/g, ' '),
      (r.engineerNotes || '').replace(/\r?\n/g, ' '),
    ])
    const csv = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `operations-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={styles.page}>
      <section className={styles.kpiSection}>
        <h2 className={styles.sectionTitle}><i className="fas fa-chart-pie fa-fw" /> Summary</h2>
        <div className={styles.opsKpiCards}>
          <div className={styles.opsKpiCard}>
            <span className={styles.opsKpiLabel}>Total Records</span>
            <span className={styles.opsKpiValue}>{kpiTotalRecords.total}</span>
            {kpiTotalRecords.pctChange != null && (
              <span className={styles.opsKpiSub}>
                {kpiTotalRecords.pctChange >= 0 ? '↑' : '↓'} {kpiTotalRecords.pctChange >= 0 ? '+' : ''}{kpiTotalRecords.pctChange}% vs previous period
              </span>
            )}
          </div>
          <div className={styles.opsKpiCard}>
            <span className={styles.opsKpiLabel}>Total Logged Time</span>
            <span className={styles.opsKpiValue}>{formatMinutesToHoursMinutes(kpiTotalLoggedTime.totalMinutes)}</span>
            <span className={styles.opsKpiSub}>Avg per Worker: {formatMinutesToHoursMinutes(kpiTotalLoggedTime.avgPerWorkerMinutes)}</span>
          </div>
          <div className={`${styles.opsKpiCard} ${styles[`opsKpiAvg${kpiAvgDuration.status === 'ok' ? 'Ok' : kpiAvgDuration.status === 'warn' ? 'Warn' : kpiAvgDuration.status === 'high' ? 'High' : ''}`]}`}>
            <span className={styles.opsKpiLabel}>Avg Duration</span>
            <span className={styles.opsKpiValue}>{formatMinutesToHoursMinutes(kpiAvgDuration.avgMinutes)}</span>
            <span className={styles.opsKpiSub}>
              {kpiAvgDuration.status === 'ok' ? 'Within expected range' : kpiAvgDuration.status === 'warn' ? 'Slightly above expected' : kpiAvgDuration.status === 'high' ? 'Above expected' : '—'}
            </span>
          </div>
          {kpiTopZone ? (
            <button
              type="button"
              className={styles.opsKpiCard}
              onClick={() => setOpsFilterZone(kpiTopZone.zoneIdForFilter)}
            >
              <span className={styles.opsKpiLabel}>Most Time-Consuming Zone</span>
              <span className={styles.opsKpiValue}>{kpiTopZone.zone}</span>
              <span className={styles.opsKpiSub}>{formatMinutesToHoursMinutes(kpiTopZone.totalMinutes)} ({kpiTopZone.pct}% of total time)</span>
            </button>
          ) : (
            <div className={styles.opsKpiCard}>
              <span className={styles.opsKpiLabel}>Most Time-Consuming Zone</span>
              <span className={styles.opsKpiValue}>—</span>
              <span className={styles.opsKpiSub}>No duration data</span>
            </div>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <button
          type="button"
          className={styles.sectionHeader}
          onClick={() => setHarvestSectionOpen((o) => !o)}
          aria-expanded={harvestSectionOpen}
        >
          <h2 className={styles.sectionTitle}><i className="fas fa-wheat-awn fa-fw" /> Record harvest</h2>
          <span className={styles.expandLabel}>{harvestSectionOpen ? 'Collapse' : 'Expand'}</span>
          <span className={styles.chevron}>{harvestSectionOpen ? '▼' : '▶'}</span>
        </button>
        {harvestSectionOpen && (
        <div className={styles.sectionBody}>
        <form onSubmit={handleSave} className={styles.form}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Zone</label>
              <select
                value={form.zoneId}
                onChange={(e) => setForm((f) => ({ ...f, zoneId: e.target.value }))}
                required
                className={styles.select}
              >
                <option value="">Select zone</option>
                {zonesList.map((z) => (
                  <option key={z.id} value={z.id}>{z.label}</option>
                ))}
              </select>
            </div>
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
          </div>
          <div className={styles.row}>
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
            <div className={styles.field}>
              <label>Quantity harvested</label>
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

          <div className={styles.formBlock}>
            <label className={styles.label}>Comment (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Remarks, product type, etc."
              className={styles.textarea}
            />
          </div>

          <div className={styles.formBlock}>
            <label className={styles.label}>Image (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={onImageChange}
              className={styles.fileInput}
            />
            {form.imageData && (
              <div className={styles.imagePreviewWrap}>
                <img src={form.imageData} alt="" className={styles.imagePreview} />
                <button type="button" className={styles.removeImageBtn} onClick={() => setForm((f) => ({ ...f, imageData: '' }))}>
                  Remove image
                </button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <button type="button" className={styles.btnSecondary} onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className={styles.btnPrimary}>
              Save
            </button>
          </div>
        </form>

        {saved && (
          <div className={styles.savedBanner}>
            Saved: {saved.id} – {new Date(saved.dateTime).toLocaleString()}
          </div>
        )}
        </div>
        )}
      </section>

      <section className={styles.operationsLogSection}>
        <div className={styles.opsLogHeader}>
          <h2 className={styles.sectionTitle}><i className="fas fa-list-check fa-fw" /> Operations log</h2>
          <button type="button" className={styles.opsExportBtn} onClick={exportOpsLogCSV} disabled={filteredOpsLog.length === 0}>
            <i className="fas fa-file-csv fa-fw" /> Export CSV
          </button>
          <button type="button" className={styles.opsPrintBtn} onClick={printOpsLog} disabled={filteredOpsLog.length === 0}>
            <i className="fas fa-print fa-fw" /> Print / PDF
          </button>
        </div>

        <div className={styles.opsFilters}>
          <select
            value={opsFilterZone}
            onChange={(e) => setOpsFilterZone(e.target.value)}
            className={styles.opsFilterSelect}
            title="Zone"
          >
            <option value="">All zones</option>
            {zonesList.map((z) => (
              <option key={z.id} value={z.id}>{z.label}</option>
            ))}
          </select>
          <select
            value={opsFilterWorker}
            onChange={(e) => setOpsFilterWorker(e.target.value)}
            className={styles.opsFilterSelect}
            title="Worker"
          >
            <option value="">All workers</option>
            {opsLogWorkers.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
          <select
            value={opsFilterPeriod}
            onChange={(e) => setOpsFilterPeriod(e.target.value)}
            className={styles.opsFilterSelect}
            title="Time period"
          >
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="custom">Custom range</option>
          </select>
          {opsFilterPeriod === 'custom' && (
            <>
              <input
                type="date"
                value={opsFilterDateFrom}
                onChange={(e) => setOpsFilterDateFrom(e.target.value)}
                className={styles.opsFilterDate}
                title="From"
              />
              <input
                type="date"
                value={opsFilterDateTo}
                onChange={(e) => setOpsFilterDateTo(e.target.value)}
                className={styles.opsFilterDate}
                title="To"
              />
            </>
          )}
          <input
            type="text"
            value={opsFilterSearch}
            onChange={(e) => setOpsFilterSearch(e.target.value)}
            placeholder="Search worker, zone, lines, comments…"
            className={styles.opsFilterSearch}
          />
        </div>
        {recentProductionRecords.length === 0 ? (
          <p className={styles.operationsLogEmpty}>No production records yet.</p>
        ) : filteredOpsLog.length === 0 ? (
          <p className={styles.operationsLogEmpty}>No records match the filter.</p>
        ) : (
          <div className={styles.operationsLogList}>
            {filteredOpsLog.map((r) => (
              <div key={r.id} className={styles.opsCard}>
                {r.worker && (
                  <div className={styles.opsRow}>
                    <span className={styles.opsLabel}>Worker</span>
                    <span className={styles.opsValue}>{r.worker}</span>
                  </div>
                )}
                <div className={styles.opsRow}>
                  <span className={styles.opsLabel}>Zone</span>
                  <span className={styles.opsValue}>{r.zone || r.zoneId || '—'}</span>
                </div>
                <div className={styles.opsRow}>
                  <span className={styles.opsLabel}>Lines</span>
                  <span className={styles.opsValue}>{r.linesArea || r.lines || '—'}</span>
                </div>
                <div className={styles.opsRow}>
                  <span className={styles.opsLabel}>Date / time</span>
                  <span className={styles.opsValue}>{r.dateTime ? new Date(r.dateTime).toLocaleString() : (r.createdAt ? new Date(r.createdAt).toLocaleString() : '—')}</span>
                </div>
                {r.duration != null && (
                  <div className={styles.opsRow}>
                    <span className={styles.opsLabel}>Duration</span>
                    <span className={styles.opsValue}>{r.duration} min</span>
                  </div>
                )}
                {r.quantity != null && (
                  <div className={styles.opsRow}>
                    <span className={styles.opsLabel}>Quantity</span>
                    <span className={styles.opsValue}>{`${r.quantity} ${r.unit || ''}`.trim()}</span>
                  </div>
                )}
                {r.notes && (
                  <div className={styles.opsRow}>
                    <span className={styles.opsLabel}>Comment (worker)</span>
                    <span className={styles.opsValue}>{r.notes}</span>
                  </div>
                )}
                {r.engineerNotes && (
                  <div className={styles.opsRow}>
                    <span className={styles.opsLabel}>Engineer notes</span>
                    <span className={styles.opsValue}>{r.engineerNotes}</span>
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
                <div className={styles.opsRow}>
                  <span className={styles.opsLabel} />
                  <span className={styles.opsValue}>
                    <button
                      type="button"
                      className={styles.opsActionLink}
                      onClick={() => setProfileWorker((storeWorkers || []).find((w) => (r.workerId != null && String(w.id) === String(r.workerId)) || (w.fullName || '').trim() === (r.worker || '').trim()) || null)}
                    >
                      View Profile
                    </button>
                  </span>
                </div>
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

      {profileWorker && (
        <div className={styles.modalOverlay} onClick={() => setProfileWorker(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}><i className="fas fa-user fa-fw" /> {profileWorker.fullName}</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setProfileWorker(null)} aria-label="Close">×</button>
            </div>
            <p className={styles.profileSubtitle}>{profileWorker.employeeId} · {profileWorker.department}</p>
            <div className={styles.profileCreds}>
              <div className={styles.profileCredRow}>
                <span className={styles.profileCredLabel}>Username</span>
                <strong className={styles.profileCredValue}>{profileWorker.employeeId || '—'}</strong>
              </div>
              <div className={styles.profileCredRow}>
                <span className={styles.profileCredLabel}>Password</span>
                <strong className={styles.profileCredValue}>{profileWorker.tempPassword || '—'}</strong>
              </div>
            </div>
            <div className={styles.profileQr}>
              <span className={styles.profileCredLabel}>QR code (login)</span>
              <img src={getQRCodeUrl(profileWorker.employeeId || '', 160)} alt="" className={styles.profileQrImg} />
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setProfileWorker(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

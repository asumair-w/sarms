import { useState, useMemo } from 'react'
import { UNITS } from '../../data/recordEvent'
import { getInitialZones } from '../../data/workerFlow'
import { useAppStore } from '../../context/AppStoreContext'
import { useLanguage } from '../../context/LanguageContext'
import { getTranslation } from '../../i18n/translations'
import { nextRecordId } from '../../utils/idGenerators'
import { escapeHtmlForPrint, buildSarmsPrintHtml, openSarmsPrintWindow } from '../../utils/sarmsPrintHtml'
import { USE_SUPABASE_ACTIVE } from '../../config/dataBackend'
import { insertHarvestLog } from '../../lib/supabaseHarvestAdapter'
import { resolveWorkerUuidByEmployeeLogin } from '../../lib/supabaseTasksAdapter'
import styles from './RecordProduction.module.css'
import invStyles from './InventoryEquipment.module.css'

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
  const { lang } = useLanguage()
  const t = (key) => getTranslation(lang, 'engineer', key)
  const { addRecord, updateRecord, removeRecord, records, zones: storeZones, workers } = useAppStore()
  const zonesList = (storeZones && storeZones.length > 0) ? storeZones : getInitialZones()
  /** Zones for harvest record only: exclude Inventory (harvest is from growing zones, not inventory). */
  const harvestZonesList = useMemo(() => zonesList.filter((z) => (z.id || '').toLowerCase() !== 'inventory'), [zonesList])
  const ZONE_LABELS = useMemo(() => Object.fromEntries(zonesList.map((z) => [z.id, z.label])), [zonesList])
  const [form, setForm] = useState(defaultForm())
  const [saved, setSaved] = useState(null)
  const [harvestSectionOpen, setHarvestSectionOpen] = useState(false)
  const [harvestFilterZone, setHarvestFilterZone] = useState('')
  const [harvestFilterSearch, setHarvestFilterSearch] = useState('')
  const [harvestFilterPeriod, setHarvestFilterPeriod] = useState('all')
  const [harvestDateFrom, setHarvestDateFrom] = useState('')
  const [harvestDateTo, setHarvestDateTo] = useState('')
  const [viewHarvestImage, setViewHarvestImage] = useState(null)
  const [editHarvestRecord, setEditHarvestRecord] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [zoneDetailOpen, setZoneDetailOpen] = useState(false)
  const [opsFilterZone, setOpsFilterZone] = useState('')
  const [opsFilterWorker, setOpsFilterWorker] = useState('')
  const [opsFilterPeriod, setOpsFilterPeriod] = useState('all')
  const [opsFilterDateFrom, setOpsFilterDateFrom] = useState('')
  const [opsFilterDateTo, setOpsFilterDateTo] = useState('')
  const [opsFilterSearch, setOpsFilterSearch] = useState('')
  const [summaryHarvestMonth, setSummaryHarvestMonth] = useState('this') // 'this' | 'last' | '7d' | 'all' | 'custom'
  const [summaryHarvestCustom, setSummaryHarvestCustom] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }) // 'YYYY-MM' when custom
  /** Summary period bounds: current period and previous equivalent period (full month or 7d). */
  const summaryPeriodBounds = useMemo(() => {
    const now = new Date()
    const nowMs = now.getTime()
    let currStart, currEnd
    if (summaryHarvestMonth === 'last') {
      const y = now.getFullYear()
      const m = now.getMonth()
      currStart = new Date(y, m - 1, 1).getTime()
      currEnd = new Date(y, m, 0, 23, 59, 59, 999).getTime()
    } else if (summaryHarvestMonth === '7d') {
      currEnd = nowMs
      currStart = currEnd - 7 * 24 * 60 * 60 * 1000
    } else if (summaryHarvestMonth === 'all') {
      currStart = 0
      currEnd = nowMs
    } else if (summaryHarvestMonth === 'custom' && summaryHarvestCustom) {
      const [yStr, mStr] = summaryHarvestCustom.split('-')
      const y = parseInt(yStr, 10)
      const m = parseInt(mStr, 10) - 1
      currStart = new Date(y, m, 1).getTime()
      currEnd = new Date(y, m + 1, 0, 23, 59, 59, 999).getTime()
    } else {
      const y = now.getFullYear()
      const m = now.getMonth()
      currStart = new Date(y, m, 1).getTime()
      currEnd = nowMs
    }
    let prevStart = null
    let prevEnd = null
    if (summaryHarvestMonth === 'this') {
      const y = now.getFullYear()
      const m = now.getMonth()
      prevStart = new Date(y, m - 1, 1).getTime()
      prevEnd = new Date(y, m, 0, 23, 59, 59, 999).getTime()
    } else if (summaryHarvestMonth === 'last') {
      const y = now.getFullYear()
      const m = now.getMonth()
      prevStart = new Date(y, m - 2, 1).getTime()
      prevEnd = new Date(y, m - 1, 0, 23, 59, 59, 999).getTime()
    } else if (summaryHarvestMonth === '7d') {
      prevEnd = currStart - 1
      prevStart = prevEnd - 7 * 24 * 60 * 60 * 1000
    } else if (summaryHarvestMonth === 'custom' && summaryHarvestCustom) {
      const [yStr, mStr] = summaryHarvestCustom.split('-')
      const y = parseInt(yStr, 10)
      const m = parseInt(mStr, 10) - 1
      prevStart = new Date(y, m - 1, 1).getTime()
      prevEnd = new Date(y, m, 0, 23, 59, 59, 999).getTime()
    }
    return { currStart, currEnd, prevStart, prevEnd }
  }, [summaryHarvestMonth, summaryHarvestCustom])

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

  /** Harvest log: records from Harvest Record form (source === 'harvest_form'). */
  const harvestRecords = useMemo(
    () =>
      (records || [])
        .filter((r) => r.source === 'harvest_form')
        .sort((a, b) => new Date(b.dateTime || b.createdAt || 0) - new Date(a.dateTime || a.createdAt || 0)),
    [records]
  )

  /** Harvest summary: records in selected period (driven by summary period filter). */
  const harvestRecordsInSummaryPeriod = useMemo(() => {
    const { currStart, currEnd } = summaryPeriodBounds
    return harvestRecords.filter((r) => {
      const t = new Date(r.dateTime || r.createdAt || 0).getTime()
      return t >= currStart && t <= currEnd
    })
  }, [harvestRecords, summaryPeriodBounds])

  /** Previous equivalent period records (for trend/growth). */
  const previousPeriodHarvestRecords = useMemo(() => {
    const { prevStart, prevEnd } = summaryPeriodBounds
    if (prevStart == null || prevEnd == null) return []
    return harvestRecords.filter((r) => {
      const t = new Date(r.dateTime || r.createdAt || 0).getTime()
      return t >= prevStart && t <= prevEnd
    })
  }, [harvestRecords, summaryPeriodBounds])

  const harvestTopProduct = useMemo(() => {
    if (harvestRecordsInSummaryPeriod.length === 0) return null
    const byUnit = {}
    harvestRecordsInSummaryPeriod.forEach((r) => {
      const u = r.unit || 'units'
      byUnit[u] = (byUnit[u] || 0) + (Number(r.quantity) || 0)
    })
    const entries = Object.entries(byUnit).sort((a, b) => b[1] - a[1])
    const top = entries[0]
    return top ? { unit: top[0], total: top[1] } : null
  }, [harvestRecordsInSummaryPeriod])

  /** Total production in selected period: sum per unit (all units), plus dominant for trend. */
  const kpiTotalProduction = useMemo(() => {
    const byUnit = {}
    harvestRecordsInSummaryPeriod.forEach((r) => {
      const u = r.unit || 'kg'
      byUnit[u] = (byUnit[u] || 0) + (Number(r.quantity) || 0)
    })
    const entries = Object.entries(byUnit).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    const dominant = entries[0]
    return {
      byUnit: Object.fromEntries(entries),
      dominantUnit: dominant ? dominant[0] : 'kg',
      dominantTotal: dominant ? dominant[1] : 0,
    }
  }, [harvestRecordsInSummaryPeriod])

  /** Previous period total for dominant unit (for trend). Null only when no previous period (e.g. All time). */
  const kpiPreviousTotalProduction = useMemo(() => {
    const { prevStart } = summaryPeriodBounds
    if (prevStart == null) return null
    const unit = kpiTotalProduction.dominantUnit
    const total = previousPeriodHarvestRecords.reduce((s, r) => s + ((r.unit || 'kg') === unit ? Number(r.quantity) || 0 : 0), 0)
    return { total, unit }
  }, [summaryPeriodBounds, previousPeriodHarvestRecords, kpiTotalProduction.dominantUnit])

  /** Trend: percentage change vs previous period (dominant unit). Null if no previous data. Capped for display. */
  const kpiTrendPct = useMemo(() => {
    if (kpiPreviousTotalProduction == null) return null
    if (kpiPreviousTotalProduction.total === 0) return kpiTotalProduction.dominantTotal > 0 ? 100 : 0
    const curr = kpiTotalProduction.dominantTotal
    const prev = kpiPreviousTotalProduction.total
    const raw = Math.round(((curr - prev) / prev) * 100)
    return Math.max(-99, Math.min(999, raw))
  }, [kpiTotalProduction, kpiPreviousTotalProduction])

  /** Top 3 zones by production: rank by total quantity (all units summed) so the zone with most production is first. */
  const kpiTopZones = useMemo(() => {
    if (harvestRecordsInSummaryPeriod.length === 0) return []
    const byZone = {}
    harvestRecordsInSummaryPeriod.forEach((r) => {
      const key = r.zoneId || r.zone || '—'
      const label = r.zone || ZONE_LABELS[r.zoneId] || key
      if (!byZone[key]) byZone[key] = { zoneId: r.zoneId, zoneLabel: label, total: 0 }
      byZone[key].total += Number(r.quantity) || 0
    })
    const sorted = Object.values(byZone).sort((a, b) => b.total - a.total)
    return sorted.slice(0, 3).map((x) => ({ ...x, unit: 'total' }))
  }, [harvestRecordsInSummaryPeriod, ZONE_LABELS])

  /** All zones with production per unit (for zone detail modal). Sorted by total (all units summed). */
  const productionByZoneAllUnits = useMemo(() => {
    if (harvestRecordsInSummaryPeriod.length === 0) return []
    const byZone = {}
    harvestRecordsInSummaryPeriod.forEach((r) => {
      const key = r.zoneId || r.zone || '—'
      const label = r.zone || ZONE_LABELS[r.zoneId] || key
      if (!byZone[key]) byZone[key] = { zoneLabel: label, byUnit: {}, total: 0 }
      const u = (r.unit || 'kg').toString().trim() || 'kg'
      const qty = Number(r.quantity) || 0
      byZone[key].byUnit[u] = (byZone[key].byUnit[u] || 0) + qty
      byZone[key].total += qty
    })
    return Object.values(byZone).sort((a, b) => b.total - a.total)
  }, [harvestRecordsInSummaryPeriod, ZONE_LABELS])

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

  function exportHarvestLogPDF() {
    if (filteredHarvestRecords.length === 0) return

    const dir = lang === 'ar' ? 'rtl' : 'ltr'
    const periodLabel =
      harvestFilterPeriod === '7d'
        ? t('rpLast7Days')
        : harvestFilterPeriod === '30d'
          ? t('rpLast30Days')
          : harvestFilterPeriod === 'custom'
            ? `${harvestDateFrom || '—'} ${t('monitorTo')} ${harvestDateTo || '—'}`
            : t('allTime')
    const zoneLabel = harvestFilterZone ? (ZONE_LABELS[harvestFilterZone] || harvestFilterZone) : t('monitorAll')
    const searchLine = harvestFilterSearch.trim() || '—'

    const rowsHtml = filteredHarvestRecords.map((r) => {
      const zoneStr = r.zone || r.zoneId || '—'
      const linesStr = r.linesArea || r.lines || '—'
      const dtStr = r.dateTime
        ? new Date(r.dateTime).toLocaleString()
        : r.createdAt
          ? new Date(r.createdAt).toLocaleString()
          : '—'
      const qtyStr = r.quantity != null ? String(r.quantity) : '—'
      const unitStr = r.unit || '—'
      const notesStr = (r.notes || '').trim() || '—'
      return `<tr>
        <td>${escapeHtmlForPrint(String(zoneStr))}</td>
        <td>${escapeHtmlForPrint(String(linesStr))}</td>
        <td>${escapeHtmlForPrint(dtStr)}</td>
        <td>${escapeHtmlForPrint(qtyStr)}</td>
        <td>${escapeHtmlForPrint(unitStr)}</td>
        <td>${escapeHtmlForPrint(notesStr)}</td>
      </tr>`
    }).join('')

    const filtersInnerHtml = `<div><strong>${escapeHtmlForPrint(t('monitorFiltersApplied'))}</strong></div>
<div>${escapeHtmlForPrint(t('rpGenerated'))}: ${escapeHtmlForPrint(new Date().toLocaleString())}</div>
<div>${escapeHtmlForPrint(t('rpZone'))}: ${escapeHtmlForPrint(zoneLabel)} · ${escapeHtmlForPrint(t('rpPeriod'))}: ${escapeHtmlForPrint(periodLabel)}</div>
<div>${escapeHtmlForPrint(t('searchPlaceholder'))}: ${escapeHtmlForPrint(searchLine)}</div>
<div>${escapeHtmlForPrint(t('monitorRows'))}: ${filteredHarvestRecords.length}</div>`

    const theadRowHtml = [
      t('rpZone'),
      t('rpLinesAreaRange'),
      t('rpDateTime'),
      t('rpQuantity'),
      t('rpUnit'),
      t('rpComment'),
    ].map((label) => `<th>${escapeHtmlForPrint(label)}</th>`).join('')

    const html = buildSarmsPrintHtml({
      title: t('rpHarvestLog'),
      metaLine: new Date().toLocaleString(),
      filtersInnerHtml,
      theadRowHtml,
      tbodyHtml: rowsHtml,
      dir,
      lang,
    })
    openSarmsPrintWindow(html)
  }

  function validateForm() {
    if (!form.zoneId?.trim()) return false
    if (form.quantity === '' || form.quantity == null) return false
    return true
  }

  function buildRecord() {
    return {
      id: nextRecordId(records),
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
    const snapshot = { ...form }
    const zoneLabel = ZONE_LABELS[snapshot.zoneId] ?? snapshot.zoneId
    addRecord(record)
    setSaved(record)
    setForm(defaultForm())

    if (USE_SUPABASE_ACTIVE) {
      void (async () => {
        try {
          const login =
            typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sarms-user-id') : null
          const resolvedWorkerUuid = login
            ? await resolveWorkerUuidByEmployeeLogin(login, workers)
            : null
          if (!resolvedWorkerUuid) {
            console.warn('[SARMS] harvest mirror: could not resolve workers.id UUID for login', login)
            return
          }
          const mappedPayload = {
            id: crypto.randomUUID(),
            zone_id: snapshot.zoneId,
            zone_label: zoneLabel,
            lines_area: snapshot.linesArea ?? '',
            recorded_at: snapshot.dateTime
              ? new Date(snapshot.dateTime).toISOString()
              : new Date().toISOString(),
            quantity: Number(snapshot.quantity) || 0,
            unit: snapshot.unit,
            notes: snapshot.notes || null,
            recorded_by: resolvedWorkerUuid,
          }
          if (snapshot.imageData) mappedPayload.image_data = snapshot.imageData
          await insertHarvestLog(mappedPayload)
        } catch (err) {
          console.error('Harvest Supabase failed', err)
        }
      })()
    }
  }

  function handleCancel() {
    setForm(defaultForm())
    setSaved(null)
  }

  function toDateTimeLocal(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${mo}-${day}T${h}:${min}`
  }

  function openEditHarvest(r) {
    setEditHarvestRecord(r)
    const zoneId = r.zoneId || (zonesList.find((z) => z.label === r.zone)?.id ?? '')
    setEditForm({
      zoneId,
      linesArea: r.linesArea ?? '',
      dateTime: toDateTimeLocal(r.dateTime || r.createdAt),
      quantity: r.quantity ?? '',
      unit: r.unit || 'kg',
      notes: r.notes ?? '',
      imageData: r.imageData ?? '',
    })
  }

  function handleSaveEditHarvest(e) {
    e.preventDefault()
    if (!editHarvestRecord || !editForm) return
    if (!editForm.zoneId?.trim() || editForm.quantity === '' || editForm.quantity == null) return
    updateRecord(editHarvestRecord.id, {
      zone: ZONE_LABELS[editForm.zoneId] ?? editForm.zoneId,
      zoneId: editForm.zoneId,
      linesArea: editForm.linesArea,
      dateTime: editForm.dateTime,
      quantity: editForm.quantity,
      unit: editForm.unit,
      notes: editForm.notes,
      imageData: editForm.imageData || undefined,
    })
    setEditHarvestRecord(null)
    setEditForm(null)
  }

  function handleDeleteHarvestFromEdit() {
    if (!editHarvestRecord) return
    if (window.confirm('Delete this record? This cannot be undone.')) {
      removeRecord(editHarvestRecord.id)
      setEditHarvestRecord(null)
      setEditForm(null)
    }
  }

  function formatQuantity(value) {
    if (value == null || Number.isNaN(value)) return '0'
    const n = Number(value)
    if (n >= 1000) return n.toLocaleString()
    if (n % 1 !== 0) return n.toFixed(1).replace(/\.0$/, '')
    return String(Math.round(n))
  }

  return (
    <div className={styles.page}>
      <section className={styles.kpiSection}>
        <h2 className={styles.sectionTitle}><i className="fas fa-chart-pie fa-fw" /> {t('rpSummary')}</h2>
        <div className={`${invStyles.summaryCards} ${styles.summaryCardsThree}`}>
          <div className={`${invStyles.summaryCard} ${invStyles.summaryCardHarvest}`}>
            <span className={invStyles.summaryCardLabel}>{t('rpHarvest')}</span>
            <div className={invStyles.summaryCardBody} onClick={(e) => e.stopPropagation()}>
              <div className={invStyles.summaryHarvestHead}>
                <select value={summaryHarvestMonth} onChange={(e) => setSummaryHarvestMonth(e.target.value)} className={invStyles.summaryHarvestSelect} onClick={(e) => e.stopPropagation()}>
                  <option value="this">{t('rpThisMonth')}</option>
                  <option value="last">{t('rpLastMonth')}</option>
                  <option value="7d">{t('rpLast7Days')}</option>
                  <option value="all">{t('allTime')}</option>
                  <option value="custom">{t('rpCustomMonth')}</option>
                </select>
                {summaryHarvestMonth === 'custom' && (
                  <input
                    type="month"
                    value={summaryHarvestCustom}
                    onChange={(e) => setSummaryHarvestCustom(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className={invStyles.summaryHarvestMonthInput}
                    title={t('rpChooseMonth')}
                  />
                )}
              </div>
              <div className={invStyles.summaryRow}><span>{t('rpRecords')}</span><strong>{harvestRecordsInSummaryPeriod.length}</strong></div>
              <div className={invStyles.summaryRowSub}>{t('rpTop')}: {harvestTopProduct ? `${formatQuantity(harvestTopProduct.total)} ${harvestTopProduct.unit}` : '—'}</div>
            </div>
          </div>
          <div className={`${invStyles.summaryCard} ${styles.summaryKpiCard}`}>
            <span className={invStyles.summaryCardLabel}>{t('rpTotalProduction')}</span>
            <div className={invStyles.summaryCardBody}>
              {Object.keys(kpiTotalProduction.byUnit).length > 0 ? (
                <>
                  {Object.entries(kpiTotalProduction.byUnit).map(([unit, total]) => (
                    <div key={unit} className={invStyles.summaryRow}>
                      <strong>{formatQuantity(total)} {unit}</strong>
                    </div>
                  ))}
                </>
              ) : (
                <div className={invStyles.summaryRow}>
                  <strong>0</strong>
                </div>
              )}
              {kpiTrendPct != null && kpiPreviousTotalProduction != null && kpiTotalProduction.dominantTotal > 0 && (
                <div className={`${styles.summaryKpiTrend} ${kpiTrendPct >= 0 ? styles.summaryKpiTrendUp : styles.summaryKpiTrendDown}`}>
                  {kpiTrendPct >= 0 ? '↑' : '↓'} {kpiTrendPct >= 0 ? '+' : ''}{kpiTrendPct}% {t('rpVsPreviousPeriod')} ({kpiTotalProduction.dominantUnit})
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            className={`${invStyles.summaryCard} ${styles.summaryKpiCard} ${styles.summaryKpiCardZone} ${styles.summaryCardClickable}`}
            onClick={() => setZoneDetailOpen(true)}
          >
            <span className={invStyles.summaryCardLabel}>{t('rpProductionByZone')}</span>
            <div className={invStyles.summaryCardBody}>
              {kpiTopZones.length > 0 ? (
                <>
                  <div className={invStyles.summaryRow}>
                    <strong>{kpiTopZones[0].zoneLabel} ({formatQuantity(kpiTopZones[0].total)} {kpiTopZones[0].unit})</strong>
                  </div>
                  {kpiTopZones[1] && (
                    <div className={`${invStyles.summaryRow} ${styles.zoneRowSub}`}>
                      <strong>{kpiTopZones[1].zoneLabel} ({formatQuantity(kpiTopZones[1].total)} {kpiTopZones[1].unit})</strong>
                    </div>
                  )}
                  {kpiTopZones[2] && (
                    <div className={`${invStyles.summaryRow} ${styles.zoneRowSub}`}>
                      <strong>{kpiTopZones[2].zoneLabel} ({formatQuantity(kpiTopZones[2].total)} {kpiTopZones[2].unit})</strong>
                    </div>
                  )}
                  <div className={styles.zoneCardHint}>{t('rpClickToViewZones')}</div>
                </>
              ) : (
                <div className={invStyles.summaryRowSub}>{t('rpNoRecordsInPeriod')}</div>
              )}
            </div>
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <button
          type="button"
          className={styles.sectionHeader}
          onClick={() => setHarvestSectionOpen((o) => !o)}
          aria-expanded={harvestSectionOpen}
        >
          <h2 className={styles.sectionTitle}><i className="fas fa-wheat-awn fa-fw" /> {t('rpRecordHarvest')}</h2>
          <span className={styles.expandLabel}>{harvestSectionOpen ? t('rpCollapse') : t('rpExpand')}</span>
          <span className={styles.chevron}>{harvestSectionOpen ? '▼' : '▶'}</span>
        </button>
        {harvestSectionOpen && (
        <div className={styles.sectionBody}>
        <form onSubmit={handleSave} className={styles.form}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>{t('rpZone')}</label>
              <select
                value={form.zoneId}
                onChange={(e) => setForm((f) => ({ ...f, zoneId: e.target.value }))}
                required
                className={styles.select}
              >
                <option value="">{t('selectZone')}</option>
                {harvestZonesList.map((z) => (
                  <option key={z.id} value={z.id}>{z.label}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label>{t('rpLinesAreaRange')}</label>
              <input
                type="text"
                value={form.linesArea}
                onChange={(e) => setForm((f) => ({ ...f, linesArea: e.target.value }))}
                placeholder={t('linesPlaceholder')}
                className={styles.input}
              />
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>{t('rpDateTime')}</label>
              <input
                type="datetime-local"
                value={form.dateTime}
                onChange={(e) => setForm((f) => ({ ...f, dateTime: e.target.value }))}
                required
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label>{t('quantityHarvested')}</label>
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
              <label>{t('rpUnit')}</label>
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
            <label className={styles.label}>{t('rpCommentOptional')}</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder={t('remarksPlaceholder')}
              className={styles.textarea}
            />
          </div>

          <div className={styles.formBlock}>
            <label className={styles.label}>{t('rpImageOptional')}</label>
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
                  {t('rpRemoveImage')}
                </button>
              </div>
            )}
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.btnSecondary} onClick={handleCancel}>
              {t('rpCancel')}
            </button>
            <button type="submit" className={styles.btnPrimary}>
              {t('rpSave')}
            </button>
          </div>
        </form>

        {saved && (
          <div className={styles.savedBanner}>
            {t('rpSaved')}: {saved.id} – {new Date(saved.dateTime).toLocaleString()}
          </div>
        )}
        </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={`${styles.sectionHeader} ${styles.sectionHeaderStatic}`}>
          <h2 className={styles.sectionTitle}><i className="fas fa-wheat-awn fa-fw" /> {t('rpHarvestLog')}</h2>
        </div>
        <div className={`${invStyles.harvestFilters} ${styles.rpHarvestFilters}`}>
              <select
                value={harvestFilterZone}
                onChange={(e) => setHarvestFilterZone(e.target.value)}
                className={invStyles.filterSelect}
                title={t('rpFilterByZone')}
              >
                <option value="">{t('allZones')}</option>
                {zonesList.map((z) => (
                  <option key={z.id} value={z.id}>{z.label}</option>
                ))}
              </select>
              <select
                value={harvestFilterPeriod}
                onChange={(e) => setHarvestFilterPeriod(e.target.value)}
                className={invStyles.filterSelect}
                title={t('timePeriod')}
              >
                <option value="all">{t('allTime')}</option>
                <option value="7d">{t('rpLast7Days')}</option>
                <option value="30d">{t('rpLast30Days')}</option>
                <option value="custom">{t('customRange')}</option>
              </select>
              {harvestFilterPeriod === 'custom' && (
                <>
                  <input
                    type="date"
                    value={harvestDateFrom}
                    onChange={(e) => setHarvestDateFrom(e.target.value)}
                    className={invStyles.filterDate}
                    title={t('fromDate')}
                  />
                  <input
                    type="date"
                    value={harvestDateTo}
                    onChange={(e) => setHarvestDateTo(e.target.value)}
                    className={invStyles.filterDate}
                    title={t('toDate')}
                  />
                </>
              )}
              <input
                type="text"
                value={harvestFilterSearch}
                onChange={(e) => setHarvestFilterSearch(e.target.value)}
                placeholder={t('searchZonePlaceholder')}
                className={invStyles.filterInput}
              />
              <div className={styles.rpHarvestExportWrap}>
                <button type="button" className={styles.rpExportPdfBtn} onClick={exportHarvestLogPDF} disabled={filteredHarvestRecords.length === 0} title="Download as PDF">
                  <i className="fas fa-file-pdf fa-fw" /> {t('rpExportPdf')}
                </button>
              </div>
            </div>
            {filteredHarvestRecords.length === 0 ? (
              <p className={`${invStyles.harvestEmpty} ${styles.rpHarvestEmpty}`}>
                {harvestRecords.length === 0 ? t('rpNoHarvestInventoryYet') : t('rpNoRecordsMatchFilter')}
              </p>
            ) : (
              <div className={`${invStyles.harvestTableWrap} ${styles.rpHarvestTableWrap}`}>
                <table className={`${invStyles.table} ${styles.rpHarvestTable}`}>
                  <thead>
                    <tr>
                      <th>{t('rpZone')}</th>
                      <th>{t('rpLinesAreaRange')}</th>
                      <th>{t('rpDateTime')}</th>
                      <th>{t('rpQuantity')}</th>
                      <th>{t('rpUnit')}</th>
                      <th>{t('rpComment')}</th>
                      <th>{t('rpPhoto')}</th>
                      <th aria-label={t('rpEdit')} />
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
                        <td className={`${invStyles.cellNotes} ${styles.rpCellNotes}`}>{r.notes || '—'}</td>
                        <td>
                          {r.imageData ? (
                            <button type="button" className={`${invStyles.photoThumb} ${styles.rpPhotoThumb}`} onClick={() => setViewHarvestImage(r.imageData)}>
                              <img src={r.imageData} alt="" />
                            </button>
                          ) : '—'}
                        </td>
                        <td className={styles.harvestActions}>
                          <button type="button" className={styles.btnEdit} onClick={() => openEditHarvest(r)} title={t('rpEdit')}>
                            <i className="fas fa-pen fa-fw" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </section>

      {viewHarvestImage && (
        <div className={invStyles.imageOverlay} onClick={() => setViewHarvestImage(null)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Escape' && setViewHarvestImage(null)}>
          <img src={viewHarvestImage} alt="" className={invStyles.imageOverlayImg} onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {editHarvestRecord && editForm && (
        <div className={styles.modalOverlay} onClick={() => { setEditHarvestRecord(null); setEditForm(null) }} role="dialog" aria-modal="true">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{t('rpEditHarvestRecord')}</h3>
            <form onSubmit={handleSaveEditHarvest} className={styles.form}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>{t('rpZone')}</label>
                  <select
                    value={editForm.zoneId}
                    onChange={(e) => setEditForm((f) => ({ ...f, zoneId: e.target.value }))}
                    required
                    className={styles.select}
                  >
                    <option value="">{t('selectZone')}</option>
                    {harvestZonesList.map((z) => (
                      <option key={z.id} value={z.id}>{z.label}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label>{t('rpLinesAreaRange')}</label>
                  <input
                    type="text"
                    value={editForm.linesArea}
                    onChange={(e) => setEditForm((f) => ({ ...f, linesArea: e.target.value }))}
                    placeholder={t('linesPlaceholder')}
                    className={styles.input}
                  />
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>{t('rpDateTime')}</label>
                  <input
                    type="datetime-local"
                    value={editForm.dateTime}
                    onChange={(e) => setEditForm((f) => ({ ...f, dateTime: e.target.value }))}
                    required
                    className={styles.input}
                  />
                </div>
                <div className={styles.field}>
                  <label>{t('rpQuantity')}</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                    required
                    className={styles.input}
                  />
                </div>
                <div className={styles.field}>
                  <label>{t('rpUnit')}</label>
                  <select
                    value={editForm.unit}
                    onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))}
                    className={styles.select}
                  >
                    {UNITS.map((u) => (
                      <option key={u.id} value={u.id}>{u.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.formBlock}>
                <label className={styles.label}>{t('rpCommentOptional')}</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className={styles.textarea}
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnDeleteInModal} onClick={handleDeleteHarvestFromEdit} title={t('rpDeleteRecord')}>
                  <i className="fas fa-trash-alt fa-fw" /> {t('rpDeleteRecord')}
                </button>
                <div className={styles.modalActionsRight}>
                  <button type="button" className={styles.btnSecondary} onClick={() => { setEditHarvestRecord(null); setEditForm(null) }}>
                    {t('rpCancel')}
                  </button>
                  <button type="submit" className={styles.btnPrimary}>{t('saveChanges')}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {zoneDetailOpen && (
        <div className={styles.modalOverlay} onClick={() => setZoneDetailOpen(false)} role="dialog" aria-modal="true" aria-labelledby="zone-detail-title">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 id="zone-detail-title" className={styles.modalTitle}>{t('rpProductionByZoneAllUnits')}</h3>
            {productionByZoneAllUnits.length > 0 ? (
              <ul className={styles.zoneDetailList}>
                {productionByZoneAllUnits.map((z) => (
                  <li key={z.zoneLabel} className={styles.zoneDetailItem}>
                    <span className={styles.zoneDetailZoneName}>{z.zoneLabel}</span>
                    <div className={styles.zoneDetailUnits}>
                      {Object.entries(z.byUnit)
                        .filter(([, v]) => v > 0)
                        .sort((a, b) => b[1] - a[1])
                        .map(([unit, total]) => (
                          <span key={unit} className={styles.zoneDetailUnitBadge}>
                            {formatQuantity(total)} {unit}
                          </span>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.zoneDetailEmpty}>No production records in this period.</p>
            )}
            <div className={styles.modalActions}>
              <div className={styles.modalActionsRight}>
                <button type="button" className={styles.btnSecondary} onClick={() => setZoneDetailOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

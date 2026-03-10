import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { useNavigate } from 'react-router-dom'
import {
  getSessionStatus,
  getElapsedMinutes,
  SESSION_STATUS,
  SESSION_STATUS_LABELS,
} from '../../data/monitorActive'
import { getTasksForDepartment, getTaskById, getInitialZones, getDepartment } from '../../data/workerFlow'
import { DEPARTMENT_OPTIONS, getQRCodeUrl } from '../../data/engineerWorkers'
import { TASK_STATUS } from '../../data/assignTask'
import { useAppStore } from '../../context/AppStoreContext'
import { nextRecordId } from '../../utils/idGenerators'
import { useLanguage } from '../../context/LanguageContext'
import { getTranslation } from '../../i18n/translations'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import styles from './MonitorActiveWork.module.css'
import opsLogStyles from './RecordProduction.module.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

function getDayEnd(dayStart) {
  const d = new Date(dayStart)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

function isSessionDelayedAtEndOfDay(session, endOfDayMs) {
  const start = new Date(session.startTime).getTime()
  const expected = (session.expectedMinutes || 60) * 60 * 1000
  const due = start + expected
  if (due >= endOfDayMs) return false
  if (start > endOfDayMs) return false
  const completed = session.completedAt ? new Date(session.completedAt).getTime() : null
  if (completed != null && completed <= endOfDayMs) return false
  return true
}

function getRiskLevel(delayRate) {
  if (delayRate > 30) return { labelKey: 'monitorRiskHigh', color: 'high' }
  if (delayRate >= 15) return { labelKey: 'monitorRiskModerate', color: 'moderate' }
  return { labelKey: 'monitorRiskStable', color: 'stable' }
}

function taskLabelByLang(task, lang) {
  if (!task) return ''
  return lang === 'ar' ? (task.labelAr ?? task.labelEn) : (task.labelEn ?? task.labelAr)
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** Normalize task status: consider any "in progress" variant as IN_PROGRESS. */
function isTaskInProgress(status) {
  if (status == null || status === '') return false
  const s = String(status).toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_').trim()
  return s === TASK_STATUS.IN_PROGRESS
}

export default function MonitorActiveWork() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const t = (key) => getTranslation(lang, 'engineer', key)
  const getDepartmentDisplayLabel = (deptId) => (lang === 'ar' ? getDepartment(deptId)?.labelAr : getDepartment(deptId)?.labelEn) ?? getDepartment(deptId)?.labelEn ?? deptId
  /** Task column: show label in current language (from task def by id or by matching label). */
  const getTaskDisplayLabel = (session) => {
    const taskDefId = session.taskDefId || session.taskId
    const byId = getTaskById(taskDefId)
    if (byId) return taskLabelByLang(byId, lang)
    const deptId = session.departmentId || session.taskTypeId
    if (deptId && session.task) {
      const list = getTasksForDepartment(deptId)
      const found = list?.find((t) => t.labelEn === session.task || t.labelAr === session.task)
      if (found) return taskLabelByLang(found, lang)
    }
    return session.task ?? '—'
  }
  const getSessionStatusDisplayLabel = (status) => {
    if (!status) return '—'
    if (status === 'completed') return t('monitorCompleted')
    if (status === SESSION_STATUS.ON_TIME) return t('monitorOnTime')
    if (status === SESSION_STATUS.DELAYED) return t('monitorDelayed')
    if (status === SESSION_STATUS.FLAGGED) return t('monitorFlagged')
    return SESSION_STATUS_LABELS[status] ?? status
  }
  const { sessions, updateSession, addSession, removeSession, addRecord, updateTaskStatus, records, zones: storeZones, workers, tasks } = useAppStore()
  const zonesList = (storeZones && storeZones.length > 0) ? storeZones : getInitialZones()
  const ZONE_LABELS = useMemo(() => Object.fromEntries(zonesList.map((z) => [z.id, z.label])), [zonesList])
  const [filterDept, setFilterDept] = useState('')
  const [filterTaskId, setFilterTaskId] = useState('')
  const [filterZone, setFilterZone] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [searchWorker, setSearchWorker] = useState('')
  const activeWorkersTableRef = useRef(null)
  const opsLogListRef = useRef(null)
  const [clickedCard, setClickedCard] = useState(null)
  const [viewSession, setViewSession] = useState(null)
  const [noteSession, setNoteSession] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [tick, setTick] = useState(0)
  const [sortBy, setSortBy] = useState('startTime')
  const [sortOrder, setSortOrder] = useState('asc')
  const [profileWorker, setProfileWorker] = useState(null)
  const [openActionsSessionId, setOpenActionsSessionId] = useState(null)
  const [dropdownAnchor, setDropdownAnchor] = useState(null) // { top, left } for portal menu
  const [riskModalOpen, setRiskModalOpen] = useState(false)
  const [opsFilterZone, setOpsFilterZone] = useState('')
  const [opsFilterWorker, setOpsFilterWorker] = useState('')
  const [opsFilterPeriod, setOpsFilterPeriod] = useState('all')
  const [opsFilterDateFrom, setOpsFilterDateFrom] = useState('')
  const [opsFilterDateTo, setOpsFilterDateTo] = useState('')
  const [opsFilterSearch, setOpsFilterSearch] = useState('')
  const [viewImageUrl, setViewImageUrl] = useState(null)

  /** Operations log: production records (excluding harvest form), same as Record Production. */
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

  /** Previous period (same length) for % change. */
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
    let pctChange = null
    if (opsFilterPeriod !== 'all' && previous !== 0) {
      const raw = Math.round(((total - previous) / previous) * 100)
      pctChange = Math.max(-99, Math.min(999, raw))
    }
    let status = 'ok'
    if (pctChange != null) {
      if (pctChange >= 0) status = 'ok'
      else if (pctChange < -20) status = 'high'
      else status = 'warn'
    }
    return { total, pctChange, status }
  }, [filteredOpsLog.length, previousPeriodRecords.length, opsFilterPeriod])

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

  function exportOpsLogPDF() {
    if (filteredOpsLog.length === 0) return
    const wrap = document.createElement('div')
    wrap.style.cssText = 'position:fixed;left:-9999px;top:0;background:#fff;padding:8px;font-family:system-ui,-apple-system,sans-serif;font-size:12px;direction:ltr;'
    const table = document.createElement('table')
    table.style.cssText = 'border-collapse:collapse;width:100%;min-width:1150px;'
    const thead = document.createElement('thead')
    const headerRow = document.createElement('tr')
    const headers = ['#', t('monitorWorker'), t('assignZone'), t('monitorLines'), t('monitorDateTime'), t('monitorDuration'), t('monitorQuantity'), t('monitorNotesLabel')]
    headers.forEach((h) => {
      const th = document.createElement('th')
      th.textContent = h
      th.style.cssText = 'text-align:left;padding:6px 8px;border:1px solid #b4b4b4;background:#f1f5f9;font-weight:bold;'
      headerRow.appendChild(th)
    })
    thead.appendChild(headerRow)
    table.appendChild(thead)
    const tbody = document.createElement('tbody')
    const cellStyle = 'text-align:left;padding:5px 8px;border:1px solid #b4b4b4;'
    filteredOpsLog.forEach((r, i) => {
      const dt = r.dateTime || r.createdAt
      const dateStr = dt ? new Date(dt).toLocaleString() : '—'
      const durationStr = r.duration != null ? `${r.duration} min` : '—'
      const qtyStr = r.quantity != null ? `${r.quantity} ${(r.unit || '').trim()}`.trim() || '—' : '—'
      const notesPart = (r.notes || '').trim()
      const engPart = (r.engineerNotes || '').trim()
      const notesStr = notesPart && engPart ? `${notesPart} | ${engPart}` : notesPart || engPart || '—'
      const row = document.createElement('tr')
      const cells = [
        i + 1,
        (r.worker || '—').trim(),
        (r.zone || r.zoneId || '—').trim(),
        (r.linesArea || r.lines || '—').trim(),
        dateStr,
        durationStr,
        qtyStr,
        notesStr,
      ]
      cells.forEach((val) => {
        const td = document.createElement('td')
        td.textContent = String(val)
        td.style.cssText = cellStyle
        row.appendChild(td)
      })
      tbody.appendChild(row)
    })
    table.appendChild(tbody)
    wrap.appendChild(table)
    document.body.appendChild(wrap)
    html2canvas(wrap, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    }).then((canvas) => {
      document.body.removeChild(wrap)
      const tEn = (key) => getTranslation('en', 'engineer', key)
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const margin = 12
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const w = pageW - margin * 2
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.text(tEn('opsLog'), margin, 10)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      const periodLabel = opsFilterPeriod === '7d' ? tEn('last7Days') : opsFilterPeriod === '30d' ? tEn('last30Days') : opsFilterPeriod === 'custom' ? `${opsFilterDateFrom || '—'} ${tEn('monitorTo')} ${opsFilterDateTo || '—'}` : tEn('allTime')
      const filterLine = `${tEn('monitorGenerated')}: ${new Date().toLocaleString()}  |  ${tEn('assignZone')}: ${opsFilterZone ? (ZONE_LABELS[opsFilterZone] || opsFilterZone) : tEn('allZones')}  |  ${tEn('monitorWorker')}: ${opsFilterWorker || tEn('allWorkers')}  |  ${tEn('timePeriod')}: ${periodLabel}`
      const splitLines = pdf.splitTextToSize(filterLine, w)
      let y = 16
      splitLines.forEach((line) => { pdf.text(line, margin, y); y += 5 })
      y += 4
      const availableH = pageH - y - margin
      const imgW = w
      const imgH = (canvas.height * w) / canvas.width
      if (imgH <= availableH) {
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, y, imgW, imgH)
      } else {
        const sliceHpx = (availableH / imgH) * canvas.height
        let srcY = 0
        let isFirstPage = true
        while (srcY < canvas.height) {
          if (!isFirstPage) pdf.addPage('a4', 'landscape')
          const sliceHeight = Math.min(sliceHpx, canvas.height - srcY)
          const sliceCanvas = document.createElement('canvas')
          sliceCanvas.width = canvas.width
          sliceCanvas.height = sliceHeight
          const ctx = sliceCanvas.getContext('2d')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height)
          ctx.drawImage(canvas, 0, srcY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
          const sliceHmm = (sliceHeight / canvas.height) * imgH
          pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, isFirstPage ? y : margin, imgW, sliceHmm)
          srcY += sliceHeight
          isFirstPage = false
        }
      }
      pdf.save(`Operations-log-${new Date().toISOString().slice(0, 10)}.pdf`)
    }).catch(() => { document.body.removeChild(wrap) })
  }

  useEffect(() => {
    const ms = 60 * 1000
    const interval = setInterval(() => setTick((t) => t + 1), ms)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!openActionsSessionId) return
    const onDocClick = (ev) => {
      if (ev.target.closest('[data-actions-wrap]') || ev.target.closest('[data-actions-menu]')) return
      setOpenActionsSessionId(null)
      setDropdownAnchor(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [openActionsSessionId])

  const now = Date.now()

  /** Sessions from store that are not completed. */
  const realActiveSessions = useMemo(() => sessions.filter((s) => !s.completedAt), [sessions])
  /** Task IDs that already have at least one *active* session – only exclude from virtual if there's an active session for that task. */
  const taskIdsWithActiveSession = useMemo(
    () => new Set(realActiveSessions.map((s) => String(s.taskId)).filter(Boolean)),
    [realActiveSessions]
  )
  /** Virtual sessions: every IN_PROGRESS task that does NOT have an active session (so completed-only sessions don't hide it). */
  const virtualSessionsFromTasks = useMemo(() => {
    const list = []
    ;(tasks || []).forEach((task) => {
      if (!isTaskInProgress(task.status)) return
      if (task.id != null && taskIdsWithActiveSession.has(String(task.id))) return
      const dept = getDepartment(task.departmentId)
      const deptId = task.departmentId || task.taskType
      const taskLabel = getTasksForDepartment(deptId)?.find((t) => t.id === task.taskId)
      const zoneIdNorm = task.zoneId != null ? String(task.zoneId).toLowerCase() : ''
      const zoneLabel = ZONE_LABELS[zoneIdNorm] ?? (zoneIdNorm === 'inventory' ? 'Inventory' : zoneIdNorm ? `Zone ${zoneIdNorm.toUpperCase()}` : '—')
      const workerIds = Array.isArray(task.workerIds) ? task.workerIds : []
      const departmentIdNorm = (task.departmentId || task.taskType || '').toLowerCase()
      /* Tasks with no real session are self-started (worker started from tablet); show Source = Self-started */
      const baseSession = {
        taskId: task.id,
        taskDefId: task.taskId,
        departmentId: departmentIdNorm || task.departmentId,
        department: dept?.labelEn ?? task.departmentId ?? '—',
        taskTypeId: departmentIdNorm || task.departmentId,
        task: taskLabel?.labelEn ?? task.taskId ?? '—',
        zoneId: zoneIdNorm || task.zoneId,
        zone: zoneLabel,
        linesArea: task.linesArea || '—',
        startTime: task.createdAt || new Date().toISOString(),
        expectedMinutes: task.estimatedMinutes || 60,
        assignedByEngineer: false,
      }
      if (workerIds.length === 0) {
        list.push({
          id: `task-${task.id}`,
          workerId: '',
          workerName: '—',
          ...baseSession,
        })
      } else {
        workerIds.forEach((wId) => {
          const worker = (workers || []).find((w) => String(w.id) === String(wId))
          list.push({
            id: `task-${task.id}-${wId}`,
            workerId: String(wId),
            workerName: worker?.fullName ?? String(wId),
            ...baseSession,
          })
        })
      }
    })
    return list
  }, [tasks, taskIdsWithActiveSession, workers, ZONE_LABELS])

  /** Active work = real sessions + virtual sessions from IN_PROGRESS tasks without a session. */
  const activeSessionsOnly = useMemo(
    () => [...realActiveSessions, ...virtualSessionsFromTasks],
    [realActiveSessions, virtualSessionsFromTasks]
  )
  const completedSessionsOnly = useMemo(() => sessions.filter((s) => s.completedAt), [sessions])
  const completedCount = useMemo(() => completedSessionsOnly.length, [completedSessionsOnly])
  const sessionsWithStatus = useMemo(
    () =>
      activeSessionsOnly.map((s) => {
        const worker = (workers || []).find((w) => String(w.id) === String(s.workerId))
        return {
          ...s,
          status: getSessionStatus(s, now),
          elapsedMinutes: getElapsedMinutes(s, now),
          employeeId: worker?.employeeId || s.workerId,
        }
      }),
    [activeSessionsOnly, tick, now, workers]
  )
  const completedSessionsWithStatus = useMemo(
    () =>
      completedSessionsOnly.map((s) => {
        const worker = (workers || []).find((w) => String(w.id) === String(s.workerId))
        const completedAt = s.completedAt ? new Date(s.completedAt).getTime() : now
        const startTime = new Date(s.startTime).getTime()
        const durationMinutes = Math.round((completedAt - startTime) / 60000)
        return {
          ...s,
          status: 'completed',
          elapsedMinutes: durationMinutes,
          employeeId: worker?.employeeId || s.workerId,
        }
      }),
    [completedSessionsOnly, workers]
  )

  const tasksForFilter = useMemo(() => getTasksForDepartment(filterDept), [filterDept])

  const filtered = useMemo(() => {
    let list = sessionsWithStatus
    if (clickedCard === 'on_time') list = list.filter((s) => s.status === SESSION_STATUS.ON_TIME)
    else if (clickedCard === 'delayed') list = list.filter((s) => s.status === SESSION_STATUS.DELAYED)
    else if (clickedCard === 'flagged') list = list.filter((s) => s.status === SESSION_STATUS.FLAGGED)
    if (filterDept) list = list.filter((s) => (s.departmentId || (s.department && s.department.toLowerCase())) === filterDept)
    if (filterTaskId) {
      const task = getTaskById(filterTaskId)
      const labelEn = task?.labelEn
      const labelAr = task?.labelAr
      list = list.filter(
        (s) =>
          s.taskId === filterTaskId ||
          s.task === labelEn ||
          s.task === labelAr
      )
    }
    if (filterZone) list = list.filter((s) => (s.zoneId || (s.zone && s.zone.toLowerCase())) === filterZone)
    if (filterStatus) list = list.filter((s) => (s.status || '') === filterStatus)
    if (searchWorker.trim()) {
      const q = searchWorker.trim().toLowerCase()
      list = list.filter(
        (s) =>
          s.workerName?.toLowerCase().includes(q) ||
          s.workerId?.toLowerCase().includes(q)
      )
    }
    return list
  }, [sessionsWithStatus, clickedCard, filterDept, filterTaskId, filterZone, filterStatus, searchWorker])

  const sortedFiltered = useMemo(() => {
    const list = [...filtered]
    const key = sortBy
    const asc = sortOrder === 'asc'
    list.sort((a, b) => {
      let va = a[key]
      let vb = b[key]
      if (key === 'startTime') {
        va = new Date(a.startTime).getTime()
        vb = new Date(b.startTime).getTime()
      } else if (key === 'elapsedMinutes') {
        va = a.elapsedMinutes ?? 0
        vb = b.elapsedMinutes ?? 0
      } else if (key === 'workerName') {
        va = (a.workerName || '').toLowerCase()
        vb = (b.workerName || '').toLowerCase()
      } else if (key === 'status') {
        va = (a.status || '').toLowerCase()
        vb = (b.status || '').toLowerCase()
      } else {
        va = String(va ?? '').toLowerCase()
        vb = String(vb ?? '').toLowerCase()
      }
      if (va < vb) return asc ? -1 : 1
      if (va > vb) return asc ? 1 : -1
      return 0
    })
    return list
  }, [filtered, sortBy, sortOrder])

  const summary = useMemo(() => {
    const onTime = sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.ON_TIME).length
    const delayed = sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.DELAYED).length
    const flagged = sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.FLAGGED).length
    return {
      activeWorkers: new Set(sessionsWithStatus.map((s) => s.workerId)).size,
      activeTasks: sessionsWithStatus.length,
      onTimeTasks: onTime,
      delayedTasks: delayed,
      flaggedIssues: flagged,
      completedTasks: completedCount,
    }
  }, [sessionsWithStatus, completedCount])

  const performanceRisk = useMemo(() => {
    const total = sessionsWithStatus.length
    const delayed = sessionsWithStatus.filter((s) => s.status === SESSION_STATUS.DELAYED).length
    const delayRate = total > 0 ? Math.round((delayed / total) * 100) : 0
    const risk = getRiskLevel(delayRate)
    const now = Date.now()
    const oneDay = 24 * 60 * 60 * 1000
    let last7Total = 0
    let prev7Total = 0
    for (let i = 0; i < 7; i++) {
      const dayEnd = getDayEnd(now - (i + 1) * oneDay)
      const count = sessions.filter((s) => isSessionDelayedAtEndOfDay(s, dayEnd)).length
      last7Total += count
    }
    for (let i = 7; i < 14; i++) {
      const dayEnd = getDayEnd(now - (i + 1) * oneDay)
      const count = sessions.filter((s) => isSessionDelayedAtEndOfDay(s, dayEnd)).length
      prev7Total += count
    }
    const trendPercent = prev7Total > 0 ? Math.round(((last7Total - prev7Total) / prev7Total) * 100) : (last7Total > 0 ? 100 : 0)
    const trendDirection = last7Total >= prev7Total ? 'up' : 'down'
    return {
      delayRate,
      riskLabelKey: risk.labelKey,
      riskColor: risk.color,
      trendPercent: trendDirection === 'up' ? trendPercent : -Math.abs(trendPercent),
      trendDirection,
    }
  }, [sessionsWithStatus, sessions])

  const riskTrendByDay = useMemo(() => {
    const now = Date.now()
    const oneDay = 24 * 60 * 60 * 1000
    const days = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now - i * oneDay)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = getDayEnd(dayStart.getTime())
      const count = sessions.filter((s) => isSessionDelayedAtEndOfDay(s, dayEnd)).length
      days.push({ date: dayStart.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), count })
    }
    return days
  }, [sessions])

  const bottleneckInsights = useMemo(() => {
    const active = sessionsWithStatus
    const byZone = {}
    const byDept = {}
    active.forEach((s) => {
      const z = s.zone || s.zoneId || 'Other'
      const d = s.department || s.departmentId || 'Other'
      if (!byZone[z]) byZone[z] = { total: 0, delayed: 0 }
      if (!byDept[d]) byDept[d] = { total: 0, delayed: 0 }
      byZone[z].total += 1
      byDept[d].total += 1
      if (s.status === SESSION_STATUS.DELAYED) {
        byZone[z].delayed += 1
        byDept[d].delayed += 1
      }
    })
    const zoneEntries = Object.entries(byZone).map(([name, v]) => ({ name, ...v, rate: v.total > 0 ? Math.round((v.delayed / v.total) * 100) : 0 }))
    const deptEntries = Object.entries(byDept).map(([name, v]) => ({ name, ...v, rate: v.total > 0 ? Math.round((v.delayed / v.total) * 100) : 0 }))
    const zone = zoneEntries.sort((a, b) => b.rate - a.rate)[0] || null
    const dept = deptEntries.sort((a, b) => b.rate - a.rate)[0] || null
    return { zone, department: dept }
  }, [sessionsWithStatus])

  function toggleFlag(sessionId, sessionData) {
    const s = (sessions || []).find((x) => x.id === sessionId)
    if (s) {
      updateSession(sessionId, { flagged: !s.flagged })
      if (viewSession?.id === sessionId) setViewSession((v) => (v ? { ...v, flagged: !v.flagged } : null))
      return
    }
    /* Virtual session (from IN_PROGRESS task): add a real session so Flag/Unflag works */
    if (sessionData && String(sessionId).startsWith('task-')) {
      const newId = `s-assign-${sessionData.taskId || sessionId}-${sessionData.workerId || '0'}`
      const existing = (sessions || []).find((x) => x.id === newId)
      if (existing) {
        updateSession(newId, { flagged: !existing.flagged })
        if (viewSession?.id === newId) setViewSession((v) => (v ? { ...v, flagged: !v.flagged } : null))
      } else {
        addSession({
          id: newId,
          taskId: sessionData.taskId,
          workerId: sessionData.workerId ?? '',
          workerName: sessionData.workerName ?? '—',
          departmentId: sessionData.departmentId,
          department: sessionData.department,
          taskTypeId: sessionData.taskTypeId,
          task: sessionData.task,
          zoneId: sessionData.zoneId,
          zone: sessionData.zone,
          linesArea: sessionData.linesArea,
          startTime: sessionData.startTime,
          expectedMinutes: sessionData.expectedMinutes ?? 60,
          flagged: true,
          notes: sessionData.notes ?? [],
          assignedByEngineer: sessionData.assignedByEngineer ?? true,
        })
      }
    }
  }

  function addNote(sessionId, text) {
    if (!text.trim()) return
    const s = sessions.find((x) => x.id === sessionId)
    if (s) updateSession(sessionId, { notes: [...(s.notes || []), { at: new Date().toISOString(), text: text.trim() }] })
    setNoteSession(null)
    setNoteText('')
  }

  function markCompleted(sessionId, sessionData) {
    const s = (sessions || []).find((x) => x.id === sessionId)
    const completedAt = new Date().toISOString()

    if (s) {
      if (viewSession?.id === sessionId) setViewSession(null)
      if (noteSession?.id === sessionId) setNoteSession(null)
      const startMs = s.startTime ? new Date(s.startTime).getTime() : Date.now()
      const durationMinutes = Math.round((Date.now() - startMs) / 60000)
      const engineerNotesStr = (s.notes?.length)
        ? s.notes.map((n) => (n.text || '').trim()).filter(Boolean).join('\n')
        : undefined
      const linesVal = s.linesArea ?? s.lines ?? '—'
      addRecord({
        id: nextRecordId(records),
        recordType: 'production',
        worker: s.workerName ?? '',
        department: s.department ?? '',
        task: s.task ?? '',
        zone: s.zone ?? '',
        zoneId: s.zoneId ?? '',
        linesArea: linesVal,
        lines: linesVal,
        dateTime: completedAt,
        createdAt: completedAt,
        duration: durationMinutes,
        startTime: s.startTime ?? completedAt,
        notes: undefined,
        engineerNotes: engineerNotesStr,
        imageData: s.imageData,
      })
      if (s.taskId) updateTaskStatus(s.taskId, TASK_STATUS.COMPLETED)
      removeSession(sessionId)
      return
    }

    /* Virtual session (from IN_PROGRESS task): mark task completed and add production record */
    if (sessionData && String(sessionId).startsWith('task-') && sessionData.taskId) {
      updateTaskStatus(sessionData.taskId, TASK_STATUS.COMPLETED)
      if (viewSession?.id === sessionId) setViewSession(null)
      if (noteSession?.id === sessionId) setNoteSession(null)
      const startMs = sessionData.startTime ? new Date(sessionData.startTime).getTime() : Date.now()
      const durationMinutes = Math.round((Date.now() - startMs) / 60000)
      const engineerNotesStr = (sessionData.notes?.length)
        ? sessionData.notes.map((n) => (n.text || '').trim()).filter(Boolean).join('\n')
        : undefined
      addRecord({
        id: nextRecordId(records),
        recordType: 'production',
        worker: sessionData.workerName ?? '',
        department: sessionData.department ?? '',
        task: sessionData.task ?? '',
        zone: sessionData.zone ?? '',
        zoneId: sessionData.zoneId,
        linesArea: sessionData.linesArea ?? '',
        lines: sessionData.linesArea ?? '',
        dateTime: completedAt,
        createdAt: completedAt,
        duration: durationMinutes,
        startTime: sessionData.startTime,
        notes: undefined,
        engineerNotes: engineerNotesStr,
        imageData: sessionData.imageData,
      })
    }
  }

  function handleSort(key) {
    if (sortBy === key) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    else {
      setSortBy(key)
      setSortOrder('asc')
    }
  }

  function exportActiveWorkersPDF() {
    const el = activeWorkersTableRef.current
    if (!el) return
    html2canvas(el, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    }).then((canvas) => {
      const tEn = (key) => getTranslation('en', 'engineer', key)
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()
      const margin = 10
      const w = pdfW - margin * 2
      const h = (canvas.height * w) / canvas.width
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      const reportTitle = clickedCard === 'delayed' ? tEn('monitorDelayedTasks') : clickedCard === 'flagged' ? tEn('monitorFlaggedIssues') : clickedCard === 'on_time' ? tEn('monitorOnTimeTasks') : tEn('monitorActiveWorkers')
      pdf.text(reportTitle, margin, 12)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.text(new Date().toLocaleString(), margin, 18)
      let y = 24
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text(tEn('monitorFiltersApplied'), margin, y)
      y += 5
      const deptLabel = filterDept ? (getDepartment(filterDept)?.labelEn ?? getDepartment(filterDept)?.labelAr ?? filterDept) : tEn('monitorAll')
      const taskLabel = filterTaskId ? (taskLabelByLang(getTaskById(filterTaskId), 'en') || filterTaskId) : tEn('monitorAll')
      const zoneLabel = filterZone ? (ZONE_LABELS[filterZone] || filterZone) : tEn('monitorAll')
      const statusLabel = filterStatus ? (filterStatus === 'completed' ? tEn('monitorCompleted') : filterStatus === SESSION_STATUS.ON_TIME ? tEn('monitorOnTime') : filterStatus === SESSION_STATUS.DELAYED ? tEn('monitorDelayed') : filterStatus === SESSION_STATUS.FLAGGED ? tEn('monitorFlagged') : (SESSION_STATUS_LABELS[filterStatus] ?? filterStatus)) : tEn('monitorAll')
      const workerSearch = searchWorker.trim() || '—'
      const sortCol = sortBy === 'workerName' ? tEn('monitorWorkerName') : sortBy === 'department' ? tEn('assignDepartment') : sortBy === 'task' ? tEn('assignTask') : sortBy === 'zone' ? tEn('assignZone') : sortBy === 'startTime' ? tEn('monitorStartTime') : sortBy === 'elapsedMinutes' ? tEn('monitorDuration') : sortBy === 'status' ? tEn('monitorStatus') : sortBy
      const sortDir = sortOrder === 'asc' ? 'asc' : 'desc'
      const sortLabel = sortBy ? `${sortCol} (${sortDir})` : '—'
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      const filterLine1 = `${tEn('assignDepartment')}: ${deptLabel}   ·   ${tEn('assignTask')}: ${taskLabel}   ·   ${tEn('assignZone')}: ${zoneLabel}   ·   ${tEn('monitorStatus')}: ${statusLabel}`
      const filterLine2 = `${tEn('monitorWorkerSearch')}: ${workerSearch}`
      const filterLine3 = `${tEn('monitorSort')}: ${sortLabel}   ·   ${tEn('monitorRows')}: ${sortedFiltered.length}`
      const lineH = 5
      const split1 = pdf.splitTextToSize(filterLine1, w)
      split1.forEach((line) => { pdf.text(line, margin, y); y += lineH })
      pdf.text(filterLine2, margin, y); y += lineH
      pdf.text(filterLine3, margin, y); y += lineH
      y += 3
      pdf.setDrawColor(220, 220, 220)
      pdf.line(margin, y, margin + w, y)
      y += 4
      const headerH = y
      const imgH = Math.min(h, pdfH - headerH - 4)
      const imgW = (canvas.width * imgH) / canvas.height
      const imgX = margin + (w - imgW) / 2
      pdf.addImage(imgData, 'PNG', imgX, headerH, imgW, imgH)
      pdf.save(`Active-Workers-${new Date().toISOString().slice(0, 10)}.pdf`)
    }).catch(() => {})
  }

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><i className="fas fa-chart-pie fa-fw" /> {t('monitorSummary')}</h2>
        <div className={styles.cards}>
          <div className={styles.cardCombined}>
            <span className={styles.cardCombinedTitle}>{t('monitorSessionStatus')}</span>
            <button
              type="button"
              className={`${styles.cardCombinedRow} ${clickedCard === 'tasks' ? styles.cardCombinedRowActive : ''}`}
              onClick={() => setClickedCard(clickedCard === 'tasks' ? null : 'tasks')}
            >
              <span className={styles.cardCombinedLabel}>{t('monitorActiveTasks')}</span>
              <span className={styles.cardCombinedValue}>{summary.activeTasks}</span>
            </button>
            <button
              type="button"
              className={`${styles.cardCombinedRow} ${styles.cardCombinedRowDelayed} ${clickedCard === 'delayed' ? styles.cardCombinedRowActive : ''}`}
              onClick={() => setClickedCard(clickedCard === 'delayed' ? null : 'delayed')}
            >
              <span className={styles.cardCombinedLabel}>{t('monitorDelayed')}</span>
              <span className={styles.cardCombinedValue}>{summary.delayedTasks}</span>
            </button>
            <button
              type="button"
              className={`${styles.cardCombinedRow} ${styles.cardCombinedRowFlagged} ${clickedCard === 'flagged' ? styles.cardCombinedRowActive : ''}`}
              onClick={() => setClickedCard(clickedCard === 'flagged' ? null : 'flagged')}
            >
              <span className={styles.cardCombinedLabel}>{t('monitorFlagged')}</span>
              <span className={styles.cardCombinedValue}>{summary.flaggedIssues}</span>
            </button>
          </div>
          <button
            type="button"
            className={`${styles.card} ${styles.cardRisk} ${styles[`cardRisk${performanceRisk.riskColor.charAt(0).toUpperCase() + performanceRisk.riskColor.slice(1)}`]}`}
            onClick={() => setRiskModalOpen(true)}
          >
            <span className={styles.cardLabel}>{t('monitorPerformanceRiskOverview')}</span>
            <span className={styles.cardValue}>{performanceRisk.delayRate}%</span>
            <span className={styles.cardRiskLabel}>{t(performanceRisk.riskLabelKey)}</span>
            <span className={styles.cardRiskTrend}>
              {performanceRisk.trendDirection === 'up' ? '↑' : '↓'} {performanceRisk.trendDirection === 'up' ? '+' : ''}{performanceRisk.trendPercent}% {t('monitorVsLastWeek')}
            </span>
          </button>
          <div className={`${styles.mergedKpiCard} ${styles.mergedKpiCardRecords}`}>
            <span className={styles.mergedKpiCardTitle}>{t('monitorRecordsAndZone')}</span>
            <div className={styles.mergedKpiBlock}>
              <span className={styles.mergedKpiLabel}>{t('monitorTotalRecords')}</span>
              <span className={styles.mergedKpiValue}>{kpiTotalRecords.total}</span>
              {kpiTotalRecords.pctChange != null && (
                <span className={styles.mergedKpiSub}>
                  {kpiTotalRecords.pctChange >= 0 ? '↑' : '↓'} {kpiTotalRecords.pctChange >= 0 ? '+' : ''}{kpiTotalRecords.pctChange}% {t('monitorVsPreviousPeriod')}
                </span>
              )}
            </div>
            <div className={styles.mergedKpiBlock}>
              <span className={styles.mergedKpiLabel}>{t('monitorMostTimeConsumingZone')}</span>
              {kpiTopZone ? (
                <button type="button" className={styles.mergedKpiZoneBtn} onClick={() => setOpsFilterZone(kpiTopZone.zoneIdForFilter)} title={t('monitorFilterByThisZone')}>
                  <span className={styles.mergedKpiValue}>{kpiTopZone.zone}</span>
                  <span className={styles.mergedKpiSub}>{formatMinutesToHoursMinutes(kpiTopZone.totalMinutes)} ({kpiTopZone.pct}% of total)</span>
                </button>
              ) : (
                <>
                  <span className={styles.mergedKpiValue}>—</span>
                  <span className={styles.mergedKpiSub}>{t('monitorNoDurationData')}</span>
                </>
              )}
            </div>
          </div>
          <div className={`${styles.mergedKpiCard} ${styles.mergedKpiCardTime} ${kpiAvgDuration.status === 'ok' ? styles.mergedKpiCardOk : kpiAvgDuration.status === 'warn' ? styles.mergedKpiCardWarn : kpiAvgDuration.status === 'high' ? styles.mergedKpiCardHigh : ''}`}>
            <span className={styles.mergedKpiCardTitle}>{t('monitorTimeAndDuration')}</span>
            <div className={styles.mergedKpiBlock}>
              <span className={styles.mergedKpiLabel}>{t('monitorTotalLoggedTime')}</span>
              <span className={styles.mergedKpiValue}>{formatMinutesToHoursMinutes(kpiTotalLoggedTime.totalMinutes)}</span>
              <span className={styles.mergedKpiSub}>{t('monitorAvgPerWorker')}: {formatMinutesToHoursMinutes(kpiTotalLoggedTime.avgPerWorkerMinutes)}</span>
            </div>
            <div className={styles.mergedKpiBlock}>
              <span className={styles.mergedKpiLabel}>{t('monitorAvgDuration')}</span>
              <span className={styles.mergedKpiValue}>{formatMinutesToHoursMinutes(kpiAvgDuration.avgMinutes)}</span>
              <span className={styles.mergedKpiSub}>
                {kpiAvgDuration.status === 'ok' ? t('withinExpected') : kpiAvgDuration.status === 'warn' ? t('slightlyAbove') : kpiAvgDuration.status === 'high' ? t('aboveExpected') : '—'}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.tableSection}`}>
        <div className={styles.filtersRow}>
          <h2 className={styles.sectionTitle}>
            {clickedCard === 'delayed' ? t('monitorDelayedTasks') : clickedCard === 'flagged' ? t('monitorFlaggedIssues') : clickedCard === 'on_time' ? t('monitorOnTimeTasks') : t('monitorActiveWorkers')}
          </h2>
          <div className={styles.filtersActions}>
            <button type="button" className={styles.exportBtn} onClick={exportActiveWorkersPDF} disabled={sortedFiltered.length === 0}>
              <i className="fas fa-file-pdf fa-fw" /> {t('monitorExportPdf')}
            </button>
          </div>
        </div>
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label>{t('assignDepartment')}</label>
            <select
              value={filterDept}
              onChange={(e) => {
                setFilterDept(e.target.value)
                setFilterTaskId('')
              }}
            >
              <option value="">{t('monitorAll')}</option>
              {DEPARTMENT_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label>{t('assignTask')}</label>
            <select
              value={filterTaskId}
              onChange={(e) => setFilterTaskId(e.target.value)}
              disabled={!filterDept}
              title={!filterDept ? t('monitorSelectDepartmentFirst') : ''}
            >
              <option value="">{t('monitorAll')}</option>
              {tasksForFilter.map((task) => (
                <option key={task.id} value={task.id}>{taskLabelByLang(task, lang)}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label>{t('assignZone')}</label>
            <select value={filterZone} onChange={(e) => setFilterZone(e.target.value)}>
              <option value="">{t('monitorAll')}</option>
              {zonesList.map((z) => (
                <option key={z.id} value={z.id}>{z.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label>{t('monitorStatus')}</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">{t('monitorAll')}</option>
              <option value={SESSION_STATUS.ON_TIME}>{t('monitorOnTime')}</option>
              <option value={SESSION_STATUS.DELAYED}>{t('monitorDelayed')}</option>
              <option value={SESSION_STATUS.FLAGGED}>{t('monitorFlagged')}</option>
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label>{t('monitorWorkerNameOrId')}</label>
            <input
              type="search"
              placeholder={t('searchPlaceholder')}
              value={searchWorker}
              onChange={(e) => setSearchWorker(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.tableWrap} ref={activeWorkersTableRef}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th><button type="button" className={styles.thSort} onClick={() => handleSort('workerName')}>{t('monitorWorkerName')} {sortBy === 'workerName' && (sortOrder === 'asc' ? '↑' : '↓')}</button></th>
                <th><button type="button" className={styles.thSort} onClick={() => handleSort('department')}>{t('assignDepartment')} {sortBy === 'department' && (sortOrder === 'asc' ? '↑' : '↓')}</button></th>
                <th><button type="button" className={styles.thSort} onClick={() => handleSort('task')}>{t('assignTask')} {sortBy === 'task' && (sortOrder === 'asc' ? '↑' : '↓')}</button></th>
                <th><button type="button" className={styles.thSort} onClick={() => handleSort('zone')}>{t('assignZone')} {sortBy === 'zone' && (sortOrder === 'asc' ? '↑' : '↓')}</button></th>
                <th>{t('monitorLinesArea')}</th>
                <th><button type="button" className={styles.thSort} onClick={() => handleSort('startTime')}>{t('monitorStartTime')} {sortBy === 'startTime' && (sortOrder === 'asc' ? '↑' : '↓')}</button></th>
                <th><button type="button" className={styles.thSort} onClick={() => handleSort('elapsedMinutes')}>{t('monitorDuration')} {sortBy === 'elapsedMinutes' && (sortOrder === 'asc' ? '↑' : '↓')}</button></th>
                <th>{t('monitorSource')}</th>
                <th><button type="button" className={styles.thSort} onClick={() => handleSort('status')}>{t('monitorStatus')} {sortBy === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}</button></th>
                <th>{t('monitorActions')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.length === 0 ? (
                <tr>
                  <td colSpan={10} className={styles.emptyCell}>
                    {t('monitorNoSessionsMatch')}
                  </td>
                </tr>
              ) : (
                sortedFiltered.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.workerName}
                      {s.employeeId && <span className={styles.workerId}> ({s.employeeId})</span>}
                    </td>
                    <td>{getDepartmentDisplayLabel(s.departmentId) || s.department}</td>
                    <td>{getTaskDisplayLabel(s)}</td>
                    <td>{s.zone}</td>
                    <td>{s.linesArea}</td>
                    <td>{new Date(s.startTime).toLocaleString()}</td>
                    <td>{formatDuration(s.elapsedMinutes)}</td>
                    <td>{s.assignedByEngineer ? t('monitorAssigned') : t('monitorSelfStarted')}</td>
                    <td>
                      {s.status === 'completed' ? (
                        <span className={styles.statusBadge} data-status="completed" style={{ background: '#dcfce7', color: '#166534' }}>
                          {t('monitorCompleted')}
                        </span>
                      ) : (
                        <span className={styles.statusBadge} data-status={s.status}>
                          {getSessionStatusDisplayLabel(s.status)}
                        </span>
                      )}
                    </td>
                    <td className={styles.cellActions}>
                        <div className={styles.actionsWrap} data-actions-wrap>
                          <button
                            type="button"
                            className={styles.actionsBtn}
                            onClick={(ev) => {
                              if (openActionsSessionId === s.id) {
                                setOpenActionsSessionId(null)
                                setDropdownAnchor(null)
                              } else {
                                const rect = ev.currentTarget.getBoundingClientRect()
                                setOpenActionsSessionId(s.id)
                                setDropdownAnchor({ top: rect.bottom + 2, left: rect.left })
                              }
                            }}
                            aria-expanded={openActionsSessionId === s.id}
                            aria-haspopup="true"
                          >
                            {t('monitorActions')} <span className={styles.actionsCaret}>{openActionsSessionId === s.id ? '▲' : '▼'}</span>
                          </button>
                        </div>
                      </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {openActionsSessionId && dropdownAnchor && (() => {
        const openSession = sortedFiltered.find((ss) => ss.id === openActionsSessionId)
        if (!openSession) return null
        const closeMenu = () => { setOpenActionsSessionId(null); setDropdownAnchor(null) }
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
            <button type="button" className={styles.actionsItem} onClick={() => { setViewSession(openSession); closeMenu(); }}>{t('monitorView')}</button>
            <button type="button" className={styles.actionsItem} onClick={() => { setProfileWorker((workers || []).find((w) => String(w.id) === String(openSession.workerId)) || null); closeMenu(); }}>{t('monitorProfile')}</button>
            {openSession.status !== 'completed' && (
              <>
                <button type="button" className={styles.actionsItem} onClick={() => { setNoteSession(openSession); setNoteText(''); closeMenu(); }}>{t('monitorNote')}</button>
                <button type="button" className={styles.actionsItem} onClick={() => { toggleFlag(openSession.id, openSession); closeMenu(); }}>
                  {openSession.flagged ? t('monitorUnflag') : t('monitorFlag')}
                </button>
                <button type="button" className={`${styles.actionsItem} ${styles.actionsItemComplete}`} onClick={() => { markCompleted(openSession.id, openSession); closeMenu(); }}>{t('monitorComplete')}</button>
              </>
            )}
          </div>,
          document.body
        )
      })()}

      {/* Operations log (moved from Record Production) */}
      <section className={opsLogStyles.operationsLogSection}>
        <div className={opsLogStyles.opsLogHeader}>
          <h2 className={opsLogStyles.sectionTitle}><i className="fas fa-list-check fa-fw" /> {t('opsLog')}</h2>
          <div className={opsLogStyles.opsLogHeaderActions}>
            <button type="button" className={opsLogStyles.opsPrintBtn} onClick={exportOpsLogPDF} disabled={filteredOpsLog.length === 0} title="Download as PDF">
              <i className="fas fa-file-pdf fa-fw" /> {t('monitorExportPdf')}
            </button>
          </div>
        </div>

        <div className={opsLogStyles.opsFilters}>
          <select
            value={opsFilterZone}
            onChange={(e) => setOpsFilterZone(e.target.value)}
            className={opsLogStyles.opsFilterSelect}
            title={t('assignZone')}
          >
            <option value="">{t('allZones')}</option>
            {zonesList.map((z) => (
              <option key={z.id} value={z.id}>{z.label}</option>
            ))}
          </select>
          <select
            value={opsFilterWorker}
            onChange={(e) => setOpsFilterWorker(e.target.value)}
            className={opsLogStyles.opsFilterSelect}
            title={t('monitorWorker')}
          >
            <option value="">{t('allWorkers')}</option>
            {opsLogWorkers.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
          <select
            value={opsFilterPeriod}
            onChange={(e) => setOpsFilterPeriod(e.target.value)}
            className={opsLogStyles.opsFilterSelect}
            title={t('timePeriod')}
          >
            <option value="all">{t('allTime')}</option>
            <option value="7d">{t('last7Days')}</option>
            <option value="30d">{t('last30Days')}</option>
            <option value="custom">{t('customRange')}</option>
          </select>
          {opsFilterPeriod === 'custom' && (
            <>
              <input
                type="date"
                value={opsFilterDateFrom}
                onChange={(e) => setOpsFilterDateFrom(e.target.value)}
                className={opsLogStyles.opsFilterDate}
                title={t('monitorFrom')}
              />
              <input
                type="date"
                value={opsFilterDateTo}
                onChange={(e) => setOpsFilterDateTo(e.target.value)}
                className={opsLogStyles.opsFilterDate}
                title={t('monitorTo')}
              />
            </>
          )}
          <input
            type="text"
            value={opsFilterSearch}
            onChange={(e) => setOpsFilterSearch(e.target.value)}
            placeholder={t('searchWorkerZonePlaceholder')}
            className={opsLogStyles.opsFilterSearch}
          />
        </div>
        {recentProductionRecords.length === 0 ? (
          <p className={opsLogStyles.operationsLogEmpty}>{t('monitorNoProductionRecords')}</p>
        ) : filteredOpsLog.length === 0 ? (
          <p className={opsLogStyles.operationsLogEmpty}>{t('monitorNoRecordsMatchFilter')}</p>
        ) : (
          <div className={opsLogStyles.operationsLogList} ref={opsLogListRef}>
            {filteredOpsLog.map((r) => (
              <div key={r.id} className={opsLogStyles.opsCard}>
                {r.worker && (
                  <div className={opsLogStyles.opsRow}>
                    <span className={opsLogStyles.opsLabel}>{t('monitorWorker')}</span>
                    <span className={opsLogStyles.opsValue}>{r.worker}</span>
                  </div>
                )}
                <div className={opsLogStyles.opsRow}>
                  <span className={opsLogStyles.opsLabel}>{t('assignZone')}</span>
                  <span className={opsLogStyles.opsValue}>{r.zone || r.zoneId || '—'}</span>
                </div>
                <div className={opsLogStyles.opsRow}>
                  <span className={opsLogStyles.opsLabel}>{t('monitorLines')}</span>
                  <span className={opsLogStyles.opsValue}>{r.linesArea || r.lines || '—'}</span>
                </div>
                <div className={opsLogStyles.opsRow}>
                  <span className={opsLogStyles.opsLabel}>{t('monitorDateTime')}</span>
                  <span className={opsLogStyles.opsValue}>{r.dateTime ? new Date(r.dateTime).toLocaleString() : (r.createdAt ? new Date(r.createdAt).toLocaleString() : '—')}</span>
                </div>
                {r.duration != null && (
                  <div className={opsLogStyles.opsRow}>
                    <span className={opsLogStyles.opsLabel}>{t('monitorDuration')}</span>
                    <span className={opsLogStyles.opsValue}>{r.duration} min</span>
                  </div>
                )}
                {r.quantity != null && (
                  <div className={opsLogStyles.opsRow}>
                    <span className={opsLogStyles.opsLabel}>{t('monitorQuantity')}</span>
                    <span className={opsLogStyles.opsValue}>{`${r.quantity} ${r.unit || ''}`.trim()}</span>
                  </div>
                )}
                {r.notes && (
                  <div className={opsLogStyles.opsRow}>
                    <span className={opsLogStyles.opsLabel}>{t('monitorCommentWorker')}</span>
                    <span className={opsLogStyles.opsValue}>{r.notes}</span>
                  </div>
                )}
                {r.engineerNotes && (
                  <div className={opsLogStyles.opsRow}>
                    <span className={opsLogStyles.opsLabel}>{t('engineerNotes')}</span>
                    <span className={opsLogStyles.opsValue}>{r.engineerNotes}</span>
                  </div>
                )}
                {r.imageData && (
                  <div className={opsLogStyles.opsRow}>
                    <span className={opsLogStyles.opsLabel}>{t('monitorPhoto')}</span>
                    <span className={opsLogStyles.opsValue}>
                      <button type="button" className={opsLogStyles.opsPhotoThumb} onClick={() => setViewImageUrl(r.imageData)}>
                        <img src={r.imageData} alt="" />
                      </button>
                    </span>
                  </div>
                )}
                <div className={opsLogStyles.opsRow}>
                  <span className={opsLogStyles.opsLabel} />
                  <span className={opsLogStyles.opsValue}>
                    <button
                      type="button"
                      className={opsLogStyles.opsActionLink}
                      onClick={() => setProfileWorker((workers || []).find((w) => (r.workerId != null && String(w.id) === String(r.workerId)) || (w.fullName || '').trim() === (r.worker || '').trim()) || null)}
                    >
                      {t('monitorViewProfile')}
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {viewImageUrl && (
        <div className={opsLogStyles.imageOverlay} onClick={() => setViewImageUrl(null)} role="dialog" aria-modal="true">
          <img src={viewImageUrl} alt="" className={opsLogStyles.imageOverlayImg} onClick={(e) => e.stopPropagation()} />
          <button type="button" className={opsLogStyles.imageOverlayClose} onClick={() => setViewImageUrl(null)} aria-label={t('viewClose')}>×</button>
        </div>
      )}

      {/* View session modal – use latest from store so notes/flag updates show */}
      {viewSession && (() => {
        const currentSession = sessions.find((s) => s.id === viewSession.id) || viewSession
        return (
        <div className={styles.modalOverlay} onClick={() => setViewSession(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{t('sessionDetails')}</h3>
            <dl className={styles.dl}>
              <dt>{t('monitorWorker')}</dt><dd>{currentSession.workerName}</dd>
              <dt>{t('assignDepartment')}</dt><dd>{getDepartmentDisplayLabel(currentSession.departmentId) || currentSession.department}</dd>
              <dt>{t('assignTask')}</dt><dd>{taskLabelByLang(getTaskById(currentSession.taskId), lang) || currentSession.task}</dd>
              <dt>{t('assignZone')}</dt><dd>{currentSession.zone}</dd>
              <dt>{t('monitorLinesArea')}</dt><dd>{currentSession.linesArea}</dd>
              <dt>{t('monitorStartTime')}</dt><dd>{new Date(currentSession.startTime).toLocaleString()}</dd>
              <dt>{t('monitorExpected')}</dt><dd>{currentSession.expectedMinutes} min</dd>
              <dt>{t('monitorStatus')}</dt><dd><span className={styles.statusBadge} data-status={currentSession.flagged ? SESSION_STATUS.FLAGGED : getSessionStatus(currentSession)}>{getSessionStatusDisplayLabel(currentSession.flagged ? SESSION_STATUS.FLAGGED : getSessionStatus(currentSession))}</span></dd>
              <dt>{t('monitorSource')}</dt><dd>{currentSession.assignedByEngineer ? t('monitorAssignedByEngineer') : t('monitorSelfStartedByWorker')}</dd>
              <dt>{t('monitorNotesLabel')}</dt>
              <dd>
                {currentSession.notes?.length ? (
                  <ul className={styles.notesList}>
                    {currentSession.notes.map((n, i) => (
                      <li key={i}>{n.text}</li>
                    ))}
                  </ul>
                ) : '—'}
              </dd>
            </dl>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setViewSession(null)}>{t('viewClose')}</button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Add note modal */}
      {noteSession && (
        <div className={styles.modalOverlay} onClick={() => { setNoteSession(null); setNoteText(''); }}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{t('monitorAddNote')} – {noteSession.workerName}</h3>
            <textarea
              className={styles.noteTextarea}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={t('operationalNote')}
              rows={4}
            />
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => { setNoteSession(null); setNoteText(''); }}>{t('monitorCancel')}</button>
              <button type="button" className={styles.btnPrimary} onClick={() => addNote(noteSession.id, noteText)} disabled={!noteText.trim()}>
                {t('monitorSaveNote')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile popup – worker credentials & data */}
      {profileWorker && (
        <div className={styles.modalOverlay} onClick={() => setProfileWorker(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}><i className="fas fa-user fa-fw" /> {profileWorker.fullName}</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setProfileWorker(null)} aria-label={t('viewClose')}>×</button>
            </div>
            <p className={styles.profileSubtitle}>{profileWorker.employeeId} · {profileWorker.department}</p>
            <div className={styles.profileCreds}>
              <div className={styles.profileCredRow}>
                <span className={styles.profileCredLabel}>{t('monitorUsername')}</span>
                <strong className={styles.profileCredValue}>{profileWorker.employeeId || '—'}</strong>
              </div>
              <div className={styles.profileCredRow}>
                <span className={styles.profileCredLabel}>{t('monitorPassword')}</span>
                <strong className={styles.profileCredValue}>{profileWorker.tempPassword || '—'}</strong>
              </div>
            </div>
            <div className={styles.profileQr}>
              <span className={styles.profileCredLabel}>{t('monitorQrCodeLogin')}</span>
              <img src={getQRCodeUrl(profileWorker.employeeId || '', 160)} alt="" className={styles.profileQrImg} />
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setProfileWorker(null)}>{t('viewClose')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Performance Risk Overview – expandable details */}
      {riskModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setRiskModalOpen(false)}>
          <div className={styles.riskModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}><i className="fas fa-chart-line fa-fw" /> {t('monitorPerformanceRiskOverview')}</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setRiskModalOpen(false)} aria-label={t('viewClose')}>×</button>
            </div>
            <section className={styles.riskSection}>
              <h4 className={styles.riskSectionTitle}>{t('monitor7DayDelayedTasks')}</h4>
              <div className={styles.riskChartWrap}>
                <Line
                  data={{
                    labels: riskTrendByDay.map((d) => d.date),
                    datasets: [
                      {
                        label: t('delayedCount'),
                        data: riskTrendByDay.map((d) => d.count),
                        borderColor: '#fb923c',
                        backgroundColor: '#fb923c20',
                        fill: true,
                        tension: 0.3,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { beginAtZero: true, ticks: { stepSize: 1 } },
                    },
                  }}
                  height={200}
                />
              </div>
            </section>
            <section className={styles.riskSection}>
              <h4 className={styles.riskSectionTitle}>{t('bottleneckInsights')}</h4>
              <div className={styles.bottleneckGrid}>
                {bottleneckInsights.zone && (
                  <div className={styles.bottleneckCard}>
                    <span className={styles.bottleneckLabel}>{t('monitorZoneHighestDelayRate')}</span>
                    <span className={styles.bottleneckName}>{bottleneckInsights.zone.name}</span>
                    <span className={`${styles.bottleneckRate} ${styles[`riskRate${getRiskLevel(bottleneckInsights.zone.rate).color.charAt(0).toUpperCase() + getRiskLevel(bottleneckInsights.zone.rate).color.slice(1)}`]}`}>
                      {bottleneckInsights.zone.rate}%
                    </span>
                    <span className={styles.bottleneckCount}>{bottleneckInsights.zone.delayed} {t('monitorDelayed').toLowerCase()}</span>
                  </div>
                )}
                {bottleneckInsights.department && (
                  <div className={styles.bottleneckCard}>
                    <span className={styles.bottleneckLabel}>{t('monitorDeptHighestOverdueRate')}</span>
                    <span className={styles.bottleneckName}>{bottleneckInsights.department.name}</span>
                    <span className={`${styles.bottleneckRate} ${styles[`riskRate${getRiskLevel(bottleneckInsights.department.rate).color.charAt(0).toUpperCase() + getRiskLevel(bottleneckInsights.department.rate).color.slice(1)}`]}`}>
                      {bottleneckInsights.department.rate}%
                    </span>
                    <span className={styles.bottleneckCount}>{bottleneckInsights.department.delayed} {t('monitorDelayed').toLowerCase()}</span>
                  </div>
                )}
              </div>
            </section>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setRiskModalOpen(false)}>{t('viewClose')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

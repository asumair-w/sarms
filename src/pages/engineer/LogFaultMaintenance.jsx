import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { EQUIPMENT_STATUS, EQUIPMENT_STATUS_LABELS } from '../../data/inventory'
import {
  FAULT_CATEGORIES,
  SEVERITY_OPTIONS,
  MAINTENANCE_TYPES,
  FAULT_TYPE_PREVENTIVE_ALERT,
  FAULT_STATUS_OPEN,
  FAULT_STATUS_RESOLVED,
  FAILURE_WINDOW_DAYS,
  FAILURE_RATE_PER_DAYS,
  HIGH_FAILURE_RATE_THRESHOLD,
  TICKET_TYPES,
  PRIORITY_OPTIONS,
} from '../../data/faults'
import { getInitialZones } from '../../data/workerFlow'
import { useAppStore } from '../../context/AppStoreContext'
import { useLanguage } from '../../context/LanguageContext'
import { getTranslation } from '../../i18n/translations'
import { nextFaultId, nextMaintenancePlanId, nextEquipmentId } from '../../utils/idGenerators'
import styles from './LogFaultMaintenance.module.css'
import eqStyles from './InventoryEquipment.module.css'

function getTodayLocal() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function addDaysLocal(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function remainingDays(nextInspectionStr, todayStr) {
  if (!nextInspectionStr) return null
  const a = new Date(nextInspectionStr + 'T12:00:00').getTime()
  const b = new Date(todayStr + 'T12:00:00').getTime()
  return Math.floor((a - b) / 86400000)
}
function cycleProgressPercent(lastStr, nextStr, todayStr) {
  if (!lastStr || !nextStr) return null
  const last = new Date(lastStr + 'T12:00:00').getTime()
  const next = new Date(nextStr + 'T12:00:00').getTime()
  const today = new Date(todayStr + 'T12:00:00').getTime()
  const span = next - last
  if (span <= 0) return null
  return Math.max(0, ((today - last) / span) * 100)
}
function ageYears(createdAt) {
  if (!createdAt) return null
  return (Date.now() - new Date(createdAt).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
}

export default function LogFaultMaintenance() {
  const navigate = useNavigate()
  const location = useLocation()
  const { lang } = useLanguage()
  const t = (key) => getTranslation(lang, 'engineer', key)
  const getEquipmentStatusDisplayLabel = (status) => (status === EQUIPMENT_STATUS.ACTIVE ? t('eqActive') : status === EQUIPMENT_STATUS.UNDER_MAINTENANCE ? t('eqUnderMaintenance') : status === EQUIPMENT_STATUS.OUT_OF_SERVICE ? t('eqOutOfService') : status || '—')
  const getTicketTypeDisplayLabel = (id) => (id === 'fault' ? t('eqTicketTypeFault') : id === 'preventive' ? t('eqTicketTypePreventive') : id === 'corrective' ? t('eqTicketTypeCorrective') : id === 'inspection' ? t('eqTicketTypeInspection') : id || '—')
  const getSeverityDisplayLabel = (id) => (id === 'low' ? t('eqSeverityLow') : id === 'medium' ? t('eqSeverityMedium') : id === 'high' ? t('eqSeverityHigh') : id === 'critical' ? t('eqSeverityCritical') : id || '—')
  const getFaultCategoryDisplayLabel = (id) => (id === 'mechanical' ? t('eqFaultCatMechanical') : id === 'electrical' ? t('eqFaultCatElectrical') : id === 'operational' ? t('eqFaultCatOperational') : id === 'other' ? t('eqFaultCatOther') : id || '—')
  const { equipment, faults, maintenancePlans, addFault, addMaintenancePlan, updateMaintenancePlan, updateEquipmentItem, addEquipmentItem, removeEquipmentItem, updateFault, zones: storeZones } = useAppStore()
  const zonesList = (storeZones && storeZones.length > 0) ? storeZones : getInitialZones()

  const [equipmentOpen, setEquipmentOpen] = useState(true)
  const [eqFilterZone, setEqFilterZone] = useState('')
  const [eqFilterStatus, setEqFilterStatus] = useState('')
  const [eqFilterSearch, setEqFilterSearch] = useState('')
  const [eqSortBy, setEqSortBy] = useState('name')
  const [eqSortDir, setEqSortDir] = useState('asc')
  const [editEquipment, setEditEquipment] = useState(null)
  const [addEquipmentOpen, setAddEquipmentOpen] = useState(false)
  const [newEquipment, setNewEquipment] = useState({ name: '', zone: '', status: EQUIPMENT_STATUS.ACTIVE, lastInspection: '' })
  const [viewHistoryEquipment, setViewHistoryEquipment] = useState(null)
  const [openActionsId, setOpenActionsId] = useState(null)
  const [dropdownAnchor, setDropdownAnchor] = useState(null) // { top, left } for portal menu
  const [eqFilterHighFailure, setEqFilterHighFailure] = useState(false)
  const [activeTicketsFilter, setActiveTicketsFilter] = useState('all') // 'all' | 'overdue' | 'this_week'
  const activeTicketsSectionRef = useRef(null)
  const equipmentSectionRef = useRef(null)
  const equipmentTableRef = useRef(null)

  function scrollToTickets(filter) {
    setActiveTicketsFilter(filter)
    setTimeout(() => activeTicketsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }
  function scrollToEquipment() {
    setEquipmentOpen(true)
    setTimeout(() => equipmentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const equipmentWithInspection = useMemo(() => {
    const today = getTodayLocal()
    return equipment.map((e) => {
      const interval = e.inspectionInterval != null ? Number(e.inspectionInterval) : null
      const last = e.lastInspection || null
      const next = e.nextInspection || (last && interval != null ? addDaysLocal(last, interval) : null)
      const days = next != null ? remainingDays(next, today) : null
      let inspectionStatus = null
      if (days != null) {
        if (days > 7) inspectionStatus = 'ok'
        else if (days >= 0) inspectionStatus = 'due_soon'
        else inspectionStatus = 'overdue'
      }
      return {
        ...e,
        inspectionInterval: interval,
        nextInspection: next,
        remainingDays: days,
        inspectionStatus,
        cycleProgress: cycleProgressPercent(last, next, today),
        ageYears: ageYears(e.createdAt),
      }
    })
  }, [equipment])

  const equipmentWithLastCheck = useMemo(() => {
    const toMs = (d) => (d ? new Date(d).getTime() : 0)
    const toDateStr = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : null)
    return equipmentWithInspection.map((e) => {
      let latestMs = toMs(e.lastInspection) || 0
      let lastTicketCreatedMs = 0
      ;(faults || []).forEach((f) => {
        if (f.equipmentId !== e.id) return
        if (toMs(f.createdAt) > latestMs) latestMs = toMs(f.createdAt)
        if (toMs(f.resolvedAt) > latestMs) latestMs = toMs(f.resolvedAt)
        if (toMs(f.createdAt) > lastTicketCreatedMs) lastTicketCreatedMs = toMs(f.createdAt)
      })
      ;(maintenancePlans || []).forEach((m) => {
        if (m.equipmentId !== e.id) return
        if (toMs(m.plannedDate) > latestMs) latestMs = toMs(m.plannedDate)
        if (toMs(m.createdAt) > latestMs) latestMs = toMs(m.createdAt)
        if (toMs(m.resolvedAt) > latestMs) latestMs = toMs(m.resolvedAt)
        if (toMs(m.createdAt) > lastTicketCreatedMs) lastTicketCreatedMs = toMs(m.createdAt)
      })
      return { ...e, lastCheck: toDateStr(latestMs) || e.lastInspection || null, lastTicketCreated: lastTicketCreatedMs ? toDateStr(lastTicketCreatedMs) : null }
    })
  }, [equipmentWithInspection, faults, maintenancePlans])

  const inspectionDueSoonCount = useMemo(() => equipmentWithInspection.filter((e) => e.inspectionStatus === 'due_soon').length, [equipmentWithInspection])
  const inspectionOverdueCount = useMemo(() => equipmentWithInspection.filter((e) => e.inspectionStatus === 'overdue').length, [equipmentWithInspection])

  const { highFailureCount, highFailureIdsSet, failureCountByEquipmentId, failureRateByEquipmentId } = useMemo(() => {
    const now = Date.now()
    const cutoff = now - FAILURE_WINDOW_DAYS * 24 * 60 * 60 * 1000
    const toMs = (d) => (d ? new Date(d).getTime() : 0)
    const countByEq = {}
    ;(faults || []).forEach((f) => {
      if (f.type === FAULT_TYPE_PREVENTIVE_ALERT || f.auto_generated) return
      const status = f.status || FAULT_STATUS_OPEN
      if (status !== FAULT_STATUS_OPEN && status !== FAULT_STATUS_RESOLVED) return
      if (toMs(f.createdAt) < cutoff) return
      const id = f.equipmentId
      if (id) countByEq[id] = (countByEq[id] || 0) + 1
    })
    ;(maintenancePlans || []).forEach((m) => {
      if (m.type !== 'corrective') return
      if (toMs(m.createdAt) < cutoff) return
      const id = m.equipmentId
      if (id) countByEq[id] = (countByEq[id] || 0) + 1
    })
    const rateByEq = {}
    Object.entries(countByEq).forEach(([id, c]) => { rateByEq[id] = (c / FAILURE_WINDOW_DAYS) * FAILURE_RATE_PER_DAYS })
    const highIds = Object.entries(rateByEq).filter(([, r]) => r >= HIGH_FAILURE_RATE_THRESHOLD).map(([id]) => id)
    return { highFailureCount: highIds.length, highFailureIdsSet: new Set(highIds), failureCountByEquipmentId: countByEq, failureRateByEquipmentId: rateByEq }
  }, [faults, maintenancePlans])

  const filteredEquipment = useMemo(() => {
    let list = equipmentWithLastCheck
    if (eqFilterHighFailure) list = list.filter((e) => highFailureIdsSet.has(e.id))
    if (eqFilterZone) list = list.filter((e) => (e.zone || '').toLowerCase() === eqFilterZone.toLowerCase())
    if (eqFilterStatus) list = list.filter((e) => e.status === eqFilterStatus)
    if (eqFilterSearch.trim()) {
      const q = eqFilterSearch.trim().toLowerCase()
      const zoneNames = Object.fromEntries(zonesList.map((z) => [z.id, (z.label || z.name || z.id).toLowerCase()]))
      list = list.filter((e) => (e.name || '').toLowerCase().includes(q) || (e.zone || '').toLowerCase().includes(q) || (zoneNames[e.zone] || '').includes(q))
    }
    const dir = eqSortDir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      if (eqSortBy === 'lastInspection') {
        const va = a.lastCheck ? new Date(a.lastCheck).getTime() : 0
        const vb = b.lastCheck ? new Date(b.lastCheck).getTime() : 0
        return dir * (va - vb)
      }
      let va = a[eqSortBy] ?? ''
      let vb = b[eqSortBy] ?? ''
      return dir * String(va).localeCompare(String(vb))
    })
  }, [equipmentWithLastCheck, eqFilterHighFailure, highFailureIdsSet, eqFilterZone, eqFilterStatus, eqFilterSearch, eqSortBy, eqSortDir, zonesList])

  const zoneLabelByKey = useMemo(() => Object.fromEntries(zonesList.map((z) => [z.id, z.label || z.name || z.id])), [zonesList])
  const equipmentZoneLabel = (zone) => zoneLabelByKey[(zone || '').toLowerCase()] || zoneLabelByKey[zone] || zone || '—'

  const historyData = useMemo(() => {
    if (!viewHistoryEquipment) return null
    const eqId = viewHistoryEquipment.id
    const now = Date.now()
    const ms90 = 90 * 24 * 60 * 60 * 1000
    const cutoff90 = now - ms90
    const toMs = (d) => (d ? new Date(d).getTime() : 0)
    const faultsForEq = (faults || []).filter((f) => f.equipmentId === eqId)
    const faultsExclPreventive = faultsForEq.filter((f) => f.type !== FAULT_TYPE_PREVENTIVE_ALERT && !f.auto_generated)
    const maintenanceForEq = (maintenancePlans || []).filter((m) => m.equipmentId === eqId)
    const faults90 = faultsExclPreventive.filter((f) => toMs(f.createdAt) >= cutoff90)
    const maintenance90 = maintenanceForEq.filter((m) => toMs(m.plannedDate || m.createdAt) >= cutoff90)
    const lastMaintenance = maintenance90.length > 0 ? maintenance90.reduce((a, m) => (toMs(m.plannedDate || m.createdAt) > (a ? toMs(a.plannedDate || a.createdAt) : 0) ? m : a), null) : null
    const timelineEvents = []
    faultsForEq.forEach((f) => timelineEvents.push({ date: f.createdAt, type: 'fault', severity: f.severity, status: f.status || FAULT_STATUS_OPEN, resolutionNote: f.resolutionNote, description: f.description }))
    maintenanceForEq.forEach((m) => {
      timelineEvents.push({ date: m.plannedDate || m.createdAt, type: 'maintenance', notes: m.notes, resolutionNote: m.resolutionNote, resolvedAt: m.resolvedAt })
      if (m.resolvedAt) timelineEvents.push({ date: m.resolvedAt, type: 'maintenance_completed', notes: m.resolutionNote })
    })
    if (viewHistoryEquipment.lastInspection) timelineEvents.push({ date: viewHistoryEquipment.lastInspection, type: 'inspection' })
    timelineEvents.sort((a, b) => toMs(b.date) - toMs(a.date))
    return { totalFaults90: faults90.length, totalMaintenance90: maintenance90.length, lastMaintenanceDate: lastMaintenance ? (lastMaintenance.plannedDate || lastMaintenance.createdAt) : null, lastInspectionDate: viewHistoryEquipment.lastInspection, faults30Count: faultsExclPreventive.filter((f) => toMs(f.createdAt) >= now - 30 * 86400000).length, timeline: timelineEvents.slice(0, 10) }
  }, [viewHistoryEquipment, faults, maintenancePlans])

  const todayStr = getTodayLocal()
  const unifiedTickets = useMemo(() => {
    const list = []
    const toMs = (d) => (d ? new Date(d).getTime() : 0)
    ;(faults || []).forEach((f) => {
      if (f.auto_generated && f.type === FAULT_TYPE_PREVENTIVE_ALERT) return
      const completed = (f.status || FAULT_STATUS_OPEN) === FAULT_STATUS_RESOLVED
      list.push({
        source: 'fault',
        id: f.id,
        equipmentId: f.equipmentId,
        equipmentName: f.equipmentName,
        ticketType: 'fault',
        status: completed ? 'completed' : 'open',
        dueDate: null,
        createdAt: f.createdAt,
        severity: f.severity,
        description: f.description,
        resolvedAt: f.resolvedAt,
        resolutionNote: f.resolutionNote,
        resolutionSpareParts: f.resolutionSpareParts,
        resolutionPhoto: f.resolutionPhoto,
      })
    })
    ;(maintenancePlans || []).forEach((m) => {
      const completed = m.status === 'completed'
      list.push({
        source: 'maintenance',
        id: m.id,
        equipmentId: m.equipmentId,
        equipmentName: m.equipmentName,
        ticketType: m.type || 'preventive',
        status: completed ? 'completed' : 'scheduled',
        dueDate: m.plannedDate || null,
        createdAt: m.createdAt,
        priority: m.priority,
        notes: m.notes,
        intervalDays: m.inspectionIntervalDays,
        resolvedAt: m.resolvedAt,
        resolutionNote: m.resolutionNote,
        resolutionSpareParts: m.resolutionSpareParts,
        resolutionPhoto: m.resolutionPhoto,
      })
    })
    return list
  }, [faults, maintenancePlans])

  function getWeekBounds() {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const mon = new Date(d)
    mon.setDate(diff)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    const toStr = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0')
    return { weekStart: toStr(mon), weekEnd: toStr(sun) }
  }

  const workloadSummary = useMemo(() => {
    const active = unifiedTickets.filter((t) => t.status !== 'completed')
    const fault = active.filter((t) => t.ticketType === 'fault').length
    const maintenanceScheduled = active.filter((t) => t.ticketType !== 'fault').length
    return { openTickets: active.length, fault, maintenanceScheduled }
  }, [unifiedTickets])

  /** Overdue: only maintenance tickets (faults are urgent, no due date / don't count as overdue) */
  const overdueSummary = useMemo(() => {
    const active = unifiedTickets.filter((t) => t.status !== 'completed')
    const maintenanceOverdue = active.filter((t) => t.ticketType !== 'fault' && t.dueDate && t.dueDate < todayStr).length
    return { total: maintenanceOverdue, maintenanceOverdue }
  }, [unifiedTickets, todayStr])

  const equipmentStatusSummary = useMemo(() => {
    const norm = (s) => (s || '').toLowerCase()
    const activeCount = equipment.filter((e) => norm(e.status) === EQUIPMENT_STATUS.ACTIVE).length
    const underCount = equipment.filter((e) => norm(e.status) === EQUIPMENT_STATUS.UNDER_MAINTENANCE).length
    const outCount = equipment.filter((e) => norm(e.status) === EQUIPMENT_STATUS.OUT_OF_SERVICE).length
    const openTicketEqIds = new Set(unifiedTickets.filter((t) => t.status !== 'completed').map((t) => t.equipmentId))
    return { active: activeCount, underMaintenance: underCount, outOfService: outCount, withOpenTickets: openTicketEqIds.size }
  }, [equipment, unifiedTickets])

  const thisWeekSummary = useMemo(() => {
    const { weekStart, weekEnd } = getWeekBounds()
    const active = unifiedTickets.filter((t) => t.status !== 'completed')
    const completed = unifiedTickets.filter((t) => t.status === 'completed')
    const toDateStr = (d) => (d ? String(d).slice(0, 10) : '')
    const maintenanceActive = active.filter((t) => t.ticketType !== 'fault')
    const scheduled = maintenanceActive.filter((t) => {
      const due = toDateStr(t.dueDate)
      if (!due) return false
      return due >= weekStart && due <= weekEnd
    }).length
    const completedThisWeek = completed.filter((t) => {
      const r = t.resolvedAt || t.createdAt
      if (!r) return false
      const dateStr = toDateStr(r)
      return dateStr >= weekStart && dateStr <= weekEnd
    }).length
    return { scheduled, completed: completedThisWeek }
  }, [unifiedTickets, todayStr])

  const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 }
  const activeTickets = useMemo(() => {
    const toMs = (d) => (d ? new Date(d).getTime() : 0)
    const active = unifiedTickets.filter((t) => t.status !== 'completed')
    const todayMs = new Date(todayStr + 'T12:00:00').getTime()
    return [...active].sort((a, b) => {
      const aFault = a.ticketType === 'fault'
      const bFault = b.ticketType === 'fault'
      if (aFault && !bFault) return -1
      if (!aFault && bFault) return 1
      if (aFault && bFault) {
        const sevA = SEVERITY_ORDER[a.severity] || 0
        const sevB = SEVERITY_ORDER[b.severity] || 0
        if (sevB !== sevA) return sevB - sevA
        return toMs(b.createdAt) - toMs(a.createdAt)
      }
      const aDue = a.dueDate ? new Date(a.dueDate + 'T12:00:00').getTime() : Infinity
      const bDue = b.dueDate ? new Date(b.dueDate + 'T12:00:00').getTime() : Infinity
      const aOverdue = a.dueDate && aDue < todayMs
      const bOverdue = b.dueDate && bDue < todayMs
      if (aOverdue && !bOverdue) return -1
      if (!aOverdue && bOverdue) return 1
      return aDue - bDue
    })
  }, [unifiedTickets, todayStr])

  const completedTickets = useMemo(() =>
    unifiedTickets.filter((t) => t.status === 'completed').sort((a, b) => (new Date(b.resolvedAt || b.createdAt).getTime()) - (new Date(a.resolvedAt || a.createdAt).getTime())),
  [unifiedTickets])

  const weekBounds = useMemo(() => getWeekBounds(), [todayStr])
  const next7DaysEnd = useMemo(() => {
    const d = new Date(todayStr + 'T12:00:00')
    d.setDate(d.getDate() + 7)
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }, [todayStr])

  const activeTicketsDisplay = useMemo(() => {
    let list = activeTickets
    if (activeTicketsFilter === 'overdue') list = list.filter((t) => t.ticketType !== 'fault' && t.dueDate && t.dueDate < todayStr)
    else if (activeTicketsFilter === 'this_week') list = list.filter((t) => t.ticketType !== 'fault' && t.dueDate && t.dueDate >= todayStr && t.dueDate <= next7DaysEnd)
    if (eqFilterHighFailure) list = list.filter((t) => t.ticketType === 'fault' && highFailureIdsSet.has(t.equipmentId))
    return list
  }, [activeTickets, activeTicketsFilter, todayStr, next7DaysEnd, eqFilterHighFailure, highFailureIdsSet])

  const [completedFilterEquipment, setCompletedFilterEquipment] = useState('')
  const [completedFilterType, setCompletedFilterType] = useState('')
  const [completedFilterDateFrom, setCompletedFilterDateFrom] = useState('')
  const [completedFilterDateTo, setCompletedFilterDateTo] = useState('')
  const [selectedCompletedTicket, setSelectedCompletedTicket] = useState(null)

  const completedTicketsFiltered = useMemo(() => {
    let list = completedTickets
    if (completedFilterEquipment) list = list.filter((t) => t.equipmentId === completedFilterEquipment)
    if (completedFilterType) list = list.filter((t) => t.ticketType === completedFilterType)
    const toMs = (d) => (d ? new Date(d).getTime() : 0)
    if (completedFilterDateFrom) {
      const fromMs = new Date(completedFilterDateFrom + 'T00:00:00').getTime()
      list = list.filter((t) => toMs(t.resolvedAt || t.createdAt) >= fromMs)
    }
    if (completedFilterDateTo) {
      const toDayMs = new Date(completedFilterDateTo + 'T23:59:59').getTime()
      list = list.filter((t) => toMs(t.resolvedAt || t.createdAt) <= toDayMs)
    }
    return list
  }, [completedTickets, completedFilterEquipment, completedFilterType, completedFilterDateFrom, completedFilterDateTo])

  useEffect(() => {
    const todayMs = new Date(todayStr + 'T12:00:00').getTime()
    const active = unifiedTickets.filter((t) => t.status !== 'completed')
    active.forEach((t) => {
      if (t.ticketType === 'fault' || !t.dueDate) return
      const dueMs = new Date(t.dueDate + 'T12:00:00').getTime()
      const daysRemaining = Math.floor((dueMs - todayMs) / 86400000)
      const isRed = daysRemaining < 0 || daysRemaining <= 2
      if (!isRed) return
      const eq = equipment.find((x) => x.id === t.equipmentId)
      if (eq?.status === EQUIPMENT_STATUS.ACTIVE) updateEquipmentItem(t.equipmentId, { status: EQUIPMENT_STATUS.UNDER_MAINTENANCE })
    })
  }, [unifiedTickets, equipment, todayStr, updateEquipmentItem])

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
    if (location.state?.filterHighFailure) {
      setEqFilterHighFailure(true)
      setEquipmentOpen(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state?.filterHighFailure, location.pathname, navigate])
  useEffect(() => {
    if (!viewHistoryEquipment) return
    const onKey = (e) => { if (e.key === 'Escape') setViewHistoryEquipment(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewHistoryEquipment])
  useEffect(() => {
    if (!selectedCompletedTicket) return
    const onKey = (e) => { if (e.key === 'Escape') setSelectedCompletedTicket(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedCompletedTicket])
  useEffect(() => {
    const today = getTodayLocal()
    equipmentWithInspection.forEach((e) => {
      if (e.remainingDays == null || e.remainingDays > 7) return
      const openPreventive = faults.find((f) => f.equipmentId === e.id && f.type === FAULT_TYPE_PREVENTIVE_ALERT && (f.status || FAULT_STATUS_OPEN) === FAULT_STATUS_OPEN)
      const isOverdue = e.remainingDays < 0
      if (openPreventive) {
        if (isOverdue && (openPreventive.severity !== 'high' || openPreventive.description !== 'Inspection overdue')) updateFault(openPreventive.id, { severity: 'high', description: 'Inspection overdue' })
        return
      }
      addFault({ id: nextFaultId(faults), equipmentId: e.id, equipmentName: e.name, type: FAULT_TYPE_PREVENTIVE_ALERT, category: 'other', severity: isOverdue ? 'high' : 'medium', status: FAULT_STATUS_OPEN, stopWork: false, description: isOverdue ? 'Inspection overdue' : 'Inspection due within 7 days', createdAt: new Date().toISOString(), auto_generated: true })
    })
  }, [equipmentWithInspection, faults, addFault, updateFault])

  function exportEquipmentPDF() {
    const el = equipmentTableRef.current
    if (!el) return
    html2canvas(el, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    }).then((canvas) => {
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
      pdf.text(t('eqManageEquipment'), margin, 12)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.text(new Date().toLocaleString(), margin, 18)

      let y = 24
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text(t('eqFiltersApplied'), margin, y)
      y += 5
      const zoneLabelVal = eqFilterZone ? (equipmentZoneLabel(eqFilterZone) || eqFilterZone) : t('eqAll')
      const statusLabelVal = eqFilterStatus ? getEquipmentStatusDisplayLabel(eqFilterStatus) : t('eqAll')
      const searchValue = eqFilterSearch.trim() || '—'
      const sortColLabel = eqSortBy === 'name' ? t('equipmentName') : eqSortBy === 'zone' ? t('assignedZone') : eqSortBy === 'lastInspection' ? t('eqNextService') : eqSortBy
      const sortLabel = `${sortColLabel} (${eqSortDir === 'asc' ? 'asc' : 'desc'})`
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      const filterLine1 = `${t('eqZone')}: ${zoneLabelVal}   ·   ${t('eqStatus')}: ${statusLabelVal}   ·   ${t('eqHighFailureOnly')}: ${eqFilterHighFailure ? 'Yes' : 'No'}`
      const filterLine2 = `${t('eqSearch')}: ${searchValue}`
      const filterLine3 = `${t('eqSort')}: ${sortLabel}   ·   ${t('eqRows')}: ${filteredEquipment.length}`
      const lineH = 5
      const split1 = pdf.splitTextToSize(filterLine1, w)
      split1.forEach((line) => { pdf.text(line, margin, y); y += lineH })
      pdf.text(filterLine2, margin, y); y += lineH
      const split3 = pdf.splitTextToSize(filterLine3, w)
      split3.forEach((line) => { pdf.text(line, margin, y); y += lineH })
      y += 3
      pdf.setDrawColor(220, 220, 220)
      pdf.line(margin, y, margin + w, y)
      y += 4
      const headerH = y
      const imgH = Math.min(h, pdfH - headerH - 4)
      const imgW = (canvas.width * imgH) / canvas.height
      const imgX = margin + (w - imgW) / 2
      pdf.addImage(imgData, 'PNG', imgX, headerH, imgW, imgH)
      pdf.save(`Equipment-${new Date().toISOString().slice(0, 10)}.pdf`)
    }).catch(() => {})
  }
  function handleSaveEditEquipment(e) {
    e.preventDefault()
    if (!editEquipment) return
    updateEquipmentItem(editEquipment.id, { name: editEquipment.name, zone: editEquipment.zone, status: editEquipment.status, lastInspection: editEquipment.lastInspection || undefined })
    setEditEquipment(null)
  }
  function handleAddEquipment(e) {
    e.preventDefault()
    if (!newEquipment.name.trim()) return
    addEquipmentItem({ id: nextEquipmentId(equipment), name: newEquipment.name.trim(), zone: newEquipment.zone || undefined, status: newEquipment.status || EQUIPMENT_STATUS.ACTIVE, lastInspection: newEquipment.lastInspection || undefined, createdAt: new Date().toISOString() })
    setNewEquipment({ name: '', zone: '', status: EQUIPMENT_STATUS.ACTIVE, lastInspection: '' })
    setAddEquipmentOpen(false)
  }
  function handleDeleteEquipment(eq) {
    if (!window.confirm(t('eqDeleteConfirm').replace('{name}', eq.name))) return
    removeEquipmentItem(eq.id)
    setOpenActionsId(null)
  }
  function toggleEqSort(field) {
    if (eqSortBy === field) setEqSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setEqSortBy(field); setEqSortDir('asc') }
  }
  function handleMarkInspectionDone(eq) {
    const today = getTodayLocal()
    const interval = eq.inspectionInterval != null ? Number(eq.inspectionInterval) : 30
    const next = addDaysLocal(today, interval)
    updateEquipmentItem(eq.id, { lastInspection: today, nextInspection: next })
    const preventiveFault = faults.find((f) => f.equipmentId === eq.id && f.type === FAULT_TYPE_PREVENTIVE_ALERT && (f.status || FAULT_STATUS_OPEN) === FAULT_STATUS_OPEN)
    if (preventiveFault) updateFault(preventiveFault.id, { status: FAULT_STATUS_RESOLVED, resolutionNote: 'Inspection completed' })
  }

  const defaultTicketForm = () => ({
    ticketType: '',
    equipmentId: '',
    category: 'mechanical',
    severity: 'medium',
    stopWork: false,
    description: '',
    plannedDate: new Date().toISOString().slice(0, 10),
    type: 'preventive',
    notes: '',
    priority: 'normal',
    inspectionMode: 'one-time',
    intervalDays: '',
  })
  const [createTicketOpen, setCreateTicketOpen] = useState(false)
  const [createTicketEquipment, setCreateTicketEquipment] = useState(null)
  const [ticketForm, setTicketForm] = useState(defaultTicketForm())
  const [resolveTicket, setResolveTicket] = useState(null)
  const [resolveForm, setResolveForm] = useState({ completionNote: '', spareParts: '', resolutionPhoto: null })
  const [completedTicketsOpen, setCompletedTicketsOpen] = useState(false)

  function openCreateTicket(eq) {
    setCreateTicketEquipment(eq || null)
    setTicketForm(defaultTicketForm())
    setCreateTicketOpen(true)
  }

  function submitCreateTicket(e) {
    e.preventDefault()
    const eq = createTicketEquipment || (ticketForm.equipmentId ? equipment.find((x) => x.id === ticketForm.equipmentId) : null)
    if (!eq && !ticketForm.equipmentId) return
    const equipmentId = eq?.id || ticketForm.equipmentId
    const equipmentName = eq?.name || equipment.find((x) => x.id === ticketForm.equipmentId)?.name || '—'
    const t = ticketForm
    if (t.ticketType === 'fault') {
      if (!t.description.trim()) return
      addFault({
      id: nextFaultId(faults),
        equipmentId,
        equipmentName,
        category: t.category,
        severity: t.severity,
        stopWork: t.stopWork,
        description: t.description.trim(),
        status: FAULT_STATUS_OPEN,
        createdAt: new Date().toISOString(),
      })
      updateEquipmentItem(equipmentId, { status: t.stopWork ? EQUIPMENT_STATUS.OUT_OF_SERVICE : EQUIPMENT_STATUS.UNDER_MAINTENANCE })
    } else {
      let plannedDate = t.plannedDate
      let intervalDays = null
      if (t.ticketType === 'inspection') {
        if (t.inspectionMode === 'recurring' && t.intervalDays.trim()) {
          intervalDays = Math.max(1, Math.floor(Number(t.intervalDays)) || 30)
        }
      }
      addMaintenancePlan({
        id: nextMaintenancePlanId(maintenancePlans),
        equipmentId,
        equipmentName,
        plannedDate,
        type: t.ticketType,
        notes: (t.notes || '').trim(),
        priority: t.ticketType === 'corrective' ? t.priority : undefined,
        inspectionIntervalDays: intervalDays || undefined,
        status: 'scheduled',
      createdAt: new Date().toISOString(),
      })
    }
    setCreateTicketOpen(false)
    setCreateTicketEquipment(null)
    setTicketForm(defaultTicketForm())
  }

  function submitResolve(e) {
    e.preventDefault()
    if (!resolveTicket || !resolveForm.completionNote.trim()) return
    const now = new Date().toISOString()
    if (resolveTicket.source === 'fault') {
      updateFault(resolveTicket.id, { status: FAULT_STATUS_RESOLVED, resolutionNote: resolveForm.completionNote.trim(), resolvedAt: now, resolutionSpareParts: resolveForm.spareParts.trim() || undefined, resolutionPhoto: resolveForm.resolutionPhoto || undefined })
    } else {
      updateMaintenancePlan(resolveTicket.id, { status: 'completed', resolvedAt: now, resolutionNote: resolveForm.completionNote.trim(), resolutionSpareParts: resolveForm.spareParts.trim() || undefined, resolutionPhoto: resolveForm.resolutionPhoto || undefined })
      if (resolveTicket.ticketType === 'inspection' && resolveTicket.intervalDays) {
        const eq = equipment.find((x) => x.id === resolveTicket.equipmentId)
        if (eq) {
          const nextDate = addDaysLocal(getTodayLocal(), resolveTicket.intervalDays)
          addMaintenancePlan({
      id: nextMaintenancePlanId(maintenancePlans),
            equipmentId: resolveTicket.equipmentId,
            equipmentName: resolveTicket.equipmentName,
            plannedDate: nextDate,
            type: 'inspection',
            notes: `Recurring (every ${resolveTicket.intervalDays} days)`,
            inspectionIntervalDays: resolveTicket.intervalDays,
            status: 'scheduled',
            createdAt: now,
          })
        }
      }
    }
    const openForEq = unifiedTickets.filter((t) => t.equipmentId === resolveTicket.equipmentId && t.status !== 'completed' && t.id !== resolveTicket.id)
    if (openForEq.length === 0) {
      updateEquipmentItem(resolveTicket.equipmentId, { status: EQUIPMENT_STATUS.ACTIVE })
    }
    setResolveTicket(null)
    setResolveForm({ completionNote: '', spareParts: '', resolutionPhoto: null })
  }

  function handleResolvePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) {
      setResolveForm((f) => ({ ...f, resolutionPhoto: null }))
      return
    }
    const reader = new FileReader()
    reader.onload = () => setResolveForm((f) => ({ ...f, resolutionPhoto: reader.result }))
    reader.readAsDataURL(file)
  }

  return (
    <div className={styles.page}>
      <section className={eqStyles.summarySection}>
        <h2 className={eqStyles.summaryTitle}><i className="fas fa-chart-pie fa-fw" /> {t('eqSummary')}</h2>
        <div className={eqStyles.summaryCards}>
          <button
            type="button"
            className={`${eqStyles.summaryCard} ${eqStyles.summaryCardHighFailure} ${highFailureCount > 0 ? eqStyles.summaryCardHighFailureDanger : eqStyles.summaryCardHighFailureOk}`}
            onClick={() => { setEqFilterHighFailure(true); setEquipmentOpen(true); setTimeout(() => activeTicketsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100) }}
          >
            <span className={eqStyles.summaryCardLabel}>{t('eqHighFailureEquipment')}</span>
            <div className={eqStyles.summaryCardBody}>
              <div className={eqStyles.summaryRow}><span>{t('eqDevices')}</span><strong>{highFailureCount}</strong></div>
              <div className={eqStyles.summaryRowSub}>{t('eqThresholdPerWeek').replace('{n}', HIGH_FAILURE_RATE_THRESHOLD)}</div>
            </div>
          </button>

          <button type="button" className={`${eqStyles.summaryCard} ${eqStyles.summaryCardWorkload}`} onClick={() => scrollToTickets('all')}>
            <span className={eqStyles.summaryCardLabel}>{t('eqWorkload')}</span>
            <div className={eqStyles.summaryCardBody}>
              <div className={eqStyles.summaryRow}><span>{t('eqOpenTickets')}</span><strong>{workloadSummary.openTickets}</strong></div>
              <div className={eqStyles.summaryRow}><span>{t('eqFault')}</span><strong>{workloadSummary.fault}</strong></div>
              <div className={eqStyles.summaryRow}><span>{t('eqMaintenanceScheduled')}</span><strong>{workloadSummary.maintenanceScheduled}</strong></div>
            </div>
          </button>

          <button type="button" className={`${eqStyles.summaryCard} ${eqStyles.summaryCardEquipmentStatus}`} onClick={() => scrollToEquipment()}>
            <span className={eqStyles.summaryCardLabel}>{t('eqEquipmentStatus')}</span>
            <div className={eqStyles.summaryCardBody}>
              <div className={eqStyles.summaryRow}><span>{t('eqActive')}</span><strong>{equipmentStatusSummary.active}</strong></div>
              <div className={eqStyles.summaryRow}><span>{t('eqUnderMaintenance')}</span><strong>{equipmentStatusSummary.underMaintenance}</strong></div>
              <div className={eqStyles.summaryRow}><span>{t('eqOutOfService')}</span><strong>{equipmentStatusSummary.outOfService}</strong></div>
              <div className={eqStyles.summaryRowSub}>{t('eqEquipmentWithOpenTickets')}: {equipmentStatusSummary.withOpenTickets}</div>
            </div>
          </button>

          <button
            type="button"
            className={`${eqStyles.summaryCard} ${eqStyles.summaryCardOverdueThisWeek} ${overdueSummary.total > 0 ? eqStyles.summaryCardOverdueDanger : eqStyles.summaryCardOverdueThisWeekOk}`}
            onClick={() => scrollToTickets(overdueSummary.total > 0 ? 'overdue' : 'this_week')}
          >
            <span className={eqStyles.summaryCardLabel}>{t('eqDueThisWeek')}</span>
            <div className={eqStyles.summaryCardBody}>
              <div className={eqStyles.summaryRow}><span>{t('eqOverdue')}</span><strong>{overdueSummary.total}</strong></div>
              <div className={eqStyles.summaryRow}><span>{t('eqScheduledThisWeek')}</span><strong>{thisWeekSummary.scheduled}</strong></div>
              <div className={eqStyles.summaryRow}><span>{t('eqCompletedThisWeek')}</span><strong>{thisWeekSummary.completed}</strong></div>
            </div>
          </button>
        </div>
      </section>

      <section ref={equipmentSectionRef} className={eqStyles.section}>
        <button type="button" className={eqStyles.sectionHeader} onClick={() => setEquipmentOpen((o) => !o)}>
          <h2 className={eqStyles.sectionTitle}><i className="fas fa-wrench fa-fw" /> {t('eqManageEquipment')}</h2>
          <span className={eqStyles.expandLabel}>{equipmentOpen ? t('eqCollapse') : t('eqExpand')}</span>
          <span className={eqStyles.chevron}>{equipmentOpen ? '▼' : '▶'}</span>
        </button>
        {equipmentOpen && (
          <>
            <div className={eqStyles.filtersBar}>
              <div className={eqStyles.filtersRow}>
                <span className={eqStyles.filterLabel}>{t('eqZone')}</span>
                <select value={eqFilterZone} onChange={(e) => setEqFilterZone(e.target.value)} className={eqStyles.filterSelect} title={t('eqZone')}>
                  <option value="">{t('eqAll')}</option>
                  {zonesList.map((z) => (
                    <option key={z.id} value={z.id}>{z.label || z.name || z.id}</option>
                  ))}
                </select>
              </div>
              <div className={eqStyles.filtersRow}>
                <span className={eqStyles.filterLabel}>{t('eqStatus')}</span>
                <select value={eqFilterStatus} onChange={(e) => setEqFilterStatus(e.target.value)} className={eqStyles.filterSelect} title={t('eqStatus')}>
                  <option value="">{t('eqAll')}</option>
                  <option value={EQUIPMENT_STATUS.ACTIVE}>{t('eqActive')}</option>
                  <option value={EQUIPMENT_STATUS.UNDER_MAINTENANCE}>{t('eqUnderMaintenance')}</option>
                  <option value={EQUIPMENT_STATUS.OUT_OF_SERVICE}>{t('eqOutOfService')}</option>
                </select>
              </div>
              <div className={eqStyles.filtersRow}>
                <span className={eqStyles.filterLabel}>{t('eqSearch')}</span>
                <input type="search" value={eqFilterSearch} onChange={(e) => setEqFilterSearch(e.target.value)} placeholder={t('nameZonePlaceholder')} className={eqStyles.filterInput} />
              </div>
              {eqFilterHighFailure && (
                <div className={eqStyles.filterChipWrap}>
                  <span className={eqStyles.filterChip}>{t('eqHighFailureOnly')}</span>
                  <button type="button" className={eqStyles.filterChipClear} onClick={() => setEqFilterHighFailure(false)} aria-label={t('eqClearHighFailureFilter')}>×</button>
                </div>
              )}
              <div className={eqStyles.filtersBarActions}>
                <button type="button" className={eqStyles.btnPrimary} onClick={() => openCreateTicket(null)}>
                  <i className="fas fa-plus fa-fw" /> {t('eqCreateTicket')}
                </button>
                <button type="button" className={eqStyles.btnPrimary} onClick={() => setAddEquipmentOpen(true)}>
                  <i className="fas fa-plus fa-fw" /> {t('eqAddEquipment')}
                </button>
              </div>
              <div className={eqStyles.filtersBarExport}>
                <button type="button" className={eqStyles.btnSecondary} onClick={exportEquipmentPDF} disabled={filteredEquipment.length === 0}>
                  <i className="fas fa-file-pdf fa-fw" /> {t('eqExportPdf')}
                </button>
              </div>
            </div>
            {(inspectionDueSoonCount > 0 || inspectionOverdueCount > 0) && (
              <div className={eqStyles.inspectionCounters}>
                {inspectionDueSoonCount > 0 && <span className={eqStyles.inspectionCounterDueSoon}>{t('eqInspectionsDueSoon')}: {inspectionDueSoonCount}</span>}
                {inspectionOverdueCount > 0 && <span className={eqStyles.inspectionCounterOverdue}>{t('eqOverdueInspections')}: {inspectionOverdueCount}</span>}
          </div>
            )}
            <div className={eqStyles.tableWrap} ref={equipmentTableRef}>
              <table className={eqStyles.table}>
                <thead>
                  <tr>
                    <th><button type="button" className={eqStyles.thSort} onClick={() => toggleEqSort('name')}>{t('equipmentName')} {eqSortBy === 'name' ? (eqSortDir === 'asc' ? '↑' : '↓') : ''}</button></th>
                    <th><button type="button" className={eqStyles.thSort} onClick={() => toggleEqSort('zone')}>{t('assignedZone')} {eqSortBy === 'zone' ? (eqSortDir === 'asc' ? '↑' : '↓') : ''}</button></th>
                    <th>{t('operationalStatus')}</th>
                    <th><button type="button" className={eqStyles.thSort} onClick={() => toggleEqSort('lastInspection')}>{t('eqNextService')} {eqSortBy === 'lastInspection' ? (eqSortDir === 'asc' ? '↑' : '↓') : ''}</button></th>
                    <th>{t('eqLastService')}</th>
                    <th>{t('eqActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEquipment.map((e) => (
                    <tr key={e.id}>
                      <td>
                        {e.name}
                        {highFailureIdsSet.has(e.id) && (
                          <span className={eqStyles.highFailureIcon} title={`${t('eqHighFailureRateWarning')}: ${failureCountByEquipmentId[e.id] ?? 0} in ${FAILURE_WINDOW_DAYS}d (${(failureRateByEquipmentId[e.id] ?? 0).toFixed(1)}/${FAILURE_RATE_PER_DAYS}d)`} aria-label={t('eqHighFailureRateWarning')}>⚠</span>
                        )}
                      </td>
                      <td>{equipmentZoneLabel(e.zone)}</td>
                      <td><span className={eqStyles.eqBadge} data-status={e.status}>{getEquipmentStatusDisplayLabel(e.status)}</span></td>
                      <td>{e.lastCheck ?? '—'}</td>
                      <td className={eqStyles.cellServiceCycle}>{e.lastTicketCreated ?? '—'}</td>
                      <td className={eqStyles.cellActions}>
                        <div className={eqStyles.actionsWrap} data-actions-wrap>
                          <button
                            type="button"
                            className={eqStyles.actionsBtn}
                            onClick={(ev) => {
                              if (openActionsId === e.id) {
                                setOpenActionsId(null)
                                setDropdownAnchor(null)
                              } else {
                                const rect = ev.currentTarget.getBoundingClientRect()
                                setOpenActionsId(e.id)
                                setDropdownAnchor({ top: rect.bottom + 2, left: rect.left })
                              }
                            }}
                            aria-expanded={openActionsId === e.id}
                            aria-haspopup="true"
                          >
{t('eqActions')} <span className={eqStyles.actionsCaret}>{openActionsId === e.id ? '▲' : '▼'}</span>
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

      <section ref={activeTicketsSectionRef} className={`${styles.section} ${styles.ticketsSection}`}>
        <h2 className={styles.sectionTitle}><i className="fas fa-ticket fa-fw" /> {t('eqEquipmentTickets')}</h2>
        <h3 className={styles.subTitle}>
          {t('eqActiveTickets')}
          {activeTicketsFilter !== 'all' && (
            <span className={styles.filterBadge}>
              {activeTicketsFilter === 'overdue' ? t('eqOverdueOnly') : t('eqThisWeekOnly')}
              <button type="button" className={styles.filterBadgeClear} onClick={() => setActiveTicketsFilter('all')} aria-label={t('eqShowAll')}>×</button>
            </span>
          )}
          {eqFilterHighFailure && (
            <span className={styles.filterBadge}>
              {t('eqFaultTicketsOnly')}
            </span>
          )}
        </h3>
        {activeTicketsDisplay.length === 0 ? (
          <p className={styles.hint}>
            {activeTickets.length === 0 ? t('eqNoActiveTickets') : eqFilterHighFailure ? t('eqNoFaultTicketsHighFailure') : t('eqNoTicketsMatchFilter')}
          </p>
        ) : (
          <div className={styles.ticketCards}>
            {activeTicketsDisplay.map((ticket) => {
              const dueMs = ticket.dueDate ? new Date(ticket.dueDate + 'T12:00:00').getTime() : null
              const todayMs = new Date(todayStr + 'T12:00:00').getTime()
              const daysRemaining = dueMs != null ? Math.floor((dueMs - todayMs) / 86400000) : null
              const isOverdue = daysRemaining != null && daysRemaining < 0
              const urgencyClass = ticket.status === 'completed' ? styles.ticketCardCompleted
                : ticket.ticketType === 'fault' ? styles.ticketCardUrgencyFault
                : isOverdue ? styles.ticketCardUrgencyOverdue
                : daysRemaining != null && daysRemaining <= 2 ? styles.ticketCardUrgencyRed
                : daysRemaining != null && daysRemaining <= 7 ? styles.ticketCardUrgencyYellow
                : styles.ticketCardUrgencyGreen
              const typeClass = ticket.ticketType === 'fault' ? styles.ticketCardTypeFault : ticket.ticketType === 'preventive' ? styles.ticketCardTypePreventive : ticket.ticketType === 'corrective' ? styles.ticketCardTypeCorrective : styles.ticketCardTypeInspection
              return (
                <div key={`${ticket.source}-${ticket.id}`} className={`${styles.ticketCard} ${urgencyClass}`}>
                  <div className={styles.ticketCardTitle}>{ticket.equipmentName}</div>
                  <span className={`${styles.ticketCardType} ${typeClass}`}>{ticket.ticketType === 'fault' ? t('eqTypeFault') : ticket.ticketType === 'preventive' ? t('eqTypePreventive') : ticket.ticketType === 'corrective' ? t('eqTypeCorrective') : t('eqTypeInspection')}</span>
                  <div className={styles.ticketCardMeta}>{t('eqStatus')}: {ticket.status === 'open' ? t('eqStatusOpen') : t('eqStatusScheduled')}</div>
                  {ticket.dueDate && <div className={styles.ticketCardMeta}>{t('eqDue')}: {ticket.dueDate}</div>}
                  {daysRemaining != null && <div className={styles.ticketCardMeta}>{t('eqDaysRemaining')}: {isOverdue ? `${t('eqOverdue')} (${Math.abs(daysRemaining)})` : daysRemaining}</div>}
                  <div className={styles.ticketCardMeta}>{t('eqCreated')}: {new Date(ticket.createdAt).toLocaleDateString()}</div>
                  {ticket.severity && <div className={styles.ticketCardMeta}>{t('eqSeverity')}: {getSeverityDisplayLabel(ticket.severity)}</div>}
                  <div className={styles.ticketCardActions}>
                    <button type="button" className={eqStyles.btnPrimary} onClick={() => { setResolveTicket(ticket); setResolveForm({ completionNote: '', spareParts: '', resolutionPhoto: null }); }}>{t('eqResolve')}</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {completedTickets.length > 0 && (
          <>
            <button type="button" className={styles.collapseHeader} onClick={() => setCompletedTicketsOpen((o) => !o)} aria-expanded={completedTicketsOpen}>
              <span className={styles.collapseCaret} aria-hidden>▼</span>
              <span>{t('eqCompletedTickets')} ({completedTickets.length})</span>
            </button>
            {completedTicketsOpen && (
              <>
                <div className={styles.completedFilters}>
                  <label className={styles.completedFilterLabel}>{t('eqFilter')}:</label>
                  <select value={completedFilterEquipment} onChange={(e) => setCompletedFilterEquipment(e.target.value)} className={styles.completedFilterSelect} title={t('eqEquipmentLabel')}>
                    <option value="">{t('eqAllEquipment')}</option>
                    {equipment.map((eq) => (
                      <option key={eq.id} value={eq.id}>{eq.name}</option>
                    ))}
                  </select>
                  <select value={completedFilterType} onChange={(e) => setCompletedFilterType(e.target.value)} className={styles.completedFilterSelect} title={t('eqTicketType')}>
                    <option value="">{t('eqAllTypes')}</option>
                    <option value="fault">{t('eqTypeFault')}</option>
                    <option value="preventive">{t('eqTypePreventive')}</option>
                    <option value="corrective">{t('eqTypeCorrective')}</option>
                    <option value="inspection">{t('eqTypeInspection')}</option>
                  </select>
                  <span className={styles.completedFilterLabel}>{t('eqResolvedFrom')}</span>
                  <input type="date" value={completedFilterDateFrom} onChange={(e) => setCompletedFilterDateFrom(e.target.value)} className={styles.completedFilterInput} />
                  <span className={styles.completedFilterLabel}>{t('eqTo')}</span>
                  <input type="date" value={completedFilterDateTo} onChange={(e) => setCompletedFilterDateTo(e.target.value)} className={styles.completedFilterInput} />
        </div>
                <div className={styles.ticketCards}>
                  {completedTicketsFiltered.length === 0 ? (
                    <p className={styles.hint}>{t('eqNoCompletedMatch')}</p>
                  ) : (
                    completedTicketsFiltered.map((ticket) => (
                      <button
                        type="button"
                        key={`${ticket.source}-${ticket.id}`}
                        className={`${styles.ticketCard} ${styles.ticketCardCompleted} ${styles.ticketCardClickable}`}
                        onClick={() => setSelectedCompletedTicket(ticket)}
                      >
                        <div className={styles.ticketCardTitle}>{ticket.equipmentName}</div>
                        <span className={`${styles.ticketCardType} ${ticket.ticketType === 'fault' ? styles.ticketCardTypeFault : ticket.ticketType === 'preventive' ? styles.ticketCardTypePreventive : ticket.ticketType === 'corrective' ? styles.ticketCardTypeCorrective : styles.ticketCardTypeInspection}`}>{ticket.ticketType === 'fault' ? t('eqTypeFault') : ticket.ticketType === 'preventive' ? t('eqTypePreventive') : ticket.ticketType === 'corrective' ? t('eqTypeCorrective') : t('eqTypeInspection')}</span>
                        <div className={styles.ticketCardMeta}>{t('eqResolved')}: {(ticket.resolvedAt || ticket.createdAt) ? new Date(ticket.resolvedAt || ticket.createdAt).toLocaleDateString() : '—'}</div>
                        <span className={styles.ticketCardViewHint}>{t('eqClickToViewDetails')}</span>
          </button>
                    ))
                  )}
        </div>
              </>
            )}
          </>
        )}
      </section>

      {openActionsId && dropdownAnchor && (() => {
        const openEquipment = filteredEquipment.find((eq) => eq.id === openActionsId)
        if (!openEquipment) return null
        const closeMenu = () => { setOpenActionsId(null); setDropdownAnchor(null) }
        return createPortal(
          <div
            className={eqStyles.actionsDropdown}
            data-actions-menu
            style={{
              position: 'fixed',
              top: dropdownAnchor.top,
              left: dropdownAnchor.left,
              zIndex: 9999,
            }}
          >
            <button type="button" className={eqStyles.actionsItem} onClick={() => { openCreateTicket(openEquipment); closeMenu(); }}><i className="fas fa-plus fa-fw" /> {t('eqCreateTicket')}</button>
            <button type="button" className={eqStyles.actionsItem} onClick={() => { setViewHistoryEquipment(openEquipment); closeMenu(); }}>{t('eqViewHistory')}</button>
            <button type="button" className={eqStyles.actionsItem} onClick={() => { setEditEquipment({ ...openEquipment, zone: (openEquipment.zone || '').toLowerCase() }); closeMenu(); }}>{t('eqEdit')}</button>
            <button type="button" className={`${eqStyles.actionsItem} ${eqStyles.actionsItemDanger}`} onClick={() => { handleDeleteEquipment(openEquipment); closeMenu(); }}>{t('eqDelete')}</button>
          </div>,
          document.body
        )
      })()}

      {/* Edit equipment modal */}
      {editEquipment && (
        <div className={eqStyles.modalOverlay} onClick={() => setEditEquipment(null)}>
          <div className={eqStyles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={eqStyles.modalTitle}>{t('eqEditEquipment')} – {editEquipment.name}</h3>
            <form onSubmit={handleSaveEditEquipment} className={eqStyles.modalForm}>
              <div className={eqStyles.formRow}>
                <label>{t('equipmentName')}</label>
                <input type="text" value={editEquipment.name} onChange={(e) => setEditEquipment((p) => ({ ...p, name: e.target.value }))} required className={eqStyles.input} />
              </div>
              <div className={eqStyles.formRow}>
                <label>{t('assignedZone')}</label>
                <select value={editEquipment.zone || ''} onChange={(e) => setEditEquipment((p) => ({ ...p, zone: e.target.value }))} className={eqStyles.input}>
                  <option value="">—</option>
                  {zonesList.map((z) => (<option key={z.id} value={z.id}>{z.label || z.name || z.id}</option>))}
                </select>
              </div>
              <div className={eqStyles.formRow}>
                <label>{t('operationalStatus')}</label>
                <select value={editEquipment.status || EQUIPMENT_STATUS.ACTIVE} onChange={(e) => setEditEquipment((p) => ({ ...p, status: e.target.value }))} className={eqStyles.input}>
                  <option value={EQUIPMENT_STATUS.ACTIVE}>{t('eqActive')}</option>
                  <option value={EQUIPMENT_STATUS.UNDER_MAINTENANCE}>{t('eqUnderMaintenance')}</option>
                  <option value={EQUIPMENT_STATUS.OUT_OF_SERVICE}>{t('eqOutOfService')}</option>
                </select>
              </div>
              <div className={eqStyles.formRow}>
                <label>{t('eqLastInspectionDate')}</label>
                <input type="date" value={editEquipment.lastInspection || ''} onChange={(e) => setEditEquipment((p) => ({ ...p, lastInspection: e.target.value || undefined }))} className={eqStyles.input} />
              </div>
              <div className={eqStyles.modalActions}>
                <button type="button" className={eqStyles.btnSecondary} onClick={() => setEditEquipment(null)}>{t('eqCancel')}</button>
                <button type="submit" className={eqStyles.btnPrimary}>{t('eqSave')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Ticket modal */}
      {createTicketOpen && (
        <div className={eqStyles.modalOverlay} onClick={() => { setCreateTicketOpen(false); setCreateTicketEquipment(null); }}>
          <div className={eqStyles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3 className={eqStyles.modalTitle}>
              {t('eqCreateEquipmentTicket')}{createTicketEquipment ? ` – ${createTicketEquipment.name}` : ''}
            </h3>
            <form onSubmit={submitCreateTicket} className={eqStyles.modalForm}>
              {!createTicketEquipment && (
                <div className={eqStyles.formRow}>
                  <label>{t('eqEquipmentLabel')} <span className={eqStyles.required}>*</span></label>
                  <select value={ticketForm.equipmentId} onChange={(e) => setTicketForm((f) => ({ ...f, equipmentId: e.target.value }))} required className={eqStyles.input}>
                    <option value="">{t('eqSelectEquipment')}</option>
                    {equipment.map((eq) => (
                      <option key={eq.id} value={eq.id}>{eq.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className={eqStyles.formRow}>
                <label>{t('eqTicketType')} <span className={eqStyles.required}>*</span></label>
                <select value={ticketForm.ticketType} onChange={(e) => setTicketForm((f) => ({ ...f, ticketType: e.target.value }))} required className={eqStyles.input}>
                  <option value="">{t('eqSelectType')}</option>
                  {TICKET_TYPES.map((ty) => (
                    <option key={ty.id} value={ty.id}>{getTicketTypeDisplayLabel(ty.id)}</option>
                  ))}
                </select>
              </div>
              {ticketForm.ticketType === 'fault' && (
                <>
                  <div className={eqStyles.formRow}>
                    <label>{t('eqFaultCategory')}</label>
                    <select value={ticketForm.category} onChange={(e) => setTicketForm((f) => ({ ...f, category: e.target.value }))} className={eqStyles.input}>
                      {FAULT_CATEGORIES.map((c) => (<option key={c.id} value={c.id}>{getFaultCategoryDisplayLabel(c.id)}</option>))}
                    </select>
                  </div>
                  <div className={eqStyles.formRow}>
                    <label>{t('eqSeverityLabel')}</label>
                    <select value={ticketForm.severity} onChange={(e) => setTicketForm((f) => ({ ...f, severity: e.target.value }))} className={eqStyles.input}>
                      {SEVERITY_OPTIONS.map((s) => (<option key={s.id} value={s.id}>{getSeverityDisplayLabel(s.id)}</option>))}
                    </select>
                  </div>
                  <div className={eqStyles.formRow}>
                    <label>{t('eqStopWork')}</label>
                    <select value={ticketForm.stopWork ? 'yes' : 'no'} onChange={(e) => setTicketForm((f) => ({ ...f, stopWork: e.target.value === 'yes' }))} className={eqStyles.input}>
                  <option value="no">{t('eqNo')}</option>
                  <option value="yes">{t('eqYes')}</option>
                </select>
              </div>
                  <div className={eqStyles.formRow}>
                    <label>{t('eqDescription')} <span className={eqStyles.required}>*</span></label>
                    <textarea value={ticketForm.description} onChange={(e) => setTicketForm((f) => ({ ...f, description: e.target.value }))} required rows={3} className={eqStyles.input} placeholder={t('describeFault')} />
                  </div>
                </>
              )}
              {(ticketForm.ticketType === 'preventive' || ticketForm.ticketType === 'corrective') && (
                <>
                  <div className={eqStyles.formRow}>
                    <label>{t('eqPlannedDate')} <span className={eqStyles.required}>*</span></label>
                    <input type="date" value={ticketForm.plannedDate} onChange={(e) => setTicketForm((f) => ({ ...f, plannedDate: e.target.value }))} required className={eqStyles.input} />
                  </div>
                  {ticketForm.ticketType === 'corrective' && (
                    <div className={eqStyles.formRow}>
                      <label>{t('eqPriority')}</label>
                      <select value={ticketForm.priority} onChange={(e) => setTicketForm((f) => ({ ...f, priority: e.target.value }))} className={eqStyles.input}>
                        {PRIORITY_OPTIONS.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                      </select>
                    </div>
                  )}
                  <div className={eqStyles.formRow}>
                    <label>{t('eqNotes')}</label>
                    <textarea value={ticketForm.notes} onChange={(e) => setTicketForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className={eqStyles.input} placeholder={t('optionalNotes')} />
                  </div>
                </>
              )}
              {ticketForm.ticketType === 'inspection' && (
                <>
                  <div className={eqStyles.formRow}>
                    <label>Inspection Mode</label>
                    <select value={ticketForm.inspectionMode} onChange={(e) => setTicketForm((f) => ({ ...f, inspectionMode: e.target.value }))} className={eqStyles.input}>
                      <option value="one-time">One-time</option>
                      <option value="recurring">Recurring</option>
                    </select>
                  </div>
                  {ticketForm.inspectionMode === 'one-time' && (
                    <div className={eqStyles.formRow}>
                      <label>Planned Date <span className={eqStyles.required}>*</span></label>
                      <input type="date" value={ticketForm.plannedDate} onChange={(e) => setTicketForm((f) => ({ ...f, plannedDate: e.target.value }))} required className={eqStyles.input} />
                    </div>
                  )}
                  {ticketForm.inspectionMode === 'recurring' && (
                    <div className={eqStyles.formRow}>
                      <label>Interval (days) <span className={eqStyles.required}>*</span></label>
                      <input type="number" min={1} value={ticketForm.intervalDays} onChange={(e) => setTicketForm((f) => ({ ...f, intervalDays: e.target.value }))} placeholder="e.g. 30" className={eqStyles.input} />
                    </div>
                  )}
                  {ticketForm.inspectionMode === 'recurring' && (
                    <div className={eqStyles.formRow}>
                      <label>First Planned Date <span className={eqStyles.required}>*</span></label>
                      <input type="date" value={ticketForm.plannedDate} onChange={(e) => setTicketForm((f) => ({ ...f, plannedDate: e.target.value }))} required className={eqStyles.input} />
              </div>
                  )}
                  <div className={eqStyles.formRow}>
                    <label>Notes</label>
                    <input type="text" value={ticketForm.notes} onChange={(e) => setTicketForm((f) => ({ ...f, notes: e.target.value }))} className={eqStyles.input} placeholder="Optional" />
              </div>
                </>
              )}
              <div className={eqStyles.modalActions}>
                <button type="button" className={eqStyles.btnSecondary} onClick={() => { setCreateTicketOpen(false); setCreateTicketEquipment(null); }}>{t('eqCancel')}</button>
                <button type="submit" className={eqStyles.btnPrimary}>{t('eqCreateTicket')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Completed Ticket detail modal */}
      {selectedCompletedTicket && (
        <div className={eqStyles.modalOverlay} onClick={() => setSelectedCompletedTicket(null)}>
          <div className={eqStyles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className={eqStyles.historyModalHeader}>
              <h3 className={eqStyles.modalTitle}>{t('eqCompletedTicketTitle')} – {selectedCompletedTicket.equipmentName}</h3>
              <button type="button" className={eqStyles.widgetListClose} onClick={() => setSelectedCompletedTicket(null)} aria-label={t('eqClose')}>×</button>
            </div>
            <div className={eqStyles.historyModalBody}>
              <section className={eqStyles.historySection}>
                <dl className={eqStyles.historyMeta}>
                  <dt>{t('eqTicketType')}</dt>
                  <dd>{selectedCompletedTicket.ticketType === 'fault' ? t('eqTypeFault') : selectedCompletedTicket.ticketType === 'preventive' ? t('eqPreventiveMaintenance') : selectedCompletedTicket.ticketType === 'corrective' ? t('eqCorrectiveMaintenance') : t('eqTypeInspection')}</dd>
                  <dt>{t('eqStatus')}</dt>
                  <dd>{t('eqCompleted')}</dd>
                  <dt>{t('eqCreated')}</dt>
                  <dd>{selectedCompletedTicket.createdAt ? new Date(selectedCompletedTicket.createdAt).toLocaleString() : '—'}</dd>
                  {selectedCompletedTicket.dueDate && (
                    <>
                      <dt>{t('eqDueDate')}</dt>
                      <dd>{selectedCompletedTicket.dueDate}</dd>
                    </>
                  )}
                  <dt>{t('eqResolvedAt')}</dt>
                  <dd>{(selectedCompletedTicket.resolvedAt || selectedCompletedTicket.createdAt) ? new Date(selectedCompletedTicket.resolvedAt || selectedCompletedTicket.createdAt).toLocaleString() : '—'}</dd>
                  {selectedCompletedTicket.severity && (
                    <>
                      <dt>{t('eqSeverity')}</dt>
                      <dd>{getSeverityDisplayLabel(selectedCompletedTicket.severity)}</dd>
                    </>
                  )}
                  {(selectedCompletedTicket.description || selectedCompletedTicket.notes) && (
                    <>
                      <dt>{selectedCompletedTicket.ticketType === 'fault' ? t('eqDescription') : t('eqNotes')}</dt>
                      <dd className={styles.detailNote}>{selectedCompletedTicket.description || selectedCompletedTicket.notes || '—'}</dd>
                    </>
                  )}
                  <dt>{t('eqCompletionNote')}</dt>
                  <dd className={styles.detailNote}>{selectedCompletedTicket.resolutionNote || '—'}</dd>
                  {selectedCompletedTicket.resolutionSpareParts && (
                    <>
                      <dt>{t('eqSparePartsUsed')}</dt>
                      <dd>{selectedCompletedTicket.resolutionSpareParts}</dd>
                    </>
                  )}
                  <dt>{t('eqPhotos')}</dt>
                  <dd>
                    {selectedCompletedTicket.resolutionPhoto ? (
                      <img src={selectedCompletedTicket.resolutionPhoto} alt="Resolution" className={styles.resolutionPhoto} />
                    ) : (
                      <span className={styles.detailMuted}>{t('eqNoPhotosAttached')}</span>
                    )}
                  </dd>
                </dl>
              </section>
              <div className={eqStyles.modalActions}>
                <button type="button" className={eqStyles.btnSecondary} onClick={() => setSelectedCompletedTicket(null)}>{t('eqClose')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Ticket modal */}
      {resolveTicket && (
        <div className={eqStyles.modalOverlay} onClick={() => { setResolveTicket(null); setResolveForm({ completionNote: '', spareParts: '', resolutionPhoto: null }); }}>
          <div className={eqStyles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h3 className={eqStyles.modalTitle}>{t('eqResolveTicket')} – {resolveTicket.equipmentName}</h3>
            <form onSubmit={submitResolve} className={eqStyles.modalForm}>
              <div className={eqStyles.formRow}>
                <label>{t('eqCompletionNote')} <span className={eqStyles.required}>*</span></label>
                <textarea value={resolveForm.completionNote} onChange={(e) => setResolveForm((f) => ({ ...f, completionNote: e.target.value }))} required rows={4} className={eqStyles.input} placeholder={t('eqDescribeWhatDone')} />
              </div>
              <div className={eqStyles.formRow}>
                <label>{t('eqSparePartsUsed')}</label>
                <input type="text" value={resolveForm.spareParts} onChange={(e) => setResolveForm((f) => ({ ...f, spareParts: e.target.value }))} className={eqStyles.input} placeholder={t('eqSparePartsPlaceholder')} />
              </div>
              <div className={eqStyles.formRow}>
                <label>{t('eqUploadPhoto')}</label>
                <input type="file" accept="image/*" onChange={handleResolvePhotoChange} className={eqStyles.input} />
                {resolveForm.resolutionPhoto && <img src={resolveForm.resolutionPhoto} alt="Attached" className={styles.resolvePhotoPreview} />}
              </div>
              <div className={eqStyles.modalActions}>
                <button type="button" className={eqStyles.btnSecondary} onClick={() => { setResolveTicket(null); setResolveForm({ completionNote: '', spareParts: '', resolutionPhoto: null }); }}>{t('eqCancel')}</button>
                <button type="submit" className={eqStyles.btnPrimary}>{t('eqSaveAndComplete')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View History modal */}
      {viewHistoryEquipment && (
        <div className={eqStyles.modalOverlay} onClick={() => setViewHistoryEquipment(null)}>
          <div className={eqStyles.historyModal} onClick={(e) => e.stopPropagation()}>
            <div className={eqStyles.historyModalHeader}>
              <h3 className={eqStyles.modalTitle}>{t('eqViewHistoryTitle')} – {viewHistoryEquipment.name}</h3>
              <button type="button" className={eqStyles.widgetListClose} onClick={() => setViewHistoryEquipment(null)} aria-label={t('eqClose')}>×</button>
            </div>
            <div className={eqStyles.historyModalBody}>
              <section className={eqStyles.historySection}>
                <h4 className={eqStyles.historySectionTitle}>{t('eqEquipment')}</h4>
                <dl className={eqStyles.historyMeta}>
                  <dt>{t('assignedZone')}</dt><dd>{equipmentZoneLabel(viewHistoryEquipment.zone)}</dd>
                  <dt>{t('operationalStatus')}</dt><dd><span className={eqStyles.eqBadge} data-status={viewHistoryEquipment.status}>{getEquipmentStatusDisplayLabel(viewHistoryEquipment.status)}</span></dd>
                  <dt>{t('eqNextInspection')}</dt>
                  <dd>
                    {viewHistoryEquipment.inspectionStatus == null ? <span className={eqStyles.inspectionBadgeNone}>{t('eqNotScheduled')}</span> : viewHistoryEquipment.inspectionStatus === 'ok' ? <span className={eqStyles.inspectionBadgeOk}>{t('eqOnTrack')}</span> : viewHistoryEquipment.inspectionStatus === 'due_soon' ? <span className={eqStyles.inspectionBadgeDueSoon}>{t('eqDueSoon')}</span> : <span className={eqStyles.inspectionBadgeOverdue}>{t('eqOverdue')}</span>}
                  </dd>
                </dl>
              </section>
              {historyData && (
                <>
                  <section className={eqStyles.historySection}>
                    <h4 className={eqStyles.historySectionTitle}>{t('eqSummaryLast90Days')}</h4>
                    <dl className={eqStyles.historyMeta}>
                      <dt>{t('eqTotalFaultEvents')}</dt><dd>{historyData.totalFaults90}</dd>
                      <dt>{t('eqTotalMaintenanceEvents')}</dt><dd>{historyData.totalMaintenance90}</dd>
                      <dt>{t('eqLastMaintenanceDate')}</dt><dd>{historyData.lastMaintenanceDate ? new Date(historyData.lastMaintenanceDate).toLocaleDateString() : '—'}</dd>
                      <dt>{t('eqLastInspectionDateLabel')}</dt><dd>{historyData.lastInspectionDate ? new Date(historyData.lastInspectionDate).toLocaleDateString() : '—'}</dd>
                    </dl>
                    {historyData.faults30Count >= 3 && <div className={eqStyles.historyWarning}>⚠ {t('eqHighFailureRateWarning')} ({historyData.faults30Count} events in 30 days)</div>}
                  </section>
                  <section className={eqStyles.historySection}>
                    <h4 className={eqStyles.historySectionTitle}>{t('eqTimeline')}</h4>
                    <div className={eqStyles.historyTimeline}>
                      {historyData.timeline.length === 0 ? <p className={eqStyles.historyEmpty}>{t('eqNoEvents')}</p> : historyData.timeline.map((ev, idx) => (
                        <div key={idx} className={ev.type === 'fault' ? eqStyles.historyEventFault : ev.type === 'maintenance' || ev.type === 'maintenance_completed' ? eqStyles.historyEventMaintenance : eqStyles.historyEventInspection}>
                          <span className={eqStyles.historyEventDate}>{ev.date ? new Date(ev.date).toLocaleDateString() : '—'}</span>
                          <span className={eqStyles.historyEventType}>{ev.type === 'fault' ? t('eqTypeFault') : ev.type === 'maintenance_completed' ? t('eqCompleted') : ev.type === 'maintenance' ? t('eqMaintenance') : t('eqTypeInspection')}</span>
                          {ev.severity != null && <span className={eqStyles.historyEventMeta}>{getSeverityDisplayLabel(ev.severity)}</span>}
                          {ev.status != null && <span className={eqStyles.historyEventMeta}>{ev.status === FAULT_STATUS_RESOLVED ? t('eqResolved') : t('eqOpen')}</span>}
                          {ev.resolutionNote && <span className={eqStyles.historyEventMeta}>{t('eqResolution')}: {ev.resolutionNote}</span>}
                          {ev.notes && <span className={eqStyles.historyEventMeta}>{ev.notes}</span>}
                          {ev.description && <span className={eqStyles.historyEventDesc}>{ev.description}</span>}
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
            </div>
          )}

      {/* Add equipment modal */}
      {addEquipmentOpen && (
        <div className={eqStyles.modalOverlay} onClick={() => setAddEquipmentOpen(false)}>
          <div className={eqStyles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={eqStyles.modalTitle}>{t('addEquipment')}</h3>
            <form onSubmit={handleAddEquipment} className={eqStyles.modalForm}>
              <div className={eqStyles.formRow}>
                <label>{t('equipmentName')}</label>
                <input type="text" value={newEquipment.name} onChange={(e) => setNewEquipment((p) => ({ ...p, name: e.target.value }))} required placeholder={t('equipmentNamePlaceholder')} className={eqStyles.input} />
              </div>
              <div className={eqStyles.formRow}>
                <label>{t('assignedZone')}</label>
                <select value={newEquipment.zone} onChange={(e) => setNewEquipment((p) => ({ ...p, zone: e.target.value }))} className={eqStyles.input}>
                  <option value="">—</option>
                  {zonesList.map((z) => (<option key={z.id} value={z.id}>{z.label || z.name || z.id}</option>))}
                </select>
              </div>
              <div className={eqStyles.formRow}>
                <label>{t('operationalStatus')}</label>
                <select value={newEquipment.status} onChange={(e) => setNewEquipment((p) => ({ ...p, status: e.target.value }))} className={eqStyles.input}>
                  <option value={EQUIPMENT_STATUS.ACTIVE}>{t('eqActive')}</option>
                  <option value={EQUIPMENT_STATUS.UNDER_MAINTENANCE}>{t('eqUnderMaintenance')}</option>
                  <option value={EQUIPMENT_STATUS.OUT_OF_SERVICE}>{t('eqOutOfService')}</option>
                </select>
              </div>
              <div className={eqStyles.formRow}>
                <label>{t('eqLastInspectionOptional')}</label>
                <input type="date" value={newEquipment.lastInspection || ''} onChange={(e) => setNewEquipment((p) => ({ ...p, lastInspection: e.target.value || undefined }))} className={eqStyles.input} />
              </div>
              <div className={eqStyles.modalActions}>
                <button type="button" className={eqStyles.btnSecondary} onClick={() => setAddEquipmentOpen(false)}>{t('eqCancel')}</button>
                <button type="submit" className={eqStyles.btnPrimary}>{t('eqAdd')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

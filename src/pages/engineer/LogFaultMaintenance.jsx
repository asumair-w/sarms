import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
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
  const { equipment, faults, maintenancePlans, addFault, addMaintenancePlan, updateMaintenancePlan, updateEquipmentItem, addEquipmentItem, removeEquipmentItem, updateFault, zones: storeZones } = useAppStore()
  const zonesList = (storeZones && storeZones.length > 0) ? storeZones : getInitialZones()

  const [equipmentOpen, setEquipmentOpen] = useState(true)
  const [eqFilterZone, setEqFilterZone] = useState('')
  const [eqFilterStatus, setEqFilterStatus] = useState('')
  const [eqFilterInspection, setEqFilterInspection] = useState('')
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
  const [selectedSummaryWidget, setSelectedSummaryWidget] = useState(null) // 'equipment' | null

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

  const inspectionDueSoonCount = useMemo(() => equipmentWithInspection.filter((e) => e.inspectionStatus === 'due_soon').length, [equipmentWithInspection])
  const inspectionOverdueCount = useMemo(() => equipmentWithInspection.filter((e) => e.inspectionStatus === 'overdue').length, [equipmentWithInspection])

  const equipmentSummary = useMemo(() => {
    const dueSoon = equipmentWithInspection.filter((e) => e.inspectionStatus === 'due_soon').length
    const overdue = equipmentWithInspection.filter((e) => e.inspectionStatus === 'overdue').length
    const now = Date.now()
    const ms90 = 90 * 24 * 60 * 60 * 1000
    const cutoff = now - ms90
    const toMs = (d) => (d ? new Date(d).getTime() : 0)
    const eventCountByEq = {}
    ;(faults || []).forEach((f) => { if (toMs(f.createdAt) >= cutoff) eventCountByEq[f.equipmentId] = (eventCountByEq[f.equipmentId] || 0) + 1 })
    ;(maintenancePlans || []).forEach((m) => { if (toMs(m.createdAt) >= cutoff || toMs(m.plannedDate) >= cutoff) eventCountByEq[m.equipmentId] = (eventCountByEq[m.equipmentId] || 0) + 1 })
    const highActivity = Object.values(eventCountByEq).filter((c) => c >= 2).length
    return { dueSoon, overdue, highActivity }
  }, [equipmentWithInspection, faults, maintenancePlans])

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
    let list = equipmentWithInspection
    if (eqFilterHighFailure) list = list.filter((e) => highFailureIdsSet.has(e.id))
    if (eqFilterZone) list = list.filter((e) => (e.zone || '').toLowerCase() === eqFilterZone.toLowerCase())
    if (eqFilterStatus) list = list.filter((e) => e.status === eqFilterStatus)
    if (eqFilterInspection) list = list.filter((e) => (eqFilterInspection === 'not_scheduled' ? e.inspectionStatus == null : (e.inspectionStatus || '') === eqFilterInspection))
    if (eqFilterSearch.trim()) {
      const q = eqFilterSearch.trim().toLowerCase()
      const zoneNames = Object.fromEntries(zonesList.map((z) => [z.id, (z.label || z.name || z.id).toLowerCase()]))
      list = list.filter((e) => (e.name || '').toLowerCase().includes(q) || (e.zone || '').toLowerCase().includes(q) || (zoneNames[e.zone] || '').includes(q))
    }
    const dir = eqSortDir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      let va = a[eqSortBy] ?? ''
      let vb = b[eqSortBy] ?? ''
      if (eqSortBy === 'lastInspection') {
        va = va ? new Date(va).getTime() : 0
        vb = vb ? new Date(vb).getTime() : 0
        return dir * (va - vb)
      }
      return dir * String(va).localeCompare(String(vb))
    })
  }, [equipmentWithInspection, eqFilterHighFailure, highFailureIdsSet, eqFilterZone, eqFilterStatus, eqFilterInspection, eqFilterSearch, eqSortBy, eqSortDir, zonesList])

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
      })
    })
    return list
  }, [faults, maintenancePlans])

  const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 }
  const activeTickets = useMemo(() => {
    const toMs = (d) => (d ? new Date(d).getTime() : 0)
    const active = unifiedTickets.filter((t) => t.status !== 'completed')
    const todayMs = new Date(todayStr + 'T12:00:00').getTime()
    return [...active].sort((a, b) => {
      const aDue = a.dueDate ? new Date(a.dueDate + 'T12:00:00').getTime() : todayMs - 1
      const bDue = b.dueDate ? new Date(b.dueDate + 'T12:00:00').getTime() : todayMs - 1
      if (aDue < todayMs && bDue >= todayMs) return -1
      if (aDue >= todayMs && bDue < todayMs) return 1
      if (aDue !== bDue) return aDue - bDue
      const sevA = SEVERITY_ORDER[a.severity] || 0
      const sevB = SEVERITY_ORDER[b.severity] || 0
      if (sevB !== sevA) return sevB - sevA
      return toMs(b.createdAt) - toMs(a.createdAt)
    })
  }, [unifiedTickets, todayStr])

  const completedTickets = useMemo(() =>
    unifiedTickets.filter((t) => t.status === 'completed').sort((a, b) => (new Date(b.resolvedAt || b.createdAt).getTime()) - (new Date(a.resolvedAt || a.createdAt).getTime())),
  [unifiedTickets])

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
    if (!selectedSummaryWidget) return
    const onKey = (e) => { if (e.key === 'Escape') setSelectedSummaryWidget(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedSummaryWidget])
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
      addFault({ id: `F-PMA-${e.id}-${Date.now()}`, equipmentId: e.id, equipmentName: e.name, type: FAULT_TYPE_PREVENTIVE_ALERT, category: 'other', severity: isOverdue ? 'high' : 'medium', status: FAULT_STATUS_OPEN, stopWork: false, description: isOverdue ? 'Inspection overdue' : 'Inspection due within 7 days', createdAt: new Date().toISOString(), auto_generated: true })
    })
  }, [equipmentWithInspection, faults, addFault, updateFault])

  function exportEquipmentCSV() {
    const headers = ['Equipment name', 'Assigned zone', 'Operational status', 'Last inspection']
    const rows = filteredEquipment.map((e) => [e.name ?? '', equipmentZoneLabel(e.zone), EQUIPMENT_STATUS_LABELS[e.status] ?? e.status ?? '', e.lastInspection ?? ''])
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `equipment-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
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
    addEquipmentItem({ id: `eq${Date.now()}`, name: newEquipment.name.trim(), zone: newEquipment.zone || undefined, status: newEquipment.status || EQUIPMENT_STATUS.ACTIVE, lastInspection: newEquipment.lastInspection || undefined, createdAt: new Date().toISOString() })
    setNewEquipment({ name: '', zone: '', status: EQUIPMENT_STATUS.ACTIVE, lastInspection: '' })
    setAddEquipmentOpen(false)
  }
  function handleDeleteEquipment(eq) {
    if (!window.confirm(`Delete "${eq.name}"? This cannot be undone.`)) return
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
  const [resolveForm, setResolveForm] = useState({ completionNote: '', spareParts: '' })
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
        id: `F${Date.now()}`,
        equipmentId,
        equipmentName,
        category: t.category,
        severity: t.severity,
        stopWork: t.stopWork,
        description: t.description.trim(),
        status: FAULT_STATUS_OPEN,
        createdAt: new Date().toISOString(),
      })
      if (t.stopWork) updateEquipmentItem(equipmentId, { status: EQUIPMENT_STATUS.OUT_OF_SERVICE })
    } else {
      let plannedDate = t.plannedDate
      let intervalDays = null
      if (t.ticketType === 'inspection') {
        if (t.inspectionMode === 'recurring' && t.intervalDays.trim()) {
          intervalDays = Math.max(1, Math.floor(Number(t.intervalDays)) || 30)
        }
      }
      addMaintenancePlan({
        id: `MP${Date.now()}`,
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
      updateFault(resolveTicket.id, { status: FAULT_STATUS_RESOLVED, resolutionNote: resolveForm.completionNote.trim(), resolvedAt: now, resolutionSpareParts: resolveForm.spareParts.trim() || undefined })
    } else {
      updateMaintenancePlan(resolveTicket.id, { status: 'completed', resolvedAt: now, resolutionNote: resolveForm.completionNote.trim(), resolutionSpareParts: resolveForm.spareParts.trim() || undefined })
      if (resolveTicket.ticketType === 'inspection' && resolveTicket.intervalDays) {
        const eq = equipment.find((x) => x.id === resolveTicket.equipmentId)
        if (eq) {
          const nextDate = addDaysLocal(getTodayLocal(), resolveTicket.intervalDays)
          addMaintenancePlan({
            id: `MP${Date.now()}`,
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
      const eqItem = equipment.find((x) => x.id === resolveTicket.equipmentId)
      if (eqItem?.status === EQUIPMENT_STATUS.OUT_OF_SERVICE) updateEquipmentItem(resolveTicket.equipmentId, { status: EQUIPMENT_STATUS.ACTIVE })
    }
    setResolveTicket(null)
    setResolveForm({ completionNote: '', spareParts: '' })
  }

  return (
    <div className={styles.page}>
      <section className={eqStyles.summarySection}>
        <h2 className={eqStyles.summaryTitle}><i className="fas fa-chart-pie fa-fw" /> Summary</h2>
        <div className={eqStyles.summaryCards}>
          <button type="button" className={`${eqStyles.summaryCard} ${eqStyles.summaryCardEquipment}`} onClick={() => setSelectedSummaryWidget(selectedSummaryWidget === 'equipment' ? null : 'equipment')} aria-pressed={selectedSummaryWidget === 'equipment'}>
            <span className={eqStyles.summaryCardLabel}>Equipment</span>
            <span className={eqStyles.summaryCardStockRow}><em>Due soon:</em> {equipmentSummary.dueSoon + equipmentSummary.overdue}</span>
            <span className={eqStyles.summaryCardStockRow}><em>High activity (90d):</em> {equipmentSummary.highActivity}</span>
          </button>
          <button
            type="button"
            className={`${eqStyles.summaryCard} ${highFailureCount > 0 ? eqStyles.summaryCardHighFailureDanger : eqStyles.summaryCardHighFailureOk}`}
            onClick={() => { setEqFilterHighFailure(true); setEquipmentOpen(true) }}
          >
            <span className={eqStyles.summaryCardLabel}>High Failure Equipment</span>
            <span className={eqStyles.summaryCardValue}>{highFailureCount} Devices</span>
            <span className={eqStyles.summaryCardSub}>Threshold: ≥{HIGH_FAILURE_RATE_THRESHOLD} per month (rate)</span>
            {highFailureCount > 0 ? <i className={`fas fa-triangle-exclamation ${eqStyles.summaryCardIcon}`} aria-hidden /> : <i className={`fas fa-circle-check ${eqStyles.summaryCardIcon}`} aria-hidden />}
          </button>
        </div>
      </section>

      {selectedSummaryWidget === 'equipment' && (
        <div className={eqStyles.modalOverlay} onClick={() => setSelectedSummaryWidget(null)}>
          <div className={eqStyles.summaryPopupModal} onClick={(e) => e.stopPropagation()}>
            <div className={eqStyles.widgetListHeader}>
              <h3 className={eqStyles.modalTitle}>Equipment – Due soon &amp; High activity (90d)</h3>
              <button type="button" className={eqStyles.widgetListClose} onClick={() => setSelectedSummaryWidget(null)} aria-label="Close">×</button>
            </div>
            <div className={eqStyles.widgetListContent}>
              {(() => {
                const dueSoonList = equipmentWithInspection.filter((e) => e.inspectionStatus === 'due_soon' || e.inspectionStatus === 'overdue')
                const now = Date.now()
                const ms90 = 90 * 24 * 60 * 60 * 1000
                const cutoff = now - ms90
                const toMs = (d) => (d ? new Date(d).getTime() : 0)
                const eventCountByEq = {}
                ;(faults || []).forEach((f) => { if (toMs(f.createdAt) >= cutoff) eventCountByEq[f.equipmentId] = (eventCountByEq[f.equipmentId] || 0) + 1 })
                ;(maintenancePlans || []).forEach((m) => { if (toMs(m.createdAt) >= cutoff || toMs(m.plannedDate) >= cutoff) eventCountByEq[m.equipmentId] = (eventCountByEq[m.equipmentId] || 0) + 1 })
                const highActivityIds = Object.entries(eventCountByEq).filter(([, c]) => c >= 2).map(([id]) => id)
                const highActivityList = equipmentWithInspection.filter((e) => highActivityIds.includes(e.id))
                return (
                  <>
                    {dueSoonList.length > 0 && (
                      <>
                        <h4 className={eqStyles.widgetSubTitle}>Due soon / Overdue</h4>
                        <table className={eqStyles.table}>
                          <thead><tr><th>Equipment</th><th>Zone</th><th>Next inspection</th><th>Status</th></tr></thead>
                          <tbody>
                            {dueSoonList.map((e) => (
                              <tr key={e.id}>
                                <td>{e.name}</td>
                                <td>{equipmentZoneLabel(e.zone)}</td>
                                <td>{e.nextInspection}</td>
                                <td>{e.inspectionStatus === 'overdue' ? <span className={eqStyles.inspectionBadgeOverdue}>Overdue</span> : <span className={eqStyles.inspectionBadgeDueSoon}>Due Soon</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                    {highActivityList.length > 0 && (
                      <>
                        <h4 className={eqStyles.widgetSubTitle}>High activity (2+ events in 90 days)</h4>
                        <table className={eqStyles.table}>
                          <thead><tr><th>Equipment</th><th>Zone</th><th>Events (90d)</th></tr></thead>
                          <tbody>
                            {highActivityList.map((e) => (
                              <tr key={e.id}>
                                <td>{e.name}</td>
                                <td>{equipmentZoneLabel(e.zone)}</td>
                                <td>{eventCountByEq[e.id] || 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                    {dueSoonList.length === 0 && highActivityList.length === 0 && <p className={eqStyles.widgetListEmpty}>No equipment due soon or with high activity.</p>}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      <section className={eqStyles.section}>
        <button type="button" className={eqStyles.sectionHeader} onClick={() => setEquipmentOpen((o) => !o)}>
          <h2 className={eqStyles.sectionTitle}><i className="fas fa-wrench fa-fw" /> Manage Equipment</h2>
          <span className={eqStyles.expandLabel}>{equipmentOpen ? 'Collapse' : 'Expand'}</span>
          <span className={eqStyles.chevron}>{equipmentOpen ? '▼' : '▶'}</span>
        </button>
        {equipmentOpen && (
          <>
            <div className={eqStyles.filtersBar}>
              <div className={eqStyles.filtersRow}>
                <span className={eqStyles.filterLabel}>Zone</span>
                <select value={eqFilterZone} onChange={(e) => setEqFilterZone(e.target.value)} className={eqStyles.filterSelect} title="Filter by zone">
                  <option value="">All</option>
                  {zonesList.map((z) => (
                    <option key={z.id} value={z.id}>{z.label || z.name || z.id}</option>
                  ))}
                </select>
              </div>
              <div className={eqStyles.filtersRow}>
                <span className={eqStyles.filterLabel}>Status</span>
                <select value={eqFilterStatus} onChange={(e) => setEqFilterStatus(e.target.value)} className={eqStyles.filterSelect} title="Filter by status">
                  <option value="">All</option>
                  <option value={EQUIPMENT_STATUS.ACTIVE}>Active</option>
                  <option value={EQUIPMENT_STATUS.UNDER_MAINTENANCE}>Under Maintenance</option>
                  <option value={EQUIPMENT_STATUS.OUT_OF_SERVICE}>Out of Service</option>
                </select>
              </div>
              <div className={eqStyles.filtersRow}>
                <span className={eqStyles.filterLabel}>Next Inspection</span>
                <select value={eqFilterInspection} onChange={(e) => setEqFilterInspection(e.target.value)} className={eqStyles.filterSelect} title="Filter by next inspection status">
                  <option value="">All</option>
                  <option value="ok">On track</option>
                  <option value="due_soon">Due Soon</option>
                  <option value="overdue">Overdue</option>
                  <option value="not_scheduled">Not scheduled</option>
                </select>
              </div>
              <div className={eqStyles.filtersRow}>
                <span className={eqStyles.filterLabel}>Search</span>
                <input type="search" value={eqFilterSearch} onChange={(e) => setEqFilterSearch(e.target.value)} placeholder="Name, zone…" className={eqStyles.filterInput} />
              </div>
              {eqFilterHighFailure && (
                <div className={eqStyles.filterChipWrap}>
                  <span className={eqStyles.filterChip}>High Failure only</span>
                  <button type="button" className={eqStyles.filterChipClear} onClick={() => setEqFilterHighFailure(false)} aria-label="Clear High Failure filter">×</button>
                </div>
              )}
              <button type="button" className={eqStyles.btnSecondary} onClick={exportEquipmentCSV} disabled={filteredEquipment.length === 0}>
                <i className="fas fa-file-csv fa-fw" /> Export CSV
              </button>
              <button type="button" className={eqStyles.btnPrimary} onClick={() => openCreateTicket(null)}>
                <i className="fas fa-plus fa-fw" /> Create Ticket
              </button>
              <button type="button" className={eqStyles.btnPrimary} onClick={() => setAddEquipmentOpen(true)}>
                <i className="fas fa-plus fa-fw" /> Add Equipment
              </button>
            </div>
            {(inspectionDueSoonCount > 0 || inspectionOverdueCount > 0) && (
              <div className={eqStyles.inspectionCounters}>
                {inspectionDueSoonCount > 0 && <span className={eqStyles.inspectionCounterDueSoon}>Inspections Due Soon: {inspectionDueSoonCount}</span>}
                {inspectionOverdueCount > 0 && <span className={eqStyles.inspectionCounterOverdue}>Overdue Inspections: {inspectionOverdueCount}</span>}
              </div>
            )}
            <div className={eqStyles.tableWrap}>
              <table className={eqStyles.table}>
                <thead>
                  <tr>
                    <th><button type="button" className={eqStyles.thSort} onClick={() => toggleEqSort('name')}>Equipment name {eqSortBy === 'name' ? (eqSortDir === 'asc' ? '↑' : '↓') : ''}</button></th>
                    <th><button type="button" className={eqStyles.thSort} onClick={() => toggleEqSort('zone')}>Assigned zone {eqSortBy === 'zone' ? (eqSortDir === 'asc' ? '↑' : '↓') : ''}</button></th>
                    <th>Operational status</th>
                    <th><button type="button" className={eqStyles.thSort} onClick={() => toggleEqSort('lastInspection')}>Last inspection {eqSortBy === 'lastInspection' ? (eqSortDir === 'asc' ? '↑' : '↓') : ''}</button></th>
                    <th>Service Cycle</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEquipment.map((e) => (
                    <tr key={e.id}>
                      <td>
                        {e.name}
                        {highFailureIdsSet.has(e.id) && (
                          <span className={eqStyles.highFailureIcon} title={`High Failure Rate: ${failureCountByEquipmentId[e.id] ?? 0} in ${FAILURE_WINDOW_DAYS}d (${(failureRateByEquipmentId[e.id] ?? 0).toFixed(1)}/${FAILURE_RATE_PER_DAYS}d)`} aria-label="High failure rate">⚠</span>
                        )}
                      </td>
                      <td>{equipmentZoneLabel(e.zone)}</td>
                      <td><span className={eqStyles.eqBadge} data-status={e.status}>{EQUIPMENT_STATUS_LABELS[e.status]}</span></td>
                      <td>{e.lastInspection}</td>
                      <td className={eqStyles.cellServiceCycle}>
                        {e.nextInspection == null ? (
                          <div className={eqStyles.serviceCycleUnscheduled}>
                            <span className={eqStyles.inspectionBadgeNone}>Not scheduled</span>
                            {e.ageYears != null && <span className={eqStyles.serviceCycleAge}>Age: {e.ageYears.toFixed(1)}y</span>}
                          </div>
                        ) : (
                          <div className={eqStyles.serviceCycleWrap}>
                            <span className={e.remainingDays > 7 ? eqStyles.serviceCycleDaysOk : e.remainingDays >= 0 ? eqStyles.serviceCycleDaysSoon : eqStyles.serviceCycleDaysOverdue}>
                              {e.remainingDays >= 0 ? `${e.remainingDays} days` : `-${Math.abs(e.remainingDays)} days`}
                            </span>
                            <div className={eqStyles.progressBarTrack}>
                              <div className={(e.cycleProgress ?? 0) < 70 ? eqStyles.progressBarFillGreen : (e.cycleProgress ?? 0) < 100 ? eqStyles.progressBarFillYellow : eqStyles.progressBarFillRed} style={{ width: `${Math.min(100, e.cycleProgress ?? 0)}%` }} />
                            </div>
                            {e.ageYears != null && <span className={eqStyles.serviceCycleAge}>Age: {e.ageYears.toFixed(1)}y</span>}
                          </div>
                        )}
                      </td>
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
                            Actions <span className={eqStyles.actionsCaret}>{openActionsId === e.id ? '▲' : '▼'}</span>
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

      <section className={`${styles.section} ${styles.ticketsSection}`}>
        <h2 className={styles.sectionTitle}><i className="fas fa-ticket fa-fw" /> Equipment Tickets</h2>
        <h3 className={styles.subTitle}>Active Tickets</h3>
        {activeTickets.length === 0 ? (
          <p className={styles.hint}>No active tickets. Use &quot;Create Ticket&quot; to add a fault, maintenance, or inspection.</p>
        ) : (
          <div className={styles.ticketCards}>
            {activeTickets.map((t) => {
              const dueMs = t.dueDate ? new Date(t.dueDate + 'T12:00:00').getTime() : null
              const todayMs = new Date(todayStr + 'T12:00:00').getTime()
              const daysRemaining = dueMs != null ? Math.floor((dueMs - todayMs) / 86400000) : null
              const isOverdue = daysRemaining != null && daysRemaining < 0
              const urgencyClass = t.status === 'completed' ? styles.ticketCardCompleted
                : isOverdue ? styles.ticketCardUrgencyOverdue
                : daysRemaining != null && daysRemaining <= 2 ? styles.ticketCardUrgencyRed
                : daysRemaining != null && daysRemaining <= 7 ? styles.ticketCardUrgencyYellow
                : styles.ticketCardUrgencyGreen
              const typeClass = t.ticketType === 'fault' ? styles.ticketCardTypeFault : t.ticketType === 'preventive' ? styles.ticketCardTypePreventive : t.ticketType === 'corrective' ? styles.ticketCardTypeCorrective : styles.ticketCardTypeInspection
              return (
                <div key={`${t.source}-${t.id}`} className={`${styles.ticketCard} ${urgencyClass}`}>
                  <div className={styles.ticketCardTitle}>{t.equipmentName}</div>
                  <span className={`${styles.ticketCardType} ${typeClass}`}>{t.ticketType === 'fault' ? 'Fault' : t.ticketType === 'preventive' ? 'Preventive' : t.ticketType === 'corrective' ? 'Corrective' : 'Inspection'}</span>
                  <div className={styles.ticketCardMeta}>Status: {t.status === 'open' ? 'Open' : 'Scheduled'}</div>
                  {t.dueDate && <div className={styles.ticketCardMeta}>Due: {t.dueDate}</div>}
                  {daysRemaining != null && <div className={styles.ticketCardMeta}>Days remaining: {isOverdue ? `Overdue (${Math.abs(daysRemaining)})` : daysRemaining}</div>}
                  <div className={styles.ticketCardMeta}>Created: {new Date(t.createdAt).toLocaleDateString()}</div>
                  {t.severity && <div className={styles.ticketCardMeta}>Severity: {SEVERITY_OPTIONS.find((s) => s.id === t.severity)?.label ?? t.severity}</div>}
                  <div className={styles.ticketCardActions}>
                    <button type="button" className={eqStyles.btnPrimary} onClick={() => { setResolveTicket(t); setResolveForm({ completionNote: '', spareParts: '' }); }}>Resolve</button>
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
              <span>Completed Tickets ({completedTickets.length})</span>
            </button>
            {completedTicketsOpen && (
              <>
                <div className={styles.completedFilters}>
                  <label className={styles.completedFilterLabel}>Filter:</label>
                  <select value={completedFilterEquipment} onChange={(e) => setCompletedFilterEquipment(e.target.value)} className={styles.completedFilterSelect} title="Equipment">
                    <option value="">All equipment</option>
                    {equipment.map((eq) => (
                      <option key={eq.id} value={eq.id}>{eq.name}</option>
                    ))}
                  </select>
                  <select value={completedFilterType} onChange={(e) => setCompletedFilterType(e.target.value)} className={styles.completedFilterSelect} title="Ticket type">
                    <option value="">All types</option>
                    <option value="fault">Fault</option>
                    <option value="preventive">Preventive</option>
                    <option value="corrective">Corrective</option>
                    <option value="inspection">Inspection</option>
                  </select>
                  <span className={styles.completedFilterLabel}>Resolved from</span>
                  <input type="date" value={completedFilterDateFrom} onChange={(e) => setCompletedFilterDateFrom(e.target.value)} className={styles.completedFilterInput} />
                  <span className={styles.completedFilterLabel}>to</span>
                  <input type="date" value={completedFilterDateTo} onChange={(e) => setCompletedFilterDateTo(e.target.value)} className={styles.completedFilterInput} />
                </div>
                <div className={styles.ticketCards}>
                  {completedTicketsFiltered.length === 0 ? (
                    <p className={styles.hint}>No completed tickets match the current filters.</p>
                  ) : (
                    completedTicketsFiltered.map((t) => (
                      <button
                        type="button"
                        key={`${t.source}-${t.id}`}
                        className={`${styles.ticketCard} ${styles.ticketCardCompleted} ${styles.ticketCardClickable}`}
                        onClick={() => setSelectedCompletedTicket(t)}
                      >
                        <div className={styles.ticketCardTitle}>{t.equipmentName}</div>
                        <span className={`${styles.ticketCardType} ${t.ticketType === 'fault' ? styles.ticketCardTypeFault : t.ticketType === 'preventive' ? styles.ticketCardTypePreventive : t.ticketType === 'corrective' ? styles.ticketCardTypeCorrective : styles.ticketCardTypeInspection}`}>{t.ticketType === 'fault' ? 'Fault' : t.ticketType === 'preventive' ? 'Preventive' : t.ticketType === 'corrective' ? 'Corrective' : 'Inspection'}</span>
                        <div className={styles.ticketCardMeta}>Resolved: {(t.resolvedAt || t.createdAt) ? new Date(t.resolvedAt || t.createdAt).toLocaleDateString() : '—'}</div>
                        <span className={styles.ticketCardViewHint}>Click to view details</span>
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
            <button type="button" className={eqStyles.actionsItem} onClick={() => { openCreateTicket(openEquipment); closeMenu(); }}><i className="fas fa-plus fa-fw" /> Create Ticket</button>
            <button type="button" className={eqStyles.actionsItem} onClick={() => { setViewHistoryEquipment(openEquipment); closeMenu(); }}>View History</button>
            <button type="button" className={eqStyles.actionsItem} onClick={() => { setEditEquipment({ ...openEquipment, zone: (openEquipment.zone || '').toLowerCase() }); closeMenu(); }}>Edit</button>
            <button type="button" className={`${eqStyles.actionsItem} ${eqStyles.actionsItemDanger}`} onClick={() => { handleDeleteEquipment(openEquipment); closeMenu(); }}>Delete</button>
          </div>,
          document.body
        )
      })()}

      {/* Edit equipment modal */}
      {editEquipment && (
        <div className={eqStyles.modalOverlay} onClick={() => setEditEquipment(null)}>
          <div className={eqStyles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={eqStyles.modalTitle}>Edit equipment – {editEquipment.name}</h3>
            <form onSubmit={handleSaveEditEquipment} className={eqStyles.modalForm}>
              <div className={eqStyles.formRow}>
                <label>Equipment name</label>
                <input type="text" value={editEquipment.name} onChange={(e) => setEditEquipment((p) => ({ ...p, name: e.target.value }))} required className={eqStyles.input} />
              </div>
              <div className={eqStyles.formRow}>
                <label>Assigned zone</label>
                <select value={editEquipment.zone || ''} onChange={(e) => setEditEquipment((p) => ({ ...p, zone: e.target.value }))} className={eqStyles.input}>
                  <option value="">—</option>
                  {zonesList.map((z) => (<option key={z.id} value={z.id}>{z.label || z.name || z.id}</option>))}
                </select>
              </div>
              <div className={eqStyles.formRow}>
                <label>Operational status</label>
                <select value={editEquipment.status || EQUIPMENT_STATUS.ACTIVE} onChange={(e) => setEditEquipment((p) => ({ ...p, status: e.target.value }))} className={eqStyles.input}>
                  <option value={EQUIPMENT_STATUS.ACTIVE}>Active</option>
                  <option value={EQUIPMENT_STATUS.UNDER_MAINTENANCE}>Under Maintenance</option>
                  <option value={EQUIPMENT_STATUS.OUT_OF_SERVICE}>Out of Service</option>
                </select>
              </div>
              <div className={eqStyles.formRow}>
                <label>Last inspection (date)</label>
                <input type="date" value={editEquipment.lastInspection || ''} onChange={(e) => setEditEquipment((p) => ({ ...p, lastInspection: e.target.value || undefined }))} className={eqStyles.input} />
              </div>
              <div className={eqStyles.modalActions}>
                <button type="button" className={eqStyles.btnSecondary} onClick={() => setEditEquipment(null)}>Cancel</button>
                <button type="submit" className={eqStyles.btnPrimary}>Save</button>
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
              Create Equipment Ticket{createTicketEquipment ? ` – ${createTicketEquipment.name}` : ''}
            </h3>
            <form onSubmit={submitCreateTicket} className={eqStyles.modalForm}>
              {!createTicketEquipment && (
                <div className={eqStyles.formRow}>
                  <label>Equipment <span className={eqStyles.required}>*</span></label>
                  <select value={ticketForm.equipmentId} onChange={(e) => setTicketForm((f) => ({ ...f, equipmentId: e.target.value }))} required className={eqStyles.input}>
                    <option value="">Select equipment</option>
                    {equipment.map((eq) => (
                      <option key={eq.id} value={eq.id}>{eq.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className={eqStyles.formRow}>
                <label>Ticket Type <span className={eqStyles.required}>*</span></label>
                <select value={ticketForm.ticketType} onChange={(e) => setTicketForm((f) => ({ ...f, ticketType: e.target.value }))} required className={eqStyles.input}>
                  <option value="">Select type</option>
                  {TICKET_TYPES.map((ty) => (
                    <option key={ty.id} value={ty.id}>{ty.label}</option>
                  ))}
                </select>
              </div>
              {ticketForm.ticketType === 'fault' && (
                <>
                  <div className={eqStyles.formRow}>
                    <label>Fault Category</label>
                    <select value={ticketForm.category} onChange={(e) => setTicketForm((f) => ({ ...f, category: e.target.value }))} className={eqStyles.input}>
                      {FAULT_CATEGORIES.map((c) => (<option key={c.id} value={c.id}>{c.label}</option>))}
                    </select>
                  </div>
                  <div className={eqStyles.formRow}>
                    <label>Severity</label>
                    <select value={ticketForm.severity} onChange={(e) => setTicketForm((f) => ({ ...f, severity: e.target.value }))} className={eqStyles.input}>
                      {SEVERITY_OPTIONS.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
                    </select>
                  </div>
                  <div className={eqStyles.formRow}>
                    <label>Stop Work?</label>
                    <select value={ticketForm.stopWork ? 'yes' : 'no'} onChange={(e) => setTicketForm((f) => ({ ...f, stopWork: e.target.value === 'yes' }))} className={eqStyles.input}>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  <div className={eqStyles.formRow}>
                    <label>Description <span className={eqStyles.required}>*</span></label>
                    <textarea value={ticketForm.description} onChange={(e) => setTicketForm((f) => ({ ...f, description: e.target.value }))} required rows={3} className={eqStyles.input} placeholder="Describe the fault..." />
                  </div>
                </>
              )}
              {(ticketForm.ticketType === 'preventive' || ticketForm.ticketType === 'corrective') && (
                <>
                  <div className={eqStyles.formRow}>
                    <label>Planned Date <span className={eqStyles.required}>*</span></label>
                    <input type="date" value={ticketForm.plannedDate} onChange={(e) => setTicketForm((f) => ({ ...f, plannedDate: e.target.value }))} required className={eqStyles.input} />
                  </div>
                  {ticketForm.ticketType === 'corrective' && (
                    <div className={eqStyles.formRow}>
                      <label>Priority</label>
                      <select value={ticketForm.priority} onChange={(e) => setTicketForm((f) => ({ ...f, priority: e.target.value }))} className={eqStyles.input}>
                        {PRIORITY_OPTIONS.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                      </select>
                    </div>
                  )}
                  <div className={eqStyles.formRow}>
                    <label>Notes</label>
                    <textarea value={ticketForm.notes} onChange={(e) => setTicketForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className={eqStyles.input} placeholder="Optional notes..." />
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
                <button type="button" className={eqStyles.btnSecondary} onClick={() => { setCreateTicketOpen(false); setCreateTicketEquipment(null); }}>Cancel</button>
                <button type="submit" className={eqStyles.btnPrimary}>Create Ticket</button>
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
              <h3 className={eqStyles.modalTitle}>Completed Ticket – {selectedCompletedTicket.equipmentName}</h3>
              <button type="button" className={eqStyles.widgetListClose} onClick={() => setSelectedCompletedTicket(null)} aria-label="Close">×</button>
            </div>
            <div className={eqStyles.historyModalBody}>
              <section className={eqStyles.historySection}>
                <dl className={eqStyles.historyMeta}>
                  <dt>Ticket type</dt>
                  <dd>{selectedCompletedTicket.ticketType === 'fault' ? 'Fault' : selectedCompletedTicket.ticketType === 'preventive' ? 'Preventive Maintenance' : selectedCompletedTicket.ticketType === 'corrective' ? 'Corrective Maintenance' : 'Inspection'}</dd>
                  <dt>Status</dt>
                  <dd>Completed</dd>
                  <dt>Created</dt>
                  <dd>{selectedCompletedTicket.createdAt ? new Date(selectedCompletedTicket.createdAt).toLocaleString() : '—'}</dd>
                  {selectedCompletedTicket.dueDate && (
                    <>
                      <dt>Due date</dt>
                      <dd>{selectedCompletedTicket.dueDate}</dd>
                    </>
                  )}
                  <dt>Resolved at</dt>
                  <dd>{(selectedCompletedTicket.resolvedAt || selectedCompletedTicket.createdAt) ? new Date(selectedCompletedTicket.resolvedAt || selectedCompletedTicket.createdAt).toLocaleString() : '—'}</dd>
                  {selectedCompletedTicket.severity && (
                    <>
                      <dt>Severity</dt>
                      <dd>{SEVERITY_OPTIONS.find((s) => s.id === selectedCompletedTicket.severity)?.label ?? selectedCompletedTicket.severity}</dd>
                    </>
                  )}
                  {(selectedCompletedTicket.description || selectedCompletedTicket.notes) && (
                    <>
                      <dt>{selectedCompletedTicket.ticketType === 'fault' ? 'Description' : 'Notes'}</dt>
                      <dd className={styles.detailNote}>{selectedCompletedTicket.description || selectedCompletedTicket.notes || '—'}</dd>
                    </>
                  )}
                  <dt>Completion note</dt>
                  <dd className={styles.detailNote}>{selectedCompletedTicket.resolutionNote || '—'}</dd>
                  {selectedCompletedTicket.resolutionSpareParts && (
                    <>
                      <dt>Spare parts used</dt>
                      <dd>{selectedCompletedTicket.resolutionSpareParts}</dd>
                    </>
                  )}
                  <dt>Photos</dt>
                  <dd className={styles.detailMuted}>No photos attached</dd>
                </dl>
              </section>
              <div className={eqStyles.modalActions}>
                <button type="button" className={eqStyles.btnSecondary} onClick={() => setSelectedCompletedTicket(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Ticket modal */}
      {resolveTicket && (
        <div className={eqStyles.modalOverlay} onClick={() => { setResolveTicket(null); setResolveForm({ completionNote: '', spareParts: '' }); }}>
          <div className={eqStyles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h3 className={eqStyles.modalTitle}>Resolve Ticket – {resolveTicket.equipmentName}</h3>
            <form onSubmit={submitResolve} className={eqStyles.modalForm}>
              <div className={eqStyles.formRow}>
                <label>Completion Note <span className={eqStyles.required}>*</span></label>
                <textarea value={resolveForm.completionNote} onChange={(e) => setResolveForm((f) => ({ ...f, completionNote: e.target.value }))} required rows={4} className={eqStyles.input} placeholder="Describe what was done..." />
              </div>
              <div className={eqStyles.formRow}>
                <label>Spare Parts Used (optional)</label>
                <input type="text" value={resolveForm.spareParts} onChange={(e) => setResolveForm((f) => ({ ...f, spareParts: e.target.value }))} className={eqStyles.input} placeholder="e.g. Belt, bearing" />
              </div>
              <div className={eqStyles.formRow}>
                <label>Upload Photo (optional)</label>
                <input type="file" accept="image/*" className={eqStyles.input} />
              </div>
              <div className={eqStyles.modalActions}>
                <button type="button" className={eqStyles.btnSecondary} onClick={() => { setResolveTicket(null); setResolveForm({ completionNote: '', spareParts: '' }); }}>Cancel</button>
                <button type="submit" className={eqStyles.btnPrimary}>Save &amp; Complete</button>
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
              <h3 className={eqStyles.modalTitle}>View History – {viewHistoryEquipment.name}</h3>
              <button type="button" className={eqStyles.widgetListClose} onClick={() => setViewHistoryEquipment(null)} aria-label="Close">×</button>
            </div>
            <div className={eqStyles.historyModalBody}>
              <section className={eqStyles.historySection}>
                <h4 className={eqStyles.historySectionTitle}>Equipment</h4>
                <dl className={eqStyles.historyMeta}>
                  <dt>Assigned zone</dt><dd>{equipmentZoneLabel(viewHistoryEquipment.zone)}</dd>
                  <dt>Operational status</dt><dd><span className={eqStyles.eqBadge} data-status={viewHistoryEquipment.status}>{EQUIPMENT_STATUS_LABELS[viewHistoryEquipment.status]}</span></dd>
                  <dt>Next inspection</dt>
                  <dd>
                    {viewHistoryEquipment.inspectionStatus == null ? <span className={eqStyles.inspectionBadgeNone}>Not scheduled</span> : viewHistoryEquipment.inspectionStatus === 'ok' ? <span className={eqStyles.inspectionBadgeOk}>On track</span> : viewHistoryEquipment.inspectionStatus === 'due_soon' ? <span className={eqStyles.inspectionBadgeDueSoon}>Due Soon</span> : <span className={eqStyles.inspectionBadgeOverdue}>Overdue</span>}
                  </dd>
                </dl>
              </section>
              {historyData && (
                <>
                  <section className={eqStyles.historySection}>
                    <h4 className={eqStyles.historySectionTitle}>Summary (last 90 days)</h4>
                    <dl className={eqStyles.historyMeta}>
                      <dt>Total fault events</dt><dd>{historyData.totalFaults90}</dd>
                      <dt>Total maintenance events</dt><dd>{historyData.totalMaintenance90}</dd>
                      <dt>Last maintenance date</dt><dd>{historyData.lastMaintenanceDate ? new Date(historyData.lastMaintenanceDate).toLocaleDateString() : '—'}</dd>
                      <dt>Last inspection date</dt><dd>{historyData.lastInspectionDate ? new Date(historyData.lastInspectionDate).toLocaleDateString() : '—'}</dd>
                    </dl>
                    {historyData.faults30Count >= 3 && <div className={eqStyles.historyWarning}>⚠ High Failure Rate ({historyData.faults30Count} events in 30 days)</div>}
                  </section>
                  <section className={eqStyles.historySection}>
                    <h4 className={eqStyles.historySectionTitle}>Timeline (last 10 events)</h4>
                    <div className={eqStyles.historyTimeline}>
                      {historyData.timeline.length === 0 ? <p className={eqStyles.historyEmpty}>No events</p> : historyData.timeline.map((ev, idx) => (
                        <div key={idx} className={ev.type === 'fault' ? eqStyles.historyEventFault : ev.type === 'maintenance' || ev.type === 'maintenance_completed' ? eqStyles.historyEventMaintenance : eqStyles.historyEventInspection}>
                          <span className={eqStyles.historyEventDate}>{ev.date ? new Date(ev.date).toLocaleDateString() : '—'}</span>
                          <span className={eqStyles.historyEventType}>{ev.type === 'fault' ? 'Fault' : ev.type === 'maintenance_completed' ? 'Completed' : ev.type === 'maintenance' ? 'Maintenance' : 'Inspection'}</span>
                          {ev.severity != null && <span className={eqStyles.historyEventMeta}>{SEVERITY_OPTIONS.find((s) => s.id === ev.severity)?.label ?? ev.severity}</span>}
                          {ev.status != null && <span className={eqStyles.historyEventMeta}>{ev.status === FAULT_STATUS_RESOLVED ? 'Resolved' : 'Open'}</span>}
                          {ev.resolutionNote && <span className={eqStyles.historyEventMeta}>Resolution: {ev.resolutionNote}</span>}
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
            <h3 className={eqStyles.modalTitle}>Add equipment</h3>
            <form onSubmit={handleAddEquipment} className={eqStyles.modalForm}>
              <div className={eqStyles.formRow}>
                <label>Equipment name</label>
                <input type="text" value={newEquipment.name} onChange={(e) => setNewEquipment((p) => ({ ...p, name: e.target.value }))} required placeholder="e.g. Harvester C" className={eqStyles.input} />
              </div>
              <div className={eqStyles.formRow}>
                <label>Assigned zone</label>
                <select value={newEquipment.zone} onChange={(e) => setNewEquipment((p) => ({ ...p, zone: e.target.value }))} className={eqStyles.input}>
                  <option value="">—</option>
                  {zonesList.map((z) => (<option key={z.id} value={z.id}>{z.label || z.name || z.id}</option>))}
                </select>
              </div>
              <div className={eqStyles.formRow}>
                <label>Operational status</label>
                <select value={newEquipment.status} onChange={(e) => setNewEquipment((p) => ({ ...p, status: e.target.value }))} className={eqStyles.input}>
                  <option value={EQUIPMENT_STATUS.ACTIVE}>Active</option>
                  <option value={EQUIPMENT_STATUS.UNDER_MAINTENANCE}>Under Maintenance</option>
                  <option value={EQUIPMENT_STATUS.OUT_OF_SERVICE}>Out of Service</option>
                </select>
              </div>
              <div className={eqStyles.formRow}>
                <label>Last inspection (date, optional)</label>
                <input type="date" value={newEquipment.lastInspection || ''} onChange={(e) => setNewEquipment((p) => ({ ...p, lastInspection: e.target.value || undefined }))} className={eqStyles.input} />
              </div>
              <div className={eqStyles.modalActions}>
                <button type="button" className={eqStyles.btnSecondary} onClick={() => setAddEquipmentOpen(false)}>Cancel</button>
                <button type="submit" className={eqStyles.btnPrimary}>Add</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

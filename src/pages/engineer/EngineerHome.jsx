import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { useLanguage } from '../../context/LanguageContext'
import { getTranslation } from '../../i18n/translations'
import { SECTION_ACTIONS } from '../../data/engineerNav'
import { useAppStore } from '../../context/AppStoreContext'
import { TASK_STATUS } from '../../data/assignTask'
import { DEPARTMENT_OPTIONS } from '../../data/engineerWorkers'
import { getInitialZones, getDepartment, getTasksForDepartment, getTaskById } from '../../data/workerFlow'
import { getInventoryStatus } from '../../data/inventory'
import { SEVERITY_OPTIONS, FAULT_STATUS_OPEN, FAULT_STATUS_RESOLVED, FAULT_TYPE_PREVENTIVE_ALERT } from '../../data/faults'
import { getSessionStatus } from '../../data/monitorActive'
import { buildOverviewData } from '../../utils/analyticsOverview'
import SystemHealthScore from '../../components/analytics/SystemHealthScore'
import styles from './EngineerHome.module.css'

/** Today as YYYY-MM-DD (local). */
function getTodayLocal() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

/** Monday 00:00:00 of the current week (ISO week). */
function getWeekStart() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.getFullYear(), d.getMonth(), diff)
  monday.setHours(0, 0, 0, 0)
  return monday.getTime()
}

/** Critical severity: high or critical (case-insensitive). */
function isCriticalSeverity(severity) {
  const s = String(severity || '').toLowerCase().trim()
  return s === 'high' || s === 'critical'
}

/** Open fault: not resolved/closed/completed. */
function isFaultOpen(fault) {
  const s = String(fault?.status ?? FAULT_STATUS_OPEN).toLowerCase().trim()
  return s !== 'resolved' && s !== 'closed' && s !== 'completed'
}

/** Normalize task status for chart counts (approved = pending_approval). */
function normalizeTaskStatus(status) {
  if (!status) return null
  const s = String(status).toLowerCase()
  if (s === TASK_STATUS.PENDING_APPROVAL || s === 'approved') return TASK_STATUS.PENDING_APPROVAL
  if (s === TASK_STATUS.IN_PROGRESS) return TASK_STATUS.IN_PROGRESS
  if (s === TASK_STATUS.COMPLETED) return TASK_STATUS.COMPLETED
  if (s === TASK_STATUS.REJECTED) return TASK_STATUS.REJECTED
  return null
}

/** True if task status is in progress (for active operations list). */
function isTaskInProgress(status) {
  if (status == null || status === '') return false
  const s = String(status).toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_').trim()
  return s === TASK_STATUS.IN_PROGRESS
}

/** Tasks that count for "active" charts (not rejected/cancelled). */
function isActiveForCharts(status) {
  const canonical = normalizeTaskStatus(status)
  return canonical !== TASK_STATUS.REJECTED && canonical != null
}

/** Safe parse date for weekly filter; returns 0 if invalid. */
function safeTaskCreatedAt(task) {
  if (!task || !task.createdAt) return 0
  const t = new Date(task.createdAt).getTime()
  return Number.isFinite(t) ? t : 0
}

/** Format duration from startTime to now (e.g. "45 min", "1h 20m"). */
function formatDuration(startTime) {
  if (!startTime) return null
  const start = new Date(startTime).getTime()
  if (!Number.isFinite(start)) return null
  const mins = Math.floor((Date.now() - start) / 60000)
  if (mins < 1) return '<1 min'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export default function EngineerHome() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const t = (key) => getTranslation(lang, 'engineer', key)
  const { tasks, sessions, zones: storeZones, workers, faults, maintenancePlans, inventory, equipment, records } = useAppStore()
  const zonesList = (storeZones && storeZones.length > 0) ? storeZones : getInitialZones()
  const ZONE_LABEL = useMemo(() => Object.fromEntries(zonesList.map((z) => [z.id, z.label])), [zonesList])
  const equipmentById = useMemo(() => Object.fromEntries((equipment || []).map((e) => [e.id, e])), [equipment])
  const isEngineer = typeof window !== 'undefined' && sessionStorage.getItem('sarms-user-role') === 'engineer'

  /* Critical Alerts – from current store state */
  const overdueCount = useMemo(() => {
    const now = Date.now()
    const activeSessionsByTaskId = (sessions || [])
      .filter((s) => !s.completedAt && s.taskId)
      .reduce((acc, s) => {
        const id = String(s.taskId)
        if (!acc[id]) acc[id] = s
        return acc
      }, {})
    return (tasks || []).filter((task) => {
      if (normalizeTaskStatus(task.status) === TASK_STATUS.COMPLETED) return false
      const mins = task.estimatedMinutes || 60
      const session = activeSessionsByTaskId[String(task.id)]
      const created = safeTaskCreatedAt(task)
      if (!session && !created) return false
      const dueTime = session
        ? new Date(session.startTime).getTime() + (session.expectedMinutes ?? mins) * 60 * 1000
        : created + mins * 60 * 1000
      if (!Number.isFinite(dueTime) || dueTime <= 0) return false
      return dueTime < now
    }).length
  }, [tasks, sessions])
  const criticalFaultsCount = useMemo(
    () => (faults || []).filter((f) => isCriticalSeverity(f.severity) && isFaultOpen(f)).length,
    [faults]
  )
  const lowStockCount = useMemo(() => {
    return (inventory || []).filter((item) => getInventoryStatus(item) !== 'normal').length
  }, [inventory])

  /** Overview data for System Health (same logic as General Reports) */
  const sessionsWithStatus = useMemo(
    () => (sessions || []).map((s) => ({ ...s, status: getSessionStatus(s, Date.now()) })),
    [sessions]
  )
  const inventoryWithStatus = useMemo(
    () => (inventory || []).map((i) => ({ ...i, status: getInventoryStatus(i) })),
    [inventory]
  )
  const homeAppliedFilters = useMemo(() => {
    const to = getTodayLocal()
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    return { dateFrom: from, dateTo: to }
  }, [])
  const overviewData = useMemo(
    () =>
      buildOverviewData({
        filteredTasks: tasks || [],
        filteredSessions: sessionsWithStatus,
        filteredFaults: faults || [],
        filteredRecords: records || [],
        inventoryWithStatus,
        equipment: equipment || [],
        filteredMaintenance: maintenancePlans || [],
        appliedFilters: homeAppliedFilters,
        zonesList,
        ZONE_LABEL,
        equipmentById,
      }),
    [
      tasks,
      sessionsWithStatus,
      faults,
      records,
      inventoryWithStatus,
      equipment,
      maintenancePlans,
      homeAppliedFilters,
      zonesList,
      ZONE_LABEL,
      equipmentById,
    ]
  )

  const pendingApprovalCount = useMemo(
    () => (tasks || []).filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.PENDING_APPROVAL).length,
    [tasks]
  )

  /* Weekly Progress: Monday to now (only active tasks in current week – exclude rejected) */
  const weeklyProgress = useMemo(() => {
    const weekStart = getWeekStart()
    const now = Date.now()
    const weekTasks = (tasks || []).filter((t) => {
      const created = safeTaskCreatedAt(t)
      return created >= weekStart && created <= now && isActiveForCharts(t.status)
    })
    const completed = weekTasks.filter((t) => normalizeTaskStatus(t.status) === TASK_STATUS.COMPLETED).length
    const total = weekTasks.length
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, pct }
  }, [tasks])

  /* Equipment tickets: faults + maintenance/inspection/corrective (from Equipment Tickets). Show open faults + tickets due or overdue. */
  const todayStr = useMemo(() => getTodayLocal(), [])
  const equipmentTicketsForHome = useMemo(() => {
    const list = []
    ;(faults || []).forEach((f) => {
      if (f.auto_generated && f.type === FAULT_TYPE_PREVENTIVE_ALERT) return
      const resolved = (f.status || FAULT_STATUS_OPEN) === FAULT_STATUS_RESOLVED
      if (resolved) return
      list.push({
        id: `f-${f.id}`,
        source: 'fault',
        ticketType: 'fault',
        equipmentName: f.equipmentName || f.description || f.id,
        zone: equipmentById[f.equipmentId]?.zone ?? '—',
        severity: f.severity,
        severityLabel: SEVERITY_OPTIONS.find((s) => s.id === f.severity)?.label ?? f.severity ?? '—',
        status: 'open',
        dueDate: null,
        createdAt: f.createdAt,
        isOverdue: false,
      })
    })
    ;(maintenancePlans || []).forEach((m) => {
      if (m.status === 'completed') return
      const due = m.plannedDate ? String(m.plannedDate).slice(0, 10) : null
      const isOverdue = due && due < todayStr
      const isDue = due && due <= todayStr
      if (!isDue && !isOverdue) return
      list.push({
        id: `m-${m.id}`,
        source: 'maintenance',
        ticketType: m.type || 'preventive',
        equipmentName: m.equipmentName || m.equipmentId || '—',
        zone: equipmentById[m.equipmentId]?.zone ?? '—',
        severity: null,
        severityLabel: '—',
        status: 'scheduled',
        dueDate: due,
        createdAt: m.createdAt,
        isOverdue: !!isOverdue,
      })
    })
    list.sort((a, b) => {
      const aFault = a.ticketType === 'fault'
      const bFault = b.ticketType === 'fault'
      if (aFault && !bFault) return -1
      if (!aFault && bFault) return 1
      if (aFault && bFault) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      if (a.isOverdue && !b.isOverdue) return -1
      if (!a.isOverdue && b.isOverdue) return 1
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    return list.slice(0, 15)
  }, [faults, maintenancePlans, equipmentById, todayStr])

  /* SARMS olive palette – ECharts uses hex only */
  const CHART_HEX = { success: '#5c7b5c', warning: '#c7924a', info: '#4f7c8a', muted: '#7a8580' }
  const STATUS_PIE_HEX = { chartPending: '#7a8580', chartInProgress: '#4f7c8a', chartCompleted: '#5c7b5c' }
  const STATUS_PIE_HOVER = { chartPending: '#5e6763', chartInProgress: '#3a606b', chartCompleted: '#385438' }
  const CHART_GRID = '#e4e9e4'
  const HOVER_HEX = { success: '#385438', warning: '#a6783c', info: '#3a606b', muted: '#5e6763' }

  /* Tasks by type – vertical bars (Farming, Maintenance, Inventory) – only active tasks, exclude rejected */
  const typeChartData = useMemo(() => {
    const byType = {}
    ;(tasks || []).filter((t) => isActiveForCharts(t.status)).forEach((task) => {
      const raw = task.departmentId || task.taskType || 'other'
      const dept = String(raw).toLowerCase().trim() || 'other'
      byType[dept] = (byType[dept] || 0) + 1
    })
    const colors = [CHART_HEX.success, CHART_HEX.warning, CHART_HEX.info]
    const hoverColors = [HOVER_HEX.success, HOVER_HEX.warning, HOVER_HEX.info]
    const series = DEPARTMENT_OPTIONS.map((d, i) => ({
      label: d.label,
      value: byType[d.value] || 0,
      color: colors[i % colors.length],
      hoverColor: hoverColors[i % hoverColors.length],
    }))
    const max = Math.max(...series.map((s) => s.value), 1)
    return series.map((s) => ({ ...s, max }))
  }, [tasks])

  /* Tasks by zone – Zone A/B/C/D + Inventory – only active tasks, exclude rejected */
  const ZONE_CHART_COLORS = ['#5c7b5c', '#7fa77f', '#a9bfa9', '#4f7c8a', '#7a8580']
  const zoneChartData = useMemo(() => {
    const byZone = {}
    ;(tasks || []).filter((t) => isActiveForCharts(t.status)).forEach((t) => {
      const raw = t.zoneId ?? ''
      const zoneKey = String(raw).toLowerCase().trim() || 'other'
      byZone[zoneKey] = (byZone[zoneKey] || 0) + 1
    })
    const series = zonesList.map((z, i) => {
      const id = z.id
      const value = byZone[id] || 0
      const label = ZONE_LABEL[id] ?? (id === 'inventory' ? 'Inventory' : `Zone ${id.toUpperCase()}`)
      return { label, value, color: ZONE_CHART_COLORS[i % ZONE_CHART_COLORS.length] }
    })
    const max = Math.max(...series.map((s) => s.value), 1)
    return series.map((s) => ({ ...s, max }))
  }, [tasks, zonesList, ZONE_LABEL])

  /* Task status doughnut – Pending, In Progress, Completed only (rejected/cancelled excluded, not shown) */
  const doughnutData = useMemo(() => {
    const s = { [TASK_STATUS.PENDING_APPROVAL]: 0, [TASK_STATUS.IN_PROGRESS]: 0, [TASK_STATUS.COMPLETED]: 0 }
    ;(tasks || []).forEach((task) => {
      const canonical = normalizeTaskStatus(task.status)
      if (canonical && canonical !== TASK_STATUS.REJECTED && s[canonical] !== undefined) s[canonical] = (s[canonical] || 0) + 1
    })
    return [
      { labelKey: 'chartPending', value: s[TASK_STATUS.PENDING_APPROVAL], color: 'var(--sarms-chart-muted)' },
      { labelKey: 'chartInProgress', value: s[TASK_STATUS.IN_PROGRESS], color: 'var(--sarms-chart-warning)' },
      { labelKey: 'chartCompleted', value: s[TASK_STATUS.COMPLETED], color: 'var(--sarms-chart-success)' },
    ].filter((d) => d.value > 0)
  }, [tasks])
  const doughnutTotal = useMemo(() => doughnutData.reduce((sum, d) => sum + d.value, 0) || 1, [doughnutData])

  /* ECharts options – optimized for card space, balanced and readable */
  const chartOptionTasksByType = useMemo(() => ({
    grid: { left: 16, right: 16, top: 28, bottom: 28, containLabel: true },
    xAxis: {
      type: 'category',
      data: typeChartData.map((d) => d.label),
      axisLabel: { fontSize: 13, fontWeight: 600, color: '#334155', interval: 0 },
    },
    yAxis: {
      type: 'value',
      splitLine: { show: true, lineStyle: { color: CHART_GRID } },
      axisLabel: { fontSize: 12, fontWeight: 500, color: '#475569' },
    },
    series: [{
      type: 'bar',
      data: typeChartData.map((d) => ({
        value: d.value,
        itemStyle: { color: d.color },
        emphasis: { itemStyle: { color: d.hoverColor } },
      })),
      barMaxWidth: 72,
    }],
    tooltip: { trigger: 'axis', confine: true },
  }), [typeChartData])

  const chartOptionWeeklyProgress = useMemo(() => ({
    series: [{
      type: 'gauge',
      radius: '98%',
      center: ['50%', '52%'],
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max: 100,
      progress: { show: true, width: 22, roundCap: true, itemStyle: { color: CHART_HEX.success } },
      axisLine: { lineStyle: { width: 22, color: [[1, CHART_GRID]] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      pointer: { show: false },
      detail: {
        valueAnimation: true,
        offsetCenter: [0, '-5%'],
        fontSize: 34,
        fontWeight: 'bold',
        formatter: '{value}%',
        color: CHART_HEX.success,
      },
      title: {
        offsetCenter: [0, '16%'],
        fontSize: 15,
        fontWeight: 600,
        color: '#334155',
        formatter: '{name}',
      },
      data: [{ value: weeklyProgress.pct, name: `${weeklyProgress.completed} / ${weeklyProgress.total}` }],
    }],
  }), [weeklyProgress])

  const chartOptionTaskStatus = useMemo(() => {
    const data = doughnutData.map((d) => ({
      value: d.value,
      name: t(d.labelKey),
      itemStyle: { color: STATUS_PIE_HEX[d.labelKey] ?? CHART_HEX.muted },
      emphasis: { itemStyle: { color: STATUS_PIE_HOVER[d.labelKey] ?? HOVER_HEX.muted } },
    }))
    const legendData = data.map((d) => d.name)
    return {
      tooltip: { trigger: 'item', confine: true },
      legend: {
        show: true,
        orient: 'horizontal',
        bottom: 4,
        left: 'center',
        itemGap: 12,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { fontSize: 12, fontWeight: 600, color: '#1e293b' },
        data: legendData,
      },
      series: [{
        type: 'pie',
        radius: ['52%', '82%'],
        center: ['50%', '48%'],
        data,
        label: { show: false },
        labelLine: { show: false },
        emphasis: { itemStyle: { shadowBlur: 8, shadowOffsetX: 0 } },
      }],
    }
  }, [doughnutData, t])

  /* Tasks by zone – Radar chart: same data, different visual */
  const chartOptionTasksByZone = useMemo(() => {
    const indicators = zoneChartData.map((d) => ({ name: d.label, max: Math.max(...zoneChartData.map((x) => x.value), 1) }))
    const values = zoneChartData.map((d) => d.value)
    return {
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (params) => {
          const vals = params.data?.value ?? values
          return indicators.map((ind, i) => `${ind.name} – ${vals[i] ?? 0} Tasks`).join('<br/>')
        },
      },
      radar: {
        indicator: indicators,
        center: ['50%', '52%'],
        radius: '58%',
        axisName: { fontSize: 11, fontWeight: 600, color: '#334155' },
        splitArea: { areaStyle: { color: ['rgba(92, 123, 92, 0.08)', 'rgba(92, 123, 92, 0.04)'] } },
        splitLine: { lineStyle: { color: CHART_GRID } },
        axisLine: { lineStyle: { color: CHART_GRID } },
      },
      series: [{
        type: 'radar',
        data: [{
          value: values,
          name: '',
          areaStyle: { color: 'rgba(92, 123, 92, 0.4)' },
          lineStyle: { color: CHART_HEX.success, width: 2 },
          itemStyle: { color: CHART_HEX.success },
          emphasis: {
            areaStyle: { color: 'rgba(56, 84, 56, 0.5)' },
            lineStyle: { color: HOVER_HEX.success, width: 2 },
            itemStyle: { color: HOVER_HEX.success },
          },
        }],
      }],
    }
  }, [zoneChartData])

  /* Active Operations: same logic as Monitor Active Work – real sessions without completedAt + IN_PROGRESS tasks without a session */
  const realActiveSessions = useMemo(() => (sessions || []).filter((s) => !s.completedAt), [sessions])
  const taskIdsWithActiveSession = useMemo(
    () => new Set(realActiveSessions.map((s) => String(s.taskId)).filter(Boolean)),
    [realActiveSessions]
  )
  const enrichedRealSessions = useMemo(() => {
    return (realActiveSessions || []).map((session) => {
      const task = (tasks || []).find((t) => String(t.id) === String(session.taskId))
      const dept = getDepartment(task?.departmentId)
      const taskLabel = task ? getTaskById(task.taskId) : null
      const zoneIdNorm = task?.zoneId != null ? String(task.zoneId).toLowerCase() : ''
      const zoneLabel = ZONE_LABEL[zoneIdNorm] ?? (zoneIdNorm === 'inventory' ? 'Inventory' : zoneIdNorm ? `Zone ${zoneIdNorm.toUpperCase()}` : '—')
      const worker = (workers || []).find((w) => String(w.id) === String(session.workerId))
      return {
        id: session.id,
        workerId: session.workerId,
        workerName: worker?.fullName ?? '—',
        departmentId: dept?.id ?? (task?.departmentId || '').toLowerCase(),
        taskId: taskLabel?.id ?? task?.taskId ?? '',
        zoneId: zoneIdNorm || (task?.zoneId ?? ''),
        department: dept?.labelEn ?? task?.departmentId ?? '—',
        task: taskLabel?.labelEn ?? task?.taskId ?? '—',
        zone: zoneLabel,
        linesArea: task?.linesArea ?? '—',
        startTime: session.startTime,
      }
    })
  }, [realActiveSessions, tasks, workers, ZONE_LABEL])
  const virtualSessionsFromTasks = useMemo(() => {
    const list = []
    ;(tasks || []).forEach((task) => {
      if (!isTaskInProgress(task.status)) return
      if (task.id != null && taskIdsWithActiveSession.has(String(task.id))) return
      const dept = getDepartment(task.departmentId)
      const deptId = task.departmentId || task.taskType
      const taskLabel = getTasksForDepartment(deptId)?.find((t) => t.id === task.taskId)
      const zoneIdNorm = task.zoneId != null ? String(task.zoneId).toLowerCase() : ''
      const zoneLabel = ZONE_LABEL[zoneIdNorm] ?? (zoneIdNorm === 'inventory' ? 'Inventory' : zoneIdNorm ? `Zone ${zoneIdNorm.toUpperCase()}` : '—')
      const workerIds = Array.isArray(task.workerIds) ? task.workerIds : []
      const departmentIdNorm = (task.departmentId || task.taskType || '').toLowerCase()
      const baseSession = {
        taskId: taskLabel?.id ?? task.taskId ?? '',
        departmentId: departmentIdNorm || task.departmentId,
        department: dept?.labelEn ?? task.departmentId ?? '—',
        task: taskLabel?.labelEn ?? task.taskId ?? '—',
        zoneId: zoneIdNorm || task.zoneId,
        zone: zoneLabel,
        linesArea: task.linesArea || '—',
        assignedByEngineer: true,
      }
      if (workerIds.length === 0) {
        list.push({ id: `task-${task.id}`, workerId: '', workerName: '—', ...baseSession })
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
  }, [tasks, taskIdsWithActiveSession, workers, ZONE_LABEL])
  const activeOperationsList = useMemo(
    () => [...enrichedRealSessions, ...virtualSessionsFromTasks],
    [enrichedRealSessions, virtualSessionsFromTasks]
  )

  const [activeOpsExpanded, setActiveOpsExpanded] = useState(false)
  const [recentFaultsExpanded, setRecentFaultsExpanded] = useState(false)
  const [chartsMounted, setChartsMounted] = useState(false)
  useEffect(() => setChartsMounted(true), [])

  const kpiCards = [
    { count: overdueCount, labelKey: 'homeOverdueTasks', path: '/engineer/monitor', icon: 'fa-clock', variant: 'warning' },
    { count: criticalFaultsCount, labelKey: 'homeCriticalFaults', path: '/engineer/faults', icon: 'fa-triangle-exclamation', variant: 'danger' },
    { count: lowStockCount, labelKey: 'homeLowStock', path: '/engineer/inventory', icon: 'fa-cubes', variant: 'info' },
  ]

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('pageTitleHome')}</h1>
        <SystemHealthScore overviewData={overviewData} />
      </header>

      {/* KPI row – aligned with Reports/Inventory card style */}
      <div className={styles.kpiRow}>
        {kpiCards.map((card) => (
          <button
            key={card.labelKey}
            type="button"
            className={`${styles.kpiCard} ${styles[`kpiCard_${card.variant}`]}`}
            onClick={() => navigate(card.path, { state: card.state })}
          >
            <span className={styles.kpiIcon}><i className={`fas ${card.icon} fa-fw`} /></span>
            <span className={styles.kpiCount}>{card.count}</span>
            <span className={styles.kpiLabel}>{t(card.labelKey)}</span>
          </button>
        ))}
      </div>

      {isEngineer && pendingApprovalCount > 0 && (
        <div className={styles.reviewBanner}>
          <span>{pendingApprovalCount} {t('homeTasksPendingReview')}</span>
          <button type="button" className={styles.reviewNowBtn} onClick={() => navigate('/engineer/assign-task', { state: { filterStatus: TASK_STATUS.PENDING_APPROVAL } })}>
            {t('homeReviewNow')}
          </button>
        </div>
      )}

      {/* Quick access – card grid (not circles) */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('homeSectionsTitle')}</h2>
        <div className={styles.actionGrid}>
          {SECTION_ACTIONS.map((item) => (
            <button
              key={item.path}
              type="button"
              className={styles.actionCard}
              onClick={() => navigate(item.path)}
            >
              <i className={`fas fa-${item.faIcon || item.icon} fa-fw ${styles.actionCardIcon}`} />
              <span className={styles.actionCardLabel}>{t(item.labelKey)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Analytics – Apache ECharts: card = chart container (centered) + title at bottom only */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('homeAnalyticsCharts')}</h2>
        <div className={styles.chartsRow}>
          <div className={styles.chartCard}>
            <div className={styles.chartCardBody}>
              <div className={styles.chartEchartsWrap}>
                {chartsMounted && (
                  <ReactECharts option={chartOptionTasksByType} style={{ width: '100%', height: '100%', minHeight: 220 }} opts={{ renderer: 'canvas' }} notMerge />
                )}
              </div>
            </div>
            <div className={styles.chartCardTitle}>{t('homeTasksByType')}</div>
          </div>
          <div className={styles.chartCard}>
            <div className={styles.chartCardBody}>
              <div className={styles.chartCardBodyCol}>
                <div className={styles.chartEchartsWrap}>
                  {chartsMounted && (
                    <ReactECharts option={chartOptionWeeklyProgress} style={{ width: '100%', height: '100%', minHeight: 220 }} opts={{ renderer: 'canvas' }} notMerge />
                  )}
                </div>
                <p className={styles.chartCardCaption}>{t('homeWeeklyProgressCaption')}</p>
              </div>
            </div>
            <div className={styles.chartCardTitle}>{t('homeWeeklyProgress')}</div>
          </div>
          <div className={styles.chartCard}>
            <div className={styles.chartCardBody}>
              <div className={styles.chartEchartsWrap}>
                {chartsMounted && (
                  <ReactECharts option={chartOptionTaskStatus} style={{ width: '100%', height: '100%', minHeight: 220 }} opts={{ renderer: 'canvas' }} notMerge />
                )}
              </div>
            </div>
            <div className={styles.chartCardTitle}>{t('homeTaskStatus')}</div>
          </div>
          <div className={styles.chartCard}>
            <div className={styles.chartCardBody}>
              <div className={styles.chartEchartsWrap}>
                {chartsMounted && (
                  <ReactECharts option={chartOptionTasksByZone} style={{ width: '100%', height: '100%', minHeight: 220 }} opts={{ renderer: 'canvas' }} notMerge />
                )}
              </div>
            </div>
            <div className={styles.chartCardTitle}>{t('homeTasksByZone')}</div>
          </div>
        </div>
      </section>

      {/* Active Operations – reflects current system: active sessions (no completedAt) + IN_PROGRESS tasks without session */}
      <section className={styles.section}>
        <button
          type="button"
          className={`${styles.collapseHeader} ${lang === 'ar' ? styles.collapseHeaderRtl : ''}`}
          onClick={() => setActiveOpsExpanded((e) => !e)}
          aria-expanded={activeOpsExpanded}
        >
          <i className={`fas fa-fw ${activeOpsExpanded ? 'fa-chevron-down' : lang === 'ar' ? 'fa-chevron-left' : 'fa-chevron-right'}`} />
          <h2 className={styles.sectionTitleCollapse}>{t('homeActiveOperations')}</h2>
          {activeOperationsList.length > 0 && <span className={styles.collapseBadge}>{activeOperationsList.length}</span>}
        </button>
        {activeOpsExpanded && (
          <div className={styles.collapseContent}>
            <div className={styles.opsCard}>
              {activeOperationsList.length === 0 ? (
                <p className={styles.opsEmpty}>{t('homeNoActiveSessions')}</p>
              ) : (
                <ul className={styles.opsList}>
                  {activeOperationsList.map((op) => {
                    const dept = getDepartment(op.departmentId)
                    const taskDef = getTaskById(op.taskId)
                    const zoneObj = zonesList.find((z) => z.id === op.zoneId)
                    const deptLabel = lang === 'ar' ? (dept?.labelAr ?? op.department) : op.department
                    const taskLabel = lang === 'ar' ? (taskDef?.labelAr ?? op.task) : op.task
                    const zoneDisplay = lang === 'ar' ? (zoneObj?.labelAr ?? op.zone) : ((op.zone === 'Inventory' || (op.zone && String(op.zone).startsWith('Zone '))) ? (op.zone || '—') : (op.zone ? `Zone ${op.zone}` : '—'))
                    return (
                      <li key={op.id} className={styles.opsItem}>
                        <button
                          type="button"
                          className={styles.opsItemBtn}
                          onClick={() => navigate('/engineer/monitor')}
                        >
                          <span className={styles.opsWorker}>{op.workerName ?? '—'}</span>
                          <span className={styles.opsDetail}>
                            {[deptLabel, taskLabel].filter(Boolean).join(' · ') || '—'} · {zoneDisplay} · {op.linesArea || '—'}
                          </span>
                          {op.startTime && formatDuration(op.startTime) && (
                            <span className={styles.opsDuration} title={t('homeDuration')}>
                              {formatDuration(op.startTime)}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Recent Fault Logs */}
      <section className={styles.section}>
        <button
          type="button"
          className={`${styles.collapseHeader} ${lang === 'ar' ? styles.collapseHeaderRtl : ''}`}
          onClick={() => setRecentFaultsExpanded((e) => !e)}
          aria-expanded={recentFaultsExpanded}
        >
          <i className={`fas fa-fw ${recentFaultsExpanded ? 'fa-chevron-down' : lang === 'ar' ? 'fa-chevron-left' : 'fa-chevron-right'}`} />
          <h2 className={styles.sectionTitleCollapse}><i className="fas fa-wrench fa-fw" /> {t('homeRecentFaultLogs')}</h2>
          {equipmentTicketsForHome.length > 0 && <span className={styles.collapseBadge}>{equipmentTicketsForHome.length}</span>}
        </button>
        {recentFaultsExpanded && (
          <div className={styles.collapseContent}>
            <div className={styles.faultTableWrap}>
              <table className={styles.faultTable}>
                <thead>
                  <tr>
                    <th>{t('homeFaultTitle')}</th>
                    <th>{t('homeFaultZone')}</th>
                    <th>{t('homeTicketType')}</th>
                    <th>{t('homeFaultSeverity')}</th>
                    <th>{t('homeTicketDue')}</th>
                    <th>{t('homeFaultStatus')}</th>
                    <th>{t('homeFaultCreated')}</th>
                  </tr>
                </thead>
                <tbody>
                  {equipmentTicketsForHome.length === 0 ? (
                    <tr><td colSpan={7} className={styles.faultEmpty}>{t('homeNoFaults')}</td></tr>
                  ) : (
                    equipmentTicketsForHome.map((row) => (
                      <tr
                        key={row.id}
                        className={`${styles.faultRow} ${row.ticketType === 'fault' ? styles.faultRowFault : row.isOverdue ? styles.faultRowOverdue : ''}`}
                        onClick={() => navigate('/engineer/faults')}
                      >
                        <td>{row.equipmentName}</td>
                        <td>{row.zone}</td>
                        <td>{t(row.ticketType === 'fault' ? 'homeTicketTypeFault' : row.ticketType === 'preventive' ? 'homeTicketTypePreventive' : row.ticketType === 'inspection' ? 'homeTicketTypeInspection' : 'homeTicketTypeCorrective')}</td>
                        <td>{row.severity ? t('homeSeverity' + (row.severity.charAt(0).toUpperCase() + row.severity.slice(1))) : (row.severityLabel || '—')}</td>
                        <td>{row.dueDate ? new Date(row.dueDate + 'T12:00:00').toLocaleDateString() : '—'}</td>
                        <td>{row.ticketType === 'fault' ? t('homeFaultStatusOpen') : t('homeFaultStatusScheduled')}</td>
                        <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

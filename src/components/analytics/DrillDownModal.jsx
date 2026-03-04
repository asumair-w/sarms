import { useMemo } from 'react'
import { TASK_STATUS_LABELS } from '../../data/assignTask'
import { SESSION_STATUS_LABELS, SESSION_STATUS } from '../../data/monitorActive'
import { INVENTORY_STATUS } from '../../data/inventory'
import { FAULT_STATUS_OPEN } from '../../data/faults'
import styles from './DrillDownModal.module.css'

function Table({ title, columns, rows, emptyMessage = 'No records' }) {
  return (
    <div className={styles.tableBlock}>
      {title && <h4 className={styles.tableTitle}>{title}</h4>}
      {rows.length === 0 ? (
        <p className={styles.empty}>{emptyMessage}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={styles.th}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className={styles.td}>{row[c.key] ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/**
 * Drill-down modal: title and table(s) from payload and filtered data.
 * Payload: { chart, label?, datasetLabel?, zoneId?, zoneLabel?, date?, axisIndex?, index? }
 */
export default function DrillDownModal({
  open,
  onClose,
  payload,
  filteredTasks = [],
  filteredSessions = [],
  filteredFaults = [],
  filteredRecords = [],
  inventoryWithStatus = [],
  filteredMaintenance = [],
  ZONE_LABEL = {},
}) {
  const { title, blocks } = useMemo(() => {
    if (!payload?.chart) return { title: 'Details', blocks: [] }

    const { chart, label, datasetLabel, zoneId, zoneLabel, date, axisIndex, index } = payload

    if (chart === 'operationalStatus') {
      const statusLabel = label || ''
      if (datasetLabel === 'Sessions' && statusLabel === 'Delayed') {
        const rows = filteredSessions.filter((s) => s.status === SESSION_STATUS.DELAYED).map((s) => ({
          id: s.id,
          worker: s.workerName || s.workerId,
          zone: ZONE_LABEL[s.zoneId] || s.zone || s.zoneId,
          task: s.task || s.taskTypeId,
          start: (s.startTime || '').toString().slice(0, 16),
          status: s.status,
        }))
        return {
          title: `Delayed — Sessions (${rows.length})`,
          blocks: [
            <Table
              key="sessions"
              title="Sessions"
              columns={[
                { key: 'id', label: 'ID' },
                { key: 'worker', label: 'Worker' },
                { key: 'zone', label: 'Zone' },
                { key: 'task', label: 'Task' },
                { key: 'start', label: 'Start' },
              ]}
              rows={rows}
            />,
          ],
        }
      }
      if (datasetLabel === 'Sessions' && statusLabel === 'In Progress') {
        const rows = filteredSessions.filter((s) => !s.completedAt).map((s) => ({
          id: s.id,
          worker: s.workerName || s.workerId,
          zone: ZONE_LABEL[s.zoneId] || s.zone || s.zoneId,
          task: s.task || s.taskTypeId,
          start: (s.startTime || '').toString().slice(0, 16),
        }))
        return {
          title: `In Progress — Sessions (${rows.length})`,
          blocks: [
            <Table
              key="sessions"
              title="Active sessions"
              columns={[
                { key: 'id', label: 'ID' },
                { key: 'worker', label: 'Worker' },
                { key: 'zone', label: 'Zone' },
                { key: 'task', label: 'Task' },
                { key: 'start', label: 'Start' },
              ]}
              rows={rows}
            />,
          ],
        }
      }
      if (datasetLabel === 'Tasks') {
        const statusMap = { Pending: 'pending_approval', 'In Progress': 'in_progress', Completed: 'completed' }
        const status = statusMap[statusLabel]
        const rows = filteredTasks.filter((t) => (t.status || '') === status).map((t) => ({
          id: t.id,
          label: t.labelEn || t.label || t.taskTypeId,
          zone: ZONE_LABEL[t.zoneId] || t.zoneId,
          status: TASK_STATUS_LABELS[t.status] || t.status,
        }))
        return {
          title: `${statusLabel} — Tasks (${rows.length})`,
          blocks: [
            <Table
              key="tasks"
              title="Tasks"
              columns={[
                { key: 'id', label: 'ID' },
                { key: 'label', label: 'Task' },
                { key: 'zone', label: 'Zone' },
                { key: 'status', label: 'Status' },
              ]}
              rows={rows}
            />,
          ],
        }
      }
      if (datasetLabel === 'Faults') {
        const rows = filteredFaults.filter((f) => (f.status || FAULT_STATUS_OPEN) === FAULT_STATUS_OPEN).map((f) => ({
          id: f.id,
          equipment: f.equipmentId || f.equipment,
          severity: f.severity,
          description: (f.description || '').slice(0, 40),
        }))
        return {
          title: `Open faults (${rows.length})`,
          blocks: [
            <Table
              key="faults"
              title="Faults"
              columns={[
                { key: 'id', label: 'ID' },
                { key: 'equipment', label: 'Equipment' },
                { key: 'severity', label: 'Severity' },
                { key: 'description', label: 'Description' },
              ]}
              rows={rows}
            />,
          ],
        }
      }
    }

    if (chart === 'zoneDistribution' && (zoneId != null || zoneLabel)) {
      const zId = zoneId || payload.zoneId
      const zLabel = zoneLabel || payload.zoneLabel || ZONE_LABEL[zId] || zId
      const tasksInZone = filteredTasks.filter((t) => (t.zoneId || '') === zId)
      const sessionsInZone = filteredSessions.filter((s) => (s.zoneId || s.zone || '') === zId)
      const faultsInZone = filteredFaults.filter((f) => (f.zoneId || f.zone || '') === zId)
      return {
        title: `Zone: ${zLabel}`,
        blocks: [
          <Table
            key="tasks"
            title={`Tasks (${tasksInZone.length})`}
            columns={[
              { key: 'id', label: 'ID' },
              { key: 'label', label: 'Task' },
              { key: 'status', label: 'Status' },
            ]}
            rows={tasksInZone.map((t) => ({
              id: t.id,
              label: t.labelEn || t.label || t.taskTypeId,
              status: TASK_STATUS_LABELS[t.status] || t.status,
            }))}
          />,
          <Table
            key="sessions"
            title={`Sessions (${sessionsInZone.length})`}
            columns={[
              { key: 'id', label: 'ID' },
              { key: 'worker', label: 'Worker' },
              { key: 'task', label: 'Task' },
              { key: 'status', label: 'Status' },
            ]}
            rows={sessionsInZone.map((s) => ({
              id: s.id,
              worker: s.workerName || s.workerId,
              task: s.task || s.taskTypeId,
              status: SESSION_STATUS_LABELS[s.status] || s.status,
            }))}
          />,
          <Table
            key="faults"
            title={`Faults (${faultsInZone.length})`}
            columns={[
              { key: 'id', label: 'ID' },
              { key: 'equipment', label: 'Equipment' },
              { key: 'severity', label: 'Severity' },
            ]}
            rows={faultsInZone.map((f) => ({
              id: f.id,
              equipment: f.equipmentId || f.equipment,
              severity: f.severity,
            }))}
          />,
        ],
      }
    }

    if (chart === 'productionTrend' && date) {
      const rows = filteredRecords
        .filter((r) => r.recordType === 'production')
        .filter((r) => (r.dateTime || r.createdAt || '').toString().slice(0, 10) === date)
        .map((r) => ({
          date: (r.dateTime || r.createdAt || '').toString().slice(0, 16),
          worker: r.worker,
          zone: r.zone || r.zoneId,
          quantity: r.quantity,
          recordType: r.recordType,
        }))
      return {
        title: `Production — ${date}`,
        blocks: [
          <Table
            key="production"
            title={`Production records (${rows.length})`}
            columns={[
              { key: 'date', label: 'Date' },
              { key: 'worker', label: 'Worker' },
              { key: 'zone', label: 'Zone' },
              { key: 'quantity', label: 'Quantity' },
            ]}
            rows={rows}
          />,
        ],
      }
    }

    if (chart === 'riskRadar' && axisIndex !== undefined) {
      const axisLabels = ['Delayed sessions', 'Critical faults', 'Critical inventory', 'Workers at risk', 'Overdue maintenance']
      const subTitle = axisLabels[axisIndex] || `Axis ${axisIndex}`
      if (axisIndex === 0) {
        const rows = filteredSessions.filter((s) => s.status === SESSION_STATUS.DELAYED).map((s) => ({
          id: s.id,
          worker: s.workerName || s.workerId,
          zone: ZONE_LABEL[s.zoneId] || s.zoneId,
          task: s.task || s.taskTypeId,
        }))
        return { title: subTitle, blocks: [<Table key="list" title="Sessions" columns={[{ key: 'id', label: 'ID' }, { key: 'worker', label: 'Worker' }, { key: 'zone', label: 'Zone' }, { key: 'task', label: 'Task' }]} rows={rows} />] }
      }
      if (axisIndex === 1) {
        const rows = filteredFaults.filter((f) => f.severity === 'critical').map((f) => ({
          id: f.id,
          equipment: f.equipmentId || f.equipment,
          severity: f.severity,
        }))
        return { title: subTitle, blocks: [<Table key="list" title="Faults" columns={[{ key: 'id', label: 'ID' }, { key: 'equipment', label: 'Equipment' }, { key: 'severity', label: 'Severity' }]} rows={rows} />] }
      }
      if (axisIndex === 2) {
        const rows = inventoryWithStatus.filter((i) => i.status === INVENTORY_STATUS.CRITICAL).map((i) => ({
          id: i.id || i.name,
          name: i.name || i.id,
          category: i.category,
          status: i.status,
        }))
        return { title: subTitle, blocks: [<Table key="list" title="Items" columns={[{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'category', label: 'Category' }]} rows={rows} />] }
      }
      if (axisIndex === 4) {
        const today = new Date().toISOString().slice(0, 10)
        const rows = filteredMaintenance.filter((p) => (p.plannedDate || '').slice(0, 10) < today).map((p) => ({
          id: p.id,
          equipment: p.equipmentId || p.equipment,
          plannedDate: (p.plannedDate || '').slice(0, 10),
        }))
        return { title: subTitle, blocks: [<Table key="list" title="Overdue maintenance" columns={[{ key: 'id', label: 'ID' }, { key: 'equipment', label: 'Equipment' }, { key: 'plannedDate', label: 'Planned date' }]} rows={rows} />] }
      }
      return { title: subTitle, blocks: [<p key="na" className={styles.empty}>No detail list for this axis.</p>] }
    }

    if (chart === 'inventoryHealth' && label) {
      const statusMap = { Normal: INVENTORY_STATUS.NORMAL, Low: INVENTORY_STATUS.LOW, Critical: INVENTORY_STATUS.CRITICAL }
      const status = statusMap[label]
      const rows = (inventoryWithStatus || []).filter((i) => i.status === status).map((i) => ({
        id: i.id || i.name,
        name: i.name || i.id,
        category: i.category,
        quantity: i.quantity ?? i.currentStock,
      }))
      return {
        title: `Inventory — ${label} (${rows.length})`,
        blocks: [
          <Table
            key="inv"
            title={`${label} items`}
            columns={[
              { key: 'id', label: 'ID' },
              { key: 'name', label: 'Name' },
              { key: 'category', label: 'Category' },
              { key: 'quantity', label: 'Quantity' },
            ]}
            rows={rows}
          />,
        ],
      }
    }

    if (chart === 'equipmentLoad' && index !== undefined) {
      const labels = ['Open faults', 'Scheduled maintenance', 'Overdue maintenance', 'Active equipment %']
      const subTitle = labels[index] || `Segment ${index}`
      if (index === 0) {
        const rows = filteredFaults.filter((f) => (f.status || FAULT_STATUS_OPEN) === FAULT_STATUS_OPEN).map((f) => ({
          id: f.id,
          equipment: f.equipmentId || f.equipment,
          severity: f.severity,
        }))
        return { title: subTitle, blocks: [<Table key="list" title="Faults" columns={[{ key: 'id', label: 'ID' }, { key: 'equipment', label: 'Equipment' }, { key: 'severity', label: 'Severity' }]} rows={rows} />] }
      }
      if (index === 1) {
        const today = new Date().toISOString().slice(0, 10)
        const rows = filteredMaintenance.filter((p) => (p.plannedDate || '').slice(0, 10) >= today).map((p) => ({
          id: p.id,
          equipment: p.equipmentId || p.equipment,
          plannedDate: (p.plannedDate || '').slice(0, 10),
        }))
        return { title: subTitle, blocks: [<Table key="list" title="Scheduled" columns={[{ key: 'id', label: 'ID' }, { key: 'equipment', label: 'Equipment' }, { key: 'plannedDate', label: 'Planned date' }]} rows={rows} />] }
      }
      if (index === 2) {
        const today = new Date().toISOString().slice(0, 10)
        const rows = filteredMaintenance.filter((p) => (p.plannedDate || '').slice(0, 10) < today).map((p) => ({
          id: p.id,
          equipment: p.equipmentId || p.equipment,
          plannedDate: (p.plannedDate || '').slice(0, 10),
        }))
        return { title: subTitle, blocks: [<Table key="list" title="Overdue" columns={[{ key: 'id', label: 'ID' }, { key: 'equipment', label: 'Equipment' }, { key: 'plannedDate', label: 'Planned date' }]} rows={rows} />] }
      }
      return { title: subTitle, blocks: [<p key="na" className={styles.empty}>Active equipment % — see Equipment list for details.</p>] }
    }

    return { title: 'Details', blocks: [] }
  }, [payload, filteredTasks, filteredSessions, filteredFaults, filteredRecords, inventoryWithStatus, filteredMaintenance, ZONE_LABEL])

  if (!open) return null

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="drilldown-title">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 id="drilldown-title" className={styles.title}>{title}</h2>
        <div className={styles.body}>{blocks}</div>
        <div className={styles.actions}>
          <button type="button" className={styles.closeBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

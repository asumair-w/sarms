/**
 * Monitor Active Work – active sessions mock data and status logic.
 */

export const SESSION_STATUS = {
  ON_TIME: 'on_time',
  DELAYED: 'delayed',
  FLAGGED: 'flagged',
}

export const SESSION_STATUS_LABELS = {
  [SESSION_STATUS.ON_TIME]: 'On time',
  [SESSION_STATUS.DELAYED]: 'Delayed',
  [SESSION_STATUS.FLAGGED]: 'Flagged',
}

/** Mock active work sessions (worker + task + zone + start time + expected minutes). */
export function getInitialSessions() {
  const now = Date.now()
  return [
    {
      id: 's1',
      workerId: '1',
      workerName: 'Worker One',
      department: 'Farming',
      departmentId: 'farming',
      taskTypeId: 'farming',
      task: 'Harvesting',
      zone: 'Zone A',
      zoneId: 'a',
      linesArea: '1–20',
      startTime: new Date(now - 45 * 60 * 1000).toISOString(),
      expectedMinutes: 120,
      flagged: false,
      notes: [],
      assignedByEngineer: true,
    },
    {
      id: 's2',
      workerId: '1',
      workerName: 'Worker One',
      department: 'Maintenance',
      departmentId: 'maintenance',
      taskTypeId: 'maintenance',
      task: 'Inspection',
      zone: 'Zone B',
      zoneId: 'b',
      linesArea: '5–15',
      startTime: new Date(now - 90 * 60 * 1000).toISOString(),
      expectedMinutes: 60,
      flagged: true,
      notes: [{ at: new Date().toISOString(), text: 'Waiting for equipment' }],
      assignedByEngineer: true,
    },
    {
      id: 's3',
      workerId: '4',
      workerName: 'Ahmed Hassan',
      department: 'Farming',
      departmentId: 'farming',
      taskTypeId: 'farming',
      task: 'Harvesting',
      zone: 'Zone A',
      zoneId: 'a',
      linesArea: '10–25',
      startTime: new Date(now - 30 * 60 * 1000).toISOString(),
      expectedMinutes: 90,
      flagged: false,
      notes: [],
      assignedByEngineer: true,
    },
    {
      id: 's4',
      workerId: '5',
      workerName: 'Fatima Ali',
      department: 'Inventory',
      departmentId: 'inventory',
      taskTypeId: 'inventory',
      task: 'Receive & Move to Storage',
      zone: 'Inventory',
      zoneId: 'inventory',
      linesArea: '—',
      startTime: new Date(now - 20 * 60 * 1000).toISOString(),
      expectedMinutes: 45,
      flagged: false,
      notes: [],
      assignedByEngineer: true,
    },
    {
      id: 's5',
      workerId: '6',
      workerName: 'Omar Khalid',
      department: 'Maintenance',
      departmentId: 'maintenance',
      taskTypeId: 'maintenance',
      task: 'Repair',
      zone: 'Zone C',
      zoneId: 'c',
      linesArea: '—',
      startTime: new Date(now - 60 * 60 * 1000).toISOString(),
      expectedMinutes: 90,
      flagged: false,
      notes: [],
      assignedByEngineer: true,
    },
    {
      id: 's6',
      workerId: '7',
      workerName: 'Sara Mohammed',
      department: 'Maintenance',
      departmentId: 'maintenance',
      taskTypeId: 'maintenance',
      task: 'Repair',
      zone: 'Zone B',
      zoneId: 'b',
      linesArea: '—',
      startTime: new Date(now - 75 * 60 * 1000).toISOString(),
      expectedMinutes: 90,
      flagged: true,
      notes: [{ at: new Date().toISOString(), text: 'Waiting for spare parts' }],
      assignedByEngineer: true,
    },
    {
      id: 's7',
      workerId: '10',
      workerName: 'Khalid Mansour',
      department: 'Inventory',
      departmentId: 'inventory',
      taskTypeId: 'inventory',
      task: 'Receive & Move to Storage',
      zone: 'Inventory',
      zoneId: 'inventory',
      linesArea: '—',
      startTime: new Date(now - 15 * 60 * 1000).toISOString(),
      expectedMinutes: 45,
      flagged: false,
      notes: [],
      assignedByEngineer: true,
    },
    {
      id: 's8',
      workerId: '11',
      workerName: 'Youssef Ahmed',
      department: 'Maintenance',
      departmentId: 'maintenance',
      taskTypeId: 'maintenance',
      task: 'Testing',
      zone: 'Zone C',
      zoneId: 'c',
      linesArea: '—',
      startTime: new Date(now - 120 * 60 * 1000).toISOString(),
      expectedMinutes: 60,
      flagged: false,
      notes: [],
      assignedByEngineer: true,
    },
  ]
}

/** Compute status: delayed if elapsed > expected, else on_time; flagged overrides display. */
export function getSessionStatus(session, now = Date.now()) {
  if (session.flagged) return SESSION_STATUS.FLAGGED
  const start = new Date(session.startTime).getTime()
  const elapsedMinutes = (now - start) / (60 * 1000)
  const expected = session.expectedMinutes || 60
  return elapsedMinutes > expected ? SESSION_STATUS.DELAYED : SESSION_STATUS.ON_TIME
}

/** Elapsed duration in minutes. */
export function getElapsedMinutes(session, now = Date.now()) {
  const start = new Date(session.startTime).getTime()
  return Math.floor((now - start) / (60 * 1000))
}

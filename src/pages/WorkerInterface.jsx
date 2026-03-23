import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { getTranslation } from '../i18n/translations'
import {
  DEPARTMENTS,
  INVENTORY_DEPARTMENT,
  ZONES as DEFAULT_ZONES,
  getDepartment,
  getZone,
  getTasksForDepartment,
} from '../data/workerFlow'
import { SEED_WORKERS } from '../data/engineerWorkers'
import { clearSessionAuth } from '../auth'
import { useAppStore } from '../context/AppStoreContext'
import { useSessionKickCheck } from '../hooks/useSessionKickCheck'
import { TASK_STATUS, generateTaskId } from '../data/assignTask'
import { nextRecordId } from '../utils/idGenerators'
import WorkerSettingsModal from '../components/WorkerSettingsModal'

/** Map HeroIcons-style names to Font Awesome class suffix (e.g. 'sun' → fa-sun). */
const ICON_FA = {
  sun: 'sun', 'wrench-simple': 'wrench', 'check-circle': 'circle-check', cube: 'cubes',
  'list-bullet': 'list', 'squares-2x2': 'th-large', 'arrow-left': 'arrow-left', 'arrow-right': 'arrow-right',
  minus: 'minus', play: 'play', stop: 'stop', check: 'check',
}
function faIcon(name) {
  return `fas fa-${ICON_FA[name] || name || 'circle'} fa-fw`
}
import styles from './WorkerInterface.module.css'

const WORKER_SESSION_STORAGE_KEY = 'sarms-worker-session-'

const STEPS = {
  DEPARTMENT: 'department',
  TASK: 'task',
  ZONE: 'zone',
  LINES: 'lines',
  EXECUTION: 'execution',
  COMPLETION_FORM: 'completion_form', // add comment & photo before completing assigned task
  CONFIRMATION: 'confirmation',
}

function labelByLang(item, lang) {
  if (!item) return ''
  return lang === 'ar' ? (item.labelAr ?? item.labelEn) : (item.labelEn ?? item.labelAr)
}

export default function WorkerInterface() {
  const navigate = useNavigate()
  const location = useLocation()
  const { lang, syncLangFromUser } = useLanguage()
  const { workers, sessions, zones = [], records = [], tasks = [], addSession, removeSession, updateSession, addTask, updateTaskStatus, updateTask, addRecord, defaultBatchByZone = {} } = useAppStore()
  const zonesList = (zones && zones.length > 0) ? zones : DEFAULT_ZONES
  const t = (key) => getTranslation(lang, 'worker', key)

  useEffect(() => {
    syncLangFromUser()
  }, [syncLangFromUser])

  useSessionKickCheck()

  useEffect(() => {
    const uid = (typeof window !== 'undefined' ? sessionStorage.getItem('sarms-user-id') : '')?.trim()
    if (!uid) navigate('/login', { replace: true })
  }, [navigate])

  const userId =
    location.state?.userId ?? (typeof window !== 'undefined' ? sessionStorage.getItem('sarms-user-id') : null) ?? ''
  const worker = useMemo(() => {
    const key = userId?.trim()?.toLowerCase()
    if (!key) return null
    const fromStore = (workers || []).find((w) => (w.employeeId || '').toLowerCase() === key)
    if (fromStore) return fromStore
    return SEED_WORKERS.find((w) => w.employeeId === key) || null
  }, [userId, workers])
  const workerId = worker?.id ?? userId
  const workerName = worker?.fullName ?? userId

  const [step, setStep] = useState(STEPS.DEPARTMENT)
  const [selectedDeptId, setSelectedDeptId] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [selectedZoneId, setSelectedZoneId] = useState(null)
  const [lineFrom, setLineFrom] = useState('')
  const [lineTo, setLineTo] = useState('')
  const [activeSession, setActiveSession] = useState(null)
  const [resumeAssignedSession, setResumeAssignedSession] = useState(null) // assigned-by-engineer session to start/resume in EXECUTION screen
  const [completedSession, setCompletedSession] = useState(null)
  const [blockMessage, setBlockMessage] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [completionNotes, setCompletionNotes] = useState('')
  const [completionImage, setCompletionImage] = useState(null) // data URL or null
  const [recordSavedForCompletion, setRecordSavedForCompletion] = useState(false)
  const [pendingCompleteSession, setPendingCompleteSession] = useState(null) // assigned session awaiting notes/photo before complete

  const selectedDept = useMemo(() => (selectedDeptId ? getDepartment(selectedDeptId) : null), [selectedDeptId])
  const selectedZone = useMemo(() => (selectedZoneId ? getZone(selectedZoneId, zonesList) : null), [selectedZoneId, zonesList])
  const departmentTasks = useMemo(() => (selectedDeptId ? getTasksForDepartment(selectedDeptId) : []), [selectedDeptId])

  /** Sessions assigned to this worker by the engineer (show first; worker can only complete them).
   * Match by worker id, employeeId, or userId; also resolve session.workerId via store/SEED so
   * sessions stored with internal id (e.g. 1) still match when user logs in with employeeId (e.g. w1). */
  const myAssignedSessions = useMemo(() => {
    if (!sessions?.length) return []
    const uid = String(userId ?? '').trim().toLowerCase()
    const wid = String(workerId ?? '').trim()
    const eid = worker?.employeeId ? String(worker.employeeId).trim().toLowerCase() : ''
    const resolveSessionWorker = (s) => {
      const sId = String(s.workerId ?? '').trim()
      if (!sId) return null
      const fromStore = (workers || []).find((w) => String(w.id ?? '').trim() === sId || String(w.employeeId ?? '').trim().toLowerCase() === sId.toLowerCase())
      if (fromStore) return fromStore
      const fromSeed = SEED_WORKERS.find((w) => String(w.id ?? '').trim() === sId || String(w.employeeId ?? '').trim().toLowerCase() === sId.toLowerCase())
      return fromSeed || null
    }
    const wName = String(workerName ?? '').trim().toLowerCase()
    return sessions.filter((s) => {
      if (!s.assignedByEngineer) return false
      if (s.completedAt || s.finishedByWorkerAt) return false
      const sId = String(s.workerId ?? '').trim()
      const sIdLower = sId.toLowerCase()
      const widLower = wid.toLowerCase()
      if (sId && (sId === wid || sIdLower === widLower)) return true
      if (eid && sIdLower === eid) return true
      if (uid && sIdLower === uid) return true
      if (wName && (String(s.workerName ?? '').trim().toLowerCase() === wName)) return true
      const sessionWorker = resolveSessionWorker(s)
      if (sessionWorker && (String(sessionWorker.employeeId ?? '').trim().toLowerCase() === uid || String(sessionWorker.id ?? '').trim().toLowerCase() === widLower)) return true
      return false
    })
  }, [sessions, workerId, worker, userId, workers, workerName])

  // Restore in-progress session when worker logs back in (so they can finish the task).
  // If the worker has tasks assigned by the engineer, show those first and do NOT restore from localStorage
  // (otherwise an old self-started task would override and show the wrong task).
  useEffect(() => {
    if (!userId) return
    if (myAssignedSessions.length > 0) {
      try {
        localStorage.removeItem(WORKER_SESSION_STORAGE_KEY + userId.trim().toLowerCase())
      } catch (_) {}
      return
    }
    try {
      const raw = localStorage.getItem(WORKER_SESSION_STORAGE_KEY + userId.trim().toLowerCase())
      if (!raw) return
      const saved = JSON.parse(raw)
      if (!saved?.sessionId || !saved?.departmentId || !saved?.zoneId) return
      const dept = getDepartment(saved.departmentId)
      const zone = getZone(saved.zoneId, zonesList)
      const taskList = getTasksForDepartment(saved.departmentId)
      const task = taskList?.find((t) => t.id === saved.taskId) ?? null
      if (!dept || !zone || !task) return
      setSelectedDeptId(saved.departmentId)
      setSelectedTask(task)
      setSelectedZoneId(saved.zoneId)
      setLineFrom(String(saved.lineFrom ?? ''))
      setLineTo(String(saved.lineTo ?? ''))
      setActiveSession({
        worker_id: userId,
        department: saved.departmentLabel ?? dept.labelEn,
        task: saved.taskLabel ?? task.labelEn,
        zone: saved.zoneLabel ?? zone.labelEn,
        line_from: saved.lineFrom,
        line_to: saved.lineTo,
        start_time: saved.startTime,
        status: 'in_progress',
        _sessionId: saved.sessionId,
      })
      setStep(STEPS.EXECUTION)
      setBlockMessage(null)
    } catch (_) {
      // ignore invalid stored data
    }
  }, [userId, myAssignedSessions.length])

  function goToZone() {
    setStep(STEPS.ZONE)
    setSelectedZoneId(null)
    setSelectedDeptId(null)
    setSelectedTask(null)
    setLineFrom('')
    setLineTo('')
    setBlockMessage(null)
  }

  /** Back from Task to Zone without clearing department. */
  function goBackToZone() {
    setStep(STEPS.ZONE)
    setSelectedZoneId(null)
    setSelectedTask(null)
    setBlockMessage(null)
  }

  function goToDepartment() {
    setStep(STEPS.DEPARTMENT)
    if (!activeSession) {
      setSelectedZoneId(null)
      setSelectedTask(null)
    }
    setBlockMessage(null)
  }

  /** Resolve task id for completion: use session.taskId, or find in_progress task for this worker matching task name. */
  function resolveTaskIdForCompletion(session) {
    const tid = session.taskId ?? session.task_id
    if (tid != null && String(tid).trim() !== '') return String(tid).trim()
    const taskLabel = (session.task || '').trim()
    const wid = String(workerId ?? '').trim()
    const widLower = wid.toLowerCase()
    const eid = String(worker?.employeeId ?? '').trim().toLowerCase()
    const sessionZone = String(session.zoneId ?? session.zone ?? '').trim()
    const sessionDept = String(session.departmentId ?? '').trim()
    const match = (tasks || []).find((t) => {
      if (t.status !== TASK_STATUS.IN_PROGRESS && t.status !== 'in_progress') return false
      const workerMatch = (t.workerIds || []).some((id) => {
        const sid = String(id ?? '').trim()
        return sid === wid || sid.toLowerCase() === widLower || sid === eid || sid.toLowerCase() === eid
      })
      if (!workerMatch) return false
      const defs = getTasksForDepartment(session.departmentId || t.departmentId) || []
      const labelMatch = defs.some((def) => (def.labelEn || '').trim() === taskLabel || (def.labelAr || '').trim() === taskLabel)
      const taskNameMatch = (t.task || '').trim() === taskLabel
      if (!labelMatch && !taskNameMatch) return false
      if (sessionZone || sessionDept) {
        const zoneOk = !sessionZone || String(t.zoneId ?? '').trim() === sessionZone
        const deptOk = !sessionDept || String(t.departmentId ?? '').trim() === sessionDept
        if (!zoneOk || !deptOk) return false
      }
      return true
    })
    return match ? String(match.id ?? match.code ?? '') : null
  }

  function handleFinishAssigned(session) {
    if (!session?.id) return
    const lineParts = (session.linesArea || '–').split(/[–\-]/).map((p) => (p || '').trim())
    const lineFromPart = lineParts[0] ?? ''
    const lineToPart = lineParts[1] ?? ''
    const startMs = (session.startTime ? new Date(session.startTime).getTime() : Date.now())
    const endMs = Date.now()
    const endTime = new Date().toISOString()
    const durationMins = Math.round((endMs - startMs) / 60000)
    const linesStr = `${(lineFromPart || '').trim()} – ${(lineToPart || '').trim()}`.trim()
    const taskIdToComplete = resolveTaskIdForCompletion(session)
    if (taskIdToComplete) {
      updateTaskStatus(taskIdToComplete, TASK_STATUS.FINISHED_BY_WORKER)
      updateTask(taskIdToComplete, {
        finishedAt: endTime,
        workerNotes: completionNotes.trim() || undefined,
        workerImages: completionImage ? [completionImage] : [],
      })
    }
    // Stop timer immediately but keep in Active Work until engineer approves
    updateSession(session.id, {
      finishedByWorkerAt: endTime,
      workerNotes: completionNotes.trim() || undefined,
      imageData: completionImage || undefined,
    })
    setCompletedSession({
      department: session.department,
      task: session.task,
      zone: session.zone,
      line_from: (lineFromPart || '').trim(),
      line_to: (lineToPart || '').trim(),
      start_time: session.startTime,
      end_time: endTime,
      status: 'finished_by_worker',
      duration: durationMins,
    })
    setCompletionNotes('')
    setCompletionImage(null)
    setRecordSavedForCompletion(true)
    setPendingCompleteSession(null)
    const uid = String(userId ?? '').trim().toLowerCase()
    const wid = String(workerId ?? '').trim()
    const widLower = wid.toLowerCase()
    const eid = worker?.employeeId ? String(worker.employeeId).trim().toLowerCase() : ''
    const remainingAssigned = (sessions || []).filter((s) => {
      if (!s.assignedByEngineer) return false
      if (s.completedAt || s.finishedByWorkerAt) return false
      if (s.id === session.id) return false
      const sId = String(s.workerId ?? '').trim()
      const sIdLower = sId.toLowerCase()
      if (sId && (sId === wid || sIdLower === widLower)) return true
      if (eid && sIdLower === eid) return true
      if (uid && sIdLower === uid) return true
      return false
    })
    if (remainingAssigned.length === 0) {
      try {
        localStorage.removeItem(WORKER_SESSION_STORAGE_KEY + String(userId ?? '').trim().toLowerCase())
      } catch (_) {}
      clearSessionAuth()
      navigate('/login', { replace: true })
    } else {
      setStep(STEPS.DEPARTMENT)
    }
  }

  function openCompletionForm(session) {
    if (session?.finishedByWorkerAt || session?.finishedAt) {
      setBlockMessage('Awaiting engineer approval')
      return
    }
    setPendingCompleteSession(session)
    setCompletionNotes('')
    setCompletionImage(null)
    setStep(STEPS.COMPLETION_FORM)
  }

  function confirmCompleteWithNotes() {
    if (pendingCompleteSession) {
      handleFinishAssigned(pendingCompleteSession)
    }
  }

  function cancelCompletionForm() {
    setPendingCompleteSession(null)
    setStep(STEPS.DEPARTMENT)
  }

  function goToTask() {
    setStep(STEPS.TASK)
    if (!activeSession) {
      setSelectedTask(null)
      setLineFrom('')
      setLineTo('')
    }
    setBlockMessage(null)
  }

  function goToLines() {
    setStep(STEPS.LINES)
    setBlockMessage(null)
  }

  function goToExecution() {
    setStep(STEPS.EXECUTION)
    setBlockMessage(null)
  }

  function handleSelectDepartment(deptId) {
    setSelectedDeptId(deptId)
    if (deptId === 'inventory') {
      setSelectedZoneId('inventory')
      setStep(STEPS.TASK)
    } else {
      setStep(STEPS.ZONE)
    }
  }

  function handleSelectTask(task) {
    setSelectedTask(task)
    if (selectedZoneId === 'inventory') {
      setLineFrom('—')
      setLineTo('—')
      setStep(STEPS.EXECUTION)
    } else {
      setStep(STEPS.LINES)
    }
  }

  function handleSelectZone(zoneId) {
    setSelectedZoneId(zoneId)
    setStep(STEPS.TASK)
  }

  const LINE_MIN = 1
  const LINE_MAX = 40

  function handleLinesStart(e) {
    e.preventDefault()
    const fromStr = lineFrom.trim()
    const toStr = lineTo.trim()
    if (!fromStr || !toStr) {
      setBlockMessage(t('enterFromTo'))
      return
    }
    const from = parseInt(fromStr, 10)
    const to = parseInt(toStr, 10)
    if (Number.isNaN(from) || Number.isNaN(to)) {
      setBlockMessage(t('enterNumbers'))
      return
    }
    if (from < LINE_MIN || from > LINE_MAX || to < LINE_MIN || to > LINE_MAX) {
      setBlockMessage(t('linesBetween'))
      return
    }
    if (from > to) {
      setBlockMessage(t('fromLessThanTo'))
      return
    }
    setBlockMessage(null)
    setStep(STEPS.EXECUTION)
  }

  /** Worker self-start: create task as Pending → logout. Task appears in Assign Task for engineer to Accept; after Accept it appears in Monitor Active Work. */
  function handleStartTask() {
    if (activeSession) {
      setBlockMessage(t('activeTaskBlock'))
      return
    }
    // Starting an engineer-assigned task: start the existing session timer and enter activeSession mode.
    if (resumeAssignedSession?.id) {
      const nowIso = new Date().toISOString()
      const lineParts = (resumeAssignedSession.linesArea || '–').split(/[–\-]/).map((p) => (p || '').trim())
      updateSession(resumeAssignedSession.id, { startTime: resumeAssignedSession.startTime || nowIso })
      setActiveSession({
        worker_id: userId,
        department: resumeAssignedSession.department,
        task: resumeAssignedSession.task,
        zone: resumeAssignedSession.zone,
        line_from: lineParts[0] || '',
        line_to: lineParts[1] || '',
        start_time: resumeAssignedSession.startTime || nowIso,
        status: 'in_progress',
        _sessionId: resumeAssignedSession.id,
      })
      setBlockMessage(null)
      return
    }
    const now = new Date().toISOString()
    const linesArea = selectedZoneId === 'inventory' ? '—' : `${lineFrom.trim()}–${lineTo.trim()}`
    const taskId = generateTaskId(tasks)
    const task = {
      id: taskId,
      departmentId: selectedDeptId ?? '',
      zoneId: selectedZoneId ?? '',
      batchId: defaultBatchByZone[selectedZoneId] ?? '1',
      linesArea,
      taskType: selectedDeptId ?? '',
      taskId: selectedTask?.id ?? '',
      workerIds: [String(workerId)],
      priority: 'medium',
      estimatedMinutes: 60,
      notes: linesArea !== '—' ? `Lines: ${linesArea}` : '',
      status: TASK_STATUS.PENDING_APPROVAL,
      startedByWorker: true,
      gridRow: 1,
      gridCol: 1,
      gridSide: 'left',
      createdAt: now,
    }
    addTask(task)
    setBlockMessage(null)
    try {
      localStorage.removeItem(WORKER_SESSION_STORAGE_KEY + String(userId ?? '').trim().toLowerCase())
    } catch (_) {}
    clearSessionAuth()
    navigate('/login', { replace: true })
  }

  function handleEndTask() {
    if (!activeSession) {
      setBlockMessage(t('noActiveTask'))
      return
    }
    if (selectedZoneId === 'inventory' && !completionNotes.trim()) {
      setBlockMessage(t('inventoryNotesRequired'))
      return
    }
    const sessionInStore = activeSession._sessionId
      ? (sessions || []).find((s) => s.id === activeSession._sessionId)
      : null
    if (activeSession._sessionId) {
      if (sessionInStore?.taskId) {
        const endTimeIso = new Date().toISOString()
        updateTaskStatus(sessionInStore.taskId, TASK_STATUS.FINISHED_BY_WORKER)
        updateTask(sessionInStore.taskId, {
          finishedAt: endTimeIso,
          workerNotes: completionNotes.trim() || undefined,
          workerImages: completionImage ? [completionImage] : [],
        })
        // Stop timer but keep session visible for engineer approval
        updateSession(activeSession._sessionId, {
          finishedByWorkerAt: endTimeIso,
          workerNotes: completionNotes.trim() || undefined,
          imageData: completionImage || undefined,
        })
      }
    }
    try {
      localStorage.removeItem(WORKER_SESSION_STORAGE_KEY + (userId || '').trim().toLowerCase())
    } catch (_) {}
    const endTime = new Date()
    const startTime = new Date(activeSession.start_time)
    const durationMs = endTime - startTime
    const durationMins = Math.round(durationMs / 60000)
    const latestSession = sessionInStore
    const engineerNotesStr = (latestSession?.notes?.length)
      ? latestSession.notes.map((n) => (n.text || '').trim()).filter(Boolean).join('\n')
      : undefined
    const linesStr = `${activeSession.line_from || ''} – ${activeSession.line_to || ''}`.trim()
    const completed = {
      ...activeSession,
      end_time: endTime.toISOString(),
      status: 'finished_by_worker',
      duration: durationMins,
      taskId: sessionInStore?.taskId ?? null,
      sourceSessionId: activeSession._sessionId ?? null,
    }
    setRecordSavedForCompletion(true)
    setCompletedSession(completed)
    setCompletionNotes('')
    setCompletionImage(null)
    setActiveSession(null)
    setStep(STEPS.CONFIRMATION)
    setBlockMessage(null)
  }

  function saveCompletionRecord() {
    if (!completedSession) return
    const engineerNotesStr = typeof completedSession.engineerNotes === 'string'
      ? completedSession.engineerNotes
      : undefined
    const isHarvest = (completedSession.task || '').toLowerCase().includes('harvest')
    const record = {
      id: nextRecordId(records),
      recordType: 'production',
      ...(isHarvest && { source: 'harvest_form' }),
      worker: workerName,
      department: completedSession.department,
      task: completedSession.task,
      zone: completedSession.zone,
      lines: `${completedSession.line_from || ''} – ${completedSession.line_to || ''}`.trim(),
      dateTime: completedSession.end_time,
      createdAt: new Date().toISOString(),
      duration: completedSession.duration,
      startTime: completedSession.start_time,
      notes: completionNotes.trim() || undefined,
      engineerNotes: engineerNotesStr,
      imageData: completionImage || undefined,
      taskId: completedSession.taskId ?? null,
      sourceSessionId: completedSession.sourceSessionId ?? null,
    }
    addRecord(record)
  }

  function handleLogAnother() {
    if (completedSession && !recordSavedForCompletion) saveCompletionRecord()
    setCompletedSession(null)
    setCompletionNotes('')
    setCompletionImage(null)
    setSelectedZoneId(null)
    setSelectedDeptId(null)
    setSelectedTask(null)
    setLineFrom('')
    setLineTo('')
    setStep(STEPS.DEPARTMENT)
  }

  function handleLogOut() {
    if (completedSession && !recordSavedForCompletion) saveCompletionRecord()
    try {
      localStorage.removeItem(WORKER_SESSION_STORAGE_KEY + String(userId ?? '').trim().toLowerCase())
    } catch (_) {}
    clearSessionAuth()
    navigate('/login', { replace: true })
  }

  function onCompletionImageChange(e) {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => setCompletionImage(reader.result)
    reader.readAsDataURL(file)
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return iso
    }
  }

  const statusLabel = activeSession ? t('inProgress') : selectedTask ? t('notStarted') : '—'

  return (
    <div className={styles.page}>
      <button
        type="button"
        className={styles.logoutFixedBtn}
        onClick={handleLogOut}
        aria-label={t('logOut')}
        title={t('logOut')}
      >
        <i className="fas fa-right-from-bracket fa-fw" />
        <span className={styles.logoutFixedLabel}>{t('logOut')}</span>
      </button>
      <button
        type="button"
        className={styles.settingsBtn}
        onClick={() => setShowSettings(true)}
        aria-label={t('settings')}
        title={t('settings')}
      >
        <i className="fas fa-gear fa-fw" />
      </button>
      {showSettings && (
        <WorkerSettingsModal onClose={() => setShowSettings(false)} />
      )}
      {step === STEPS.DEPARTMENT && myAssignedSessions.length > 0 && (
        <div className={styles.screen}>
          <h1 className={styles.screenTitle}><i className={`${faIcon('list-bullet')} ${styles.stepIcon}`} /> {t('assignedToYou')}</h1>
          <div className={styles.taskGrid}>
            {myAssignedSessions.map((session) => (
              <div key={session.id} className={styles.assignedCard}>
                <div className={styles.assignedInfo}>
                  <span className={styles.assignedDept}>
                    {labelByLang(getDepartment(session.departmentId || session.taskTypeId) || { labelEn: session.department, labelAr: session.department }, lang)}
                  </span>
                  <span className={styles.assignedTask}>
                    {(() => {
                      const deptId = session.departmentId || session.taskTypeId
                      const defs = deptId ? (getTasksForDepartment(deptId) || []) : []
                      const taskDefId = session.taskDefId || session.taskId
                      const found = defs.find((d) => d.id === taskDefId) || defs.find((d) => d.labelEn === session.task || d.labelAr === session.task)
                      return labelByLang(found || { labelEn: session.task, labelAr: session.task }, lang)
                    })()}
                  </span>
                  <span className={styles.assignedZone}>
                    {labelByLang(getZone(session.zoneId, zonesList) || { labelEn: session.zone, labelAr: session.zone }, lang)} · {session.linesArea}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => openCompletionForm(session)}
                  disabled={!!(session.finishedByWorkerAt || session.finishedAt)}
                >
                  <i className={`${faIcon('check')} ${styles.btnIcon}`} /> {session.finishedByWorkerAt ? 'Awaiting approval' : t('confirmComplete')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {step === STEPS.ZONE && (
        <div className={styles.screen}>
          <button type="button" className={styles.backButton} onClick={goToDepartment}>
            <i className={`${faIcon(lang === 'ar' ? 'arrow-right' : 'arrow-left')} ${styles.backArrow}`} /> {t('back')}
          </button>
          <p className={styles.stepBadge}>2</p>
          <h1 className={styles.screenTitle}><i className={`${faIcon('squares-2x2')} ${styles.stepIcon}`} /> {t('selectZone')}</h1>
          <div className={styles.zoneGrid}>
            {zonesList.filter((z) => z.id !== 'inventory').map((z) => (
              <button
                key={z.id}
                type="button"
                className={styles.zoneCard}
                onClick={() => handleSelectZone(z.id)}
              >
                <i className={`${faIcon(z.icon ?? 'squares-2x2')} ${styles.zoneIcon}`} />
                <span className={styles.zoneLabel}>{labelByLang(z, lang)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === STEPS.DEPARTMENT && myAssignedSessions.length === 0 && (
        <div className={styles.screen}>
          <p className={styles.stepBadge}>1</p>
          <h1 className={styles.screenTitle}>{t('selectDepartment')}</h1>
          {activeSession ? (
            <div className={styles.activeTaskBlock}>
              <p className={styles.blockMessage}>{t('activeTaskBlock')}</p>
              <button type="button" className={styles.primaryButton} onClick={goToExecution}>
                {t('backToTask')}
              </button>
            </div>
          ) : (
          <div className={styles.deptGrid}>
            {[...DEPARTMENTS, INVENTORY_DEPARTMENT].map((d) => (
              <button
                key={d.id}
                type="button"
                className={styles.deptCard}
                onClick={() => handleSelectDepartment(d.id)}
              >
                <i className={`${faIcon(d.icon)} ${styles.deptIcon}`} />
                <span className={styles.deptLabel}>{labelByLang(d, lang)}</span>
              </button>
            ))}
          </div>
          )}
        </div>
      )}

      {step === STEPS.TASK && (
        <div className={styles.screen}>
          <button type="button" className={styles.backButton} onClick={selectedDeptId === 'inventory' ? goToDepartment : goBackToZone}>
            <i className={`${faIcon(lang === 'ar' ? 'arrow-right' : 'arrow-left')} ${styles.backArrow}`} /> {t('back')}
          </button>
          <p className={styles.stepBadge}>3</p>
          <h1 className={styles.screenTitle}>
            <i className={`${faIcon('list-bullet')} ${styles.stepIcon}`} /> {selectedZoneId === 'inventory' ? t('selectInventoryTask') : t('selectTask')}
          </h1>
          {activeSession ? (
            <div className={styles.activeTaskBlock}>
              <p className={styles.blockMessage}>{t('activeTaskBlock')}</p>
              <button type="button" className={styles.primaryButton} onClick={goToExecution}>
                {t('backToTask')}
              </button>
            </div>
          ) : (
            <div className={styles.taskGrid}>
              {departmentTasks.map((tsk) => (
                <button
                  key={tsk.id}
                  type="button"
                  className={styles.taskCard}
                  onClick={() => handleSelectTask(tsk)}
                >
                  <i className={`${faIcon(tsk.icon ?? 'list-bullet')} ${styles.taskIcon}`} />
                  <span className={styles.taskLabel}>{labelByLang(tsk, lang)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === STEPS.LINES && (
        <div className={styles.screen}>
          <button type="button" className={styles.backButton} onClick={goToTask}>
            <i className={`${faIcon(lang === 'ar' ? 'arrow-right' : 'arrow-left')} ${styles.backArrow}`} /> {t('back')}
          </button>
          <p className={styles.stepBadge}>4</p>
          <h1 className={styles.screenTitle}>
            <i className={`${faIcon('minus')} ${styles.stepIcon}`} /> {t('selectLines')}
          </h1>
          {activeSession ? (
            <div className={styles.activeTaskBlock}>
              <p className={styles.blockMessage}>{t('activeTaskBlock')}</p>
              <button type="button" className={styles.primaryButton} onClick={goToExecution}>
                {t('backToTask')}
              </button>
            </div>
          ) : (
            <div className={styles.linesCard}>
              <p className={styles.linesHint}>
                {t('lines1To90')}
              </p>
              <form onSubmit={handleLinesStart} className={styles.linesForm}>
                <div className={styles.linesRow}>
                  <div className={styles.linesField}>
                    <label className={styles.linesLabel} htmlFor="lineFrom">{t('from')}</label>
                    <input
                      id="lineFrom"
                      type="number"
                      min={LINE_MIN}
                      max={LINE_MAX}
                      className={styles.linesInput}
                      value={lineFrom}
                      onChange={(e) => setLineFrom(e.target.value)}
                      placeholder="1"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  </div>
                  <div className={styles.linesDashWrapper}>
                    <span className={styles.linesDash} style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>-</span>
                  </div>
                  <div className={styles.linesField}>
                    <label className={styles.linesLabel} htmlFor="lineTo">{t('to')}</label>
                    <input
                      id="lineTo"
                      type="number"
                      min={LINE_MIN}
                      max={LINE_MAX}
                      className={styles.linesInput}
                      value={lineTo}
                      onChange={(e) => setLineTo(e.target.value)}
                      placeholder="40"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  </div>
                </div>
                {blockMessage && <p className={styles.blockMessage} role="alert">{blockMessage}</p>}
                <button type="submit" className={styles.primaryButton}>
                  {t('start')}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {step === STEPS.EXECUTION && (
        <div className={styles.screen}>
          <button type="button" className={styles.backButton} onClick={selectedZoneId === 'inventory' ? goToTask : goToLines}>
            <i className={`${faIcon(lang === 'ar' ? 'arrow-right' : 'arrow-left')} ${styles.backArrow}`} /> {t('back')}
          </button>
          <p className={styles.stepBadge}>{selectedZoneId === 'inventory' ? '3' : '5'}</p>
          <h1 className={styles.screenTitle}>
            <i className={`${faIcon('play')} ${styles.stepIcon}`} /> {t('task')}
          </h1>
          <div className={styles.executionCard}>
            <div className={styles.executionRow}>
              <span className={styles.infoLabel}>{t('department')}</span>
              <span className={styles.infoValue}>{labelByLang(selectedDept, lang)}</span>
            </div>
            <div className={styles.executionRow}>
              <span className={styles.infoLabel}>{t('task')}</span>
              <span className={styles.infoValue}>{labelByLang(selectedTask, lang)}</span>
            </div>
            <div className={styles.executionRow}>
              <span className={styles.infoLabel}>{t('zone')}</span>
              <span className={styles.infoValue}>{labelByLang(selectedZone, lang)}</span>
            </div>
            <div className={styles.executionRow}>
              <span className={styles.infoLabel}>{t('lines')}</span>
              <span className={styles.infoValue}>{lineFrom.trim()} – {lineTo.trim()}</span>
            </div>
            <div className={styles.executionRow}>
              <span className={styles.infoLabel}>{t('status')}</span>
              <span className={activeSession ? styles.statusActive : styles.statusIdle}>{statusLabel}</span>
            </div>
          </div>
          {blockMessage && <p className={styles.blockMessage} role="alert">{blockMessage}</p>}
          <div className={styles.completionExtra}>
            <label className={styles.completionNotesLabel} htmlFor="exec-notes">
              {selectedZoneId === 'inventory' ? t('completionNotesLabelInventory') : t('completionNotesLabel')}
            </label>
            <textarea
              id="exec-notes"
              className={styles.completionNotesInput}
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder={selectedZoneId === 'inventory' ? t('completionNotesPlaceholderInventory') : t('completionNotesPlaceholder')}
              rows={3}
              required={selectedZoneId === 'inventory'}
              aria-required={selectedZoneId === 'inventory'}
            />
            <div className={styles.completionPhotoWrap}>
              <span className={styles.completionPhotoLabel}>{t('addPhoto')}</span>
              {completionImage ? (
                <div className={styles.completionImagePreviewWrap}>
                  <img src={completionImage} alt="" className={styles.completionImagePreview} />
                  <button type="button" className={styles.removePhotoBtn} onClick={() => setCompletionImage(null)} aria-label={t('removePhoto')}>
                    <i className="fas fa-times fa-fw" /> {t('removePhoto')}
                  </button>
                </div>
              ) : (
                <label className={styles.addPhotoBtn}>
                  <input type="file" accept="image/*" capture="environment" onChange={onCompletionImageChange} className={styles.addPhotoInput} />
                  <i className="fas fa-camera fa-fw" /> {t('addPhoto')}
                </label>
              )}
            </div>
          </div>
          <div className={styles.executionActions}>
            <button
              type="button"
              className={styles.startBtn}
              onClick={activeSession ? handleEndTask : handleStartTask}
            >
              <i className={`${faIcon(activeSession ? 'stop' : 'play')} ${styles.btnIcon}`} /> {t(activeSession ? 'finishTask' : 'confirmStart')}
            </button>
          </div>
        </div>
      )}

      {step === STEPS.COMPLETION_FORM && pendingCompleteSession && (
        <div className={styles.screen}>
          <button type="button" className={styles.backButton} onClick={cancelCompletionForm}>
            <i className={`${faIcon(lang === 'ar' ? 'arrow-right' : 'arrow-left')} ${styles.backArrow}`} /> {t('back')}
          </button>
          <h1 className={styles.screenTitle}>
            <i className={`${faIcon('check')} ${styles.stepIcon}`} /> {t('confirmComplete')}
          </h1>
          <div className={styles.summaryCard}>
            <div className={styles.summaryRow}>
              <span className={styles.infoLabel}>{t('department')}</span>
              <span>{pendingCompleteSession.department}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.infoLabel}>{t('task')}</span>
              <span>{pendingCompleteSession.task}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.infoLabel}>{t('zone')}</span>
              <span>{pendingCompleteSession.zone}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.infoLabel}>{t('lines')}</span>
              <span>{pendingCompleteSession.linesArea || '—'}</span>
            </div>
          </div>
          <p className={styles.completionFormHint}>{t('completionFormHint')}</p>
          <div className={styles.completionExtra}>
            <label className={styles.completionNotesLabel} htmlFor="completion-form-notes">{t('completionNotesLabel')}</label>
            <textarea
              id="completion-form-notes"
              className={styles.completionNotesInput}
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder={t('completionNotesPlaceholder')}
              rows={3}
            />
            <div className={styles.completionPhotoWrap}>
              <span className={styles.completionPhotoLabel}>{t('addPhoto')}</span>
              {completionImage ? (
                <div className={styles.completionImagePreviewWrap}>
                  <img src={completionImage} alt="" className={styles.completionImagePreview} />
                  <button type="button" className={styles.removePhotoBtn} onClick={() => setCompletionImage(null)} aria-label={t('removePhoto')}>
                    <i className="fas fa-times fa-fw" /> {t('removePhoto')}
                  </button>
                </div>
              ) : (
                <label className={styles.addPhotoBtn}>
                  <input type="file" accept="image/*" capture="environment" onChange={onCompletionImageChange} className={styles.addPhotoInput} />
                  <i className="fas fa-camera fa-fw" /> {t('addPhoto')}
                </label>
              )}
            </div>
          </div>
          <div className={styles.executionActions}>
            <button type="button" className={styles.primaryButton} onClick={confirmCompleteWithNotes}>
              <i className={`${faIcon('check')} ${styles.btnIcon}`} /> {t('confirmComplete')}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={cancelCompletionForm}>
              {t('back')}
            </button>
          </div>
        </div>
      )}

      {step === STEPS.CONFIRMATION && completedSession && (
        <div className={styles.screen}>
          <p className={styles.stepBadge}><i className={`${faIcon('check')} ${styles.stepBadgeSvg}`} /></p>
          <h1 className={styles.confirmTitle}>
            <i className={`${faIcon('check')} ${styles.confirmIcon}`} /> {t('taskLogged')}
          </h1>
          <div className={styles.summaryCard}>
            <div className={styles.summaryRow}>
              <span className={styles.infoLabel}>{t('department')}</span>
              <span>{completedSession.department}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.infoLabel}>{t('task')}</span>
              <span>{completedSession.task}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.infoLabel}>{t('zone')}</span>
              <span>{completedSession.zone}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.infoLabel}>{t('lines')}</span>
              <span>{completedSession.line_from} – {completedSession.line_to}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.infoLabel}>{t('startTime')}</span>
              <span>{formatTime(completedSession.start_time)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.infoLabel}>{t('endTime')}</span>
              <span>{formatTime(completedSession.end_time)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.infoLabel}>{t('duration')}</span>
              <span>{completedSession.duration} {t('min')}</span>
            </div>
          </div>
          {!recordSavedForCompletion && (
            <div className={styles.completionExtra}>
              <label className={styles.completionNotesLabel} htmlFor="completion-notes">{t('completionNotesLabel')}</label>
              <textarea
                id="completion-notes"
                className={styles.completionNotesInput}
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder={t('completionNotesPlaceholder')}
                rows={3}
              />
              <div className={styles.completionPhotoWrap}>
                <span className={styles.completionPhotoLabel}>{t('addPhoto')}</span>
                {completionImage ? (
                  <div className={styles.completionImagePreviewWrap}>
                    <img src={completionImage} alt="" className={styles.completionImagePreview} />
                    <button type="button" className={styles.removePhotoBtn} onClick={() => setCompletionImage(null)} aria-label={t('removePhoto')}>
                      <i className="fas fa-times fa-fw" /> {t('removePhoto')}
                    </button>
                  </div>
                ) : (
                  <label className={styles.addPhotoBtn}>
                    <input type="file" accept="image/*" capture="environment" onChange={onCompletionImageChange} className={styles.addPhotoInput} />
                    <i className="fas fa-camera fa-fw" /> {t('addPhoto')}
                  </label>
                )}
              </div>
            </div>
          )}
          <div className={styles.confirmActions}>
            <button type="button" className={styles.primaryButton} onClick={handleLogAnother}>
              {t('logAnother')}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={handleLogOut}>
              {t('logOut')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

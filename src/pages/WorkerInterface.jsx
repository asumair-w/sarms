import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { getTranslation } from '../i18n/translations'
import {
  DEPARTMENTS,
  ZONES as DEFAULT_ZONES,
  getDepartment,
  getZone,
  getTasksForDepartment,
} from '../data/workerFlow'
import { SEED_WORKERS } from '../data/engineerWorkers'
import { useAppStore } from '../context/AppStoreContext'
import { TASK_STATUS, generateTaskId } from '../data/assignTask'
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
  CONFIRMATION: 'confirmation',
}

function labelByLang(item, lang) {
  if (!item) return ''
  return lang === 'ar' ? (item.labelAr ?? item.labelEn) : (item.labelEn ?? item.labelAr)
}

export default function WorkerInterface() {
  const navigate = useNavigate()
  const location = useLocation()
  const { lang } = useLanguage()
  const { workers, sessions, zones = [], addSession, removeSession, addTask, updateTaskStatus, addRecord, defaultBatchByZone = {} } = useAppStore()
  const zonesList = (zones && zones.length > 0) ? zones : DEFAULT_ZONES
  const t = (key) => getTranslation(lang, 'worker', key)

  const userId = location.state?.userId ?? (typeof window !== 'undefined' ? sessionStorage.getItem('sarms-user-id') : null) ?? 'worker'
  const worker = useMemo(() => {
    const key = userId?.trim()?.toLowerCase()
    if (!key) return null
    const fromStore = (workers || []).find((w) => (w.employeeId || '').toLowerCase() === key)
    if (fromStore) return fromStore
    return SEED_WORKERS.find((w) => w.employeeId === key) || null
  }, [userId, workers])
  const workerId = worker?.id ?? userId
  const workerName = worker?.fullName ?? userId

  const [step, setStep] = useState(STEPS.ZONE)
  const [selectedDeptId, setSelectedDeptId] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [selectedZoneId, setSelectedZoneId] = useState(null)
  const [lineFrom, setLineFrom] = useState('')
  const [lineTo, setLineTo] = useState('')
  const [activeSession, setActiveSession] = useState(null)
  const [completedSession, setCompletedSession] = useState(null)
  const [blockMessage, setBlockMessage] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [completionNotes, setCompletionNotes] = useState('')
  const [completionImage, setCompletionImage] = useState(null) // data URL or null
  const [recordSavedForCompletion, setRecordSavedForCompletion] = useState(false)

  const selectedDept = useMemo(() => (selectedDeptId ? getDepartment(selectedDeptId) : null), [selectedDeptId])
  const selectedZone = useMemo(() => (selectedZoneId ? getZone(selectedZoneId, zonesList) : null), [selectedZoneId, zonesList])
  const tasks = useMemo(() => (selectedDeptId ? getTasksForDepartment(selectedDeptId) : []), [selectedDeptId])

  /** Sessions assigned to this worker by the engineer (show first; worker can only complete them). */
  const myAssignedSessions = useMemo(
    () => (sessions || []).filter(
      (s) => String(s.workerId) === String(workerId) && s.assignedByEngineer
    ),
    [sessions, workerId]
  )

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

  function goToDepartment() {
    setStep(STEPS.DEPARTMENT)
    if (!activeSession) setSelectedTask(null)
    setBlockMessage(null)
  }

  function handleCompleteAssigned(session) {
    if (!session?.taskId) return
    updateTaskStatus(session.taskId, TASK_STATUS.COMPLETED)
    removeSession(session.id)
    const [lineFromPart, lineToPart] = (session.linesArea || '–').split('–')
    const startMs = new Date(session.startTime).getTime()
    const endMs = Date.now()
    setCompletedSession({
      department: session.department,
      task: session.task,
      zone: session.zone,
      line_from: (lineFromPart || '').trim(),
      line_to: (lineToPart || '').trim(),
      start_time: session.startTime,
      end_time: new Date().toISOString(),
      status: 'completed',
      duration: Math.round((endMs - startMs) / 60000),
      engineerNotes: session.notes && session.notes.length ? [...session.notes] : undefined,
    })
    setCompletionNotes('')
    setCompletionImage(null)
    setRecordSavedForCompletion(false)
    setStep(STEPS.CONFIRMATION)
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
    setStep(STEPS.TASK)
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
    if (zoneId === 'inventory') {
      setSelectedDeptId('inventory')
      setStep(STEPS.TASK)
    } else {
      setSelectedDeptId(null)
      setStep(STEPS.DEPARTMENT)
    }
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

  function handleStartTask() {
    if (activeSession) {
      setBlockMessage(t('activeTaskBlock'))
      return
    }
    const now = new Date().toISOString()
    const linesArea = `${lineFrom.trim()}–${lineTo.trim()}`
    const taskId = generateTaskId()
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
      notes: linesArea ? `Lines: ${linesArea}` : '',
      status: TASK_STATUS.PENDING_APPROVAL,
      gridRow: 1,
      gridCol: 1,
      gridSide: 'left',
      createdAt: now,
    }
    addTask(task)
    setBlockMessage(null)
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
    if (activeSession._sessionId) removeSession(activeSession._sessionId)
    try {
      localStorage.removeItem(WORKER_SESSION_STORAGE_KEY + (userId || '').trim().toLowerCase())
    } catch (_) {}
    const endTime = new Date()
    const startTime = new Date(activeSession.start_time)
    const durationMs = endTime - startTime
    const durationMins = Math.round(durationMs / 60000)
    const latestSession = (sessions || []).find((ss) => ss.id === activeSession._sessionId)
    const engineerNotesStr = (latestSession?.notes?.length)
      ? latestSession.notes.map((n) => `${new Date(n.at).toLocaleString()}: ${n.text}`).join('\n')
      : undefined
    const linesStr = `${activeSession.line_from || ''} – ${activeSession.line_to || ''}`.trim()
    const completed = {
      ...activeSession,
      end_time: endTime.toISOString(),
      status: 'completed',
      duration: durationMins,
    }
    const record = {
      id: `R-${Date.now()}`,
      recordType: 'production',
      worker: workerName,
      department: activeSession.department,
      task: activeSession.task,
      zone: activeSession.zone,
      lines: linesStr,
      linesArea: linesStr,
      dateTime: endTime.toISOString(),
      createdAt: new Date().toISOString(),
      duration: durationMins,
      startTime: activeSession.start_time,
      notes: completionNotes.trim() || undefined,
      engineerNotes: engineerNotesStr,
      imageData: completionImage || undefined,
    }
    addRecord(record)
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
    const engineerNotesStr = (completedSession.engineerNotes && completedSession.engineerNotes.length)
      ? completedSession.engineerNotes.map((n) => `${new Date(n.at).toLocaleString()}: ${n.text}`).join('\n')
      : undefined
    const record = {
      id: `R-${Date.now()}`,
      recordType: 'production',
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
    }
    addRecord(record)
  }

  function handleLogAnother() {
    saveCompletionRecord()
    setCompletedSession(null)
    setCompletionNotes('')
    setCompletionImage(null)
    setSelectedZoneId(null)
    setSelectedDeptId(null)
    setSelectedTask(null)
    setLineFrom('')
    setLineTo('')
    setStep(STEPS.ZONE)
  }

  function handleLogOut() {
    if (completedSession && !recordSavedForCompletion) saveCompletionRecord()
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
      {step === STEPS.ZONE && myAssignedSessions.length > 0 && (
        <div className={styles.screen}>
          <h1 className={styles.screenTitle}><i className={`${faIcon('list-bullet')} ${styles.stepIcon}`} /> {t('assignedToYou')}</h1>
          <div className={styles.taskGrid}>
            {myAssignedSessions.map((session) => (
              <div key={session.id} className={styles.assignedCard}>
                <div className={styles.assignedInfo}>
                  <span className={styles.assignedDept}>{session.department}</span>
                  <span className={styles.assignedTask}>{session.task}</span>
                  <span className={styles.assignedZone}>{session.zone} · {session.linesArea}</span>
                </div>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => handleCompleteAssigned(session)}
                >
                  <i className={`${faIcon('check')} ${styles.btnIcon}`} /> {t('completeTask')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {step === STEPS.ZONE && myAssignedSessions.length === 0 && (
        <div className={styles.screen}>
          <p className={styles.stepBadge}>1</p>
          <h1 className={styles.screenTitle}><i className={`${faIcon('squares-2x2')} ${styles.stepIcon}`} /> {t('selectZone')}</h1>
          <div className={styles.zoneGrid}>
            {zonesList.map((z) => (
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

      {step === STEPS.DEPARTMENT && (
        <div className={styles.screen}>
          <button type="button" className={styles.backButton} onClick={goToZone}>
            <i className={`${faIcon(lang === 'ar' ? 'arrow-right' : 'arrow-left')} ${styles.backArrow}`} /> {t('back')}
          </button>
          <p className={styles.stepBadge}>2</p>
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
            {DEPARTMENTS.map((d) => (
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
          <button type="button" className={styles.backButton} onClick={selectedZoneId === 'inventory' ? goToZone : goToDepartment}>
            <i className={`${faIcon(lang === 'ar' ? 'arrow-right' : 'arrow-left')} ${styles.backArrow}`} /> {t('back')}
          </button>
          <p className={styles.stepBadge}>{selectedZoneId === 'inventory' ? '2' : '3'}</p>
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
              {tasks.map((tsk) => (
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
            <button type="button" className={styles.startBtn} onClick={handleStartTask}>
              <i className={`${faIcon('play')} ${styles.btnIcon}`} /> {t('startTask')}
            </button>
            <button type="button" className={styles.endBtn} onClick={handleEndTask}>
              <i className={`${faIcon('stop')} ${styles.btnIcon}`} /> {t('endTask')}
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

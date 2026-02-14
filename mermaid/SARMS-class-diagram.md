
```mermaid
classDiagram
  direction TB

  %% ========== Entry & Core ==========
  class main_jsx {
    <<entry>>
    +render()
    -showBootstrapError()
    wraps: ErrorBoundary, LanguageProvider, BrowserRouter, AppStoreProvider, App
  }

  class App_jsx {
    <<router>>
    +App()
    ROLE_KEY
    EngineerRouteGuard()
    Routes: /login, /worker, /engineer/*, /admin/*
  }

  class auth_js {
    <<auth module>>
    ROLES
    ROUTES_BY_ROLE
    MOCK_USERS
    +validateCredentials(userId, password)
    +validateUserIdFromQR(userId)
    +getRedirectForRole(role)
  }

  %% ========== Contexts ==========
  class LanguageContext {
    <<context>>
    LanguageProvider
    useLanguage()
    state: lang (en|ar)
    setLang()
    STORAGE_KEY
  }

  class AppStoreContext {
    <<context>>
    AppStoreProvider
    useAppStore()
    state: tasks, records, sessions, inventory, equipment, faults, maintenancePlans
    storeReducer()
    +setTasks, addTask, updateTaskStatus
    +addRecord, setSessions, addSession, removeSession, updateSession
    +setInventory, updateInventoryItem, addInventoryItem, setEquipment
    +addFault, addMaintenancePlan
  }

  %% ========== Layouts ==========
  class EngineerLayout {
    <<layout>>
    +EngineerLayout()
    uses: Outlet, NavLink, useLanguage, getTranslation, SIDEBAR_ITEMS, Icon, MenuIcon, SidebarToggleIcon
    state: sidebarOpen, sidebarCollapsed
    children: engineer pages
  }

  class AdminLayout {
    <<layout>>
    +AdminLayout()
    uses: Outlet, NavLink, useLanguage, getTranslation, ADMIN_SIDEBAR_ITEMS, Icon, MenuIcon, SidebarToggleIcon
    state: sidebarOpen, sidebarCollapsed
    children: AdminDashboard, RegisterManageWorkers, AdminSettings
  }

  %% ========== Pages ==========
  class Login {
    <<page>>
    +Login()
    uses: auth.validateCredentials, getRedirectForRole, sessionStorage
    form: userId, password
  }

  class WorkerInterface {
    <<page>>
    +WorkerInterface()
    uses: useLanguage, workerFlow (DEPARTMENTS, TASKS_BY_DEPARTMENT, ZONES), useAppStore, QRScanModal, WorkerSettingsModal, Icon
    flow: department → task → zone → lines → start/end
  }

  class EngineerHome {
    <<page>>
    +EngineerHome()
    uses: useAppStore (tasks, sessions), SECTION_ACTIONS, TASK_STATUS, Icon
    sections: action grid, active operations, analytics charts (bar, doughnut)
  }

  class RegisterManageWorkers {
    <<page>>
    +RegisterManageWorkers()
    uses: useAppStore (sessions), engineerWorkers (SEED_WORKERS, DEPARTMENT_OPTIONS), Icon
    CRUD workers, attendance-based status
  }

  class AssignTask {
    <<page>>
    +AssignTask()
    uses: useAppStore (tasks), assignTask (TASK_STATUS, ZONES, getInitialTasks), engineerWorkers (WORKERS), Icon
    batches, operation path, greenhouse overview, assign task modal
  }

  class MonitorActiveWork {
    <<page>>
    +MonitorActiveWork()
    uses: useAppStore (sessions), Icon
    list active sessions, notes
  }

  class RecordProduction {
    <<page>>
    +RecordProduction()
    uses: useAppStore (records, addRecord), recordEvent (RECORD_TYPES, ZONES, UNITS, QUALITY_OUTCOMES)
    form: record type, quantity, zone, quality, notes
  }

  class InventoryEquipment {
    <<page>>
    +InventoryEquipment()
    uses: useAppStore (inventory, equipment, updateInventoryItem, addInventoryItem), inventory (getInventoryStatus, EQUIPMENT_STATUS)
    list inventory/equipment, add, update, adjust
  }

  class LogFaultMaintenance {
    <<page>>
    +LogFaultMaintenance()
    uses: useAppStore (equipment, faults, maintenancePlans, addFault, addMaintenancePlan), faults (FAULT_CATEGORIES, SEVERITY_OPTIONS, MAINTENANCE_TYPES)
    fault log, plan maintenance modal
  }

  class ReportsAnalytics {
    <<page>>
    +ReportsAnalytics()
    uses: useAppStore (tasks, records, faults, inventory), engineerWorkers (DEPARTMENT_OPTIONS), assignTask (ZONES), inventory (getInventoryStatus)
    filters, summary cards, charts (production by dept, faults by equipment, quality by zone), export PDF/Excel
  }

  class EngineerSettings {
    <<page>>
    +EngineerSettings()
    uses: useLanguage, sessionStorage
    display user id, role; link to language
  }

  class EngineerSectionPlaceholder {
    <<page>>
    +EngineerSectionPlaceholder()
    uses: useParams, getTranslation
    placeholder for :section routes
  }

  class AdminDashboard {
    <<page>>
    +AdminDashboard()
    uses: useLanguage, getTranslation, adminNav, Icon
    internal analytics tabs, Power BI embed, quick actions
  }

  class AdminSettings {
    <<page>>
    +AdminSettings()
    uses: useLanguage, sessionStorage, powerBi config
    Power BI URL, user info, language
  }

  %% ========== Components ==========
  class ErrorBoundary {
    <<component (class)>>
    state: error
    getDerivedStateFromError()
    componentDidCatch()
    render(): fallback UI on error
  }

  class HeroIcons {
    <<component>>
    ICON_MAP
    Icon(name)
    MenuIcon(open)
    SidebarToggleIcon(collapsed)
  }

  class QRScanModal {
    <<component>>
    +QRScanModal(props)
    uses: html5-qrcode, Icon (camera)
    scan QR for worker ID
  }

  class WorkerSettingsModal {
    <<component>>
    +WorkerSettingsModal(props)
    display worker userId, role
  }

  %% ========== Data modules ==========
  class assignTask_data {
    <<data>>
    TASK_STATUS, TASK_STATUS_LABELS, TASK_TYPES, PRIORITY_OPTIONS, ZONES
    GRID_ROWS, GRID_COLS
    generateTaskId(), getInitialTasks(), getInitialRecords()
  }

  class engineerNav_data {
    <<data>>
    SIDEBAR_ITEMS, SECTION_ACTIONS
  }

  class adminNav_data {
    <<data>>
    ADMIN_SIDEBAR_ITEMS
  }

  class engineerWorkers_data {
    <<data>>
    ROLE_OPTIONS, DEPARTMENT_OPTIONS, SEED_WORKERS
    generateEmployeeId(), generateTempPassword(), getQRCodeUrl()
  }

  class workerFlow_data {
    <<data>>
    DEPARTMENTS, TASKS_BY_DEPARTMENT, ZONES
    getDepartment(), getTasksForDepartment(), getZone()
  }

  class inventory_data {
    <<data>>
    INVENTORY_CATEGORIES, INVENTORY_STATUS, EQUIPMENT_STATUS, EQUIPMENT_STATUS_LABELS
    getInitialInventory(), getInitialEquipment(), getInventoryStatus()
  }

  class faults_data {
    <<data>>
    FAULT_CATEGORIES, SEVERITY_OPTIONS, MAINTENANCE_TYPES
    getInitialFaults(), getInitialMaintenancePlans()
  }

  class monitorActive_data {
    <<data>>
    SESSION_STATUS, SESSION_STATUS_LABELS
    getInitialSessions(), getSessionStatus(), getElapsedMinutes()
  }

  class recordEvent_data {
    <<data>>
    RECORD_TYPES, ZONES, UNITS, QUALITY_OUTCOMES, SEVERITY_OPTIONS
  }

  %% ========== i18n & config ==========
  class translations_i18n {
    <<i18n>>
    translations { common, login, worker, engineer, admin }
    getTranslation(lang, section, key)
  }

  class powerBi_config {
    <<config>>
    getEmbedUrl()
    POWER_BI_STORAGE_KEY (in AdminSettings)
  }

  %% ========== Relationships ==========
  main_jsx --> ErrorBoundary
  main_jsx --> LanguageContext
  main_jsx --> AppStoreContext
  main_jsx --> App_jsx

  App_jsx --> Login
  App_jsx --> WorkerInterface
  App_jsx --> EngineerLayout
  App_jsx --> AdminLayout
  App_jsx --> auth_js

  Login --> auth_js

  EngineerLayout --> LanguageContext
  EngineerLayout --> translations_i18n
  EngineerLayout --> engineerNav_data
  EngineerLayout --> HeroIcons
  EngineerLayout --> EngineerHome
  EngineerLayout --> RegisterManageWorkers
  EngineerLayout --> AssignTask
  EngineerLayout --> MonitorActiveWork
  EngineerLayout --> RecordProduction
  EngineerLayout --> InventoryEquipment
  EngineerLayout --> LogFaultMaintenance
  EngineerLayout --> ReportsAnalytics
  EngineerLayout --> EngineerSettings
  EngineerLayout --> EngineerSectionPlaceholder

  AdminLayout --> LanguageContext
  AdminLayout --> translations_i18n
  AdminLayout --> adminNav_data
  AdminLayout --> HeroIcons
  AdminLayout --> AdminDashboard
  AdminLayout --> RegisterManageWorkers
  AdminLayout --> AdminSettings

  AppStoreContext --> assignTask_data
  AppStoreContext --> inventory_data
  AppStoreContext --> faults_data
  AppStoreContext --> monitorActive_data
  AppStoreContext --> engineerWorkers_data

  WorkerInterface --> LanguageContext
  WorkerInterface --> workerFlow_data
  WorkerInterface --> AppStoreContext
  WorkerInterface --> QRScanModal
  WorkerInterface --> WorkerSettingsModal
  WorkerInterface --> HeroIcons

  EngineerHome --> AppStoreContext
  EngineerHome --> assignTask_data
  EngineerHome --> engineerNav_data
  EngineerHome --> HeroIcons
  EngineerHome --> translations_i18n

  RegisterManageWorkers --> AppStoreContext
  RegisterManageWorkers --> engineerWorkers_data
  RegisterManageWorkers --> HeroIcons

  AssignTask --> AppStoreContext
  AssignTask --> assignTask_data
  AssignTask --> engineerWorkers_data
  AssignTask --> HeroIcons

  MonitorActiveWork --> AppStoreContext
  MonitorActiveWork --> HeroIcons

  RecordProduction --> AppStoreContext
  RecordProduction --> recordEvent_data

  InventoryEquipment --> AppStoreContext
  InventoryEquipment --> inventory_data

  LogFaultMaintenance --> AppStoreContext
  LogFaultMaintenance --> faults_data

  ReportsAnalytics --> AppStoreContext
  ReportsAnalytics --> engineerWorkers_data
  ReportsAnalytics --> assignTask_data
  ReportsAnalytics --> inventory_data

  AdminDashboard --> LanguageContext
  AdminDashboard --> translations_i18n
  AdminDashboard --> HeroIcons

  AdminSettings --> LanguageContext
  AdminSettings --> powerBi_config
```
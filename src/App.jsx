import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import Login from './pages/Login'
import WorkerInterface from './pages/WorkerInterface'
import EngineerLayout from './layouts/EngineerLayout'
import EngineerHome from './pages/engineer/EngineerHome'
import RegisterManageWorkers from './pages/engineer/RegisterManageWorkers'
import WorkerProfile from './pages/engineer/WorkerProfile'
import EngineerSectionPlaceholder from './pages/engineer/EngineerSectionPlaceholder'
import AssignTask from './pages/engineer/AssignTask'
import MonitorActiveWork from './pages/engineer/MonitorActiveWork'
import RecordProduction from './pages/engineer/RecordProduction'
import InventoryEquipment from './pages/engineer/InventoryEquipment'
import LogFaultMaintenance from './pages/engineer/LogFaultMaintenance'
import ReportsAnalytics from './pages/engineer/ReportsAnalytics'
import AdminLayout from './layouts/AdminLayout'
import AdminSettings from './pages/AdminSettings'
import EngineerSettings from './pages/engineer/EngineerSettings'
import { ROLES, getRedirectForRole } from './auth'

const ROLE_KEY = 'sarms-user-role'
const USER_ID_KEY = 'sarms-user-id'

function readSessionAuth() {
  if (typeof window === 'undefined') return { userId: null, role: null }
  const userId = sessionStorage.getItem(USER_ID_KEY)?.trim() || null
  const role = sessionStorage.getItem(ROLE_KEY)?.trim() || null
  return { userId, role }
}

/** Requires login; optional allow-list of roles redirects others to their home route. */
function RequireSession({ allow }) {
  const location = useLocation()
  const { userId, role } = readSessionAuth()
  if (!userId || !role) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (allow && !allow.includes(role)) {
    return <Navigate to={getRedirectForRole(role)} replace />
  }
  return <Outlet />
}

function LoginOrRedirectHome() {
  const { userId, role } = readSessionAuth()
  if (userId && role) return <Navigate to={getRedirectForRole(role)} replace />
  return <Login />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginOrRedirectHome />} />
      <Route path="/worker" element={<RequireSession allow={[ROLES.WORKER]} />}>
        <Route index element={<WorkerInterface />} />
      </Route>
      <Route path="/engineer" element={<RequireSession allow={[ROLES.ENGINEER]} />}>
        <Route element={<EngineerLayout />}>
          <Route index element={<EngineerHome />} />
          <Route path="register" element={<Navigate to="/engineer" replace />} />
          <Route path="register/worker/:id" element={<Navigate to="/engineer" replace />} />
          <Route path="assign-task" element={<AssignTask />} />
          <Route path="monitor" element={<MonitorActiveWork />} />
          <Route path="production" element={<RecordProduction />} />
          <Route path="inventory" element={<InventoryEquipment />} />
          <Route path="faults" element={<LogFaultMaintenance />} />
          <Route path="reports" element={<Navigate to="/engineer" replace />} />
          <Route path="settings" element={<EngineerSettings />} />
          <Route path=":section" element={<EngineerSectionPlaceholder />} />
        </Route>
      </Route>
      <Route path="/admin" element={<RequireSession allow={[ROLES.ADMIN]} />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/reports" replace />} />
          <Route path="register" element={<RegisterManageWorkers />} />
          <Route path="register/worker/:id" element={<WorkerProfile />} />
          <Route path="reports" element={<ReportsAnalytics />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Route>
      <Route path="/" element={<LoginOrRedirectHome />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

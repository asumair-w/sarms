import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
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

const ROLE_KEY = 'sarms-user-role'

function EngineerRouteGuard() {
  const role = typeof window !== 'undefined' ? sessionStorage.getItem(ROLE_KEY) : null
  if (role === 'admin') return <Navigate to="/admin" replace />
  return <Outlet />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/worker" element={<WorkerInterface />} />
      <Route path="/engineer" element={<EngineerRouteGuard />}>
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
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/reports" replace />} />
        <Route path="register" element={<RegisterManageWorkers />} />
        <Route path="register/worker/:id" element={<WorkerProfile />} />
        <Route path="reports" element={<ReportsAnalytics />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>
      <Route path="/" element={<Login />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

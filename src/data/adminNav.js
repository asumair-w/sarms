/**
 * Admin sidebar navigation.
 * faIcon: Font Awesome class name.
 */

/** Admin sidebar: Dashboard = General Reports (default), then Manage Workers, Settings */
export const ADMIN_SIDEBAR_ITEMS = [
  { path: '/admin/reports', labelKey: 'navDashboard', icon: 'chart-pie', faIcon: 'chart-pie', end: true },
  { path: '/admin/register', labelKey: 'navRegister', icon: 'users', faIcon: 'users', end: true },
  { path: '/admin/settings', labelKey: 'navSettings', icon: 'cog-6-tooth', faIcon: 'gear', end: true },
]

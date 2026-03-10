/**
 * Admin sidebar navigation.
 * faIcon: Font Awesome class name.
 */

/** Admin sidebar: Dashboard, Manage Workers (Settings is in footer above Log out) */
export const ADMIN_SIDEBAR_ITEMS = [
  { path: '/admin/reports', labelKey: 'navDashboard', icon: 'chart-pie', faIcon: 'chart-pie', end: true },
  { path: '/admin/register', labelKey: 'navRegister', icon: 'users', faIcon: 'users', end: true },
]

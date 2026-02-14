/**
 * Engineer sidebar and section navigation.
 * faIcon: Font Awesome class name (e.g. 'home' → fa-home)
 */

export const SIDEBAR_ITEMS = [
  { path: '/engineer', labelKey: 'navHome', icon: 'home', faIcon: 'house' },
  { path: '/engineer/register', labelKey: 'navRegister', icon: 'users', faIcon: 'users' },
  { path: '/engineer/assign-task', labelKey: 'navAssignTask', icon: 'clipboard-document-list', faIcon: 'list-check' },
  { path: '/engineer/monitor', labelKey: 'navMonitor', icon: 'signal', faIcon: 'tower-broadcast' },
  { path: '/engineer/production', labelKey: 'navProduction', icon: 'check-circle', faIcon: 'circle-check' },
  { path: '/engineer/inventory', labelKey: 'navInventory', icon: 'cube', faIcon: 'cubes' },
  { path: '/engineer/faults', labelKey: 'navFaults', icon: 'wrench', faIcon: 'wrench' },
  { path: '/engineer/reports', labelKey: 'navReports', icon: 'chart-bar', faIcon: 'chart-column' },
  { path: '/engineer/settings', labelKey: 'navSettings', icon: 'cog-6-tooth', faIcon: 'gear', end: true },
]

/** Same 6 action sections (excluding Home) for the green boxes on Home. */
export const SECTION_ACTIONS = SIDEBAR_ITEMS.filter((item) => item.path !== '/engineer')

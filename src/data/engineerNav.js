/**
 * Engineer sidebar and section navigation.
 * faIcon: Font Awesome class name (e.g. 'home' → fa-home)
 */

const HOME = { path: '/engineer', labelKey: 'navHome', icon: 'home', faIcon: 'house' }
const ASSIGN_TASK = { path: '/engineer/assign-task', labelKey: 'navAssignTask', icon: 'clipboard-document-list', faIcon: 'list-check' }
const MONITOR = { path: '/engineer/monitor', labelKey: 'navMonitor', icon: 'signal', faIcon: 'tower-broadcast' }
const PRODUCTION = { path: '/engineer/production', labelKey: 'navProduction', icon: 'check-circle', faIcon: 'circle-check' }
const INVENTORY = { path: '/engineer/inventory', labelKey: 'navInventory', icon: 'cube', faIcon: 'cubes' }
const FAULTS = { path: '/engineer/faults', labelKey: 'navFaults', icon: 'wrench', faIcon: 'wrench' }
const SETTINGS = { path: '/engineer/settings', labelKey: 'navSettings', icon: 'cog-6-tooth', faIcon: 'gear', end: true }

/** Sidebar grouped into labeled sections. Manage Workers and General Reports are admin-only. */
export const SIDEBAR_SECTIONS = [
  { id: 'dashboard', labelKey: 'navSectionDashboard', items: [HOME] },
  { id: 'operations', labelKey: 'navSectionOperations', items: [ASSIGN_TASK, MONITOR, PRODUCTION] },
  { id: 'resources', labelKey: 'navSectionResources', items: [INVENTORY, FAULTS] },
  { id: 'system', labelKey: 'navSectionSystem', items: [SETTINGS] },
]

/** Flat list of all items (for SECTION_ACTIONS and lookup). */
export const SIDEBAR_ITEMS = SIDEBAR_SECTIONS.flatMap((s) => s.items)

/** Same 6 action sections (excluding Home) for the green boxes on Home. */
export const SECTION_ACTIONS = SIDEBAR_ITEMS.filter((item) => item.path !== '/engineer')

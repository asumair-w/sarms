/**
 * Record Production & Quality – record types and options.
 */

export const RECORD_TYPES = [
  { id: 'production', label: 'Production Record' },
  { id: 'inventory', label: 'Inventory Record' },
]

export const ZONES = [
  { id: 'a', label: 'Zone A' },
  { id: 'b', label: 'Zone B' },
  { id: 'c', label: 'Zone C' },
  { id: 'd', label: 'Zone D' },
  { id: 'inventory', label: 'Inventory' },
]

export const UNITS = [
  { id: 'kg', label: 'kg' },
  { id: 'units', label: 'units' },
  { id: 'liters', label: 'liters' },
  { id: 'boxes', label: 'boxes' },
]

export const QUALITY_OUTCOMES = [
  { id: 'pass', label: 'Pass' },
  { id: 'fail', label: 'Fail' },
  { id: 'conditional', label: 'Conditional' },
]

export const SEVERITY_OPTIONS = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
]

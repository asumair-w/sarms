/**
 * Clear, readable IDs for SARMS. Prevents strange identifiers (e.g. mov1772657672123).
 * Uses prefix + number; if duplicate would occur, next number is used.
 *
 * Usage: getNextId(existingItems, 'record') → 'record-1', 'record-2', ...
 *        getNextId(records, 'R', { numericOnly: true }) → 'R28' (for R1, R2, ... R27)
 *        getNextId(faults, 'F', { pad: 3 }) → 'F007'
 */

/**
 * Get next ID: prefix + (max existing number + 1).
 * @param {Array<{ id: string }>} items - List of items with .id
 * @param {string} prefix - e.g. 'R', 'F', 'inv', 'eq', 'movement', 'mp', 'task'
 * @param {{ numericOnly?: boolean, pad?: number, suffix?: string }} opts
 *   - numericOnly: match only prefix + digits (e.g. R1, R28). Default true for single-char prefix.
 *   - pad: zero-pad number (e.g. pad 3 → F001, F007)
 *   - suffix: between prefix and number (e.g. prefix 'movement', suffix '-' → movement-1)
 * @returns {string}
 */
export function getNextId(items, prefix, opts = {}) {
  const list = Array.isArray(items) ? items : []
  const { pad, suffix = '' } = opts
  const fullPrefix = suffix ? `${prefix}${suffix}` : prefix
  const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i')
  let max = 0
  for (const item of list) {
    const id = item?.id ?? item
    if (typeof id !== 'string') continue
    const m = id.match(regex)
    if (m) {
      const n = parseInt(m[1], 10)
      if (!Number.isNaN(n)) max = Math.max(max, n)
    }
  }
  const next = max + 1
  const numStr = pad ? String(next).padStart(pad, '0') : String(next)
  return `${fullPrefix}${numStr}`
}

/** Record: R1, R2, ... R28 */
export function nextRecordId(records) {
  return getNextId(records, 'R', {})
}

/** Task: T001, T002 (3-digit to align with seed style T001A1 when needed) */
export function nextTaskId(tasks) {
  return getNextId(tasks, 'T', { pad: 3 })
}

/** Inventory movement: movement-1, movement-2 */
export function nextMovementId(movements) {
  return getNextId(movements, 'movement', { suffix: '-' })
}

/** Inventory item: inv1, inv2, ... inv13 */
export function nextInventoryItemId(inventory) {
  return getNextId(inventory, 'inv', {})
}

/** Equipment: eq1, eq2, ... eq9 */
export function nextEquipmentId(equipment) {
  return getNextId(equipment, 'eq', {})
}

/** Fault: F001, F002, ... F007 */
export function nextFaultId(faults) {
  return getNextId(faults, 'F', { pad: 3 })
}

/** Maintenance plan: mp1, mp2, ... mp6 */
export function nextMaintenancePlanId(plans) {
  return getNextId(plans, 'mp', {})
}

/** Session (from Assign): s1, s2 - use session-1 if we want clarity */
export function nextSessionId(sessions) {
  return getNextId(sessions, 'session', { suffix: '-' })
}

/** Batch id for a zone: 1, 2, 3 or batch-1. We use numeric 1,2,3 to match seed. */
export function nextBatchNumber(batchesInZone) {
  const list = Array.isArray(batchesInZone) ? batchesInZone : []
  let max = 0
  for (const b of list) {
    const id = b?.id ?? b
    const n = typeof id === 'string' ? parseInt(id, 10) : (typeof id === 'number' ? id : 0)
    if (!Number.isNaN(n)) max = Math.max(max, n)
  }
  return String(max + 1)
}

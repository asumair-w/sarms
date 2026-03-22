/**
 * Orchestrates equipment + equipment_tickets + resolved_tickets reads (single source, no merge with local).
 */

import { fetchEquipmentAppShaped, hasEquipmentMirrorActive } from './supabaseEquipmentAdapter'
import { fetchEquipmentTicketsMapped } from './supabaseEquipmentTicketsAdapter'
import { fetchResolvedTicketsAppShaped, fetchResolvedFaultsAndMaintenancePlans } from './supabaseResolvedTicketsAdapter'

export async function fetchEquipmentDomainAppShaped() {
  const equipment = await fetchEquipmentAppShaped()
  if (equipment === null) return null
  const open = await fetchEquipmentTicketsMapped(equipment)
  if (open == null) return null
  const resolvedTickets = await fetchResolvedTicketsAppShaped()
  if (resolvedTickets === null) return null
  const resolvedSplit = await fetchResolvedFaultsAndMaintenancePlans(equipment)
  if (resolvedSplit == null) return null
  return {
    equipment,
    faults: [...open.faults, ...resolvedSplit.faults],
    maintenancePlans: [...open.maintenancePlans, ...resolvedSplit.maintenancePlans],
    resolvedTickets,
  }
}

export function equipmentDomainHasAnyData(domain) {
  if (!domain) return false
  return (
    (domain.equipment && domain.equipment.length > 0) ||
    (domain.faults && domain.faults.length > 0) ||
    (domain.maintenancePlans && domain.maintenancePlans.length > 0) ||
    (domain.resolvedTickets && domain.resolvedTickets.length > 0)
  )
}

/** localStorage mode + Supabase mirror: hydrate from DB when there is any row, or when user has mirrored equipment before (so empty DB clears local list). */
export function equipmentDomainShouldHydrateReadTest(domain) {
  if (!domain) return false
  if (equipmentDomainHasAnyData(domain)) return true
  return hasEquipmentMirrorActive()
}

/** USE_SUPABASE mode: apply equipment domain whenever fetch succeeded (including empty list after deletes). */
export function equipmentDomainFetchedOk(domain) {
  return domain != null && typeof domain === 'object'
}

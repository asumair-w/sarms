import { isSupabaseConfigured } from '../lib/supabase'

/**
 * Data backend toggle: Supabase-only vs localStorage-only. No dual-sync.
 * Set in `.env`: VITE_USE_SUPABASE=true
 */
export const USE_SUPABASE =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_USE_SUPABASE === 'true'

export const USE_SUPABASE_ACTIVE = USE_SUPABASE && isSupabaseConfigured

if (USE_SUPABASE && !isSupabaseConfigured) {
  console.error(
    '[SARMS] VITE_USE_SUPABASE is true but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing; staying on local fallback where implemented'
  )
}

import { persistSetting } from '../lib/supabaseSchema'

/**
 * Power BI Publish-to-web embed URL.
 *
 * We keep the UI/iframe usage synchronous, so we load the URL into an in-memory cache
 * during Supabase bootstrap. localStorage remains only as a local fallback/cache.
 */
export const POWER_BI_EMBED_URL = ''
// Used as: settings.key in Supabase + legacy cache key in localStorage.
export const POWER_BI_STORAGE_KEY = 'sarms-powerbi-url'

let powerBiEmbedUrlCache = ''

export function setPowerBiEmbedUrlCache(url) {
  powerBiEmbedUrlCache = String(url ?? '').trim()
  // Optional cache for local/debug; may get purged in Supabase mode.
  try {
    if (powerBiEmbedUrlCache) localStorage.setItem(POWER_BI_STORAGE_KEY, powerBiEmbedUrlCache)
  } catch {}
}

export function getPowerBiEmbedUrl() {
  if (powerBiEmbedUrlCache) return powerBiEmbedUrlCache
  try {
    const stored = localStorage.getItem(POWER_BI_STORAGE_KEY)?.trim()
    if (stored) return stored
  } catch {}
  return POWER_BI_EMBED_URL || ''
}

export async function savePowerBiEmbedUrl(url) {
  const next = String(url ?? '').trim()
  setPowerBiEmbedUrlCache(next)

  // If Supabase is configured, persist permanently in settings table.
  // persistSetting() is a no-op when Supabase isn't configured.
  try {
    await persistSetting(POWER_BI_STORAGE_KEY, { url: next })
  } catch (e) {
    // If Supabase fails, fall back to local cache so the current session still works.
    try {
      if (next) localStorage.setItem(POWER_BI_STORAGE_KEY, next)
    } catch {}
  }
}

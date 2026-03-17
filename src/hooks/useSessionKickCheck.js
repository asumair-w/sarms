import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getActiveSessionForUser, SESSION_ID_STORAGE_KEY } from '../lib/supabaseSchema'
import { isSupabaseConfigured } from '../lib/supabase'

const USER_ID_KEY = 'sarms-user-id'
const ROLE_KEY = 'sarms-user-role'
const CHECK_INTERVAL_MS = 18_000
const FIRST_CHECK_DELAY_MS = 3_000

function clearSessionAndRedirect(navigate) {
  try {
    sessionStorage.removeItem(ROLE_KEY)
    sessionStorage.removeItem(USER_ID_KEY)
    sessionStorage.removeItem(SESSION_ID_STORAGE_KEY)
  } catch (_) {}
  navigate('/login', { replace: true })
}

/**
 * When Supabase is configured: polls the active session for the current user.
 * If another device logged in (session id in Supabase !== our session id), clears
 * session and redirects to login so only one device stays logged in.
 */
export function useSessionKickCheck() {
  const navigate = useNavigate()
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const userId = typeof window !== 'undefined' ? sessionStorage.getItem(USER_ID_KEY) : null
    if (!userId || !userId.trim()) return

    const mySessionId = typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_ID_STORAGE_KEY) : null
    if (!mySessionId) return

    function check() {
      const uid = sessionStorage.getItem(USER_ID_KEY)
      if (!uid) return
      getActiveSessionForUser(uid).then((currentSessionId) => {
        if (currentSessionId == null) return
        const mine = sessionStorage.getItem(SESSION_ID_STORAGE_KEY)
        if (mine !== currentSessionId) clearSessionAndRedirect(navigate)
      })
    }

    intervalRef.current = setInterval(check, CHECK_INTERVAL_MS)
    const firstCheckTimer = setTimeout(check, FIRST_CHECK_DELAY_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      clearTimeout(firstCheckTimer)
    }
  }, [navigate])
}

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'sarms_lang'

function getStoredLang(key) {
  try {
    const v = localStorage.getItem(key)
    if (v === 'ar' || v === 'en') return v
    return null
  } catch {
    return null
  }
}

function getInitialLang() {
  try {
    const userId = sessionStorage.getItem('sarms-user-id')
    if (userId) {
      const userLang = getStoredLang(`sarms_lang_${userId}`)
      if (userLang) return userLang
    }
    return getStoredLang(STORAGE_KEY) || 'en'
  } catch {
    return 'en'
  }
}

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(getInitialLang)

  useEffect(() => {
    const value = lang === 'ar' ? 'ar' : 'en'
    try {
      localStorage.setItem(STORAGE_KEY, value)
      const userId = sessionStorage.getItem('sarms-user-id')
      if (userId) localStorage.setItem(`sarms_lang_${userId}`, value)
    } catch {}
    const root = document.documentElement
    root.setAttribute('lang', value)
    root.setAttribute('dir', value === 'ar' ? 'rtl' : 'ltr')
  }, [lang])

  const setLang = useCallback((value) => {
    setLangState(value === 'ar' ? 'ar' : 'en')
  }, [])

  const syncLangFromUser = useCallback(() => {
    try {
      const userId = sessionStorage.getItem('sarms-user-id')
      if (userId) {
        const userLang = getStoredLang(`sarms_lang_${userId}`)
        if (userLang) setLangState(userLang)
      } else {
        const global = getStoredLang(STORAGE_KEY)
        if (global) setLangState(global)
      }
    } catch {}
  }, [])

  return (
    <LanguageContext.Provider value={{ lang, setLang, syncLangFromUser }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}

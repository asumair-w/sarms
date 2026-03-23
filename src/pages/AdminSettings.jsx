import { useState, useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { getTranslation } from '../i18n/translations'
import { POWER_BI_STORAGE_KEY } from '../config/powerBi'
import { resetSystem } from '../lib/resetSystem'
import styles from './AdminSettings.module.css'

function getStoredPowerBiUrl() {
  try {
    return localStorage.getItem(POWER_BI_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export default function AdminSettings() {
  const { lang, setLang } = useLanguage()
  const t = (key) => getTranslation(lang, 'admin', key)
  const [powerBiUrl, setPowerBiUrl] = useState('')
  const [powerBiSaved, setPowerBiSaved] = useState(false)
  const [account, setAccount] = useState({ userId: '', role: '' })

  useEffect(() => {
    setPowerBiUrl(getStoredPowerBiUrl())
  }, [])

  useEffect(() => {
    try {
      setAccount({
        userId: sessionStorage.getItem('sarms-user-id') || '—',
        role: sessionStorage.getItem('sarms-user-role') || '—',
      })
    } catch {
      setAccount({ userId: '—', role: '—' })
    }
  }, [])

  function handleSavePowerBi() {
    try {
      localStorage.setItem(POWER_BI_STORAGE_KEY, powerBiUrl.trim())
      setPowerBiSaved(true)
      setTimeout(() => setPowerBiSaved(false), 2000)
    } catch {
      setPowerBiSaved(false)
    }
  }

  function handleResetSystem() {
    const ok = window.confirm('Are you sure you want to reset the system? This will delete all data.')
    if (!ok) return
    try {
      resetSystem()
    } finally {
      window.location.reload()
    }
  }

  const isAdmin = account.role === 'admin'

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}><i className="fas fa-gear fa-fw" /> {t('settingsTitle')}</h1>

      <div className={styles.settingsGrid}>
        {/* General */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}><i className="fas fa-sliders fa-fw" /> {t('general')}</h2>
          <p className={styles.sectionDesc}>
            {t('generalDesc')}
          </p>
          <div className={styles.row}>
            <span className={styles.label}>{t('language')}</span>
            <div className={styles.langRow}>
              <button
                type="button"
                className={lang === 'en' ? styles.langBtnActive : styles.langBtn}
                onClick={() => setLang('en')}
                aria-pressed={lang === 'en'}
              >
                {t('english')}
              </button>
              <button
                type="button"
                className={lang === 'ar' ? styles.langBtnActive : styles.langBtn}
                onClick={() => setLang('ar')}
                aria-pressed={lang === 'ar'}
                data-lang="ar"
              >
                {t('arabic')}
              </button>
            </div>
          </div>
        </section>

        {/* Analytics / Reports */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('analyticsReports')}</h2>
          <p className={styles.sectionDesc}>
            {t('analyticsDesc')}
          </p>
          <div className={styles.row}>
            <label className={styles.label} htmlFor="powerbi-url">
              {t('powerBiEmbedUrl')}
            </label>
            <input
              id="powerbi-url"
              type="url"
              className={styles.input}
              value={powerBiUrl}
              onChange={(e) => setPowerBiUrl(e.target.value)}
              placeholder="https://app.powerbi.com/view?r=..."
              autoComplete="off"
            />
            <p className={styles.hint}>
              {t('powerBiHint')}
            </p>
            <button
              type="button"
              className={styles.saveBtn}
              onClick={handleSavePowerBi}
            >
              {t('saveUrl')}
              {powerBiSaved && <span className={styles.saved}>{t('saved')}</span>}
            </button>
          </div>
        </section>

        {/* Account */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}><i className="fas fa-user fa-fw" /> {t('account')}</h2>
          <p className={styles.sectionDesc}>
            {t('accountDesc')}
          </p>
          <div className={styles.accountRow}>
            <div className={styles.accountItem}>
              <span className={styles.accountLabel}>{t('userId')}</span>
              <span className={styles.accountValue}>{account.userId}</span>
            </div>
            <div className={styles.accountItem}>
              <span className={styles.accountLabel}>{t('role')}</span>
              <span className={styles.accountValue}>
                {(account.role && ['admin', 'engineer', 'worker'].includes(account.role)) ? t('role' + account.role.charAt(0).toUpperCase() + account.role.slice(1)) : account.role}
              </span>
            </div>
          </div>
        </section>

        {/* System (Admin only) */}
        {isAdmin && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>System</h2>
            <p className={styles.sectionDesc}>
              This action will permanently delete all system data and restore default accounts.
            </p>
            <button
              type="button"
              className={styles.resetSystemBtn}
              onClick={handleResetSystem}
            >
              Reset System
            </button>
          </section>
        )}
      </div>
    </div>
  )
}

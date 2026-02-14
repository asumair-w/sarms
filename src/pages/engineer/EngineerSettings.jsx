import { useState, useEffect } from 'react'
import { useLanguage } from '../../context/LanguageContext'
import { getTranslation } from '../../i18n/translations'
import styles from '../AdminSettings.module.css'

export default function EngineerSettings() {
  const { lang, setLang } = useLanguage()
  const t = (key) => getTranslation(lang, 'admin', key)
  const [account, setAccount] = useState({ userId: '', role: '' })

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

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}><i className="fas fa-gear fa-fw" /> {t('settingsTitle')}</h1>

      {/* General – Language */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('general')}</h2>
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
            >
              {t('arabic')}
            </button>
          </div>
        </div>
      </section>

      {/* Account */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><i className="fas fa-user fa-fw" /> {t('account')}</h2>
        <p className={styles.sectionDesc}>
          {t('accountDesc')}
        </p>
        <div className={styles.accountRow}>
          <span><span className={styles.accountLabel}>{t('userId')}</span> {account.userId}</span>
          <span><span className={styles.accountLabel}>{t('role')}</span> {(account.role && ['admin', 'engineer', 'worker'].includes(account.role)) ? t('role' + account.role.charAt(0).toUpperCase() + account.role.slice(1)) : account.role}</span>
        </div>
      </section>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { getTranslation } from '../i18n/translations'
import styles from './WorkerSettingsModal.module.css'
import sectionStyles from '../pages/AdminSettings.module.css'

export default function WorkerSettingsModal({ onClose }) {
  const { lang, setLang } = useLanguage()
  const t = (key) => getTranslation(lang, 'admin', key)
  const tWorker = (key) => getTranslation(lang, 'worker', key)
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
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="worker-settings-title" onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 id="worker-settings-title" className={styles.title}>{t('settingsTitle')}</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={tWorker('close')}
          >
            ×
          </button>
        </div>

        <section className={sectionStyles.section}>
          <h3 className={sectionStyles.sectionTitle}>{t('general')}</h3>
          <p className={sectionStyles.sectionDesc}>{t('generalDesc')}</p>
          <div className={sectionStyles.row}>
            <span className={sectionStyles.label}>{t('language')}</span>
            <div className={sectionStyles.langRow}>
              <button
                type="button"
                className={lang === 'en' ? sectionStyles.langBtnActive : sectionStyles.langBtn}
                onClick={() => setLang('en')}
                aria-pressed={lang === 'en'}
              >
                {t('english')}
              </button>
              <button
                type="button"
                className={lang === 'ar' ? sectionStyles.langBtnActive : sectionStyles.langBtn}
                onClick={() => setLang('ar')}
                aria-pressed={lang === 'ar'}
                data-lang="ar"
              >
                {t('arabic')}
              </button>
            </div>
          </div>
        </section>

        <section className={sectionStyles.section}>
          <h3 className={sectionStyles.sectionTitle}>{t('account')}</h3>
          <p className={sectionStyles.sectionDesc}>{t('accountDesc')}</p>
          <div className={sectionStyles.accountRow}>
            <span><span className={sectionStyles.accountLabel}>{t('userId')}</span> {account.userId}</span>
            <span><span className={sectionStyles.accountLabel}>{t('role')}</span> {(account.role && ['admin', 'engineer', 'worker'].includes(account.role)) ? t('role' + account.role.charAt(0).toUpperCase() + account.role.slice(1)) : account.role}</span>
          </div>
        </section>
      </div>
    </div>
  )
}

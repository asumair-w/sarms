import { useLanguage } from '../context/LanguageContext'
import { getTranslation } from '../i18n/translations'
import { USE_SUPABASE } from '../config/dataBackend'
import { useAppStore } from '../context/AppStoreContext'
import styles from './SupabaseBootstrapShell.module.css'

/**
 * When Supabase is the only data source: blocks the app until bootstrap finishes.
 * Shows loading or fatal error (no localStorage fallback).
 */
export default function SupabaseBootstrapShell({ children }) {
  const { dataStatus, dataError } = useAppStore()
  const { lang } = useLanguage()
  const t = (key) => getTranslation(lang, 'login', key)

  if (!USE_SUPABASE) return children

  if (dataStatus === 'loading') {
    return (
      <div className={styles.fullscreen} role="status" aria-live="polite">
        <div className={styles.panel}>
          <div className={styles.spinner} aria-hidden />
          <p className={styles.message}>{t('bootstrapLoading')}</p>
        </div>
      </div>
    )
  }

  if (dataStatus === 'error') {
    return (
      <div className={styles.fullscreen} role="alert">
        <div className={styles.panel}>
          <h1 className={styles.title}>{t('bootstrapErrorTitle')}</h1>
          <p className={styles.message}>{t('bootstrapErrorBody')}</p>
          {dataError ? (
            <pre className={styles.detail}>{dataError}</pre>
          ) : null}
          <button type="button" className={styles.retry} onClick={() => window.location.reload()}>
            {t('bootstrapRetry')}
          </button>
        </div>
      </div>
    )
  }

  return children
}

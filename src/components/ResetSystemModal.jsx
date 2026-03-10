import { useState } from 'react'
import { getTranslation } from '../i18n/translations'
import { useLanguage } from '../context/LanguageContext'
import { executeFullReset } from '../lib/resetSystem'
import styles from './ResetSystemModal.module.css'

const CONFIRM_PHRASE = 'RESET'

export default function ResetSystemModal({ onClose, isAdmin, adminUserId }) {
  const { lang } = useLanguage()
  const t = (key) => getTranslation(lang, 'admin', key)
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const match = typed.trim().toUpperCase() === CONFIRM_PHRASE
  const canConfirm = match && isAdmin && !loading

  async function handleConfirm() {
    if (!canConfirm || !isAdmin) return
    setError(null)
    setLoading(true)
    try {
      await executeFullReset(adminUserId)
    } catch (e) {
      setError(e?.message || t('resetError'))
      setLoading(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="reset-modal-title">
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <h2 id="reset-modal-title" className={styles.title}>{t('resetSystem')}</h2>
          <p className={styles.denied}>{t('resetAdminOnly')}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>{t('resetCancel')}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="reset-modal-title">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 id="reset-modal-title" className={styles.title}><span className={styles.warningIcon}>⚠</span> {t('resetSystem')}</h2>
        <div className={styles.warningBlock}>
          <p className={styles.warningTitle}>{t('resetWarningTitle')}</p>
          <p className={styles.warningText}>{t('resetWarningMessage')}</p>
        </div>
        <div className={styles.confirmRow}>
          <label className={styles.label} htmlFor="reset-confirm-input">{t('resetTypeConfirm')}</label>
          <input
            id="reset-confirm-input"
            type="text"
            className={styles.input}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            autoComplete="off"
            disabled={loading}
          />
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={loading}>
            {t('resetCancel')}
          </button>
          <button
            type="button"
            className={styles.btnDanger}
            onClick={handleConfirm}
            disabled={!canConfirm}
            aria-describedby={!match ? 'reset-confirm-hint' : undefined}
          >
            {loading ? t('resetInProgress') || 'Resetting…' : t('resetConfirm')}
          </button>
        </div>
        {!match && typed.length > 0 && (
          <p id="reset-confirm-hint" className={styles.hint}>{t('resetTypeHint')}</p>
        )}
      </div>
    </div>
  )
}

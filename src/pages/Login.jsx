import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { validateCredentials, validateUserIdFromQR, getRedirectForRole } from '../auth'
import { useLanguage } from '../context/LanguageContext'
import { getTranslation } from '../i18n/translations'
import { setActiveSessionForUser } from '../lib/supabaseSchema'
import LoginStyles from './Login.module.css'
import QRScanModal from '../components/QRScanModal'

const ERROR_KEYS = {
  'Invalid ID or password': 'errorInvalid',
  'Invalid or expired QR Code': 'errorQR',
  'Inactive or unauthorized user': 'errorInactive',
  'Camera access denied': 'errorCamera',
}

export default function Login() {
  const navigate = useNavigate()
  const { lang, setLang, syncLangFromUser } = useLanguage()
  const t = (key) => getTranslation(lang, 'login', key)

  useEffect(() => {
    syncLangFromUser()
  }, [syncLangFromUser])

  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = validateCredentials(userId, password)
    if (!result.ok) {
      setLoading(false)
      const errKey = ERROR_KEYS[result.error] || 'errorInvalid'
      setError(t(errKey))
      return
    }
    sessionStorage.setItem('sarms-user-role', result.role)
    sessionStorage.setItem('sarms-user-id', userId)
    try {
      await setActiveSessionForUser(userId)
    } finally {
      setLoading(false)
    }
    navigate(getRedirectForRole(result.role), { replace: true, state: { userId } })
  }

  async function handleQRSuccess(resolvedUserId) {
    setError('')
    const result = validateUserIdFromQR(resolvedUserId)
    if (!result.ok) {
      const errKey = ERROR_KEYS[result.error] || 'errorQR'
      setError(t(errKey))
      return
    }
    sessionStorage.setItem('sarms-user-role', result.role)
    sessionStorage.setItem('sarms-user-id', resolvedUserId)
    await setActiveSessionForUser(resolvedUserId)
    setShowQRModal(false)
    navigate(getRedirectForRole(result.role), { replace: true, state: { userId: resolvedUserId } })
  }

  return (
    <div className={LoginStyles.page}>
      <div className={LoginStyles.card}>
        <img
          src="/logo-sarms.png"
          alt="SARMS"
          className={LoginStyles.logo}
        />
        <h1 className={LoginStyles.title}><i className="fas fa-building-user fa-fw" /> {t('title')}</h1>
        <p className={LoginStyles.subtitle}>{t('subtitle')}</p>
        <div className={LoginStyles.langSwitcher}>
          <button
            type="button"
            className={lang === 'en' ? LoginStyles.langActive : LoginStyles.langBtn}
            onClick={() => setLang('en')}
            aria-pressed={lang === 'en'}
          >
            {t('english')}
          </button>
          <button
            type="button"
            className={lang === 'ar' ? LoginStyles.langActive : LoginStyles.langBtn}
            onClick={() => setLang('ar')}
            aria-pressed={lang === 'ar'}
            data-lang="ar"
          >
            {t('arabic')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className={LoginStyles.form}>
          <div className={LoginStyles.field}>
            <label className={LoginStyles.label} htmlFor="userId"><i className="fas fa-id-card fa-fw" /> {t('id')}</label>
            <input
              id="userId"
              type="text"
              className={LoginStyles.input}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              autoComplete="username"
              autoCapitalize="off"
              disabled={loading}
            />
          </div>
          <div className={LoginStyles.field}>
            <label className={LoginStyles.label} htmlFor="password"><i className="fas fa-lock fa-fw" /> {t('password')}</label>
            <input
              id="password"
              type="password"
              className={LoginStyles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={loading}
            />
          </div>
          {error && <p className={LoginStyles.error} role="alert">{error}</p>}
          <button type="submit" className={LoginStyles.primaryButton} disabled={loading}>
            {t('logIn')}
          </button>
        </form>

        <div className={LoginStyles.separator}>
          <span className={LoginStyles.separatorLine} />
          <span className={LoginStyles.separatorText}>{t('or')}</span>
          <span className={LoginStyles.separatorLine} />
        </div>

        <button
          type="button"
          className={LoginStyles.primaryButton}
          onClick={() => { setError(''); setShowQRModal(true); }}
        >
          <i className="fas fa-qrcode fa-fw" /> {t('scanQR')}
        </button>
      </div>

      {showQRModal && (
        <QRScanModal
          onClose={() => setShowQRModal(false)}
          onSuccess={handleQRSuccess}
        />
      )}
    </div>
  )
}

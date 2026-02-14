import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode'
import { useLanguage } from '../context/LanguageContext'
import { getTranslation } from '../i18n/translations'
import QRScanStyles from './QRScanModal.module.css'

export default function QRScanModal({ onClose, onSuccess }) {
  const { lang } = useLanguage()
  const t = (key) => getTranslation(lang, 'qr', key)

  const containerRef = useRef(null)
  const [manualId, setManualId] = useState('')
  const [cameraError, setCameraError] = useState(null)
  const [cameraReady, setCameraReady] = useState(false)
  const scannerRef = useRef(null)

  /** Stop scanner only if it's running/paused; swallow errors (state + DOM removeChild). */
  const safeStopScanner = () => {
    const scanner = scannerRef.current
    if (!scanner) return
    try {
      const state = scanner.getState()
      if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
        scanner.stop().catch(() => {})
      }
    } catch (_) {
      // Ignore "Cannot stop" and any DOM errors
    }
    scannerRef.current = null
  }

  const handleClose = () => {
    safeStopScanner()
    onClose()
  }

  useEffect(() => {
    let mounted = true
    const startScan = async () => {
      // Wait for modal DOM to be laid out so #qr-reader has dimensions
      await new Promise((r) => {
        requestAnimationFrame(() => setTimeout(r, 100))
      })
      if (!mounted) return
      const el = document.getElementById('qr-reader')
      if (!el) return
      try {
        const scanner = new Html5Qrcode('qr-reader')
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (decodedText) => {
            if (!mounted) return
            safeStopScanner()
            onSuccess(decodedText.trim())
          },
          () => {}
        )
        if (mounted) setCameraReady(true)
      } catch (err) {
        if (mounted) setCameraError(t('cameraError'))
      }
    }
    startScan()
    return () => {
      mounted = false
      safeStopScanner()
    }
  }, [onSuccess])

  function handleManualSubmit(e) {
    e.preventDefault()
    const id = manualId.trim()
    if (id) onSuccess(id)
  }

  const modalContent = (
    <div
      className={QRScanStyles.page}
      role="dialog"
      aria-modal="true"
      aria-label={t('heading')}
      style={{ background: '#1e293b' }}
    >
      <div className={QRScanStyles.card} style={{ minHeight: 320, background: '#fefdfb' }}>
        <button
          type="button"
          className={QRScanStyles.closeButton}
          onClick={handleClose}
          aria-label={t('cancel')}
        >
          ×
        </button>

        <header className={QRScanStyles.header}>
          <h1 className={QRScanStyles.title} style={{ color: '#0f172a', margin: 0 }}>
            {t('heading')}
          </h1>
          <p className={QRScanStyles.subtitle} style={{ color: '#64748b', margin: 0 }}>
            {t('subheading')}
          </p>
        </header>

        <div className={QRScanStyles.scanSection}>
          <div className={QRScanStyles.readerWrap}>
            <div
              id="qr-reader"
              ref={containerRef}
              className={QRScanStyles.reader}
              aria-label={t('heading')}
              style={{ width: '100%', height: 280 }}
            />
            {!cameraError && !cameraReady && (
              <div className={QRScanStyles.readerPlaceholder} aria-hidden="true">
                <span className={QRScanStyles.readerSpinner} />
                <span>{t('startingCamera')}</span>
              </div>
            )}
            {cameraError && (
              <div className={QRScanStyles.readerFallback}>
                <i className={`fas fa-camera fa-fw ${QRScanStyles.fallbackIcon}`} />
                <p>{cameraError}</p>
                <p className={QRScanStyles.fallbackHint}>{t('enterUserId')}</p>
              </div>
            )}
          </div>
        </div>

        <div className={QRScanStyles.divider}>
          <span className={QRScanStyles.dividerLine} />
          <span className={QRScanStyles.dividerText}>{t('or')}</span>
          <span className={QRScanStyles.dividerLine} />
        </div>

        <section className={QRScanStyles.manualSection}>
          <p className={QRScanStyles.manualTitle}>{t('orEnterUserId')}</p>
          <form onSubmit={handleManualSubmit} className={QRScanStyles.manualForm}>
            <input
              id="manualUserId"
              type="text"
              className={QRScanStyles.manualInput}
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder={t('placeholder')}
              autoComplete="off"
              autoFocus={!!cameraError}
            />
            <button type="submit" className={QRScanStyles.manualButton} disabled={!manualId.trim()}>
              {t('logIn')}
            </button>
          </form>
        </section>

        <button type="button" className={QRScanStyles.cancelTextButton} onClick={handleClose}>
          {t('cancel')}
        </button>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

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
      const facingModes = ['environment', 'user']
      let lastErr = null

      // Try multiple facing modes for better device compatibility.
      for (const facingMode of facingModes) {
        let scanner = null
        try {
          scanner = new Html5Qrcode('qr-reader')
          scannerRef.current = scanner
          await scanner.start(
            { facingMode },
            { fps: 15, qrbox: { width: 350, height: 350 } },
            (decodedText) => {
              if (!mounted) return
              safeStopScanner()
              onSuccess(decodedText.trim())
            },
            () => {}
          )
          if (mounted) setCameraReady(true)
          return
        } catch (err) {
          lastErr = err
          try {
            await scanner?.stop?.()
          } catch (_) {}
          scannerRef.current = null
        }
      }

      if (mounted) {
        // If we couldn't start the camera/scanner, show a clear message.
        // (We don't expose `lastErr` to avoid leaking implementation details.)
        setCameraError(t('cameraError'))
      }
    }
    startScan()
    return () => {
      mounted = false
      safeStopScanner()
    }
  }, [onSuccess])

  const modalContent = (
    <div
      className={QRScanStyles.page}
      role="dialog"
      aria-modal="true"
      aria-label={t('heading')}
      style={{ background: '#1e293b' }}
    >
      <div className={QRScanStyles.card} style={{ minHeight: 420, background: '#fefdfb' }}>
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
              style={{ width: '100%', height: 400 }}
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
                <p className={QRScanStyles.fallbackHint}>{t('useLoginInstead')}</p>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className={QRScanStyles.backToLoginBottomButton}
          onClick={handleClose}
        >
          {t('backToLogin')}
        </button>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

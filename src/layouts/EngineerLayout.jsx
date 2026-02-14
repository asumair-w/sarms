import { useState, useEffect } from 'react'
import { Outlet, useLocation, NavLink, useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { getTranslation } from '../i18n/translations'
import { SIDEBAR_ITEMS } from '../data/engineerNav'
import styles from './EngineerLayout.module.css'

const STORAGE_KEY = 'sarms-sidebar-collapsed'

function getStoredCollapsed() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

export default function EngineerLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const t = (key) => getTranslation(lang, 'engineer', key)
  const currentPath = location.pathname
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getStoredCollapsed)

  useEffect(() => {
    setSidebarOpen(false)
  }, [currentPath])

  function toggleSidebarCollapse() {
    setSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false')
      return next
    })
  }

  const currentItem = SIDEBAR_ITEMS.find((i) => i.path === currentPath)
  const currentLabel = currentItem ? t(currentItem.labelKey) : t('navHome')

  return (
    <div className={styles.wrapper}>
      <header className={styles.topBar}>
        <button
          type="button"
          className={styles.menuBtn}
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label={t('toggleMenu')}
        >
          <i className={`fas fa-fw ${sidebarOpen ? 'fa-times' : 'fa-bars'}`} />
        </button>
        <div className={styles.topBarLogoWrap}>
          <img src="/logo.png" alt="SARMS" className={styles.topBarLogo} />
        </div>
        <h1 className={styles.pageTitle}>{t('layoutTitle')}</h1>
        <span className={styles.sectionIndicator}>
          {currentLabel}
        </span>
      </header>

      <div
        className={`${styles.overlay} ${sidebarOpen ? styles.overlayVisible : ''}`}
        aria-hidden={!sidebarOpen}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <button
          type="button"
          className={styles.sidebarToggle}
          onClick={toggleSidebarCollapse}
          aria-label={sidebarCollapsed ? t('expandSidebar') : t('collapseSidebar')}
          title={sidebarCollapsed ? t('expandSidebar') : t('collapseSidebar')}
        >
          <i className={`fas fa-fw fa-chevron-${sidebarCollapsed ? 'right' : 'left'}`} />
        </button>
        <nav className={styles.sidebarNav}>
          {SIDEBAR_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                isActive ? `${styles.sidebarItem} ${styles.sidebarItemActive}` : styles.sidebarItem
              }
              end={item.path === '/engineer' || item.end === true}
            >
              <i className={`fas fa-${item.faIcon || item.icon} fa-fw ${styles.sidebarIcon}`} />
              <span className={styles.sidebarLabel}>{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          className={styles.logoutBtn}
          onClick={() => {
            sessionStorage.removeItem('sarms-user-role')
            sessionStorage.removeItem('sarms-user-id')
            navigate('/login', { replace: true })
          }}
        >
          <i className="fas fa-right-from-bracket fa-fw" /> {t('logOut')}
        </button>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}

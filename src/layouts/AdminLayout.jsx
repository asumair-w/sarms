import { useState, useEffect, useRef, Fragment } from 'react'
import { Outlet, useLocation, NavLink, useNavigate, Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { getTranslation } from '../i18n/translations'
import { ADMIN_SIDEBAR_ITEMS } from '../data/adminNav'
import { useSessionKickCheck } from '../hooks/useSessionKickCheck'
import styles from './AdminLayout.module.css'

const STORAGE_KEY = 'sarms-sidebar-collapsed'
const USER_ID_KEY = 'sarms-user-id'

function getStoredCollapsed() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

export default function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { lang, syncLangFromUser } = useLanguage()
  const t = (key) => getTranslation(lang, 'admin', key)
  const currentPath = location.pathname
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getStoredCollapsed)
  const [userDropdownOpen, setUserDropdownOpen] = useState(false)
  const [userId, setUserId] = useState(() => (typeof window !== 'undefined' ? sessionStorage.getItem(USER_ID_KEY) : null) || '')
  const userDropdownRef = useRef(null)

  useEffect(() => {
    setUserId(typeof window !== 'undefined' ? sessionStorage.getItem(USER_ID_KEY) : null)
  }, [currentPath])

  useEffect(() => {
    syncLangFromUser()
  }, [syncLangFromUser])

  useEffect(() => {
    setSidebarOpen(false)
  }, [currentPath])

  useSessionKickCheck()

  useEffect(() => {
    if (!userDropdownOpen) return
    function handleClickOutside(e) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target)) setUserDropdownOpen(false)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [userDropdownOpen])

  function handleLogout() {
    setUserDropdownOpen(false)
    sessionStorage.removeItem('sarms-user-role')
    sessionStorage.removeItem(USER_ID_KEY)
    try { sessionStorage.removeItem('sarms-session-id') } catch (_) {}
    navigate('/login', { replace: true })
  }

  function toggleSidebarCollapse() {
    /* On mobile when sidebar is open as overlay: collapse button closes the sidebar */
    if (sidebarOpen) {
      setSidebarOpen(false)
      return
    }
    setSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false')
      return next
    })
  }

  const currentItem = ADMIN_SIDEBAR_ITEMS.find((i) => i.path === currentPath) ??
    ADMIN_SIDEBAR_ITEMS.find((i) => i.external && currentPath.startsWith(i.path))
  const currentLabel = currentPath === '/admin/settings' ? t('navSettings') : (currentItem ? t(currentItem.labelKey) : t('navHome'))

  return (
    <div className={`${styles.wrapper} ${sidebarOpen ? styles.wrapperSidebarOpen : ''} ${lang === 'ar' ? styles.wrapperRtl : ''}`}>
      <header className={styles.topBar}>
        <button
          type="button"
          className={styles.menuBtn}
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label={t('toggleMenu')}
        >
          <i className={`fas fa-fw ${sidebarOpen ? 'fa-times' : 'fa-bars'}`} />
        </button>
        <div className={styles.topBarLeft}>
          <div className={styles.topBarLogoWrap}>
            <img src="/logo-sarms-white.png" alt="SARMS" className={styles.topBarLogo} />
          </div>
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <Link to="/admin/reports" className={styles.breadcrumbLink}>{t('layoutTitle')}</Link>
            <span className={styles.breadcrumbSep} aria-hidden> / </span>
            <span className={styles.sectionIndicator}>{currentLabel}</span>
          </nav>
        </div>
        <div className={`${styles.topBarRight} ${styles.topBarUserBlock}`} ref={userDropdownRef}>
          <button
            type="button"
            className={styles.userMenuBtn}
            onClick={() => setUserDropdownOpen((o) => !o)}
            aria-expanded={userDropdownOpen}
            aria-haspopup="true"
            aria-label={t('loggedInAs')}
          >
            <i className="fas fa-user-circle fa-fw" aria-hidden />
            <span className={styles.userMenuLabel}>{userId || '—'}</span>
            <i className={`fas fa-chevron-down fa-fw ${styles.userMenuCaret} ${userDropdownOpen ? styles.userMenuCaretOpen : ''}`} aria-hidden />
          </button>
          {userDropdownOpen && (
            <div className={styles.userDropdown} role="menu">
              <div className={styles.userDropdownHeader}>
                <span className={styles.userDropdownLabel}>{t('loggedInAs')}</span>
                <span className={styles.userDropdownId}>{userId || '—'}</span>
              </div>
              <Link to="/admin/settings" className={styles.userDropdownItem} role="menuitem" onClick={() => setUserDropdownOpen(false)}>
                <i className="fas fa-gear fa-fw" /> {t('navSettings')}
              </Link>
              <button type="button" className={styles.userDropdownItem} role="menuitem" onClick={handleLogout}>
                <i className="fas fa-right-from-bracket fa-fw" /> {t('logOut')}
              </button>
            </div>
          )}
        </div>
      </header>

      <div
        className={`${styles.overlay} ${sidebarOpen ? styles.overlayVisible : ''}`}
        aria-hidden={!sidebarOpen}
        onClick={() => setSidebarOpen(false)}
        onPointerDown={(e) => {
          if (sidebarOpen) {
            e.preventDefault()
            setSidebarOpen(false)
          }
        }}
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
        <nav className={styles.sidebarNav} aria-label="Main navigation">
          {ADMIN_SIDEBAR_ITEMS.map((item, index) => (
            <Fragment key={item.path}>
              {index > 0 && <div className={styles.sidebarSectionDivider} aria-hidden />}
              <NavLink
                to={item.path}
                end={item.end !== false}
                className={({ isActive }) =>
                  isActive ? `${styles.sidebarItem} ${styles.sidebarItemActive}` : styles.sidebarItem
                }
              >
                <i className={`fas fa-${item.faIcon || item.icon} fa-fw ${styles.sidebarIcon}`} />
                <span className={styles.sidebarLabel}>{t(item.labelKey)}</span>
              </NavLink>
            </Fragment>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <div className={styles.sidebarSectionDivider} aria-hidden />
          <NavLink
            to="/admin/settings"
            className={({ isActive }) =>
              isActive ? `${styles.sidebarItem} ${styles.sidebarItemActive} ${styles.sidebarFooterItem}` : `${styles.sidebarItem} ${styles.sidebarFooterItem}`
            }
            end
            title={sidebarCollapsed ? t('navSettings') : undefined}
          >
            <i className={`fas fa-gear fa-fw ${styles.sidebarIcon}`} />
            <span className={styles.sidebarLabel}>{t('navSettings')}</span>
          </NavLink>
          <button
            type="button"
            className={styles.logoutBtn}
            onClick={handleLogout}
          >
            <i className="fas fa-right-from-bracket fa-fw" /> {t('logOut')}
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}

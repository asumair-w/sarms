import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import { AppStoreProvider } from './context/AppStoreContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ensureDefaultAccountsSeeded } from './lib/defaultAccounts'
import App from './App'
import './index.css'

function showBootstrapError(message, detail) {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `
    <div class="sarms-error-box" style="max-width:600px;padding:2rem;margin:auto;background:#1e293b;border-radius:12px;border:1px solid #475569;color:#f8fafc;font-family:system-ui,sans-serif;">
      <h1 style="margin:0 0 1rem;font-size:1.25rem;color:#fca5a5;">SARMS failed to load</h1>
      <pre style="margin:0 0 1rem;padding:1rem;background:#0f172a;border-radius:8px;overflow:auto;font-size:0.8rem;color:#fca5a5;white-space:pre-wrap;word-break:break-all;">${(message + (detail ? '\n\n' + detail : '')).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
      <p style="margin:0 0 1rem;font-size:0.9rem;color:#94a3b8;">Open DevTools (F12) → Console for the full error.</p>
      <button onclick="location.reload()" style="padding:0.5rem 1rem;font-size:1rem;cursor:pointer;background:#22c55e;color:#fff;border:none;border-radius:8px;">Reload page</button>
    </div>
  `
}

try {
  ensureDefaultAccountsSeeded()
  const rootEl = document.getElementById('root')
  if (!rootEl) {
    document.body.innerHTML = '<div style="padding:2rem;color:#fca5a5;">No #root element found.</div>'
  } else {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <ErrorBoundary>
          <LanguageProvider>
            <BrowserRouter>
              <AppStoreProvider>
                <App />
              </AppStoreProvider>
            </BrowserRouter>
          </LanguageProvider>
        </ErrorBoundary>
      </React.StrictMode>,
    )
  }
} catch (err) {
  console.error('SARMS bootstrap error:', err)
  showBootstrapError(err?.message ?? String(err), err?.stack)
}

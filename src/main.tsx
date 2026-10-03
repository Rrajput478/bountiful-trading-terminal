import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import * as api from './services/api'

/*
 * Inside the APK the app is served from `file:///android_asset/index.html`,
 * where path-based routing cannot work: `/settings` would resolve to the
 * filesystem root and fail to load. Hash routing works on both origins, so it
 * is used there and the plain path router is kept for the web build.
 */
const Router = api.isNative() ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
)

/*
 * Register the service worker so the terminal is installable from a browser on
 * Android and iOS. It is skipped in the native shell: that app is already
 * installed, and a worker on a file:// origin cannot register at all.
 */
if (!api.isNative() && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // An install prompt is still possible without a worker, so never break
      // the app over this - just report it.
      console.warn('Service worker registration failed:', err)
    })
  })
}
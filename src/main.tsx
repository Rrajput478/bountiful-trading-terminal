import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

/*
 * A single path-based router for every surface.
 *
 * The Android shell loads the app from the terminal server over https, so
 * path routing and deep links work exactly as they do in a browser. An earlier
 * `file://` shell needed hash routing instead; that is no longer how the app is
 * packaged.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

/*
 * Register the service worker so the terminal is installable from a browser on
 * Android and iOS. It is skipped in dev, where a cached shell would serve stale
 * assets and make hot reload look broken.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installation is a progressive enhancement: the app works without it.
    })
  })
}
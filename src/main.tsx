import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

/*
 * Register the service worker so the terminal is installable on Android and
 * iOS. Only runs in production builds: in dev it would serve a stale cached
 * shell and make hot reload look broken.
 */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // An install prompt is still possible without a worker, so never break
      // the app over this - just report it.
      console.warn('Service worker registration failed:', err)
    })
  })
}
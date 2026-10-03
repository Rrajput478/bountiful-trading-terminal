import { useEffect, useState } from 'react'

/**
 * Install prompt for the trading terminal.
 *
 * Android/Chrome fires `beforeinstallprompt`, which we capture and turn into a
 * real button instead of relying on a user knowing about the browser menu. iOS
 * Safari never fires that event, so it gets the manual "Share -> Add to Home
 * Screen" instructions instead.
 *
 * The banner is only a convenience - the app is installable either way.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'bountiful.installDismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari reports installation this way instead.
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ reports as Mac, so check for touch points too.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIOSHint, setShowIOSHint] = useState(false)

  useEffect(() => {
    if (isStandalone()) return

    const dismissed = localStorage.getItem(DISMISS_KEY) === '1'
    if (dismissed) return

    const onPrompt = (e: Event) => {
      // Prevent the mini-infobar; we show our own UI instead.
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }

    const onInstalled = () => {
      setDeferred(null)
      localStorage.removeItem(DISMISS_KEY)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)

    // iOS gets the manual hint shortly after first load.
    if (isIOS()) {
      const t = setTimeout(() => setShowIOSHint(true), 2500)
      return () => {
        clearTimeout(t)
        window.removeEventListener('beforeinstallprompt', onPrompt)
        window.removeEventListener('appinstalled', onInstalled)
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDeferred(null)
    setShowIOSHint(false)
  }

  const install = async () => {
    if (!deferred) return
    try {
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      if (outcome === 'accepted') setDeferred(null)
    } catch {
      // A failed prompt is not worth interrupting the user over.
    }
  }

  if (!deferred && !showIOSHint) return null

  return (
    <div className="install-bar" role="status">
      <div className="install-text">
        {deferred ? (
          <>
            <strong>Install Bountiful</strong>
            <span>Add the terminal to your home screen for full-screen access.</span>
          </>
        ) : (
          <>
            <strong>Add to your home screen</strong>
            <span>Tap Share, then &ldquo;Add to Home Screen&rdquo; in Safari.</span>
          </>
        )}
      </div>
      <div className="install-actions">
        {deferred && (
          <button type="button" className="btn primary" onClick={install}>
            Install
          </button>
        )}
        <button type="button" className="icon-btn" onClick={dismiss} aria-label="Dismiss install hint">
          ×
        </button>
      </div>
    </div>
  )
}
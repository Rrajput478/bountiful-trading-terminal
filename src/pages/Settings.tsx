import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import * as api from '../services/api'
import './Settings.css'

/**
 * Broker credentials, stored in the Android Keystore.
 *
 * The secret is handed straight to the native bridge and never held in React
 * state beyond the submit call, never logged, and cannot be read back — there
 * is no getter on the bridge. Refusing to run in a browser is deliberate: a key
 * typed into a web page is a key in a browser's memory, in history, and in
 * devtools.
 */
export default function Settings() {
  const navigate = useNavigate()
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [configured, setConfigured] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const native = api.isNative()

  useEffect(() => {
    setConfigured(api.hasCredentials())
  }, [])

  const save = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.saveCredentials(apiKey.trim(), apiSecret.trim())
      // Wipe the inputs: the plaintext must not linger in the DOM.
      setApiKey('')
      setApiSecret('')
      setConfigured(true)
      setMessage('Saved to this device’s secure keystore.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the key.')
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await api.verifyCredentials()
      setMessage(`Connected as ${res.username || res.email || res.user_id || 'your account'}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not verify the key.')
    } finally {
      setBusy(false)
    }
  }

  const forget = async () => {
    setBusy(true)
    try {
      await api.clearCredentials()
      setConfigured(false)
      setMessage('Key removed from this device.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the key.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-bar">
        <button type="button" className="icon-btn" onClick={() => navigate('/terminal')} aria-label="Back">
          ←
        </button>
        <h1>Broker Keys</h1>
      </header>

      <main className="settings-body">
        {!native && (
          <div className="settings-note">
            This screen is only available inside the installed Android app. In a browser
            there is no secure store, so keys are refused rather than handled unsafely.
            Open the app from your home-screen icon.
          </div>
        )}

        <section className="settings-card">
          <div className="settings-status">
            CoinDCX ·{' '}
            <strong className={configured ? 'ok' : 'off'}>
              {configured ? 'KEY SAVED' : 'NO KEY'}
            </strong>
          </div>

          <label className="settings-label" htmlFor="api-key">
            API key
          </label>
          <input
            id="api-key"
            className="settings-input"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your CoinDCX API key"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />

          <label className="settings-label" htmlFor="api-secret">
            API secret
          </label>
          <input
            id="api-secret"
            className="settings-input"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            placeholder="Paste your CoinDCX API secret"
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />

          <div className="settings-actions">
            <button
              type="button"
              className="settings-btn primary"
              onClick={save}
              disabled={busy || !apiKey.trim() || !apiSecret.trim()}
            >
              {busy ? 'Working…' : 'Save key'}
            </button>
            <button type="button" className="settings-btn" onClick={verify} disabled={busy || !configured}>
              Verify
            </button>
            <button type="button" className="settings-btn danger" onClick={forget} disabled={busy || !configured}>
              Remove
            </button>
          </div>

          {message && <div className="settings-ok">{message}</div>}
          {error && <div className="settings-error">{error}</div>}
        </section>

        <section className="settings-card warn">
          <h2>Before you trade</h2>
          <ul>
            <li>Enable only “read” and “trade” permissions on the key. Never enable withdrawals.</li>
            <li>Start with a very small amount so a bug cannot cost you much.</li>
            <li>This app is not exchange-certified. Test thoroughly before increasing size.</li>
          </ul>
        </section>
      </main>
    </div>
  )
}
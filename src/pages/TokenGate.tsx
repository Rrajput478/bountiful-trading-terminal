import { useState } from 'react'
import { useNavigate } from 'react-router'
import * as api from '../services/api'
import './Login.css'

/**
 * Unlocks a hosted terminal.
 *
 * This is not a user account. It asks for the deployment's ACCESS_TOKEN, the
 * same shared secret the server requires on every API call. The CoinDCX API
 * key is never typed here — it lives only in the server's environment, so this
 * screen has no field that could leak one.
 */
export default function TokenGate() {
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = token.trim()
    if (!value) {
      setError('Enter your access token.')
      return
    }
    setChecking(true)
    api.setAccessToken(value)
    try {
      // Prove the token works before letting the user into the terminal.
      await api.getBrokers()
      setError(null)
      navigate('/connect-broker')
    } catch {
      api.setAccessToken('')
      setError('That token was not accepted by this server.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-glow"></div>

      <main className="login-card">
        <div className="login-logo">B</div>

        <h1>Enter access token</h1>

        <p className="login-subtitle">
          This terminal is private. Paste the access token you configured on the server.
        </p>

        <form className="login-form" onSubmit={submit}>
          <label htmlFor="token">Access token</label>
          <input
            id="token"
            type="password"
            autoComplete="off"
            placeholder="Paste your token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-button" disabled={checking}>
            {checking ? 'Checking…' : 'Unlock terminal'}
            <span>→</span>
          </button>
        </form>

        <p className="login-note">
          Your CoinDCX API key is never entered in the app. It stays on the server, so this
          screen can only unlock the terminal — it cannot change broker credentials.
        </p>
      </main>
    </div>
  )
}
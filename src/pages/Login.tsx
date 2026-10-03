import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import './Login.css'

/**
 * Authentication-ready screen.
 *
 * There is no auth backend yet, so this does not pretend to authenticate anyone
 * and does not claim a session exists. It validates the shape of what was typed
 * and moves on to broker setup. Wire a real auth provider here later; nothing
 * downstream needs to change.
 */
export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const signIn = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid email address.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setError(null)
    navigate('/connect-broker')
  }

  return (
    <div className="login-page">
      <div className="login-glow"></div>

      <main className="login-card">
        <div className="login-logo">B</div>

        <h1>Welcome back</h1>

        <p className="login-subtitle">Sign in to continue to your trading terminal.</p>

        <form className="login-form" onSubmit={signIn}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-button">
            Sign In
            <span>→</span>
          </button>
        </form>

        <div className="login-divider">
          <span>or</span>
        </div>

        <Link to="/connect-broker" className="demo-link">
          Continue without signing in
        </Link>

        <p className="login-note">
          No account yet? Continue straight to the terminal in paper trading mode.
        </p>

        <Link to="/" className="back-link">
          ← Back to welcome
        </Link>
      </main>
    </div>
  )
}
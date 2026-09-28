import { Link } from 'react-router'
import './Login.css'

function Login() {
  return (
    <div className="login-page">

      <div className="login-glow"></div>

      <main className="login-card">

        <div className="login-logo">
          B
        </div>

        <h1>Welcome back</h1>

        <p className="login-subtitle">
          Sign in to continue to your trading terminal.
        </p>

        <form className="login-form">

          <label>
            Email
          </label>

          <input
            type="email"
            placeholder="you@example.com"
          />

          <label>
            Password
          </label>

          <input
            type="password"
            placeholder="Enter your password"
          />

          <button type="button" className="login-button">
            Sign In
            <span>→</span>
          </button>

        </form>

        <div className="login-divider">
          <span>or</span>
        </div>

        <Link to="/connect-broker" className="demo-link">
          Continue with demo account
        </Link>

        <Link to="/" className="back-link">
          ← Back to welcome
        </Link>

      </main>

    </div>
  )
}

export default Login
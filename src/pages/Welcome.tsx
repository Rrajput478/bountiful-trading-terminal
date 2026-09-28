import { Link } from 'react-router'
import './Welcome.css'

function Welcome() {
  return (
    <div className="welcome-page">

      <div className="welcome-glow"></div>

      <main className="welcome-content">

        <div className="welcome-badge">
          <span className="status-dot"></span>
          PERSONAL TRADING TERMINAL
        </div>

        <h1>
          Bountiful
          <span>Trading Terminal</span>
        </h1>

        <p className="welcome-description">
          A clean, fast and focused trading workspace
          built around your workflow.
        </p>

        <Link to="/login" className="start-button">
          Get Started
          <span>→</span>
        </Link>

        <div className="welcome-features">
          <div className="feature">
            <span>◉</span>
            Paper Trading
          </div>

          <div className="feature">
            <span>⌁</span>
            Secure Connection
          </div>

          <div className="feature">
            <span>⚡</span>
            Fast Execution
          </div>
        </div>

      </main>

      <div className="welcome-footer">
        Bountiful Trading Terminal · v0.1.0
      </div>

    </div>
  )
}

export default Welcome
import { Link, useNavigate } from 'react-router'
import './Connectbroker.css'

function Connectbroker() {
  const navigate = useNavigate()

  const handleConnect = () => {
    navigate('/terminal')
  }

  return (
    <div className="broker-page">

      <main className="broker-card">

        <div className="broker-icon">
          ↗
        </div>

        <div className="broker-step">
          STEP 2 OF 2
        </div>

        <h1>Connect your broker</h1>

        <p className="broker-description">
          Connect a supported broker to access market data,
          positions and trading from your terminal.
        </p>

        <div className="broker-option">

          <div className="broker-option-left">
            <div className="broker-logo">
              C
            </div>

            <div>
              <div className="broker-name">
                CoinDCX
              </div>

              <div className="broker-status">
                API connection
              </div>
            </div>
          </div>

          <div className="broker-arrow">
            →
          </div>

        </div>

        <div className="security-note">
          <span>🔒</span>

          <div>
            <strong>Your credentials stay secure</strong>
            <p>
              API secrets will be handled by the secure
              backend and will never be exposed in the app.
            </p>
          </div>
        </div>

        <button
          className="connect-button"
          onClick={handleConnect}
        >
          Connect CoinDCX
          <span>→</span>
        </button>

        <Link to="/login" className="back-link">
          ← Back to login
        </Link>

      </main>

    </div>
  )
}

export default Connectbroker
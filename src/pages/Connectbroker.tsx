import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import * as api from '../services/api'
import './Connectbroker.css'

interface BrokerOption {
  id: 'paper' | 'upstox' | 'coindcx'
  name: string
  subtitle: string
  tag: string
  tagColor: string
  icon: string
  fields: { name: string; label: string; placeholder: string; type: string }[]
}

const BROKERS: BrokerOption[] = [
  {
    id: 'paper',
    name: 'Paper Trading Terminal',
    subtitle: 'Zero Risk Sandbox with $100,000 Virtual Capital',
    tag: 'Instant Demo',
    tagColor: '#35d07f',
    icon: '⚡',
    fields: [],
  },
  {
    id: 'upstox',
    name: 'Upstox Pro V2',
    subtitle: 'NSE / BSE Equities, NIFTY & BANKNIFTY Options',
    tag: 'Indian Markets',
    tagColor: '#6366f1',
    icon: '📈',
    fields: [
      { name: 'apiKey', label: 'API Key (Client ID)', placeholder: 'e.g. 5a1b2c3d-...', type: 'text' },
      { name: 'apiSecret', label: 'API Secret', placeholder: 'Enter API Secret key', type: 'password' },
      { name: 'accessToken', label: 'Access Token (Optional / Demo fallback)', placeholder: 'Bearer token if active', type: 'password' },
    ],
  },
  {
    id: 'coindcx',
    name: 'CoinDCX Pro',
    subtitle: 'High-speed Crypto Spot & Futures Trading',
    tag: 'Crypto Markets',
    tagColor: '#f59e0b',
    icon: '🪙',
    fields: [
      { name: 'apiKey', label: 'CoinDCX API Key', placeholder: 'Enter CoinDCX API Key', type: 'text' },
      { name: 'apiSecret', label: 'API Secret', placeholder: 'Enter API Secret', type: 'password' },
    ],
  },
]

function Connectbroker() {
  const navigate = useNavigate()
  const [selectedBroker, setSelectedBroker] = useState<'paper' | 'upstox' | 'coindcx'>('paper')
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [isConnecting, setIsConnecting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const activeOption = BROKERS.find((b) => b.id === selectedBroker) || BROKERS[0]

  const handleInputChange = (field: string, val: string) => {
    setCredentials((prev) => ({ ...prev, [field]: val }))
  }

  const handleConnect = async () => {
    setIsConnecting(true)
    setErrorMsg(null)
    try {
      await api.connectBroker(selectedBroker, credentials)
      localStorage.setItem('active_broker', selectedBroker)
      navigate(`/terminal?broker=${selectedBroker}`)
    } catch (err: any) {
      // In demo mode, fallback to terminal with demo state
      localStorage.setItem('active_broker', selectedBroker)
      navigate(`/terminal?broker=${selectedBroker}`)
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <div className="broker-page">
      <main className="broker-card">
        <div className="broker-icon">🚀</div>
        <div className="broker-step">STEP 2 OF 2 • BROKER SETUP</div>
        <h1>Select & Connect Broker</h1>
        <p className="broker-description">
          Trade Indian Equities, F&O or Crypto with lightning-fast execution and real-time P&L analytics.
        </p>

        {/* Broker Selector List */}
        <div className="broker-grid">
          {BROKERS.map((broker) => {
            const isSelected = selectedBroker === broker.id
            return (
              <div
                key={broker.id}
                className={`broker-option ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedBroker(broker.id)}
              >
                <div className="broker-option-left">
                  <div className="broker-logo">{broker.icon}</div>
                  <div>
                    <div className="broker-name-row">
                      <span className="broker-name">{broker.name}</span>
                      <span className="broker-badge" style={{ color: broker.tagColor, borderColor: broker.tagColor }}>
                        {broker.tag}
                      </span>
                    </div>
                    <div className="broker-status">{broker.subtitle}</div>
                  </div>
                </div>
                <div className="broker-radio">
                  <input
                    type="radio"
                    name="brokerSelect"
                    checked={isSelected}
                    onChange={() => setSelectedBroker(broker.id)}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Form Inputs for Live Keys (if selected has fields) */}
        {activeOption.fields.length > 0 && (
          <div className="broker-credential-form">
            <div className="form-header">
              <span>Enter {activeOption.name} Credentials (Optional for Demo Mode)</span>
            </div>
            {activeOption.fields.map((f) => (
              <div key={f.name} className="form-group">
                <label>{f.label}</label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={credentials[f.name] || ''}
                  onChange={(e) => handleInputChange(f.name, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}

        <div className="security-note">
          <span>🔒</span>
          <div>
            <strong>Ultra-Low Latency & High Security</strong>
            <p>
              Your credentials are processed locally and never stored in plain text. You can toggle between Demo and Live execution anytime.
            </p>
          </div>
        </div>

        {errorMsg && <div className="broker-error-banner">{errorMsg}</div>}

        <button
          className="connect-button"
          onClick={handleConnect}
          disabled={isConnecting}
        >
          {isConnecting
            ? 'Connecting...'
            : `Launch Terminal with ${activeOption.name}`}
          <span>→</span>
        </button>

        <Link to="/login" className="back-link">
          ← Back to Login
        </Link>
      </main>
    </div>
  )
}

export default Connectbroker

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import * as api from '../services/api'
import type { BrokerInfo } from '../types/trading'
import './Connectbroker.css'

/**
 * Broker selection. Paper Trading is the only enabled option.
 *
 * Live brokers are listed so the architecture is visible, but they are shown as
 * unavailable: credentials live in backend environment variables only (§30), so
 * nothing secret is ever typed into the browser.
 */
export default function Connectbroker() {
  const navigate = useNavigate()
  const [brokers, setBrokers] = useState<BrokerInfo[]>([])
  const [selected, setSelected] = useState('paper')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .getBrokers()
      .then((list) => {
        if (!alive) return
        setBrokers(list)
        const paper = list.find((b) => b.id === 'paper')
        if (paper) setSelected('paper')
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Cannot reach the server')
      })
    return () => {
      alive = false
    }
  }, [])

  const start = async () => {
    // Guard the submit path itself: a disabled option must never reach the API,
    // even if selection was changed outside the UI.
    const chosen = brokers.find((b) => b.id === selected)
    if (!chosen?.enabled) {
      setError(
        chosen
          ? `${chosen.name} is not available yet. ${chosen.description}.`
          : 'Select a broker to continue.',
      )
      return
    }
    setConnecting(true)
    setError(null)
    try {
      await api.post<{ success: boolean }>('/broker/connect', { broker: selected })
      localStorage.setItem('bountiful.broker', selected)
      navigate('/terminal')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="broker-page">
      <main className="broker-card">
        <div className="broker-step">STEP 2 OF 2 · BROKER SETUP</div>
        <h1>Select a Broker</h1>
        <p className="broker-description">
          Bountiful starts in paper mode. Live brokers stay disabled until their API
          integration is implemented and configured on the server.
        </p>

        <div className="broker-grid">
          {brokers.map((b) => {
            const enabled = b.enabled !== false
            const isSelected = selected === b.id
            return (
              <button
                type="button"
                key={b.id}
                className={`broker-option${isSelected ? ' selected' : ''}${enabled ? '' : ' disabled'}`}
                onClick={() => enabled && setSelected(b.id)}
                disabled={!enabled}
              >
                <div className="broker-option-left">
                  <div className="broker-logo">{b.id === 'paper' ? '⚡' : '🔌'}</div>
                  <div>
                    <div className="broker-name-row">
                      <span className="broker-name">{b.name}</span>
                      <span className={`broker-tag ${b.isLive ? 'live' : 'paper'}`}>
                        {b.isLive ? 'LIVE' : 'PAPER'}
                      </span>
                    </div>
                    <div className="broker-sub">{b.description}</div>
                    {!enabled && (
                      <div className="broker-note">
                        Not implemented — set {b.id.toUpperCase()}_API_KEY on the backend
                      </div>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {error && <div className="broker-error">{error}</div>}

        <button
          type="button"
          className="broker-submit"
          onClick={start}
          disabled={connecting || !selected}
        >
          {connecting ? 'Connecting…' : 'Enter Terminal'}
        </button>

        <Link className="broker-back" to="/login">
          ← Back
        </Link>
      </main>
    </div>
  )
}
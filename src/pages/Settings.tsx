import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import * as api from '../services/api'
import './Settings.css'

/**
 * Broker configuration, read-only by design.
 *
 * The API key for a live broker lives only in the terminal server's
 * environment. This page therefore cannot enter, view, or change a key — it
 * reports what the server has configured and lets the operator verify the
 * connection. Anyone who could edit a key here could also read it, so the
 * capability is deliberately absent from the client.
 */

interface BrokerRow {
  id: string
  name: string
  description: string
  enabled: boolean
  connected: boolean
  isLive: boolean
}

export default function Settings() {
  const [brokers, setBrokers] = useState<BrokerRow[]>([])
  const [active, setActive] = useState<string>('paper')
  const [status, setStatus] = useState<{ mode: string; liveEnabled: boolean } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const [list, current, health] = await Promise.all([
        api.getBrokers(),
        api.request<{ broker: string }>('/broker/active'),
        api.getHealth(),
      ])
      setBrokers(list as BrokerRow[])
      setActive(current.broker)
      setStatus({ mode: health.mode, liveEnabled: health.liveTradingEnabled })
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const choose = async (brokerId: string) => {
    setBusy(true)
    setError('')
    try {
      await api.selectBroker(brokerId)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings">
      <header className="settings-head">
        <h1>Broker settings</h1>
        <Link to="/terminal" className="settings-back">
          Terminal
        </Link>
      </header>

      {status && (
        <p className="settings-mode">
          Server mode: <strong>{status.mode}</strong>
          {!status.liveEnabled && ' · live trading is disabled on this server'}
        </p>
      )}

      <section className="settings-note">
        <h2>Where your API key lives</h2>
        <p>
          Broker keys are stored in the terminal server&rsquo;s environment, never in this app. The
          app has no field for a key and no way to read one, so the key cannot leak from the
          device. To change a key, update the server&rsquo;s environment variables and restart it.
        </p>
      </section>

      {error && <p className="settings-error">{error}</p>}

      <ul className="settings-list">
        {brokers.map((b) => (
          <li key={b.id} className="settings-item">
            <div className="settings-item-main">
              <strong>{b.name}</strong>
              <span className="settings-item-desc">{b.description}</span>
              <span className="settings-item-state">
                {b.id === active
                  ? 'Active'
                  : b.enabled
                    ? 'Available'
                    : 'Not configured on this server'}
              </span>
            </div>
            <button
              type="button"
              disabled={busy || b.id === active || !b.enabled}
              onClick={() => void choose(b.id)}
            >
              {b.id === active ? 'Active' : b.enabled ? 'Use' : 'Unavailable'}
            </button>
          </li>
        ))}
      </ul>

      <Link to="/connect-broker" className="settings-link">
        Connect a broker
      </Link>
    </div>
  )
}
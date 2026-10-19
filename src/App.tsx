import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import Welcome from './pages/Welcome'
import Login from './pages/Login'
import TokenGate from './pages/TokenGate'
import ConnectBroker from './pages/Connectbroker'
import Terminal from './pages/Terminal'
import Settings from './pages/Settings'
import * as api from './services/api'

/**
 * Gate for a hosted terminal.
 *
 * When the server requires a token, every route redirects to the token screen
 * until one is stored. The check is a single unauthenticated probe, and it runs
 * only once per load so a failed API call deeper in the app never bounces the
 * user out of a working session.
 */
function RequireToken({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const [state, setState] = useState<'checking' | 'open' | 'locked'>('checking')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { required } = await api.request<{ required: boolean }>('/auth/required')
        if (!alive) return
        if (!required) {
          setState('open')
          return
        }
        // A stored token still has to be accepted by the server.
        await api.getBrokers()
        if (alive) setState('open')
      } catch {
        if (alive) setState('locked')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  if (state === 'checking') return null
  if (state === 'locked' && location.pathname !== '/token') {
    return <Navigate to="/token" replace />
  }
  return <>{children}</>
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/token"
        element={
          <RequireToken>
            <TokenGate />
          </RequireToken>
        }
      />
      <Route
        path="/connect-broker"
        element={
          <RequireToken>
            <ConnectBroker />
          </RequireToken>
        }
      />
      <Route
        path="/terminal"
        element={
          <RequireToken>
            <Terminal />
          </RequireToken>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireToken>
            <Settings />
          </RequireToken>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function AppRoot() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  )
}
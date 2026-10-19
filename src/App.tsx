import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import Welcome from './pages/Welcome'
import Login from './pages/Login'
import TokenGate from './pages/TokenGate'
import ConnectBroker from './pages/Connectbroker'
import Terminal from './pages/Terminal'
import Settings from './pages/Settings'
import * as api from './services/api'

function LoadingScreen() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#080b10',
      color: '#f08418',
      fontFamily: 'monospace',
      gap: '1rem'
    }}>
      <div style={{ fontSize: '2rem' }}>⚡</div>
      <div style={{ fontSize: '1rem', opacity: 0.7 }}>Loading Bountiful…</div>
    </div>
  )
}

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
        // Check if token is already stored and valid
        try {
          await api.getBrokers()
          if (alive) setState('open')
        } catch {
          if (alive) setState('locked')
        }
      } catch {
        // If /auth/required fails (e.g. 401/503), token is definitely required or server needs gate
        if (alive) setState('locked')
      }
    })()
    return () => { alive = false }
  }, [])

  if (state === 'checking') return <LoadingScreen />
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
      <Route path="/token" element={<TokenGate />} />
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

import { Routes, Route } from 'react-router'
import Welcome from './pages/Welcome'
import Login from './pages/Login'
import ConnectBroker from './pages/Connectbroker'
import Terminal from './pages/Terminal'
import Settings from './pages/Settings'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/login" element={<Login />} />
      <Route path="/connect-broker" element={<ConnectBroker />} />
      <Route path="/terminal" element={<Terminal />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  )
}

export default App
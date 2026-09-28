import { Routes, Route } from 'react-router'
import Welcome from './pages/Welcome'
import Login from './pages/Login'
import ConnectBroker from './pages/Connectbroker'
import Terminal from './pages/Terminal'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/login" element={<Login />} />
      <Route path="/connect-broker" element={<ConnectBroker />} />
      <Route path="/terminal" element={<Terminal />} />
    </Routes>
  )
}

export default App
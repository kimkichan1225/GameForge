import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Landing from './pages/Landing'
import Home from './pages/Home'
import MapEditor from './pages/MapEditor'

function App() {
  const initialize = useAuthStore((state) => state.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/home" element={<Home />} />
        <Route path="/editor" element={<MapEditor />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

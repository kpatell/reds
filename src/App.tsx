import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/components/AuthProvider'
import Lobby from '@/pages/Lobby'
import Game from '@/pages/Game'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Lobby />} />
          <Route path="/game/:gameId" element={<Game />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App

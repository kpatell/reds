import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from '@/components/AuthProvider'
import { CompleteProfile } from '@/components/CompleteProfile'
import { Toaster } from 'sonner'
import Lobby from '@/pages/Lobby'
import Game from '@/pages/Game'
import Profile from '@/pages/Profile'

function ProfileGate({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileLoading } = useAuth()

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    )
  }

  // Non-anonymous authenticated users without a gamertag must complete their profile
  if (user && user.email && !profile?.username) {
    return <CompleteProfile />
  }

  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProfileGate>
          <Routes>
            <Route path="/" element={<Lobby />} />
            <Route path="/game/:shortCode" element={<Game />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </ProfileGate>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App

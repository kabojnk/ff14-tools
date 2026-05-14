import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { usePresence } from '@/hooks/usePresence'
import { LoginPage } from '@/components/auth/LoginPage'
import { AppShell } from '@/components/layout/AppShell'
import { EepMode } from '@/components/eep/EepMode'

// Stays mounted for the entire logged-in session, including during Eep mode,
// so presence and passphrase survive the AppShell ↔ EepMode swap.
function AuthenticatedApp() {
  const { eepMode, loadEepPassphrase, loadPin } = useUiStore()
  const { user } = useAuthStore()

  usePresence()

  useEffect(() => {
    loadEepPassphrase()
    if (user) loadPin(user.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  if (eepMode) return <EepMode />
  return <AppShell />
}

export default function App() {
  const { initialized, user, initialize } = useAuthStore()
  const { theme } = useUiStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  if (!initialized) {
    return (
      <div className="flex h-full items-center justify-center bg-primary">
        <div className="text-secondary">Loading...</div>
      </div>
    )
  }

  if (!user) return <LoginPage />
  return <AuthenticatedApp />
}

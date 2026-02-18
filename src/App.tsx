import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { LoginPage } from '@/components/auth/LoginPage'
import { AppShell } from '@/components/layout/AppShell'
import { EepMode } from '@/components/eep/EepMode'

export default function App() {
  const { initialized, user, initialize } = useAuthStore()
  const { eepMode, theme } = useUiStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  // Apply theme
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

  if (!user) {
    return <LoginPage />
  }

  if (eepMode) {
    return <EepMode />
  }

  return <AppShell />
}

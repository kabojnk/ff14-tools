import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { usePresence } from '@/hooks/usePresence'
import { LoginPage } from '@/components/auth/LoginPage'
import { AppShell } from '@/components/layout/AppShell'
import { EepMode } from '@/components/eep/EepMode'
import { LOADING_BG, statusBarColor } from '@/lib/themes'

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

  return (
    <>
      {eepMode && <EepMode />}
      {/* Keep AppShell mounted so the phone view and scroll state survive eep transitions */}
      <div style={{ display: eepMode ? 'none' : 'flex', height: '100%', flexDirection: 'column', overflow: 'hidden' }}>
        <AppShell />
      </div>
    </>
  )
}

function setThemeColor(color: string) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = color
}

export default function App() {
  const { initialized, user, initialize } = useAuthStore()
  const { theme, eepMode } = useUiStore()
  const [showLogin, setShowLogin] = useState(false)

  useEffect(() => {
    initialize()
  }, [initialize])

  // index.html already set data-theme before the first paint; this keeps it in step with the picker.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // The status bar follows the theme's bar in the chat, and the fixed disguise colour otherwise. So does the
  // page behind everything: Safari shows it under its see-through toolbar, below the disguise and the PIN pad.
  useEffect(() => {
    const bar = getComputedStyle(document.documentElement).getPropertyValue('--bar')
    const color = statusBarColor({ initialized, signedIn: !!user, eepMode, bar })
    setThemeColor(color)
    document.documentElement.style.backgroundColor = color
    document.body.style.backgroundColor = color
  }, [theme, initialized, user, eepMode])

  // Collapse login overlay whenever auth resolves (successful login or init)
  useEffect(() => {
    if (user) setShowLogin(false)
  }, [user])

  // Before auth resolves: the disguise if it's up, otherwise a neutral fixed-colour screen.
  // Never theme colours, which would hint at the chat.
  if (!initialized) {
    if (eepMode) return <EepMode />
    return (
      <div className="flex h-full items-center justify-center" style={{ background: LOADING_BG }}>
        <div style={{ color: '#a4aab2' }}>Loading...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <EepMode onLoginClick={() => setShowLogin(true)} />
        {showLogin && <LoginPage onCancel={() => setShowLogin(false)} />}
      </>
    )
  }

  return <AuthenticatedApp />
}

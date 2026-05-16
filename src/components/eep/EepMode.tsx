import { useState, useCallback } from 'react'
import { useUiStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { getRandomDuties, getDifficultyColor, type FF14Duty } from '@/lib/ff14data'
import { PinPad } from '@/components/pin/PinPad'

interface EepModeProps {
  onLoginClick?: () => void
}

export function EepMode({ onLoginClick }: EepModeProps) {
  const { setEepMode, eepPassphrase, pinCode, pinLocked, unlockPin } = useUiStore()
  const { user, signOut } = useAuthStore()
  const [duties, setDuties] = useState<FF14Duty[]>([])
  const [customRaid, setCustomRaid] = useState('')
  const [showPinPad, setShowPinPad] = useState(false)
  const [pinError, setPinError] = useState(false)

  const handleLogout = async () => {
    await signOut()
    // Reset eepMode so the next login opens straight to chat, not eep
    setEepMode(false)
  }

  const rollContent = useCallback(() => {
    const count = Math.floor(Math.random() * 3) + 3 // 3-5 duties
    setDuties(getRandomDuties(count))
  }, [])

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (eepPassphrase && customRaid === eepPassphrase) {
      setEepMode(false)
      return
    }
    setCustomRaid('')
  }

  const handlePinComplete = (pin: string) => {
    if (pin === pinCode) {
      setPinError(false)
      if (pinLocked) unlockPin()
      setShowPinPad(false)
      setEepMode(false)
    } else {
      setPinError(true)
      setTimeout(() => setPinError(false), 700)
    }
  }

  const overlayVisible = pinLocked || showPinPad

  return (
    <div className="flex h-full flex-col" style={{ background: '#1a1a2e', color: '#e0e0e0' }}>
      {/* Header */}
      <header
        style={{ background: '#16213e', borderBottom: '2px solid #0f3460', paddingTop: 'max(1rem, env(safe-area-inset-top, 1rem))' }}
        className="flex items-center justify-between px-6 pb-4"
      >
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#e94560' }}>
            FF14 Random Content Running Agenda Picker
          </h1>
          <p className="text-sm" style={{ color: '#a0a0b0' }}>
            Can&apos;t decide what to run? Let fate choose!
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: '#606080' }}>
          {user ? (
            <button
              onClick={handleLogout}
              className="transition-colors hover:text-[#a0a0b0]"
            >
              Logout
            </button>
          ) : onLoginClick ? (
            <button
              onClick={onLoginClick}
              className="transition-colors hover:text-[#a0a0b0]"
            >
              Login
            </button>
          ) : null}
          {(user || onLoginClick) && <span>|</span>}
          <span>v2.1.4</span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 flex-col items-center justify-start overflow-y-auto p-8">
        <button
          onClick={rollContent}
          className="mb-8 rounded-lg px-8 py-3 text-lg font-bold text-white transition-all hover:scale-105 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #e94560, #0f3460)',
            boxShadow: '0 4px 15px rgba(233, 69, 96, 0.3)',
          }}
        >
          Roll Random Content
        </button>

        {duties.length > 0 && (
          <div className="w-full max-w-2xl">
            <h2 className="mb-4 text-center text-lg font-semibold" style={{ color: '#a0a0b0' }}>
              Today&apos;s Agenda ({duties.length} duties)
            </h2>
            <div className="space-y-3">
              {duties.map((duty, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg p-4"
                  style={{ background: '#16213e', border: '1px solid #0f3460' }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-medium text-white">{i + 1}. {duty.name}</span>
                    </div>
                    <div className="mt-1 flex gap-3 text-xs" style={{ color: '#808090' }}>
                      <span>{duty.expansion}</span>
                      <span>&middot;</span>
                      <span>{duty.type}</span>
                    </div>
                  </div>
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{
                      color: getDifficultyColor(duty.difficulty),
                      border: `1px solid ${getDifficultyColor(duty.difficulty)}40`,
                      background: `${getDifficultyColor(duty.difficulty)}15`,
                    }}
                  >
                    {duty.difficulty}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {duties.length === 0 && (
          <div className="text-center" style={{ color: '#606080' }}>
            <p className="mb-4 text-4xl">🎲</p>
            <p>Click the button above to generate a random content agenda</p>
          </div>
        )}
      </main>

      {/* Footer — passphrase / PIN unlock. Hidden for unauthenticated visitors. */}
      {user && <footer
        className="px-6 py-4"
        style={{ background: '#16213e', borderTop: '1px solid #0f3460' }}
      >
        <div className="flex items-end gap-3">
          {/* PIN unlock button — only shown if a PIN is configured */}
          {pinCode && (
            <button
              onClick={() => setShowPinPad(true)}
              className="mb-0.5 h-9 w-9 flex-shrink-0 rounded-full"
              style={{ background: '#60a5fa' }}
              aria-label="Unlock"
            />
          )}

          <form onSubmit={handleCustomSubmit} className="flex flex-1 gap-3">
            <div className="flex-1">
              <label
                htmlFor="custom-raid"
                className="mb-1 block text-xs font-medium"
                style={{ color: '#808090' }}
              >
                Or enter in a custom raid
              </label>
              <input
                id="custom-raid"
                type="text"
                value={customRaid}
                onChange={(e) => setCustomRaid(e.target.value)}
                placeholder="e.g. The Binding Coil Turn 5"
                className="w-full rounded px-3 py-2 text-sm outline-none"
                style={{ background: '#1a1a2e', border: '1px solid #0f3460', color: '#e0e0e0' }}
              />
            </div>
            <button
              type="submit"
              className="self-end rounded px-4 py-2 text-sm font-medium text-white"
              style={{ background: '#0f3460' }}
            >
              Add
            </button>
          </form>
        </div>
      </footer>}

      {/* PIN overlay */}
      {overlayVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <PinPad
            title="Enter PIN"
            error={pinError}
            onComplete={handlePinComplete}
            onCancel={pinLocked ? undefined : () => setShowPinPad(false)}
          />
        </div>
      )}
    </div>
  )
}

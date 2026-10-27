import { useUiStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { PinPad } from '@/components/pin/PinPad'
import { Aetherdesk } from '@/components/eep/desk/Aetherdesk'
import { logOut } from '@/lib/logout'

interface EepModeProps {
  onLoginClick?: () => void
}

/**
 * The disguise: Aetherdesk, an FFXIV companion site. Signed in, its search field takes the passphrase and its
 * round "character" button is the Unlock dot that opens the PIN pad.
 */
export function EepMode({ onLoginClick }: EepModeProps) {
  const { setEepMode, eepPassphrase, pinLength, pinLocked, pinPadOpen, openPinPad, closePinPad, unlockPin, verifyPin } = useUiStore()
  const user = useAuthStore((s) => s.user)

  // Signs out, clears the PIN and resets eepMode so the next login opens straight to chat.
  const handleLogout = () => {
    void logOut()
  }

  // The passphrase isn't searched for. While the PIN lock is on (including before the PIN length has loaded),
  // it only opens the PIN pad; the chat needs the PIN.
  const handleSearch = (text: string): boolean => {
    if (!user || !eepPassphrase || text !== eepPassphrase.trim()) return false
    if (pinLocked) openPinPad()
    else setEepMode(false)
    return true
  }

  const handlePinSuccess = () => {
    unlockPin()
    setEepMode(false)
  }

  return (
    <div className="h-full">
      <Aetherdesk
        signedIn={!!user}
        canUnlock={pinLength !== null}
        onUnlock={openPinPad}
        onSubmitSearch={handleSearch}
        onLogin={onLoginClick}
        onLogout={handleLogout}
      />

      {/* PIN overlay: PinPad renders its own full-screen blurred backdrop. It shows only when asked for (the
          Unlock dot), never by itself, and Cancel always closes it (a locked app stays locked).
          pinLength is the stored PIN's actual length, so any stored PIN (including legacy ones) can be entered. */}
      {user && pinPadOpen && pinLength !== null && (
        <PinPad mode="unlock" length={pinLength} verify={verifyPin} onSuccess={handlePinSuccess} onCancel={closePinPad} />
      )}
    </div>
  )
}

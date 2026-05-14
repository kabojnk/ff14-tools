import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { supabase } from '@/lib/supabase'
import { AvatarUpload } from '@/components/user/AvatarUpload'
import { PinPad } from '@/components/pin/PinPad'
import { Portal } from '@/components/ui/Portal'
import type { ThemePreset } from '@/types'

interface UserSettingsProps {
  onClose: () => void
}

type Tab = 'profile' | 'appearance' | 'security'

// PIN setup is a small multi-step wizard embedded in the security tab
type PinStep =
  | 'idle'
  | 'set-new'       // entering a new PIN (no current PIN)
  | 'set-confirm'   // confirming the new PIN
  | 'change-verify' // verifying current PIN before changing
  | 'change-new'    // entering new PIN
  | 'change-confirm'// confirming new PIN
  | 'remove-verify' // verifying current PIN before removing

export function UserSettings({ onClose }: UserSettingsProps) {
  const { profile, fetchProfile } = useAuthStore()
  const { theme, setTheme, pinCode, setPinCode } = useUiStore()
  const [nickname, setNickname] = useState(profile?.nickname ?? '')
  const [profileMessage, setProfileMessage] = useState(profile?.profile_message ?? '')
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('profile')

  // PIN wizard state
  const [pinStep, setPinStep] = useState<PinStep>('idle')
  const [pendingPin, setPendingPin] = useState<string | null>(null)
  const [pinError, setPinError] = useState(false)
  const [pinSuccess, setPinSuccess] = useState<string | null>(null)

  const resetPinWizard = () => {
    setPinStep('idle')
    setPendingPin(null)
    setPinError(false)
    setPinSuccess(null)
  }

  const showPinError = () => {
    setPinError(true)
    setTimeout(() => setPinError(false), 700)
  }

  const handlePinComplete = async (pin: string) => {
    if (!profile) return

    switch (pinStep) {
      case 'set-new':
        setPendingPin(pin)
        setPinStep('set-confirm')
        break

      case 'set-confirm':
        if (pin === pendingPin) {
          await setPinCode(profile.id, pin)
          setPinSuccess('PIN set successfully')
          setTimeout(resetPinWizard, 1500)
        } else {
          showPinError()
          setPinStep('set-new')
          setPendingPin(null)
        }
        break

      case 'change-verify':
        if (pin === pinCode) {
          setPinStep('change-new')
        } else {
          showPinError()
        }
        break

      case 'change-new':
        setPendingPin(pin)
        setPinStep('change-confirm')
        break

      case 'change-confirm':
        if (pin === pendingPin) {
          await setPinCode(profile.id, pin)
          setPinSuccess('PIN changed successfully')
          setTimeout(resetPinWizard, 1500)
        } else {
          showPinError()
          setPinStep('change-new')
          setPendingPin(null)
        }
        break

      case 'remove-verify':
        if (pin === pinCode) {
          await setPinCode(profile.id, null)
          setPinSuccess('PIN removed')
          setTimeout(resetPinWizard, 1500)
        } else {
          showPinError()
        }
        break
    }
  }

  const pinPadTitle: Record<PinStep, string> = {
    'idle': '',
    'set-new': 'Choose a PIN',
    'set-confirm': 'Confirm PIN',
    'change-verify': 'Enter current PIN',
    'change-new': 'Choose new PIN',
    'change-confirm': 'Confirm new PIN',
    'remove-verify': 'Enter current PIN',
  }

  const pinPadSubtitle: Partial<Record<PinStep, string>> = {
    'set-confirm': 'Enter the same PIN again',
    'change-new': 'Enter a different PIN',
  }

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    await supabase
      .from('profiles')
      .update({
        nickname: nickname.trim() || profile.nickname,
        profile_message: profileMessage.trim() || null,
      })
      .eq('id', profile.id)
    await fetchProfile()
    setSaving(false)
  }

  const themes: { value: ThemePreset; label: string; preview: string }[] = [
    { value: 'dark', label: 'Dark', preview: '#313338' },
    { value: 'light', label: 'Light', preview: '#ffffff' },
    { value: 'midnight', label: 'Midnight', preview: '#1a1d2e' },
  ]

  const tabs: { value: Tab; label: string }[] = [
    { value: 'profile', label: 'My Profile' },
    { value: 'appearance', label: 'Appearance' },
    { value: 'security', label: 'Security' },
  ]

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-stretch bg-tertiary">
        {/* Sidebar */}
        <div className="flex w-56 flex-shrink-0 flex-col items-end bg-secondary pr-2 pt-16">
          <nav className="w-44 space-y-0.5">
            {tabs.map((t) => (
              <button
                key={t.value}
                onClick={() => { setActiveTab(t.value); resetPinWizard() }}
                className={`w-full rounded-[4px] px-3 py-1.5 text-left text-sm ${
                  activeTab === t.value
                    ? 'bg-active text-interactive-active'
                    : 'text-interactive hover:bg-hover hover:text-interactive-hover'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col overflow-y-auto pt-16 pl-10 pr-8">
          <div className="max-w-2xl">
            {/* Close button */}
            <div className="fixed right-8 top-4">
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--color-input-border))] text-interactive transition-colors hover:text-interactive-hover"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <span className="mt-1 block text-center text-[11px] text-muted">ESC</span>
            </div>

            {activeTab === 'profile' && (
              <>
                <h2 className="mb-5 text-xl font-bold text-primary">My Profile</h2>

                <div className="mb-6">
                  <label className="mb-2 block text-xs font-bold uppercase text-secondary">Avatar</label>
                  <AvatarUpload />
                </div>

                <div className="mb-4">
                  <label className="mb-1 block text-xs font-bold uppercase text-secondary">Display Name</label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full rounded-[3px] bg-input px-3 py-2 text-sm text-primary outline-none"
                    maxLength={32}
                  />
                </div>

                <div className="mb-6">
                  <label className="mb-1 block text-xs font-bold uppercase text-secondary">About Me</label>
                  <textarea
                    value={profileMessage}
                    onChange={(e) => setProfileMessage(e.target.value)}
                    className="w-full resize-none rounded-[3px] bg-input px-3 py-2 text-sm text-primary outline-none"
                    rows={4}
                    maxLength={190}
                    placeholder="Tell others about yourself"
                  />
                  <p className="mt-1 text-right text-xs text-muted">{profileMessage.length}/190</p>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-[3px] bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            )}

            {activeTab === 'appearance' && (
              <>
                <h2 className="mb-5 text-xl font-bold text-primary">Appearance</h2>
                <div className="mb-4">
                  <label className="mb-3 block text-xs font-bold uppercase text-secondary">Theme</label>
                  <div className="flex gap-4">
                    {themes.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => setTheme(t.value)}
                        className={`rounded-lg border-2 p-1 transition-colors ${
                          theme === t.value
                            ? 'border-[hsl(var(--color-brand))]'
                            : 'border-transparent hover:border-[hsl(var(--color-input-border))]'
                        }`}
                      >
                        <div
                          className="flex h-16 w-24 items-end rounded p-2"
                          style={{ backgroundColor: t.preview }}
                        >
                          <span className={`text-xs font-medium ${t.value === 'light' ? 'text-gray-800' : 'text-white'}`}>
                            {t.label}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'security' && (
              <>
                <h2 className="mb-5 text-xl font-bold text-primary">Security</h2>

                <div className="mb-2">
                  <label className="mb-1 block text-xs font-bold uppercase text-secondary">App Lock PIN</label>
                  <p className="mb-4 text-sm text-muted">
                    {pinCode
                      ? 'A 4-digit PIN is required to unlock the app after it goes to the background.'
                      : 'Set a 4-digit PIN to lock the app when it loses focus.'}
                  </p>

                  {pinSuccess && (
                    <p className="mb-4 text-sm font-medium text-green-400">{pinSuccess}</p>
                  )}

                  {pinStep === 'idle' ? (
                    <div className="flex gap-3">
                      {!pinCode ? (
                        <button
                          onClick={() => setPinStep('set-new')}
                          className="rounded-[3px] bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
                        >
                          Set PIN
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => setPinStep('change-verify')}
                            className="rounded-[3px] bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
                          >
                            Change PIN
                          </button>
                          <button
                            onClick={() => setPinStep('remove-verify')}
                            className="rounded-[3px] border border-[hsl(var(--color-input-border))] px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-hover"
                          >
                            Remove PIN
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-start">
                      <div className="rounded-xl bg-[#1a1a2e] px-12 py-10">
                        <PinPad
                          title={pinPadTitle[pinStep]}
                          subtitle={pinPadSubtitle[pinStep]}
                          error={pinError}
                          onComplete={handlePinComplete}
                          onCancel={resetPinWizard}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Portal>
  )
}

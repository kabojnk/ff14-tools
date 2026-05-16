import { useRef, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { supabase } from '@/lib/supabase'
import { AvatarUpload } from '@/components/user/AvatarUpload'
import { BannerCrop } from '@/components/user/BannerCrop'
import { PinPad } from '@/components/pin/PinPad'
import { Portal } from '@/components/ui/Portal'
import type { ThemePreset } from '@/types'

interface UserSettingsProps {
  onClose: () => void
}

type DesktopTab = 'profile' | 'appearance' | 'security'
type MobileScreen = 'profile' | 'settings-menu' | 'appearance' | 'security'

type PinStep =
  | 'idle'
  | 'set-new'
  | 'set-confirm'
  | 'change-verify'
  | 'change-new'
  | 'change-confirm'
  | 'remove-verify'

function ChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export function UserSettings({ onClose }: UserSettingsProps) {
  const { profile, fetchProfile } = useAuthStore()
  const { theme, setTheme, pinCode, setPinCode } = useUiStore()
  const [nickname, setNickname] = useState(profile?.nickname ?? '')
  const [profileMessage, setProfileMessage] = useState(profile?.profile_message ?? '')
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<DesktopTab>('profile')
  const [mobileScreen, setMobileScreen] = useState<MobileScreen>('profile')
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)

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

  const handleBannerFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setBannerFile(file)
    e.target.value = ''
  }

  const handleBannerSave = async (cropped: File) => {
    if (!profile) return
    const formData = new FormData()
    formData.append('file', cropped)
    formData.append('path', `banners/${profile.id}`)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-media`,
      { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` }, body: formData },
    )
    if (res.ok) {
      const { url } = await res.json()
      await supabase.from('profiles').update({ banner_url: url }).eq('id', profile.id)
      await fetchProfile()
    }
    setBannerFile(null)
  }

  const handleRemoveBanner = async () => {
    if (!profile) return
    await supabase.from('profiles').update({ banner_url: null }).eq('id', profile.id)
    await fetchProfile()
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

  const desktopTabs: { value: DesktopTab; label: string }[] = [
    { value: 'profile', label: 'My Profile' },
    { value: 'appearance', label: 'Appearance' },
    { value: 'security', label: 'Security' },
  ]

  // Shared content blocks (no hooks — safe to use as JSX variables)
  const profileContent = (
    <>
      <div className="mb-6">
        <label className="mb-2 block text-xs font-bold uppercase text-secondary">Avatar</label>
        <AvatarUpload />
      </div>

      <div className="mb-6">
        <label className="mb-2 block text-xs font-bold uppercase text-secondary">Profile Banner</label>
        <div className="mb-3 w-full overflow-hidden rounded-lg" style={{ aspectRatio: '4 / 1' }}>
          {profile?.banner_url ? (
            <img src={profile.banner_url} alt="Banner" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[hsl(var(--color-brand)/.6)]" />
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => bannerInputRef.current?.click()}
            className="rounded-[3px] border border-[hsl(var(--color-brand))] px-4 py-1.5 text-sm font-medium text-brand transition-colors hover:bg-brand hover:text-white"
          >
            {profile?.banner_url ? 'Change Banner' : 'Upload Banner'}
          </button>
          {profile?.banner_url && (
            <button
              onClick={handleRemoveBanner}
              className="rounded-[3px] border border-[hsl(var(--color-input-border))] px-4 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-hover"
            >
              Remove
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">JPG or PNG. Will be cropped to 4:1.</p>
        <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerFileSelected} className="hidden" />
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
  )

  const appearanceContent = (
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
            <div className="flex h-16 w-24 items-end rounded p-2" style={{ backgroundColor: t.preview }}>
              <span className={`text-xs font-medium ${t.value === 'light' ? 'text-gray-800' : 'text-white'}`}>
                {t.label}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  const securityContent = (
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
    </div>
  )

  const mobileTitles: Record<MobileScreen, string> = {
    'profile': 'Profile',
    'settings-menu': 'Settings',
    'appearance': 'Appearance',
    'security': 'Security',
  }

  const handleMobileBack = () => {
    if (mobileScreen === 'profile') onClose()
    else if (mobileScreen === 'settings-menu') setMobileScreen('profile')
    else setMobileScreen('settings-menu')
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-stretch">

        {/* ── Mobile layout (< md) ── */}
        <div className="flex flex-1 flex-col bg-primary md:hidden">
          {/* Header — safe-area-aware so it clears the iPhone status bar */}
          <div className="flex-shrink-0 bg-secondary pt-safe">
            <div className="flex h-12 items-center border-b border-[hsl(var(--color-bg-tertiary))] px-2">
              {/* Left: Cancel / Back */}
              <button
                onClick={handleMobileBack}
                className="flex min-w-[64px] items-center gap-1 text-sm font-medium text-brand"
              >
                {mobileScreen !== 'profile' && <ChevronLeft />}
                {mobileScreen === 'profile' ? 'Cancel' : 'Back'}
              </button>

              {/* Center: screen title */}
              <h1 className="flex-1 text-center text-base font-semibold text-primary">
                {mobileTitles[mobileScreen]}
              </h1>

              {/* Right: gear icon on profile, spacer elsewhere */}
              <div className="flex min-w-[64px] justify-end">
                {mobileScreen === 'profile' ? (
                  <button
                    onClick={() => setMobileScreen('settings-menu')}
                    className="rounded p-2 text-interactive transition-colors hover:text-interactive-hover"
                    title="Settings"
                  >
                    <GearIcon />
                  </button>
                ) : (
                  <div className="w-10" />
                )}
              </div>
            </div>
          </div>

          {/* Screen content */}
          <div className="flex-1 overflow-y-auto">
            {mobileScreen === 'profile' && (
              <div className="px-4 py-6">{profileContent}</div>
            )}

            {mobileScreen === 'settings-menu' && (
              <div className="py-2">
                <button
                  onClick={() => setMobileScreen('appearance')}
                  className="flex w-full items-center justify-between px-4 py-4 text-sm text-primary transition-colors hover:bg-hover"
                >
                  <span>Appearance</span>
                  <span className="text-muted"><ChevronRight /></span>
                </button>
                <div className="mx-4 border-t border-[hsl(var(--color-bg-tertiary))]" />
                <button
                  onClick={() => { setMobileScreen('security'); resetPinWizard() }}
                  className="flex w-full items-center justify-between px-4 py-4 text-sm text-primary transition-colors hover:bg-hover"
                >
                  <span>Security</span>
                  <span className="text-muted"><ChevronRight /></span>
                </button>
              </div>
            )}

            {mobileScreen === 'appearance' && (
              <div className="px-4 py-6">{appearanceContent}</div>
            )}

            {mobileScreen === 'security' && (
              <div className="px-4 py-6">{securityContent}</div>
            )}
          </div>
        </div>

        {/* ── Desktop layout (≥ md) ── */}
        <div className="hidden flex-1 bg-tertiary md:flex">
          {/* Sidebar */}
          <div className="flex w-56 flex-shrink-0 flex-col items-end bg-secondary pr-2 pt-16">
            <nav className="w-44 space-y-0.5">
              {desktopTabs.map((t) => (
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

          {/* Content area */}
          <div className="flex flex-1 flex-col overflow-y-auto pt-16 pl-10 pr-8">
            <div className="max-w-2xl">
              {activeTab === 'profile' && (
                <>
                  <h2 className="mb-5 text-xl font-bold text-primary">My Profile</h2>
                  {profileContent}
                </>
              )}
              {activeTab === 'appearance' && (
                <>
                  <h2 className="mb-5 text-xl font-bold text-primary">Appearance</h2>
                  {appearanceContent}
                </>
              )}
              {activeTab === 'security' && (
                <>
                  <h2 className="mb-5 text-xl font-bold text-primary">Security</h2>
                  {securityContent}
                </>
              )}
            </div>
          </div>

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
        </div>
      </div>

      {/* Banner crop modal */}
      {bannerFile && (
        <BannerCrop
          file={bannerFile}
          onSave={handleBannerSave}
          onCancel={() => setBannerFile(null)}
        />
      )}

      {/* PIN entry modal — sits above both mobile and desktop layouts */}
      {pinStep !== 'idle' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
          <PinPad
            key={pinStep}
            title={pinPadTitle[pinStep]}
            subtitle={pinPadSubtitle[pinStep]}
            error={pinError}
            onComplete={handlePinComplete}
            onCancel={resetPinWizard}
          />
        </div>
      )}
    </Portal>
  )
}

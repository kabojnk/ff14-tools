import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { supabase } from '@/lib/supabase'
import { AvatarUpload } from '@/components/user/AvatarUpload'
import { Portal } from '@/components/ui/Portal'
import type { ThemePreset } from '@/types'

interface UserSettingsProps {
  onClose: () => void
}

export function UserSettings({ onClose }: UserSettingsProps) {
  const { profile, fetchProfile } = useAuthStore()
  const { theme, setTheme } = useUiStore()
  const [nickname, setNickname] = useState(profile?.nickname ?? '')
  const [profileMessage, setProfileMessage] = useState(profile?.profile_message ?? '')
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'appearance'>('profile')

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

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-stretch bg-tertiary">
      {/* Sidebar */}
      <div className="flex w-56 flex-shrink-0 flex-col items-end bg-secondary pr-2 pt-16">
        <nav className="w-44 space-y-0.5">
          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full rounded-[4px] px-3 py-1.5 text-left text-sm ${
              activeTab === 'profile' ? 'bg-active text-interactive-active' : 'text-interactive hover:bg-hover hover:text-interactive-hover'
            }`}
          >
            My Profile
          </button>
          <button
            onClick={() => setActiveTab('appearance')}
            className={`w-full rounded-[4px] px-3 py-1.5 text-left text-sm ${
              activeTab === 'appearance' ? 'bg-active text-interactive-active' : 'text-interactive hover:bg-hover hover:text-interactive-hover'
            }`}
          >
            Appearance
          </button>
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

              {/* Avatar */}
              <div className="mb-6">
                <label className="mb-2 block text-xs font-bold uppercase text-secondary">Avatar</label>
                <AvatarUpload />
              </div>

              {/* Nickname */}
              <div className="mb-4">
                <label className="mb-1 block text-xs font-bold uppercase text-secondary">
                  Display Name
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full rounded-[3px] bg-input px-3 py-2 text-sm text-primary outline-none"
                  maxLength={32}
                />
              </div>

              {/* Profile message */}
              <div className="mb-6">
                <label className="mb-1 block text-xs font-bold uppercase text-secondary">
                  About Me
                </label>
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
                        theme === t.value ? 'border-[hsl(var(--color-brand))]' : 'border-transparent hover:border-[hsl(var(--color-input-border))]'
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
        </div>
      </div>
    </div>
    </Portal>
  )
}

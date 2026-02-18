import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { StatusPicker } from '@/components/user/StatusPicker'
import { UserSettings } from '@/components/user/UserSettings'

export function UserPanel() {
  const { profile, signOut } = useAuthStore()
  const [showStatus, setShowStatus] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  return (
    <>
      <div className="flex items-center gap-2 bg-tertiary px-2 py-1.5">
        {/* Avatar + status (clickable for status picker) */}
        <button
          onClick={() => setShowStatus(true)}
          className="relative flex-shrink-0"
          title="Set status"
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.nickname}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
              {profile?.nickname?.charAt(0).toUpperCase() ?? '?'}
            </div>
          )}
          <div
            className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[hsl(var(--color-bg-tertiary))]"
            style={{
              backgroundColor: profile?.status === 'online'
                ? 'hsl(var(--color-status-online))'
                : profile?.status === 'away'
                  ? 'hsl(var(--color-status-away))'
                  : 'hsl(var(--color-status-offline))',
            }}
          />
        </button>

        {/* User info */}
        <div className="flex-1 overflow-hidden">
          <p className="truncate text-sm font-medium leading-tight text-primary">
            {profile?.nickname ?? 'User'}
          </p>
          <p className="truncate text-[11px] leading-tight text-muted">
            {profile?.custom_status_emoji && `${profile.custom_status_emoji} `}
            {profile?.custom_status_text || (
              profile?.status === 'online' ? 'Online'
              : profile?.status === 'away' ? 'Away'
              : 'Offline'
            )}
          </p>
        </div>

        {/* Settings button */}
        <button
          onClick={() => setShowSettings(true)}
          className="rounded p-1.5 text-interactive transition-colors hover:bg-hover hover:text-interactive-hover"
          title="User settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {/* Sign out */}
        <button
          onClick={signOut}
          className="rounded p-1.5 text-interactive transition-colors hover:bg-hover hover:text-interactive-hover"
          title="Sign out"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>

      {/* Modals */}
      {showStatus && <StatusPicker onClose={() => setShowStatus(false)} />}
      {showSettings && <UserSettings onClose={() => setShowSettings(false)} />}
    </>
  )
}

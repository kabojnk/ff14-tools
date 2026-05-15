import { useEffect } from 'react'
import { Portal } from '@/components/ui/Portal'
import { statusColor, statusLabel } from '@/components/user/StatusPicker'
import type { Profile, UserStatus } from '@/types'

interface UserProfileFullProps {
  profile: Profile
  status: UserStatus
  customText: string | null
  customEmoji: string | null
  onClose: () => void
}

export function UserProfileFull({ profile, status, customText, customEmoji, onClose }: UserProfileFullProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const memberSince = new Date(profile.created_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-sm overflow-x-hidden overflow-y-auto rounded-xl bg-floating shadow-2xl"
          style={{ maxHeight: 'calc(100dvh - 2rem)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white/80 transition-colors hover:bg-black/50 hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Banner */}
          {profile.banner_url ? (
            <img src={profile.banner_url} alt="" className="h-24 w-full object-cover" />
          ) : (
            <div className="h-24 bg-[hsl(var(--color-brand)/.6)]" />
          )}

          {/* Body */}
          <div className="px-5 pb-5">
            {/* Avatar — overlaps banner */}
            <div className="relative -mt-11 mb-3 inline-block">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.nickname}
                  className="h-20 w-20 rounded-full object-cover ring-4 ring-[hsl(var(--color-bg-floating))]"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand text-2xl font-bold text-white ring-4 ring-[hsl(var(--color-bg-floating))]">
                  {profile.nickname.charAt(0).toUpperCase()}
                </div>
              )}
              <div
                className="absolute bottom-1 right-0.5 h-5 w-5 rounded-full border-[3px] border-[hsl(var(--color-bg-floating))]"
                style={{ backgroundColor: statusColor(status) }}
              />
            </div>

            {/* Name */}
            <h2 className="text-xl font-bold leading-tight text-primary">{profile.nickname}</h2>

            {/* Status */}
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: statusColor(status) }} />
              <span className="text-sm text-muted">{statusLabel(status)}</span>
            </div>

            {/* Custom status */}
            {(customEmoji || customText) && (
              <div className="mt-1.5 flex items-center gap-2">
                {customEmoji && <span className="text-base leading-none">{customEmoji}</span>}
                {customText && <span className="text-sm text-muted">{customText}</span>}
              </div>
            )}

            <div className="my-4 border-t border-[hsl(var(--color-input-border))]" />

            {/* About Me */}
            {profile.profile_message ? (
              <div className="mb-4">
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-secondary">About Me</p>
                <p className="whitespace-pre-wrap text-sm text-muted">{profile.profile_message}</p>
              </div>
            ) : null}

            {/* Member Since */}
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-secondary">Member Since</p>
              <p className="text-sm text-muted">{memberSince}</p>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}

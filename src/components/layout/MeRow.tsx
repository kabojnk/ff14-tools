import { useRef, useState } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { useStatusStore } from '@/stores/statusStore'
import { displayed } from '@/lib/presence'
import { presenceLabel } from '@/lib/status'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { StatusPill } from '@/components/chat2/StatusPill'
import { ProfileEditor } from '@/components/user/ProfileEditor'
import { Settings } from '@/components/settings/Settings'

/**
 * You: avatar (opens the profile editor), name, then your status pill and status message (or your
 * presence when neither is set), and a settings gear.
 * The desktop left column's top row and the phone list screen's top bar.
 */
export function MeRow({ className = '' }: { className?: string }) {
  const profile = useAuthStore((s) => s.profile)
  // My presence across devices, with my manual override applied at once.
  const presence = usePresenceStore((s) => displayed(profile ? s.users[profile.id] : undefined, s.override))
  const statusId = profile?.status_id ?? null
  const status = useStatusStore((s) => (statusId ? (s.definitions.find((d) => d.id === statusId) ?? null) : null))
  const message = profile?.custom_status_text?.trim() || null
  const [open, setOpen] = useState<'editor' | 'settings' | null>(null)
  const gearRef = useRef<HTMLButtonElement>(null)
  const name = profile?.nickname ?? 'You'

  // Settings → "Edit profile": focus the gear first, so the editor's sheet takes it as its opener
  // and gives focus back to it on close (the Settings button inside is gone by then).
  const editFromSettings = () => {
    gearRef.current?.focus()
    setOpen('editor')
  }

  return (
    <>
      <div data-me-row className={`flex items-center gap-2.5 border-b border-[color:var(--line)] px-3 py-3 ${className}`}>
        <button type="button" onClick={() => setOpen('editor')} title="Set status" className="flex-none rounded-full">
          <Avatar name={name} url={profile?.avatar_url} size={34} presence={presence} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-[color:var(--fg)]">{name}</p>
          {status || message ? (
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight text-[color:var(--muted)]">
              {status && <StatusPill label={status.label} color={status.color} className="min-w-0 flex-none" />}
              {message && <span className="min-w-0 truncate">{message}</span>}
            </p>
          ) : (
            <p className="truncate text-[11px] leading-tight text-[color:var(--muted)]">{presenceLabel(presence).toLowerCase()}</p>
          )}
        </div>
        <button
          ref={gearRef}
          type="button"
          onClick={() => setOpen('settings')}
          title="User settings"
          aria-label="User settings"
          className="flex-none rounded-md p-1.5 text-[color:var(--muted)] transition-colors hover:bg-[color:var(--seg)] hover:text-[color:var(--fg)]"
        >
          <Icon icon={SettingsIcon} size={18} />
        </button>
      </div>

      {open === 'editor' && <ProfileEditor onClose={() => setOpen(null)} />}
      {open === 'settings' && <Settings onClose={() => setOpen(null)} onEditProfile={editFromSettings} />}
    </>
  )
}

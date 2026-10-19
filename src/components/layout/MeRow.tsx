import { useState } from 'react'
import { Settings } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { useStatusStore } from '@/stores/statusStore'
import { displayed } from '@/lib/presence'
import { presenceLabel } from '@/lib/status'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { CustomStatus } from '@/components/user/CustomStatus'
import { StatusPicker } from '@/components/user/StatusPicker'
import { UserSettings } from '@/components/user/UserSettings'

/**
 * You: avatar (opens the status picker), name, then your custom status or presence, and a settings gear.
 * The desktop left column's top row and the phone list screen's top bar.
 */
export function MeRow({ className = '' }: { className?: string }) {
  const profile = useAuthStore((s) => s.profile)
  // My presence across devices, with my manual override applied at once.
  const presence = usePresenceStore((s) => displayed(profile ? s.users[profile.id] : undefined, s.override))
  const statusId = profile?.status_id ?? null
  const customText = profile?.custom_status_text ?? null
  const hasCustomStatus = useStatusStore((s) => !!statusId && s.definitions.some((d) => d.id === statusId))
  const [showStatus, setShowStatus] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const name = profile?.nickname ?? 'You'

  return (
    <>
      <div data-me-row className={`flex items-center gap-2.5 border-b border-[color:var(--line)] px-3 py-3 ${className}`}>
        <button type="button" onClick={() => setShowStatus(true)} title="Set status" className="flex-none rounded-full">
          <Avatar name={name} url={profile?.avatar_url} size={34} presence={presence} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-[color:var(--fg)]">{name}</p>
          {hasCustomStatus || customText ? (
            <CustomStatus statusId={statusId} text={customText} className="truncate text-[11px] leading-tight" />
          ) : (
            <p className="truncate text-[11px] leading-tight text-[color:var(--muted)]">{presenceLabel(presence).toLowerCase()}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          title="User settings"
          aria-label="User settings"
          className="flex-none rounded-md p-1.5 text-[color:var(--muted)] transition-colors hover:bg-[color:var(--seg)] hover:text-[color:var(--fg)]"
        >
          <Icon icon={Settings} size={18} />
        </button>
      </div>

      {showStatus && <StatusPicker onClose={() => setShowStatus(false)} />}
      {showSettings && <UserSettings onClose={() => setShowSettings(false)} />}
    </>
  )
}

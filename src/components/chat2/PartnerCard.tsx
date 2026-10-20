import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { StatusPill } from '@/components/chat2/StatusPill'
import type { Presence, Profile, StatusDefinition } from '@/types'

interface PartnerCardProps {
  name: string
  profile: Profile | null
  presence: Presence
  status: StatusDefinition | null
  /** `popover` under the header (desktop); `sheet` from the bottom (phones). */
  variant: 'popover' | 'sheet'
  onClose: () => void
}

/** The partner's profile card: banner, avatar, name, pill and status message. */
export function PartnerCard({ name, profile, presence, status, variant, onClose }: PartnerCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [onClose])

  const sheet = variant === 'sheet'
  const message = profile?.custom_status_text?.trim() || null

  const card = (
    <div
      ref={ref}
      role="dialog"
      aria-label={name}
      data-partner-card
      className={`overflow-hidden border border-[color:var(--line)] bg-[color:var(--them)] text-[color:var(--fg)] shadow-[0_10px_30px_var(--shadow)] ${
        sheet ? 'w-full rounded-t-2xl pb-safe' : 'w-[300px] rounded-xl'
      }`}
    >
      <div className="relative h-[72px]">
        {profile?.banner_url ? (
          <img src={profile.banner_url} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div aria-hidden className="h-full w-full bg-[linear-gradient(120deg,var(--accent),var(--seg-on))]" />
        )}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2 rounded-full bg-[color:color-mix(in_srgb,var(--bar)_70%,transparent)] p-1 text-[color:var(--fg)]"
        >
          <Icon icon={X} size={16} />
        </button>
      </div>
      <div className="flex flex-col gap-1.5 px-3.5 pb-3.5">
        <span className="-mt-7 inline-block w-fit rounded-full border-[3px] border-[color:var(--them)]">
          <Avatar name={name} url={profile?.avatar_url} size={52} presence={presence} />
        </span>
        <p className="text-[15px] font-bold leading-tight">{name}</p>
        {status && (
          <span>
            <StatusPill label={status.label} color={status.color} />
          </span>
        )}
        {message && <p className="whitespace-pre-wrap break-words text-[12.5px] text-[color:var(--muted)]">{message}</p>}
      </div>
    </div>
  )

  if (!sheet) return <div className="absolute left-3 top-full z-50 mt-1">{card}</div>
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      {card}
    </div>
  )
}

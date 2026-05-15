import { useEffect, useRef } from 'react'
import { Portal } from '@/components/ui/Portal'
import { statusColor, statusLabel } from '@/components/user/StatusPicker'
import type { Profile, UserStatus } from '@/types'

interface UserProfileProps {
  profile: Profile
  status: UserStatus
  customText: string | null
  customEmoji: string | null
  anchorRect: DOMRect
  onClose: () => void
}

const CARD_WIDTH = 280
const CARD_HEIGHT_EST = 320
const MARGIN = 8

function calcPosition(anchor: DOMRect) {
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Prefer right of anchor; fall back to left
  let left = anchor.right + MARGIN
  if (left + CARD_WIDTH > vw - MARGIN) {
    left = anchor.left - CARD_WIDTH - MARGIN
  }
  left = Math.max(MARGIN, left)

  // Align top of card to top of anchor; clamp to viewport
  let top = anchor.top
  if (top + CARD_HEIGHT_EST > vh - MARGIN) {
    top = vh - CARD_HEIGHT_EST - MARGIN
  }
  top = Math.max(MARGIN, top)

  return { left, top }
}

export function UserProfile({ profile, status, customText, customEmoji, anchorRect, onClose }: UserProfileProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const { left, top } = calcPosition(anchorRect)

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <Portal>
      <div
        ref={cardRef}
        className="fixed z-50 overflow-hidden rounded-lg bg-floating shadow-2xl"
        style={{ left, top, width: CARD_WIDTH }}
      >
        {/* Banner */}
        <div className="h-16 bg-[hsl(var(--color-brand)/.6)]" />

        {/* Body */}
        <div className="px-4 pb-4">
          {/* Avatar — overlaps banner */}
          <div className="relative -mt-9 mb-3 inline-block">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.nickname}
                className="h-[72px] w-[72px] rounded-full object-cover ring-4 ring-[hsl(var(--color-bg-floating))]"
              />
            ) : (
              <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-brand text-2xl font-bold text-white ring-4 ring-[hsl(var(--color-bg-floating))]">
                {profile.nickname.charAt(0).toUpperCase()}
              </div>
            )}
            <div
              className="absolute bottom-1 right-0.5 h-4 w-4 rounded-full border-[3px] border-[hsl(var(--color-bg-floating))]"
              style={{ backgroundColor: statusColor(status) }}
            />
          </div>

          {/* Nickname */}
          <h3 className="text-base font-bold leading-tight text-primary">{profile.nickname}</h3>

          {/* Status line */}
          <div className="mt-1 flex items-center gap-1.5">
            <div className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: statusColor(status) }} />
            <span className="text-xs text-muted">{statusLabel(status)}</span>
          </div>

          {/* Custom status — emoji inline with text */}
          {(customEmoji || customText) && (
            <div className="mt-1.5 flex items-center gap-1.5">
              {customEmoji && <span className="text-sm leading-none">{customEmoji}</span>}
              {customText && <span className="text-xs text-muted">{customText}</span>}
            </div>
          )}

          {/* About Me */}
          {profile.profile_message && (
            <>
              <div className="my-3 border-t border-[hsl(var(--color-input-border))]" />
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-secondary">About Me</p>
              <p className="whitespace-pre-wrap text-xs text-muted">{profile.profile_message}</p>
            </>
          )}
        </div>
      </div>
    </Portal>
  )
}

import { useEffect, useState } from 'react'
import { usePresenceStore } from '@/stores/presenceStore'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

export function MemberList() {
  const { onlineUsers } = usePresenceStore()
  const { user } = useAuthStore()
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])

  // Fetch all profiles once (so we can show offline members too)
  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('nickname', { ascending: true })
      .then(({ data }) => {
        if (data) setAllProfiles(data as Profile[])
      })
  }, [])

  // Merge presence data onto profiles
  const members = allProfiles.map((profile) => {
    const presence = onlineUsers[profile.id]
    return {
      profile,
      status: presence?.status ?? 'offline',
      customText: presence?.custom_status_text ?? profile.custom_status_text,
      customEmoji: presence?.custom_status_emoji ?? profile.custom_status_emoji,
    }
  })

  const online = members.filter((m) => m.status === 'online')
  const away   = members.filter((m) => m.status === 'away')
  const offline = members.filter((m) => m.status === 'offline')

  return (
    <aside className="flex w-[var(--member-list-width)] flex-shrink-0 flex-col overflow-y-auto bg-secondary py-4">
      <MemberSection label="Online" count={online.length} members={online} currentUserId={user?.id} />
      {away.length > 0 && (
        <MemberSection label="Away" count={away.length} members={away} currentUserId={user?.id} />
      )}
      <MemberSection label="Offline" count={offline.length} members={offline} currentUserId={user?.id} dim />
    </aside>
  )
}

interface MemberEntry {
  profile: Profile
  status: 'online' | 'away' | 'offline'
  customText: string | null
  customEmoji: string | null
}

function MemberSection({
  label,
  count,
  members,
  currentUserId,
  dim = false,
}: {
  label: string
  count: number
  members: MemberEntry[]
  currentUserId?: string
  dim?: boolean
}) {
  if (count === 0) return null

  return (
    <div className="mb-4 px-3">
      <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label} — {count}
      </p>
      <div className="space-y-0.5">
        {members.map(({ profile, status, customText, customEmoji }) => (
          <MemberRow
            key={profile.id}
            profile={profile}
            status={status}
            customText={customText}
            customEmoji={customEmoji}
            isYou={profile.id === currentUserId}
            dim={dim}
          />
        ))}
      </div>
    </div>
  )
}

function MemberRow({
  profile,
  status,
  customText,
  customEmoji,
  isYou,
  dim,
}: {
  profile: Profile
  status: 'online' | 'away' | 'offline'
  customText: string | null
  customEmoji: string | null
  isYou: boolean
  dim: boolean
}) {
  const statusColor =
    status === 'online' ? 'hsl(var(--color-status-online))'
    : status === 'away'  ? 'hsl(var(--color-status-away))'
    : 'hsl(var(--color-status-offline))'

  return (
    <div
      className={`flex items-center gap-2.5 rounded-[4px] px-2 py-1.5 transition-colors hover:bg-hover ${dim ? 'opacity-50' : ''}`}
      title={isYou ? `${profile.nickname} (you)` : profile.nickname}
    >
      {/* Avatar with status dot */}
      <div className="relative flex-shrink-0">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.nickname}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
            {profile.nickname.charAt(0).toUpperCase()}
          </div>
        )}
        <div
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[hsl(var(--color-bg-secondary))]"
          style={{ backgroundColor: statusColor }}
        />
      </div>

      {/* Name + custom status */}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium leading-tight ${dim ? 'text-muted' : 'text-interactive-hover'}`}>
          {profile.nickname}{isYou && <span className="ml-1 text-[10px] text-muted font-normal">(you)</span>}
        </p>
        {(customText || customEmoji) && (
          <p className="truncate text-[11px] leading-tight text-muted">
            {customEmoji && `${customEmoji} `}{customText}
          </p>
        )}
      </div>
    </div>
  )
}

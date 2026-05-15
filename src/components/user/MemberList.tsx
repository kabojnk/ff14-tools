import { useEffect, useState } from 'react'
import { usePresenceStore } from '@/stores/presenceStore'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { statusColor } from '@/components/user/StatusPicker'
import { UserProfile } from '@/components/user/UserProfile'
import type { Profile, UserStatus } from '@/types'

interface SelectedProfile {
  profile: Profile
  status: UserStatus
  customText: string | null
  customEmoji: string | null
  anchorRect: DOMRect
}

const ALERT_STATUSES: UserStatus[] = ['under_close_watch', 'found_out', 'you_can_call', 'potential_eep']

export function MemberList() {
  const { onlineUsers } = usePresenceStore()
  const { user } = useAuthStore()
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [selectedProfile, setSelectedProfile] = useState<SelectedProfile | null>(null)

  // Fetch all profiles and keep them live via realtime
  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('nickname', { ascending: true })
      .then(({ data }) => {
        if (data) setAllProfiles(data as Profile[])
      })

    const channel = supabase
      .channel('member-list-profiles')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          setAllProfiles((prev) =>
            prev.map((p) =>
              p.id === (payload.new as Profile).id ? { ...p, ...(payload.new as Profile) } : p,
            ),
          )
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
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

  const alerts  = members.filter((m) => ALERT_STATUSES.includes(m.status))
  const online  = members.filter((m) => m.status === 'online')
  const away    = members.filter((m) => m.status === 'away')
  const offline = members.filter((m) => m.status === 'offline')

  const handleMemberClick = (entry: typeof members[number], rect: DOMRect) => {
    setSelectedProfile({
      profile: entry.profile,
      status: entry.status,
      customText: entry.customText,
      customEmoji: entry.customEmoji,
      anchorRect: rect,
    })
  }

  return (
    <>
      <aside className="flex w-[var(--member-list-width)] flex-shrink-0 flex-col overflow-y-auto bg-secondary py-4">
        {alerts.length > 0 && (
          <MemberSection label="Alert" count={alerts.length} members={alerts} currentUserId={user?.id} onMemberClick={handleMemberClick} />
        )}
        <MemberSection label="Online" count={online.length} members={online} currentUserId={user?.id} onMemberClick={handleMemberClick} />
        {away.length > 0 && (
          <MemberSection label="Away" count={away.length} members={away} currentUserId={user?.id} onMemberClick={handleMemberClick} />
        )}
        <MemberSection label="Offline" count={offline.length} members={offline} currentUserId={user?.id} dim onMemberClick={handleMemberClick} />
      </aside>

      {selectedProfile && (
        <UserProfile
          profile={selectedProfile.profile}
          status={selectedProfile.status}
          customText={selectedProfile.customText}
          customEmoji={selectedProfile.customEmoji}
          anchorRect={selectedProfile.anchorRect}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </>
  )
}

interface MemberEntry {
  profile: Profile
  status: UserStatus
  customText: string | null
  customEmoji: string | null
}

function MemberSection({
  label, count, members, currentUserId, dim = false, onMemberClick,
}: {
  label: string
  count: number
  members: MemberEntry[]
  currentUserId?: string
  dim?: boolean
  onMemberClick: (entry: MemberEntry, rect: DOMRect) => void
}) {
  if (count === 0) return null

  return (
    <div className="mb-4 px-3">
      <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label} — {count}
      </p>
      <div className="space-y-0.5">
        {members.map((entry) => (
          <MemberRow
            key={entry.profile.id}
            profile={entry.profile}
            status={entry.status}
            customText={entry.customText}
            customEmoji={entry.customEmoji}
            isYou={entry.profile.id === currentUserId}
            dim={dim}
            onClick={(rect) => onMemberClick(entry, rect)}
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
  onClick,
}: {
  profile: Profile
  status: UserStatus
  customText: string | null
  customEmoji: string | null
  isYou: boolean
  dim: boolean
  onClick: (rect: DOMRect) => void
}) {
  return (
    <button
      className={`flex w-full items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-left transition-colors hover:bg-hover ${dim ? 'opacity-50' : ''}`}
      title={isYou ? `${profile.nickname} (you)` : profile.nickname}
      onClick={(e) => onClick((e.currentTarget as HTMLElement).getBoundingClientRect())}
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
          style={{ backgroundColor: statusColor(status) }}
        />
      </div>

      {/* Name + custom status */}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium leading-tight ${dim ? 'text-muted' : 'text-interactive-hover'}`}>
          {profile.nickname}{isYou && <span className="ml-1 text-[10px] text-muted font-normal">(you)</span>}
        </p>
        {(customText || customEmoji) && (
          <p className="flex items-center gap-1 truncate text-[11px] leading-tight text-muted">
            {customEmoji && <span className="text-xs leading-none">{customEmoji}</span>}
            {customText && <span className="truncate">{customText}</span>}
          </p>
        )}
      </div>
    </button>
  )
}

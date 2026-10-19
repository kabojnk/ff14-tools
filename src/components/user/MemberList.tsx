import { useEffect, useState } from 'react'
import { usePresenceStore } from '@/stores/presenceStore'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { useStatusStore } from '@/stores/statusStore'
import { groupMembers, presenceColor, presenceOf } from '@/lib/status'
import { UserProfile } from '@/components/user/UserProfile'
import { CustomStatus } from '@/components/user/CustomStatus'
import type { Presence, Profile, UserStatus } from '@/types'

interface MemberEntry {
  profile: Profile
  status: UserStatus
  presence: Presence
  statusId: string | null
  customText: string | null
}

interface SelectedProfile extends MemberEntry {
  anchorRect: DOMRect
}

export function MemberList() {
  const { onlineUsers } = usePresenceStore()
  const { user } = useAuthStore()
  const definitions = useStatusStore((s) => s.definitions)
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

  // Merge presence data onto profiles. The custom status comes from the live profile row.
  const members: MemberEntry[] = allProfiles.map((profile) => {
    const live = onlineUsers[profile.id]
    const status: UserStatus = live?.status ?? 'offline'
    return {
      profile,
      status,
      presence: presenceOf(status),
      statusId: profile.status_id,
      customText: live?.custom_status_text ?? profile.custom_status_text,
    }
  })

  const groups = groupMembers(members, definitions)

  const handleMemberClick = (entry: MemberEntry, rect: DOMRect) => {
    setSelectedProfile({ ...entry, anchorRect: rect })
  }

  return (
    <>
      <aside className="flex w-[var(--member-list-width)] flex-shrink-0 flex-col overflow-y-auto bg-secondary py-4">
        {groups.map((g) => (
          <MemberSection
            key={g.key}
            label={g.label}
            color={g.color}
            count={g.members.length}
            members={g.members}
            currentUserId={user?.id}
            dim={g.presence === 'offline'}
            onMemberClick={handleMemberClick}
          />
        ))}
      </aside>

      {selectedProfile && (
        <UserProfile
          profile={selectedProfile.profile}
          status={selectedProfile.status}
          customText={selectedProfile.customText}
          statusId={selectedProfile.statusId}
          anchorRect={selectedProfile.anchorRect}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </>
  )
}

function MemberSection({
  label, color, count, members, currentUserId, dim = false, onMemberClick,
}: {
  label: string
  color?: string
  count: number
  members: MemberEntry[]
  currentUserId?: string
  dim?: boolean
  onMemberClick: (entry: MemberEntry, rect: DOMRect) => void
}) {
  if (count === 0) return null

  return (
    <div className="mb-4 px-3">
      <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted" style={color ? { color } : undefined}>
        {label} — {count}
      </p>
      <div className="space-y-0.5">
        {members.map((entry) => (
          <MemberRow
            key={entry.profile.id}
            profile={entry.profile}
            status={entry.status}
            customText={entry.customText}
            statusId={entry.statusId}
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
  statusId,
  isYou,
  dim,
  onClick,
}: {
  profile: Profile
  status: UserStatus
  customText: string | null
  statusId: string | null
  isYou: boolean
  dim: boolean
  onClick: (rect: DOMRect) => void
}) {
  return (
    <button
      className={`flex w-full items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-left transition-colors hover:bg-hover ${dim ? 'opacity-50' : ''}`}
      title={isYou ? `${profile.nickname} (you)` : profile.nickname}
      data-member={profile.nickname}
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
          style={{ backgroundColor: presenceColor(presenceOf(status)) }}
        />
      </div>

      {/* Name + custom status */}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium leading-tight ${dim ? 'text-muted' : 'text-interactive-hover'}`}>
          {profile.nickname}{isYou && <span className="ml-1 text-[10px] text-muted font-normal">(you)</span>}
        </p>
        <CustomStatus statusId={statusId} text={customText} className="truncate text-[11px] leading-tight" />
      </div>
    </button>
  )
}

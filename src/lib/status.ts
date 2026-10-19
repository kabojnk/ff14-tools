import type { Presence, StatusDefinition } from '@/types'

/**
 * The automatic presence behind a profiles.status value.
 * Legacy custom values written by the old app (e.g. 'found_out') count as 'online'.
 */
export function presenceOf(status: string | null | undefined): Presence {
  if (status === 'online' || status === 'away' || status === 'offline') return status
  return status ? 'online' : 'offline'
}

export function presenceColor(p: Presence): string {
  return `hsl(var(--color-status-${p}))`
}

const PRESENCE_LABEL: Record<Presence, string> = { online: 'Online', away: 'Away', offline: 'Offline' }

export function presenceLabel(p: Presence): string {
  return PRESENCE_LABEL[p]
}

export interface MemberGroup<T> {
  key: string
  label: string
  /** The custom status colour, for status groups. */
  color?: string
  /** A presence group; the member list dims the offline one. */
  presence?: Presence
  members: T[]
}

/**
 * Member list sections: one per custom status that has members (in definition order), then
 * Online, Away and Offline for everyone else. Presence groups are always returned, even empty.
 */
export function groupMembers<T extends { presence: Presence; statusId: string | null }>(
  members: T[],
  definitions: StatusDefinition[],
): MemberGroup<T>[] {
  const known = new Set(definitions.map((d) => d.id))
  const statusGroups = definitions
    .map((d) => ({ key: `status:${d.id}`, label: d.label, color: d.color, members: members.filter((m) => m.statusId === d.id) }))
    .filter((g) => g.members.length > 0)
  const rest = members.filter((m) => !m.statusId || !known.has(m.statusId))
  const presenceGroups = (['online', 'away', 'offline'] as const).map((p) => ({
    key: p,
    label: PRESENCE_LABEL[p],
    presence: p,
    members: rest.filter((m) => m.presence === p),
  }))
  return [...statusGroups, ...presenceGroups]
}

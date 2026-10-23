import type { Presence } from '@/types'

/**
 * The automatic presence behind a profiles.status value.
 * Legacy custom values written by the old app (e.g. 'found_out') count as 'online'.
 */
export function presenceOf(status: string | null | undefined): Presence {
  if (status === 'online' || status === 'away' || status === 'offline') return status
  return status ? 'online' : 'offline'
}

export function presenceColor(p: Presence): string {
  return `var(--presence-${p})`
}

const PRESENCE_LABEL: Record<Presence, string> = { online: 'Online', away: 'Away', offline: 'Offline' }

export function presenceLabel(p: Presence): string {
  return PRESENCE_LABEL[p]
}

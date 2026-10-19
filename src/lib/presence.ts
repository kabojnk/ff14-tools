import { presenceOf } from '@/lib/status'
import type { Presence, PresenceOverride } from '@/types'

export type { Presence, PresenceOverride }

/** One device's entry on the presence channel. Old cached apps send `status` only. */
export interface DevicePresence {
  user_id: string
  device_id?: string
  presence?: Presence
  /** Legacy field, still sent so old apps can read it. */
  status?: string | null
  at?: number
}

export interface AggregatePresence {
  presence: Presence
  /** Latest `at` across the user's channel entries (0 when unknown). Not the "last seen" shown in the UI. */
  lastSeen: number
}

const RANK: Record<Presence, number> = { offline: 0, away: 1, online: 2 }

let sessionDeviceId: string | null = null

/** A random ID for this browser, kept in localStorage; a per-session ID when storage is unavailable. */
export function deviceId(): string {
  try {
    const stored = localStorage.getItem('deviceId')
    if (stored) return stored
    const id = crypto.randomUUID()
    localStorage.setItem('deviceId', id)
    return id
  } catch {
    sessionDeviceId ??= crypto.randomUUID()
    return sessionDeviceId
  }
}

/** Most-online state per user across every channel entry (two tabs can share a device ID). */
export function aggregate(entries: DevicePresence[]): Record<string, AggregatePresence> {
  const out: Record<string, AggregatePresence> = {}
  for (const e of entries) {
    const presence = e.presence ?? presenceOf(e.status)
    const at = e.at ?? 0
    const prev = out[e.user_id]
    if (!prev) {
      out[e.user_id] = { presence, lastSeen: at }
    } else {
      out[e.user_id] = {
        presence: RANK[presence] > RANK[prev.presence] ? presence : prev.presence,
        lastSeen: Math.max(prev.lastSeen, at),
      }
    }
  }
  return out
}

/**
 * What everyone sees for a user. A manual override (profiles.presence_override) wins:
 * 'invisible' shows offline, 'away' shows away (only while some device is connected);
 * otherwise the aggregate. Never reads profiles.status.
 */
export function displayed(
  agg: { presence: Presence } | undefined,
  override: PresenceOverride | null | undefined,
): Presence {
  const live = agg?.presence ?? 'offline'
  if (override === 'invisible') return 'offline'
  if (override === 'away') return live === 'offline' ? 'offline' : 'away'
  return live
}

/** The profiles.presence_override value for a StatusPicker choice. Online clears it. */
export function overrideFor(choice: Presence): PresenceOverride | null {
  if (choice === 'away') return 'away'
  if (choice === 'offline') return 'invisible'
  return null
}

/** "Last seen" from profiles.last_seen_at, as epoch ms; null when unknown. */
export function lastSeen(profile: { last_seen_at?: string | null } | null | undefined): number | null {
  if (!profile?.last_seen_at) return null
  const ms = Date.parse(profile.last_seen_at)
  return Number.isNaN(ms) ? null : ms
}

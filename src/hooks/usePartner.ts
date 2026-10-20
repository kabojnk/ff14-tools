import { displayed } from '@/lib/presence'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { useProfileStore } from '@/stores/profileStore'
import { useStatusStore } from '@/stores/statusStore'
import type { Presence, Profile, StatusDefinition } from '@/types'

export interface Partner {
  id: string | null
  /** Live from the profile store (never carries the PIN). Null until loaded. */
  profile: Profile | null
  /** Most-online across their devices, with their manual override applied. */
  presence: Presence
  /** Their shared custom status definition, if one is set and still exists. */
  status: StatusDefinition | null
}

/** The other member of the conversation. */
export function usePartner(): Partner {
  const myId = useAuthStore((s) => s.user?.id ?? null)
  const id = useConversationStore((s) => s.memberIds.find((m) => m !== myId) ?? null)
  const profile = useProfileStore((s) => (id ? (s.profiles[id] ?? null) : null))
  const presence = usePresenceStore((s) => displayed(id ? s.users[id] : undefined, profile?.presence_override))
  const statusId = profile?.status_id ?? null
  const status = useStatusStore((s) => (statusId ? (s.definitions.find((d) => d.id === statusId) ?? null) : null))
  return { id, profile, presence, status }
}

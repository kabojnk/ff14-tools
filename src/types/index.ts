export type UserStatus =
  | 'online'
  | 'away'
  | 'offline'
  | 'under_close_watch'
  | 'found_out'
  | 'you_can_call'
  | 'potential_eep'

export type Space = 'main' | 'schist'
export type Presence = 'online' | 'away' | 'offline'
/** profiles.presence_override: a manual choice applied on every device. */
export type PresenceOverride = 'away' | 'invisible'
export type MediaKind = 'image' | 'video' | 'gif' | 'file' | 'audio' | 'link'

export interface Profile {
  id: string
  nickname: string
  avatar_url: string | null
  banner_url: string | null
  profile_message: string | null
  status: UserStatus
  custom_status_text: string | null
  status_id: string | null
  presence_override?: PresenceOverride | null
  last_seen_at?: string | null
  read_receipts: boolean
  lock_pin_length: number | null
  /** Manual presence choice; null follows the devices. */
  presence_override: 'away' | 'invisible' | null
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

export interface Conversation {
  id: string
  title: string | null
  archived: boolean
  created_by: string | null
  created_at: string
}

export interface ReadPosition {
  conversation_id: string
  user_id: string
  space: Space
  last_read_at: string
}

export interface StatusDefinition {
  id: string
  label: string
  color: string
  position: number
  legacy_key: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface MediaItem {
  id: string
  message_id: string
  conversation_id: string
  space: Space
  session_id: string
  kind: MediaKind
  url: string
  filename: string | null
  extension: string | null
  size: number | null
  spoiler: boolean
  created_at: string
}

export interface Session {
  id: string
  conversation_id: string
  channel_id: string | null
  visible: boolean
  created_by: string
  created_at: string
}

export interface Attachment {
  url: string
  type: 'image' | 'video' | 'gif' | 'file' | 'audio'
  filename: string
  size: number
  spoiler: boolean
}

export interface Message {
  id: string
  conversation_id: string
  space: Space
  channel_id: string | null
  session_id: string
  author_id: string
  content: string | null
  attachments: Attachment[]
  type: 'text' | 'gif' | 'system'
  edited_at: string | null
  deleted: boolean
  reply_to: string | null
  created_at: string
  // Joined fields
  author?: Profile
}

export interface Reaction {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}

export interface CustomEmoji {
  id: string
  name: string
  image_url: string
  uploaded_by: string
  created_at: string
}

export interface AppSettings {
  key: string
  value: string
  updated_at: string
}

export type ThemePreset = 'dark' | 'light' | 'midnight'

export interface PinnedMessage {
  id: string
  conversation_id: string
  channel_id: string | null
  message_id: string
  pinned_by: string
  pinned_at: string
}

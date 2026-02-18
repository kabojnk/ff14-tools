export interface Profile {
  id: string
  nickname: string
  avatar_url: string | null
  profile_message: string | null
  status: 'online' | 'away' | 'offline'
  custom_status_text: string | null
  custom_status_emoji: string | null
  created_at: string
  updated_at: string
}

export interface Channel {
  id: string
  name: string
  description: string | null
  archived: boolean
  position: number
  created_by: string
  created_at: string
}

export interface Session {
  id: string
  channel_id: string
  visible: boolean
  created_by: string
  created_at: string
}

export interface Attachment {
  url: string
  type: 'image' | 'video' | 'gif' | 'file'
  filename: string
  size: number
  spoiler: boolean
}

export interface Message {
  id: string
  channel_id: string
  session_id: string
  author_id: string
  content: string | null
  attachments: Attachment[]
  type: 'text' | 'gif' | 'system'
  edited_at: string | null
  deleted: boolean
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

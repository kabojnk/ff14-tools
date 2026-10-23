import type { MediaKind } from '@/types'

/** The media gallery's type chips. */
export type MediaFilterKind = 'all' | 'photos' | 'videos' | 'gifs' | 'files' | 'links' | 'voice'
/** This space only, or both spaces. */
export type MediaScope = 'space' | 'both'

const KINDS: Record<MediaFilterKind, MediaKind[]> = {
  all: ['image', 'video', 'gif'],
  photos: ['image'],
  videos: ['video'],
  gifs: ['gif'],
  files: ['file'],
  links: ['link'],
  voice: ['audio'],
}

/**
 * The get_media p_kinds for a chip. With an extension, All searches every kind (null), so `.zip`
 * finds files from the All chip.
 */
export function kindsFor(kind: MediaFilterKind, extension: string | null): MediaKind[] | null {
  if (kind === 'all' && extension) return null
  return KINDS[kind]
}

/** 512 → "0.5 KB", 2048 → "2 KB", 1.5 MiB → "1.5 MB"; unknown → "". */
export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return ''
  const mb = 1024 * 1024
  const n = bytes >= mb ? bytes / mb : bytes / 1024
  return `${Number(n.toFixed(1))} ${bytes >= mb ? 'MB' : 'KB'}`
}

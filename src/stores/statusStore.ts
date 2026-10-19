import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { StatusDefinition } from '@/types'

export interface StatusInput {
  label: string
  color: string
}

type Result = { error: string | null }

const COLOR_RE = /^#[0-9a-f]{6}$/i

/** Matches the database checks: a trimmed label of 1–40 characters and a #rrggbb colour. */
export function validateStatus({ label, color }: StatusInput): string | null {
  const len = label.trim().length
  if (len < 1 || len > 40) return 'The label must be 1–40 characters.'
  if (!COLOR_RE.test(color)) return 'The colour must look like #rrggbb.'
  return null
}

function sortDefs(defs: StatusDefinition[]): StatusDefinition[] {
  return [...defs].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
}

function upsert(defs: StatusDefinition[], row: StatusDefinition): StatusDefinition[] {
  return sortDefs([...defs.filter((d) => d.id !== row.id), row])
}

interface StatusState {
  definitions: StatusDefinition[]
  loaded: boolean
  load: () => Promise<void>
  /** Joins the status_definitions change feed once (AppShell). Returns the cleanup. */
  subscribe: () => () => void
  unsubscribe: () => void
  create: (input: StatusInput) => Promise<Result & { definition?: StatusDefinition }>
  update: (id: string, patch: Partial<StatusInput>) => Promise<Result>
  remove: (id: string) => Promise<Result>
}

let channel: RealtimeChannel | null = null

export const useStatusStore = create<StatusState>((set, get) => ({
  definitions: [],
  loaded: false,

  load: async () => {
    const { data, error } = await supabase
      .from('status_definitions')
      .select('*')
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
    if (error || !data) return
    set({ definitions: sortDefs(data as StatusDefinition[]), loaded: true })
  },

  subscribe: () => {
    if (!channel) {
      channel = supabase
        .channel('status-definitions')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'status_definitions' },
          (payload: { eventType: string; new: unknown; old: unknown }) => {
            if (payload.eventType === 'DELETE') {
              const id = (payload.old as { id?: string }).id
              if (id) set((s) => ({ definitions: s.definitions.filter((d) => d.id !== id) }))
            } else {
              const row = payload.new as StatusDefinition
              if (row?.id) set((s) => ({ definitions: upsert(s.definitions, row) }))
            }
          },
        )
        .subscribe()
    }
    return () => get().unsubscribe()
  },

  unsubscribe: () => {
    if (channel) supabase.removeChannel(channel)
    channel = null
  },

  create: async (input) => {
    const invalid = validateStatus(input)
    if (invalid) return { error: invalid }
    const defs = get().definitions
    const position = defs.reduce((max, d) => Math.max(max, d.position), -1) + 1
    const { data, error } = await supabase
      .from('status_definitions')
      .insert({ label: input.label.trim(), color: input.color, position })
      .select()
      .single()
    if (error || !data) return { error: error?.message ?? 'Couldn’t add the status.' }
    const definition = data as StatusDefinition
    set((s) => ({ definitions: upsert(s.definitions, definition) }))
    return { error: null, definition }
  },

  update: async (id, patch) => {
    const current = get().definitions.find((d) => d.id === id)
    const clean: Partial<StatusInput> = { ...patch }
    if (clean.label !== undefined) clean.label = clean.label.trim()
    const invalid = validateStatus({ label: clean.label ?? current?.label ?? '', color: clean.color ?? current?.color ?? '' })
    if (invalid) return { error: invalid }
    const { error } = await supabase.from('status_definitions').update(clean).eq('id', id)
    if (error) return { error: error.message }
    if (current) set((s) => ({ definitions: upsert(s.definitions, { ...current, ...clean }) }))
    return { error: null }
  },

  remove: async (id) => {
    const { error } = await supabase.from('status_definitions').delete().eq('id', id)
    if (error) return { error: error.message }
    set((s) => ({ definitions: s.definitions.filter((d) => d.id !== id) }))
    return { error: null }
  },
}))

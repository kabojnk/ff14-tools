import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { useStatusStore } from '@/stores/statusStore'
import { supabase } from '@/lib/supabase'
import { displayed, overrideFor } from '@/lib/presence'
import { Portal } from '@/components/ui/Portal'
import type { Presence } from '@/types'

interface StatusPickerProps {
  onClose: () => void
}

const PRESENCE_OPTIONS: { value: Presence; label: string; color: string }[] = [
  { value: 'online',  label: 'Online',    color: 'var(--presence-online)' },
  { value: 'away',    label: 'Away',      color: 'var(--presence-away)' },
  { value: 'offline', label: 'Invisible', color: 'var(--presence-offline)' },
]

const NEW_STATUS_COLOR = '#5865f2'

interface Draft {
  /** A definition id, or null for a new status. */
  id: string | null
  label: string
  color: string
}

const rowClass = (selected: boolean) =>
  `flex w-full items-center gap-3 rounded-[3px] px-3 py-2 text-left text-sm transition-colors hover:bg-hover ${selected ? 'bg-active' : ''}`

export function StatusPicker({ onClose }: StatusPickerProps) {
  const { profile, fetchProfile } = useAuthStore()
  const setOverride = usePresenceStore((s) => s.setOverride)
  const currentOverride = usePresenceStore((s) => s.override)
  const { definitions, create, update, remove } = useStatusStore()
  // The picker's choice is the manual override: none = Online, 'away' = Away, 'invisible' = Invisible.
  const [presence, setPresence] = useState<Presence>(displayed({ presence: 'online' }, currentOverride))
  const [chosenId, setChosenId] = useState<string | null>(profile?.status_id ?? null)
  const [customText, setCustomText] = useState(profile?.custom_status_text ?? '')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // A status deleted by anyone (live) falls back to None.
  const statusId = chosenId && definitions.some((d) => d.id === chosenId) ? chosenId : null

  const handleSave = async () => {
    if (!profile) return
    const text = customText.trim() || null
    const override = overrideFor(presence)
    // presence_override is what every device reads; status is kept in step for old cached apps.
    await supabase
      .from('profiles')
      .update({ presence_override: override, status: presence, status_id: statusId, custom_status_text: text })
      .eq('id', profile.id)
    void setOverride(override)
    await fetchProfile()
    onClose()
  }

  const saveDraft = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    if (draft.id) {
      const res = await update(draft.id, { label: draft.label, color: draft.color })
      if (res.error) setError(res.error)
      else setDraft(null)
    } else {
      const res = await create({ label: draft.label, color: draft.color })
      if (res.error) setError(res.error)
      else {
        setDraft(null)
        if (res.definition) setChosenId(res.definition.id)
      }
    }
    setBusy(false)
  }

  const deleteStatus = async (id: string, label: string) => {
    if (!window.confirm(`Delete the status "${label}" for everyone?`)) return
    setError(null)
    const res = await remove(id)
    if (res.error) setError(res.error)
  }

  const editor = (
    <div className="flex items-center gap-2 rounded-[3px] bg-active px-3 py-2">
      <input
        type="color"
        aria-label="Status colour"
        value={draft?.color ?? NEW_STATUS_COLOR}
        onChange={(e) => setDraft((d) => (d ? { ...d, color: e.target.value } : d))}
        className="h-6 w-6 flex-shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
      />
      <input
        type="text"
        aria-label="Status label"
        value={draft?.label ?? ''}
        onChange={(e) => setDraft((d) => (d ? { ...d, label: e.target.value } : d))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void saveDraft()
          if (e.key === 'Escape') setDraft(null)
        }}
        placeholder="Status name"
        maxLength={40}
        autoFocus
        className="min-w-0 flex-1 rounded-[3px] bg-input px-2 py-1 text-sm text-primary outline-none placeholder:text-muted"
      />
      <button
        onClick={() => void saveDraft()}
        disabled={busy || !draft?.label.trim()}
        aria-label="Save status"
        className="rounded-[3px] bg-brand px-2 py-1 text-xs font-medium text-on-accent hover:bg-brand-hover disabled:opacity-50"
      >
        Save
      </button>
      <button
        onClick={() => { setDraft(null); setError(null) }}
        aria-label="Cancel editing"
        className="px-1 py-1 text-xs text-interactive hover:underline"
      >
        Cancel
      </button>
    </div>
  )

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
        <div
          className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-lg bg-primary p-4 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="mb-3 text-lg font-bold text-primary">Set Status</h3>

          {/* Presence */}
          <div className="mb-1 space-y-0.5">
            {PRESENCE_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setPresence(opt.value)} className={rowClass(presence === opt.value)}>
                <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: opt.color }} />
                <span className="text-primary">{opt.label}</span>
              </button>
            ))}
          </div>

          {/* Shared custom statuses */}
          <p className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted">Custom status</p>
          <div className="mb-1 space-y-0.5">
            <button onClick={() => setChosenId(null)} className={rowClass(statusId === null)}>
              <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-[color:var(--line)]" />
              <span className="text-primary">None</span>
            </button>
            {definitions.map((d) =>
              draft?.id === d.id ? (
                <div key={d.id}>{editor}</div>
              ) : (
                <div key={d.id} className="group flex items-center">
                  <button onClick={() => setChosenId(d.id)} className={rowClass(statusId === d.id)} aria-pressed={statusId === d.id}>
                    <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: d.color }} data-status-dot />
                    <span className="truncate text-primary">{d.label}</span>
                  </button>
                  <button
                    onClick={() => { setError(null); setDraft({ id: d.id, label: d.label, color: d.color }) }}
                    title={`Edit ${d.label}`}
                    className="flex-shrink-0 rounded p-1.5 text-interactive transition-colors hover:bg-hover hover:text-interactive-hover"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => void deleteStatus(d.id, d.label)}
                    title={`Delete ${d.label}`}
                    className="flex-shrink-0 rounded p-1.5 text-interactive transition-colors hover:bg-hover hover:text-danger"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </div>
              ),
            )}
            {draft && draft.id === null ? (
              editor
            ) : (
              <button
                onClick={() => { setError(null); setDraft({ id: null, label: '', color: NEW_STATUS_COLOR }) }}
                className="w-full rounded-[3px] px-3 py-2 text-left text-sm text-interactive transition-colors hover:bg-hover hover:text-interactive-hover"
              >
                + New status
              </button>
            )}
          </div>
          {error && <p className="mb-2 px-3 text-xs text-danger">{error}</p>}

          {/* Status message */}
          <div className="mt-3 border-t border-[color:var(--line)] pt-4">
            <label htmlFor="status-message" className="mb-1 block text-xs font-bold uppercase text-secondary">
              Status message
            </label>
            <input
              id="status-message"
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="What are you up to?"
              className="mb-3 w-full rounded-[3px] bg-input px-3 py-2 text-sm text-primary outline-none placeholder:text-muted"
              maxLength={128}
            />
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-[3px] px-3 py-1.5 text-sm text-interactive hover:underline">
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="rounded-[3px] bg-brand px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-brand-hover"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}

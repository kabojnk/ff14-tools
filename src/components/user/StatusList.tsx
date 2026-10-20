import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useStatusStore, validateStatus } from '@/stores/statusStore'
import { STATUS_SWATCHES } from '@/lib/swatches'
import { StatusPill } from '@/components/chat2/StatusPill'
import { SwatchPalette } from '@/components/ui/SwatchPalette'
import { Icon } from '@/components/ui/Icon'

interface StatusListProps {
  /** The editor's chosen status; one that no longer exists shows as None. */
  selectedId: string | null
  onSelect: (id: string | null) => void
}

/** Lets the profile editor save an open inline edit before its own Save. */
export interface StatusListHandle {
  /** True while a status is being edited or added inline. */
  hasOpenEdit: () => boolean
  /** Saves the open edit, if any. False (with the row's error showing) when it couldn't be saved. */
  commit: () => Promise<boolean>
}

interface Draft {
  /** A definition id, or null for a new status. */
  id: string | null
  label: string
  color: string
}

const NEW_STATUS_COLOR = STATUS_SWATCHES[0]

/**
 * The shared custom status list (design §11): None, each status as a radio row with its pill and a
 * pencil, then "New status". Editing opens inline (label, swatches, delete). Create, update and
 * delete go to `statusStore` straight away and are live for both people, so the profile editor's
 * Cancel can't undo them; the note under the heading says so.
 */
export const StatusList = forwardRef<StatusListHandle, StatusListProps>(function StatusList({ selectedId, onSelect }, ref) {
  const { definitions, create, update, remove } = useStatusStore()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const errorId = useId()
  const draftRef = useRef(draft)
  draftRef.current = draft

  // A status deleted by anyone (live) falls back to None.
  const effectiveId = selectedId && definitions.some((d) => d.id === selectedId) ? selectedId : null

  // An edit open on a status someone else deleted has nothing left to save.
  useEffect(() => {
    if (draft?.id && !definitions.some((d) => d.id === draft.id)) {
      setDraft(null)
      setConfirmDelete(false)
      setError(null)
    }
  }, [definitions, draft?.id])

  const open = (next: Draft) => {
    setDraft(next)
    setConfirmDelete(false)
    setError(null)
  }

  const close = () => {
    setDraft(null)
    setConfirmDelete(false)
    setError(null)
  }

  const saveDraft = async (): Promise<boolean> => {
    const d = draftRef.current
    if (!d) return true
    const invalid = validateStatus({ label: d.label, color: d.color })
    if (invalid) {
      setError(invalid)
      return false
    }
    setBusy(true)
    setError(null)
    const input = { label: d.label, color: d.color }
    let failed: string | null
    if (d.id) {
      failed = (await update(d.id, input)).error
    } else {
      const res = await create(input)
      failed = res.error
      // Creating a status selects it.
      if (!failed && res.definition) onSelect(res.definition.id)
    }
    setBusy(false)
    if (failed) {
      setError(failed)
      return false
    }
    close()
    return true
  }

  const deleteDraft = async () => {
    const d = draftRef.current
    if (!d?.id) return
    setBusy(true)
    setError(null)
    const res = await remove(d.id)
    setBusy(false)
    if (res.error) {
      setError(res.error)
      setConfirmDelete(false)
    } else {
      close()
    }
  }

  useImperativeHandle(ref, () => ({
    hasOpenEdit: () => draftRef.current !== null,
    commit: saveDraft,
  }))

  // The sheet closes on Escape unless the event is marked handled, so cancel here and say so.
  const onEditKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    if (confirmDelete) setConfirmDelete(false)
    else close()
  }

  const rowClass = 'flex items-center gap-2.5 border-t border-[color:var(--line)] first:border-t-0'
  const radioClass = (on: boolean) =>
    `h-4 w-4 flex-none rounded-full border-2 ${
      on
        ? 'border-[color:var(--accent)] shadow-[inset_0_0_0_3px_var(--them),inset_0_0_0_8px_var(--accent)]'
        : 'border-[color:var(--muted)]'
    }`
  const optionClass =
    'flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-[7px] text-left outline-none focus-visible:bg-[color:var(--seg)]'
  const toolClass =
    'mr-1.5 grid h-7 w-7 flex-none place-items-center rounded-md text-[color:var(--muted)] outline-none hover:text-[color:var(--fg)] focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]'

  const editor = (d: Draft) => (
    <div
      key={d.id ?? 'new'}
      className="flex flex-col gap-2 border-t border-[color:var(--line)] bg-[color:var(--seg)] px-2.5 py-[7px] first:border-t-0"
      onKeyDown={onEditKeyDown}
    >
      <div className="flex items-center gap-2.5">
        <input
          type="text"
          aria-label="Status label"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={d.label}
          onChange={(e) => setDraft((cur) => (cur ? { ...cur, label: e.target.value } : cur))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void saveDraft()
            }
          }}
          placeholder="Status name"
          maxLength={40}
          autoFocus
          className="min-w-0 flex-1 rounded-lg border border-[color:var(--accent)] bg-[color:var(--field)] px-2 py-1.5 text-[13px] text-[color:var(--fg)] outline-none placeholder:text-[color:var(--muted)]"
        />
        {d.id && (
          <button
            type="button"
            title={`Delete ${d.label || 'status'}`}
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            className={`${toolClass} mr-0 hover:text-[color:var(--danger)]`}
          >
            <Icon icon={Trash2} size={16} />
          </button>
        )}
      </div>
      <SwatchPalette value={d.color} onChange={(color) => setDraft((cur) => (cur ? { ...cur, color } : cur))} />
      {error && (
        <p id={errorId} role="alert" className="text-[11.5px] text-[color:var(--danger)]">
          {error}
        </p>
      )}
      {confirmDelete ? (
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-[12.5px] font-semibold">Delete for everyone?</span>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="rounded-lg px-3 py-[5px] text-xs font-bold text-[color:var(--muted)]"
          >
            Keep
          </button>
          <button
            type="button"
            onClick={() => void deleteDraft()}
            disabled={busy}
            className="rounded-lg bg-[color:var(--danger)] px-3 py-[5px] text-xs font-bold text-[color:var(--on-danger)] disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            aria-label="Cancel editing"
            className="rounded-lg px-3 py-[5px] text-xs font-bold text-[color:var(--muted)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void saveDraft()}
            disabled={busy}
            aria-label="Save status"
            className="rounded-lg bg-[color:var(--accent)] px-3 py-[5px] text-xs font-bold text-[color:var(--on-accent)] disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-[5px]">
      <p
        className="text-[11px] font-bold uppercase tracking-[.05em] text-[color:var(--muted)]"
      >
        Custom status
        <em className="ml-1 font-medium normal-case not-italic tracking-normal opacity-80">shared, anyone can edit</em>
      </p>
      <p className="text-[11.5px] text-[color:var(--muted)]">Changes to the status list save straight away</p>
      <div
        role="radiogroup"
        aria-label="Custom status"
        className="flex flex-col overflow-hidden rounded-[10px] border border-[color:var(--line)] bg-[color:var(--them)] text-[13px] font-medium text-[color:var(--fg)]"
      >
        <div className={rowClass}>
          <button
            type="button"
            role="radio"
            aria-checked={effectiveId === null}
            onClick={() => onSelect(null)}
            className={optionClass}
          >
            <span aria-hidden="true" className={radioClass(effectiveId === null)} />
            None
          </button>
        </div>
        {definitions.map((d) =>
          draft?.id === d.id ? (
            editor(draft)
          ) : (
            <div key={d.id} className={rowClass}>
              <button
                type="button"
                role="radio"
                aria-checked={effectiveId === d.id}
                aria-label={d.label}
                onClick={() => onSelect(d.id)}
                className={optionClass}
              >
                <span aria-hidden="true" className={radioClass(effectiveId === d.id)} />
                <StatusPill label={d.label} color={d.color} className="!text-[11.5px]" />
              </button>
              <button type="button" title={`Edit ${d.label}`} onClick={() => open({ id: d.id, label: d.label, color: d.color })} className={toolClass}>
                <Icon icon={Pencil} size={15} />
              </button>
            </div>
          ),
        )}
        {draft && draft.id === null ? (
          editor(draft)
        ) : (
          <div className={rowClass}>
            <button
              type="button"
              onClick={() => open({ id: null, label: '', color: NEW_STATUS_COLOR })}
              className={`${optionClass} font-semibold text-[color:var(--accent)]`}
            >
              <Icon icon={Plus} size={16} />
              New status
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

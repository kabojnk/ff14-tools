import { X } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import type { MediaFilterKind, MediaScope } from '@/lib/media'

export interface MediaFiltersProps {
  kind: MediaFilterKind
  onKindChange: (kind: MediaFilterKind) => void
  extension: string
  onExtensionChange: (extension: string) => void
  scope: MediaScope
  onScopeChange: (scope: MediaScope) => void
}

const CHIPS: { value: MediaFilterKind; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'photos', label: 'Photos' },
  { value: 'videos', label: 'Videos' },
  { value: 'gifs', label: 'GIFs' },
  { value: 'files', label: 'Files' },
  { value: 'links', label: 'Links' },
  { value: 'voice', label: 'Voice' },
]

const SCOPES: { value: MediaScope; label: string }[] = [
  { value: 'space', label: 'This space' },
  { value: 'both', label: 'Both' },
]

/**
 * The gallery's filters (the approved mockup): a row of kind chips, the extension box with a leading ".",
 * and the This space / Both segment. Sticky at the top of the panel's scroll area.
 */
export function MediaFilters({ kind, onKindChange, extension, onExtensionChange, scope, onScopeChange }: MediaFiltersProps) {
  return (
    <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-[color:var(--line)] bg-[color:var(--bar)] px-3 pb-2.5 pt-2">
      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none]">
        {CHIPS.map((c) => {
          const on = kind === c.value
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onKindChange(c.value)}
              aria-pressed={on}
              className={`flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                on
                  ? 'bg-[color:var(--accent)] text-[color:var(--on-accent)]'
                  : 'bg-[color:var(--seg)] text-[color:var(--muted)] hover:text-[color:var(--fg)]'
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <div
          className={`flex h-[30px] min-w-0 flex-1 items-center gap-0.5 rounded-lg border bg-[color:var(--field)] px-2 text-[color:var(--muted)] focus-within:border-[color:var(--accent)] ${
            extension ? 'border-[color:var(--accent)]' : 'border-[color:var(--line)]'
          }`}
        >
          <span aria-hidden="true" className="text-sm">.</span>
          <input
            type="text"
            value={extension}
            onChange={(e) => onExtensionChange(e.target.value)}
            placeholder="extension, e.g. zip"
            aria-label="Extension"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[color:var(--fg)] outline-none placeholder:text-[color:var(--muted)]"
          />
          {extension && (
            <button
              type="button"
              onClick={() => onExtensionChange('')}
              aria-label="Clear extension"
              className="flex-none rounded p-0.5 text-[color:var(--muted)] hover:text-[color:var(--fg)]"
            >
              <Icon icon={X} size={14} />
            </button>
          )}
        </div>
        <div className="grid flex-none grid-cols-2 rounded-[10px] bg-[color:var(--seg)] p-[3px] text-xs font-semibold">
          {SCOPES.map((s) => {
            const on = scope === s.value
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => onScopeChange(s.value)}
                aria-pressed={on}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1 transition-colors ${
                  on
                    ? 'bg-[color:var(--seg-on)] text-[color:var(--fg)] shadow-[0_1px_2px_var(--shadow)]'
                    : 'text-[color:var(--muted)] hover:text-[color:var(--fg)]'
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

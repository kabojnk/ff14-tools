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

// Styled like the info panel's tab buttons.
const chipClass = (active: boolean) =>
  `flex-shrink-0 px-2.5 py-1.5 text-xs font-medium transition-colors ${
    active ? 'border-b-2 border-brand text-brand' : 'text-interactive hover:text-interactive-hover'
  }`

export function MediaFilters({ kind, onKindChange, extension, onExtensionChange, scope, onScopeChange }: MediaFiltersProps) {
  return (
    <div className="border-b border-[hsl(var(--color-bg-tertiary))] bg-secondary">
      <div className="flex overflow-x-auto px-1">
        {CHIPS.map((c) => (
          <button key={c.value} onClick={() => onKindChange(c.value)} aria-pressed={kind === c.value} className={chipClass(kind === c.value)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 rounded-[3px] bg-input px-2 py-1">
          <input
            type="text"
            value={extension}
            onChange={(e) => onExtensionChange(e.target.value)}
            placeholder="Extension (e.g. zip)"
            aria-label="Extension"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-muted"
          />
          {extension && (
            <button
              onClick={() => onExtensionChange('')}
              aria-label="Clear extension"
              className="px-1 text-sm leading-none text-muted hover:text-interactive-hover"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex flex-shrink-0 overflow-hidden rounded-[3px] bg-tertiary">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              onClick={() => onScopeChange(s.value)}
              aria-pressed={scope === s.value}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                scope === s.value ? 'bg-brand text-white' : 'text-interactive hover:text-interactive-hover'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

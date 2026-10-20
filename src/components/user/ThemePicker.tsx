import { useUiStore } from '@/stores/uiStore'
import { THEMES } from '@/lib/themes'

/** Settings → Appearance: one swatch card per theme. Applies instantly; uiStore persists it per device. */
export function ThemePicker() {
  const { theme, setTheme } = useUiStore()

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={theme === t.id}
          onClick={() => setTheme(t.id)}
          className={`rounded-lg border-2 p-1 text-left transition-colors ${
            theme === t.id
              ? 'border-[color:var(--accent)]'
              : 'border-transparent hover:border-[color:var(--line)]'
          }`}
        >
          <span aria-hidden="true" className="flex h-12 overflow-hidden rounded border border-[color:var(--line)]">
            {t.swatches.map((c, i) => (
              <span key={i} className="flex-1" style={{ backgroundColor: c }} />
            ))}
          </span>
          <span className="mt-1 block truncate px-0.5 text-xs font-medium text-primary">{t.name}</span>
        </button>
      ))}
    </div>
  )
}

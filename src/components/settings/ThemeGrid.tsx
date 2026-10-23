import { useId } from 'react'
import { Check } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import { useUiStore } from '@/stores/uiStore'
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { THEMES, type ThemeInfo } from '@/lib/themes'

/** "Light", "Dark", "Pink · Light"… */
function themeKind(t: ThemeInfo): string {
  const kind = t.kind === 'light' ? 'Light' : 'Dark'
  return t.pink ? `Pink · ${kind}` : kind
}

/**
 * Settings → Appearance: every theme as a card with a mini chat preview (wallpaper with dots, two
 * bubbles), its name and kind. Choosing one applies it at once; uiStore persists it per device.
 *
 * Each preview sets `data-theme={id}`: themes.css selects on `[data-theme="<id>"]` alone, so the
 * preview's tokens resolve to that theme whatever the page's theme is.
 */
export function ThemeGrid() {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const name = useId()
  // Two columns on phones, three on desktop.
  const isDesktop = useMediaQuery(DESKTOP_QUERY)

  return (
    <div role="radiogroup" aria-label="Theme" className={`grid gap-2.5 ${isDesktop ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {THEMES.map((t) => {
        const on = theme === t.id
        return (
          <label
            key={t.id}
            data-theme-card={t.id}
            className={`relative flex cursor-pointer flex-col overflow-hidden rounded-[11px] border bg-[color:var(--them)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[color:var(--accent)] ${
              on ? 'border-[color:var(--accent)] shadow-[0_0_0_1.5px_var(--accent)]' : 'border-[color:var(--line)]'
            }`}
          >
            <input
              type="radio"
              name={name}
              aria-label={t.name}
              checked={on}
              onChange={() => setTheme(t.id)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              data-theme={t.id}
              className="flex h-[58px] flex-col justify-end gap-[3px] bg-[color:var(--wall)] px-[7px] pb-1.5 pt-[7px]"
              style={{
                backgroundImage: 'radial-gradient(var(--wall-dot) 1px, transparent 1.4px)',
                backgroundSize: '9px 9px',
              }}
            >
              <i className="block h-2.5 w-[62%] rounded bg-[color:var(--them)]" />
              <i className="block h-2.5 w-[48%] self-end rounded bg-[color:var(--me)]" />
              <i className="block h-2.5 w-[30%] rounded bg-[color:var(--them)]" />
            </span>
            <span className="flex items-center gap-1.5 px-2 py-1.5 text-[11.5px] font-semibold text-[color:var(--fg)]">
              <span className="min-w-0">
                <span className="block truncate">{t.name}</span>
                <small className="block text-[10px] font-medium text-[color:var(--muted)]">{themeKind(t)}</small>
              </span>
              {on && (
                <span className="ml-auto grid h-4 w-4 flex-none place-items-center rounded-full bg-[color:var(--accent)] text-[color:var(--on-accent)]">
                  <Icon icon={Check} size={11} strokeWidth={3} />
                </span>
              )}
            </span>
          </label>
        )
      })}
    </div>
  )
}

import { ThemeGrid } from '@/components/settings/ThemeGrid'

/** Settings → Appearance: the theme cards. A tap applies the theme at once; there's no Save. */
export function AppearanceSection() {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-1.5 text-[10.5px] font-bold uppercase tracking-[.07em] text-[color:var(--muted)]">Theme</h3>
      <ThemeGrid />
    </section>
  )
}

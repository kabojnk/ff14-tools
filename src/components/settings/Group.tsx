import type { ReactNode } from 'react'

/** One row in a grouped list: the mockup's `.srow`. */
export const rowClass =
  'flex min-h-[44px] w-full items-center gap-2.5 border-t border-[color:var(--line)] px-3 py-2.5 text-left text-[13.5px] first:border-t-0'

/** A row that acts: same as `rowClass`, with hover and focus styles. */
export const buttonRowClass = `${rowClass} outline-none transition-colors hover:bg-[color:var(--seg)] focus-visible:bg-[color:var(--seg)] disabled:opacity-50`

/** The muted value at a row's right edge. */
export const valueClass = 'ml-auto inline-flex items-center gap-1 text-[12.5px] text-[color:var(--muted)]'

/** A labelled group of rows in one rounded card (the mockup's `.grp` + `.list`). */
export function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      {label && (
        <h3 className="px-1.5 text-[10.5px] font-bold uppercase tracking-[.07em] text-[color:var(--muted)]">{label}</h3>
      )}
      <div className="flex flex-col overflow-hidden rounded-[10px] border border-[color:var(--line)] bg-[color:var(--them)] text-[color:var(--fg)]">
        {children}
      </div>
    </section>
  )
}

import type { ReactNode } from 'react'

/** Desktop right-hand panel (360 px) beside the chat: media, pins and search. */
export function SlideOver({ label, children }: { label: string; children: ReactNode }) {
  return (
    <aside
      aria-label={label}
      className="flex w-[360px] flex-none flex-col overflow-hidden border-l border-[color:var(--line)] bg-[color:var(--bar)]"
    >
      {children}
    </aside>
  )
}

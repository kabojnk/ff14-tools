/** TODAY / YESTERDAY / weekday / date, centred where the day changes. Also used for system notes. */
export function DateChip({ label, system = false }: { label: string; system?: boolean }) {
  return (
    <div
      data-date-chip={system ? undefined : ''}
      data-system-note={system ? '' : undefined}
      className={`my-1.5 self-center rounded-[8px] bg-[color:var(--bar)] px-2.5 py-[3px] text-center text-[11px] text-[color:var(--muted)] shadow-[0_1px_0_var(--shadow)] ${
        system ? 'max-w-[85%] font-medium' : 'font-semibold tracking-[.04em]'
      }`}
    >
      {label}
    </div>
  )
}

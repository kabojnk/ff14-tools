import { TriangleAlert } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import { useUiStore } from '@/stores/uiStore'

/**
 * The red Eep! button: shows the FF14 disguise straight away. No confirmation, because speed matters
 * and coming back needs the passphrase. A labelled pill on desktop, a warning icon on phones.
 */
export function EepButton({ wide }: { wide: boolean }) {
  const eep = () => useUiStore.getState().setEepMode(true)
  return (
    <button
      type="button"
      onClick={eep}
      aria-label="Eep!"
      title="Eep! Hide the chat now"
      className={
        wide
          ? 'inline-flex flex-none items-center gap-[5px] rounded-full border border-[color:color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_14%,transparent)] py-1 pl-[7px] pr-2.5 text-[12.5px] font-bold text-[color:var(--danger)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--danger)_22%,transparent)]'
          : 'inline-flex flex-none items-center rounded-full p-1.5 text-[color:var(--danger)] transition-colors hover:bg-[color:var(--seg)]'
      }
    >
      <Icon icon={TriangleAlert} size={wide ? 17 : 20} />
      {wide && <span aria-hidden>Eep!</span>}
    </button>
  )
}

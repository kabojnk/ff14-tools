import { useId, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { rowClass } from '@/components/settings/Group'

/** Security & privacy → Privacy: the read receipts switch. */
export function ReadReceiptsRow() {
  const profile = useAuthStore((s) => s.profile)
  const labelId = useId()
  const subId = useId()
  // Optimistic: the switch moves at once; it moves back if the write fails.
  const [pending, setPending] = useState<boolean | null>(null)
  const on = pending ?? profile?.read_receipts ?? true

  const toggle = async () => {
    if (!profile || pending !== null) return
    const next = !on
    setPending(next)
    const { error } = await supabase.from('profiles').update({ read_receipts: next }).eq('id', profile.id)
    if (!error) {
      const latest = useAuthStore.getState().profile
      if (latest) useAuthStore.setState({ profile: { ...latest, read_receipts: next } })
    }
    setPending(null)
  }

  return (
    <div className={rowClass}>
      <span className="min-w-0 flex-1">
        <span id={labelId}>Read receipts</span>
        <span id={subId} className="mt-px block text-[11px] text-[color:var(--muted)]">
          Off means neither of you sees ✓✓
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelId}
        aria-describedby={subId}
        onClick={toggle}
        className={`relative h-[22px] w-[38px] flex-none rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-1 ${
          on ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--seg-on)]'
        }`}
      >
        <span
          className={`absolute left-0 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

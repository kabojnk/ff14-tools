import { Check, CheckCheck, CircleAlert, Clock } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import type { Tick } from '@/lib/chat'

const LABEL: Record<Tick, string> = { sending: 'Sending', sent: 'Sent', read: 'Read', failed: 'Not sent' }
const GLYPH = { sending: Clock, sent: Check, read: CheckCheck, failed: CircleAlert } as const

interface TicksProps {
  state: Tick
  onRetry?: () => void
}

/** My message's delivery state: clock, ✓, blue ✓✓, or a red ! with Retry. */
export function Ticks({ state, onRetry }: TicksProps) {
  const colour =
    state === 'read' ? 'text-[color:var(--tick)]' : state === 'failed' ? 'text-[color:var(--danger)]' : ''
  return (
    <span data-tick={state} className={`inline-flex items-center gap-1 ${colour}`}>
      <Icon icon={GLYPH[state]} size={state === 'sending' ? 11 : 14} strokeWidth={2} role="img" aria-label={LABEL[state]} />
      {state === 'failed' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRetry?.()
          }}
          className="font-semibold underline underline-offset-2"
        >
          Retry
        </button>
      )}
    </span>
  )
}

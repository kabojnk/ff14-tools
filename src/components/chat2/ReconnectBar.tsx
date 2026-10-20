import { useEffect, useState } from 'react'
import { useConversationStore } from '@/stores/conversationStore'

export const RECONNECT_DELAY_MS = 2000

/** A slim "Reconnecting…" notice under the header, once the conversation channel has been down for 2 s. */
export function ReconnectBar() {
  const joined = useConversationStore((s) => s.realtimeStatus === 'SUBSCRIBED')
  const [show, setShow] = useState(false)

  // Keyed on joined/not joined only, so JOINING → CHANNEL_ERROR doesn't restart the 2 s.
  useEffect(() => {
    if (joined) {
      setShow(false)
      return
    }
    const t = setTimeout(() => setShow(true), RECONNECT_DELAY_MS)
    return () => clearTimeout(t)
  }, [joined])

  if (!show || joined) return null
  return (
    <div
      role="status"
      className="flex-shrink-0 border-b border-[color:var(--line)] bg-[color:var(--seg)] px-3 py-1 text-center text-[11.5px] font-medium text-[color:var(--muted)]"
    >
      Reconnecting…
    </div>
  )
}

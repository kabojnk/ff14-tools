import { useConversationStore } from '@/stores/conversationStore'

/** Drags the lake: hides both spaces of the conversation and starts a new clean session. */
export function SheetsButton() {
  const dragTheLake = useConversationStore((s) => s.dragTheLake)

  const handleClick = () => {
    void dragTheLake()
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 rounded-[3px] px-2 py-1 text-xs text-interactive transition-colors hover:bg-hover hover:text-interactive-hover"
      title="Drag the Lake — starts a new clean session"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" />
        <path d="M3 12h18" />
        <path d="M3 18h18" />
      </svg>
      <span>Drag the Lake</span>
    </button>
  )
}

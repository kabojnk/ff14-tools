import { useChannelStore } from '@/stores/channelStore'

interface SheetsButtonProps {
  channelId: string
}

export function SheetsButton({ channelId }: SheetsButtonProps) {
  const { changeSheets } = useChannelStore()

  const handleClick = () => {
    changeSheets(channelId)
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 rounded-[3px] px-2 py-1 text-xs text-interactive transition-colors hover:bg-hover hover:text-interactive-hover"
      title="Change the Sheets — starts a new clean session"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" />
        <path d="M3 12h18" />
        <path d="M3 18h18" />
      </svg>
      <span>Sheets</span>
    </button>
  )
}

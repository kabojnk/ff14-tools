import { useStatusStore } from '@/stores/statusStore'

interface CustomStatusProps {
  statusId: string | null | undefined
  text: string | null | undefined
  className?: string
  textClassName?: string
}

/**
 * A profile's custom status: the shared definition's label in its colour, then the status message.
 * Renders nothing when there is neither. (The pill design comes with the sub-project 3 redesign.)
 */
export function CustomStatus({ statusId, text, className = '', textClassName = 'text-muted' }: CustomStatusProps) {
  const definition = useStatusStore((s) => (statusId ? s.definitions.find((d) => d.id === statusId) : undefined))
  if (!definition && !text) return null
  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${className}`} data-custom-status>
      {definition && (
        <span className="flex-shrink-0 font-semibold" style={{ color: definition.color }} data-status-label>
          {definition.label}
        </span>
      )}
      {text && <span className={`truncate ${textClassName}`}>{text}</span>}
    </span>
  )
}

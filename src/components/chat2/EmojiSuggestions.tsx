import { EMOJI_SUGGESTIONS_ID, suggestionId, type EmojiSuggestion } from '@/lib/emoji/shortcodes'

interface Props {
  query: string
  items: EmojiSuggestion[]
  active: number
  onHover: (i: number) => void
  onPick: (s: EmojiSuggestion) => void
}

/** The `:query` autocomplete above the composer field (Discord style): pick with a tap, a click, Enter or Tab. */
export function EmojiSuggestions({ query, items, active, onHover, onPick }: Props) {
  return (
    <div
      className="absolute bottom-full left-2 right-2 z-20 mb-1.5 overflow-hidden rounded-[10px] border border-[color:var(--line)] bg-[color:var(--bar)] p-[5px] shadow-[0_10px_30px_var(--shadow)]"
      // Keeps the focus (and the phone keyboard) in the field.
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
    >
      <p className="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.07em] text-[color:var(--muted)]">
        Emoji matching <span className="normal-case">:{query}</span>
      </p>
      <ul id={EMOJI_SUGGESTIONS_ID} role="listbox" aria-label="Emoji suggestions">
        {items.map((s, i) => (
          <li
            key={s.kind === 'standard' ? `s:${s.code}` : `c:${s.name}`}
            id={suggestionId(i)}
            role="option"
            aria-selected={i === active}
            onPointerEnter={() => onHover(i)}
            onClick={() => onPick(s)}
            className={`flex cursor-pointer items-center gap-2.5 rounded-[7px] px-2 py-1.5 text-[14px] text-[color:var(--fg)] ${
              i === active ? 'bg-[color:var(--seg)]' : ''
            }`}
          >
            {s.kind === 'standard' ? (
              <span className="grid w-6 place-items-center text-[20px] leading-none" aria-hidden="true">
                {s.emoji}
              </span>
            ) : (
              <img src={s.url} alt="" className="h-6 w-6 object-contain" />
            )}
            <span className="truncate">:{s.kind === 'standard' ? s.code : s.name}:</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

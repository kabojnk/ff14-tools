/** Three bouncing dots in their bubble colour while the partner types in this space. */
export function TypingBubble({ names }: { names: string[] }) {
  const label = names.length === 1 ? `${names[0]} is typing` : `${names.join(' and ')} are typing`
  return (
    <div className="msg-in mt-1 flex">
      <div
        role="status"
        aria-label={label}
        data-typing-bubble
        className="inline-flex gap-[3px] rounded-[10px] rounded-tl-[2px] bg-[color:var(--them)] px-3 py-2.5 shadow-[0_1px_0_var(--shadow)]"
      >
        {[0, 150, 300].map((delay) => (
          <i
            key={delay}
            aria-hidden="true"
            className="typing-dot block h-1.5 w-1.5 rounded-full bg-[color:var(--muted)]"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

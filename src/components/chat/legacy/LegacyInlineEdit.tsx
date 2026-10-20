import { useState, type ReactNode } from 'react'
import { useComposerStore } from '@/stores/composerStore'
import { useMessageStore } from '@/stores/messageStore'
import type { Message } from '@/types'

/**
 * INTERIM (redesign 3a, Tasks 8–10): the old MessageItem's inline edit. The Edit action (menu, sheet, E)
 * calls composerStore.startEdit; while that message is being edited its bubble is replaced by this
 * editor. Task 11 moves editing into the composer (with the "Editing message" bar) and deletes this file.
 */
export function LegacyInlineEdit({ message, spaceKey, children }: { message: Message; spaceKey: string; children: ReactNode }) {
  const editing = useComposerStore((s) => s.editing?.id === message.id)
  if (!editing) return <>{children}</>
  return <Editor message={message} spaceKey={spaceKey} />
}

function Editor({ message, spaceKey }: { message: Message; spaceKey: string }) {
  const [content, setContent] = useState(message.content ?? '')
  const cancel = () => useComposerStore.getState().cancelEdit()

  const save = async () => {
    if (content.trim() && content !== message.content) {
      await useMessageStore.getState().editMessage(message.id, content, spaceKey)
    }
    cancel()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void save()
    }
    if (e.key === 'Escape') cancel()
  }

  return (
    <div className="w-full max-w-[var(--bubble-max,78%)]">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Edit message"
        className="w-full resize-none rounded-[10px] bg-input p-2 text-[15px] text-primary outline-none"
        rows={Math.min(content.split('\n').length + 1, 6)}
        autoFocus
      />
      <p className="mt-1 text-xs text-muted">
        escape to <button onClick={cancel} className="text-link hover:underline">cancel</button>
        {' '}&middot; enter to <button onClick={() => void save()} className="text-link hover:underline">save</button>
      </p>
    </div>
  )
}

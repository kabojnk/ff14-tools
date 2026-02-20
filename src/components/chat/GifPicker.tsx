import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { searchGifs, type TenorGif } from '@/lib/tenor'

interface GifPickerProps {
  onSelect: (gif: TenorGif) => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}

export function GifPicker({ onSelect, onClose, anchorRef }: GifPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TenorGif[]>([])
  const [loading, setLoading] = useState(false)
  const [pos, setPos] = useState({ bottom: 0, right: 0 })
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({
        bottom: window.innerHeight - rect.top + 8,
        right: window.innerWidth - rect.right,
      })
    }
  }, [anchorRef])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const gifs = await searchGifs(q.trim())
      setResults(gifs)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInput = (value: string) => {
    setQuery(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => doSearch(value), 400)
  }

  return createPortal(
    <div
      className="fixed z-50 w-80 rounded-lg border border-[hsl(var(--color-input-border))] bg-floating shadow-xl"
      style={{ bottom: pos.bottom, right: pos.right }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Search bar */}
      <div className="p-3">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="Search GIFs"
          className="w-full rounded bg-input px-3 py-2 text-sm text-primary outline-none placeholder:text-muted"
        />
      </div>

      {/* Results grid */}
      <div className="h-72 overflow-y-auto px-3 pb-3">
        {loading && (
          <div className="flex h-full items-center justify-center text-sm text-muted">Searching...</div>
        )}
        {!loading && results.length === 0 && query && (
          <div className="flex h-full items-center justify-center text-sm text-muted">No GIFs found</div>
        )}
        {!loading && !query && (
          <div className="flex h-full items-center justify-center text-sm text-muted">Search for GIFs above</div>
        )}
        <div className="grid grid-cols-2 gap-1">
          {results.map((gif) => (
            <button
              key={gif.id}
              onClick={() => { onSelect(gif); onClose() }}
              className="overflow-hidden rounded hover:ring-2 hover:ring-[hsl(var(--color-brand))]"
            >
              <img
                src={gif.preview}
                alt={gif.title ?? ''}
                className="h-24 w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Attribution */}
      <div className="border-t border-[hsl(var(--color-input-border))] px-3 py-1.5 text-right">
        <span className="text-[10px] text-muted">Powered by Klipy</span>
      </div>
    </div>,
    document.body
  )
}

import { useState, useCallback, useRef, useEffect } from 'react'
import { searchGifs, type TenorGif } from '@/lib/tenor'

interface GifPickerProps {
  onSelect: (gif: TenorGif) => void
  onClose: () => void
}

export function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TenorGif[]>([])
  const [loading, setLoading] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }
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

  return (
    <div className="absolute bottom-full left-0 mb-2 w-96 rounded-lg bg-floating shadow-xl border border-[hsl(var(--color-input-border))]">
      {/* Search bar */}
      <div className="p-3">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="Search Tenor"
          className="w-full rounded bg-input px-3 py-2 text-sm text-primary outline-none placeholder:text-muted"
        />
      </div>

      {/* Results grid */}
      <div className="h-72 overflow-y-auto px-3 pb-3">
        {loading && (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Searching...
          </div>
        )}

        {!loading && results.length === 0 && query && (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            No GIFs found
          </div>
        )}

        {!loading && !query && (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Search for GIFs
          </div>
        )}

        <div className="grid grid-cols-2 gap-1">
          {results.map((gif) => (
            <button
              key={gif.id}
              onClick={() => {
                onSelect(gif)
                onClose()
              }}
              className="overflow-hidden rounded hover:ring-2 hover:ring-[hsl(var(--color-brand))]"
            >
              <img
                src={gif.preview}
                alt={gif.title}
                className="h-auto w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Tenor attribution */}
      <div className="border-t border-[hsl(var(--color-input-border))] px-3 py-1.5 text-right">
        <span className="text-[10px] text-muted">Powered by Tenor</span>
      </div>
    </div>
  )
}

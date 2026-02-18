import { useState, useEffect, useRef } from 'react'
import { useChannelStore } from '@/stores/channelStore'

interface CreateChannelModalProps {
  onClose: () => void
}

export function CreateChannelModal({ onClose }: CreateChannelModalProps) {
  const { createChannel } = useChannelStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError(null)

    const result = await createChannel(name.trim(), description.trim() || undefined)
    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else {
      onClose()
    }
  }

  const previewName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'new-channel'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-md rounded-lg bg-primary p-4 shadow-xl">
        <h3 className="mb-1 text-xl font-bold text-primary">Create Channel</h3>
        <p className="mb-4 text-sm text-muted">Channels are where conversations happen.</p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="mb-1 block text-xs font-bold uppercase text-secondary">
              Channel Name
            </label>
            <div className="flex items-center rounded-[3px] bg-input px-3 py-2">
              <span className="mr-1 text-muted">#</span>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="new-channel"
                className="flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-muted"
                maxLength={50}
              />
            </div>
            <p className="mt-1 text-xs text-muted">
              Will be created as: <span className="text-secondary">#{previewName}</span>
            </p>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-bold uppercase text-secondary">
              Description <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this channel about?"
              className="w-full rounded-[3px] bg-input px-3 py-2 text-sm text-primary outline-none placeholder:text-muted"
              maxLength={200}
            />
          </div>

          {error && <p className="mb-4 text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[3px] px-4 py-2 text-sm font-medium text-interactive hover:text-interactive-hover hover:underline"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="rounded-[3px] bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

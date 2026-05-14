import { useEffect } from 'react'
import { Portal } from '@/components/ui/Portal'

interface MediaViewerProps {
  url: string
  filename: string
  type: 'image' | 'gif' | 'video'
  onClose: () => void
}

export function MediaViewer({ url, filename, type, onClose }: MediaViewerProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85"
        onClick={onClose}
      >
        {/* Toolbar */}
        <div
          className="absolute right-0 top-0 flex items-center gap-1 p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <a
            href={url}
            download={filename}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded text-white/70 hover:bg-white/10 hover:text-white"
            title="Download"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </a>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded text-white/70 hover:bg-white/10 hover:text-white"
            title="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Media */}
        <div className="flex max-h-[90vh] max-w-[90vw] items-center justify-center" onClick={(e) => e.stopPropagation()}>
          {type === 'video' ? (
            <video
              src={url}
              controls
              autoPlay
              className="max-h-[90vh] max-w-[90vw] rounded"
            />
          ) : (
            <img
              src={url}
              alt={filename}
              className="max-h-[90vh] max-w-[90vw] rounded object-contain"
            />
          )}
        </div>

        {/* Filename */}
        <p className="absolute bottom-4 max-w-[80vw] truncate text-center text-sm text-white/50">
          {filename}
        </p>
      </div>
    </Portal>
  )
}

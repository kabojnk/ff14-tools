import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { supabase } from '@/lib/supabase'
import { Portal } from '@/components/ui/Portal'

interface StatusPickerProps {
  onClose: () => void
}

const STATUS_OPTIONS = [
  { value: 'online' as const, label: 'Online', color: 'var(--color-status-online)' },
  { value: 'away' as const, label: 'Away', color: 'var(--color-status-away)' },
  { value: 'offline' as const, label: 'Invisible', color: 'var(--color-status-offline)' },
]

export function StatusPicker({ onClose }: StatusPickerProps) {
  const { profile, fetchProfile } = useAuthStore()
  const { updatePresence } = usePresenceStore()
  // Track selected status in local state so Save always uses the latest chosen value
  const [selectedStatus, setSelectedStatus] = useState<'online' | 'away' | 'offline'>(
    profile?.status ?? 'online'
  )
  const [customText, setCustomText] = useState(profile?.custom_status_text ?? '')
  const [customEmoji, setCustomEmoji] = useState(profile?.custom_status_emoji ?? '')

  const handleStatusChange = async (status: 'online' | 'away' | 'offline') => {
    if (!profile) return
    setSelectedStatus(status)
    await supabase
      .from('profiles')
      .update({ status })
      .eq('id', profile.id)
    updatePresence(status, profile.custom_status_text, profile.custom_status_emoji, true)
    await fetchProfile()
  }

  const handleCustomStatus = async () => {
    if (!profile) return
    const text = customText.trim() || null
    const emoji = customEmoji.trim() || null
    await supabase
      .from('profiles')
      .update({
        status: selectedStatus,
        custom_status_text: text,
        custom_status_emoji: emoji,
      })
      .eq('id', profile.id)
    // Use local selectedStatus — not stale profile.status from closure
    updatePresence(selectedStatus, text, emoji, true)
    await fetchProfile()
    onClose()
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-primary p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-bold text-primary">Set Status</h3>

        {/* Status options */}
        <div className="mb-4 space-y-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleStatusChange(opt.value)}
              className={`flex w-full items-center gap-3 rounded-[3px] px-3 py-2 text-left text-sm transition-colors hover:bg-hover ${
                selectedStatus === opt.value ? 'bg-active' : ''
              }`}
            >
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: `hsl(${opt.color})` }}
              />
              <span className="text-primary">{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Custom status */}
        <div className="border-t border-[hsl(var(--color-input-border))] pt-4">
          <label className="mb-1 block text-xs font-bold uppercase text-secondary">
            Custom Status
          </label>
          <div className="mb-3 flex gap-2">
            <input
              type="text"
              value={customEmoji}
              onChange={(e) => setCustomEmoji(e.target.value)}
              placeholder="😊"
              className="w-12 rounded-[3px] bg-input px-2 py-2 text-center text-sm text-primary outline-none"
              maxLength={4}
            />
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="What are you up to?"
              className="flex-1 rounded-[3px] bg-input px-3 py-2 text-sm text-primary outline-none placeholder:text-muted"
              maxLength={128}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-[3px] px-3 py-1.5 text-sm text-interactive hover:underline"
            >
              Cancel
            </button>
            <button
              onClick={handleCustomStatus}
              className="rounded-[3px] bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  )
}

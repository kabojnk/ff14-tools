import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { supabase } from '@/lib/supabase'
import { Portal } from '@/components/ui/Portal'
import type { UserStatus } from '@/types'

interface StatusPickerProps {
  onClose: () => void
}

const STANDARD_STATUSES: { value: UserStatus; label: string; color: string }[] = [
  { value: 'online',  label: 'Online',    color: 'hsl(var(--color-status-online))' },
  { value: 'away',    label: 'Away',      color: 'hsl(var(--color-status-away))' },
  { value: 'offline', label: 'Invisible', color: 'hsl(var(--color-status-offline))' },
]

const ALERT_STATUSES: { value: UserStatus; label: string; color: string }[] = [
  { value: 'under_close_watch', label: 'Under Close Watch', color: '#ef4444' },
  { value: 'found_out',         label: 'Found Out',         color: '#a855f7' },
  { value: 'you_can_call',      label: 'You can call me',   color: '#3b82f6' },
  { value: 'potential_eep',     label: 'Potential Eep',     color: '#14b8a6' },
]

export function statusColor(status: UserStatus): string {
  switch (status) {
    case 'online':            return 'hsl(var(--color-status-online))'
    case 'away':              return 'hsl(var(--color-status-away))'
    case 'offline':           return 'hsl(var(--color-status-offline))'
    case 'under_close_watch': return '#ef4444'
    case 'found_out':         return '#a855f7'
    case 'you_can_call':      return '#3b82f6'
    case 'potential_eep':     return '#14b8a6'
  }
}

export function statusLabel(status: UserStatus): string {
  switch (status) {
    case 'online':            return 'Online'
    case 'away':              return 'Away'
    case 'offline':           return 'Offline'
    case 'under_close_watch': return 'Under Close Watch'
    case 'found_out':         return 'Found Out'
    case 'you_can_call':      return 'You can call me'
    case 'potential_eep':     return 'Potential Eep'
  }
}

export function StatusPicker({ onClose }: StatusPickerProps) {
  const { profile, fetchProfile } = useAuthStore()
  const { updatePresence } = usePresenceStore()
  const [selectedStatus, setSelectedStatus] = useState<UserStatus>(profile?.status ?? 'online')
  const [customText, setCustomText] = useState(profile?.custom_status_text ?? '')
  const [customEmoji, setCustomEmoji] = useState(profile?.custom_status_emoji ?? '')

  const handleSave = async () => {
    if (!profile) return
    const text = customText.trim() || null
    const emoji = customEmoji.trim() || null
    await supabase
      .from('profiles')
      .update({ status: selectedStatus, custom_status_text: text, custom_status_emoji: emoji })
      .eq('id', profile.id)
    updatePresence(selectedStatus, text, emoji, true)
    await fetchProfile()
    onClose()
  }

  const renderOption = (opt: { value: UserStatus; label: string; color: string }) => (
    <button
      key={opt.value}
      onClick={() => setSelectedStatus(opt.value)}
      className={`flex w-full items-center gap-3 rounded-[3px] px-3 py-2 text-left text-sm transition-colors hover:bg-hover ${
        selectedStatus === opt.value ? 'bg-active' : ''
      }`}
    >
      <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: opt.color }} />
      <span className="text-primary">{opt.label}</span>
    </button>
  )

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
        <div className="w-full max-w-sm rounded-lg bg-primary p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <h3 className="mb-3 text-lg font-bold text-primary">Set Status</h3>

          {/* Standard statuses */}
          <div className="mb-1 space-y-0.5">
            {STANDARD_STATUSES.map(renderOption)}
          </div>

          {/* Alert statuses */}
          <p className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Alert
          </p>
          <div className="mb-4 space-y-0.5">
            {ALERT_STATUSES.map(renderOption)}
          </div>

          {/* Custom status text */}
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
              <button onClick={onClose} className="rounded-[3px] px-3 py-1.5 text-sm text-interactive hover:underline">
                Cancel
              </button>
              <button
                onClick={handleSave}
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

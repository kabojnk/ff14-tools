import { useState, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { uploadFile } from '@/lib/bunny'

export function AvatarUpload() {
  const { profile, fetchProfile } = useAuthStore()
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    // Validate
    if (!file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) return // 5MB max

    setUploading(true)

    try {
      const { url } = await uploadFile(file, `avatars/${profile.id}`)
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
      await fetchProfile()
    } catch {
      // Upload failed silently
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      {/* Current avatar */}
      <div className="relative">
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.nickname}
            className="h-20 w-20 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand text-2xl font-bold text-white">
            {profile?.nickname?.charAt(0).toUpperCase() ?? '?'}
          </div>
        )}
      </div>

      {/* Upload button */}
      <div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-[3px] border border-[hsl(var(--color-brand))] px-4 py-1.5 text-sm font-medium text-brand transition-colors hover:bg-brand hover:text-white disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : 'Change Avatar'}
        </button>
        <p className="mt-1 text-xs text-muted">JPG, PNG or GIF. Max 5MB.</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  )
}

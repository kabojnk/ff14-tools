import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { Camera } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { useStatusStore } from '@/stores/statusStore'
import { supabase } from '@/lib/supabase'
import { uploadFile } from '@/lib/bunny'
import { displayed, overrideFor } from '@/lib/presence'
import { Sheet } from '@/components/ui/Sheet'
import { ImageCrop } from '@/components/ui/ImageCrop'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { StatusList, type StatusListHandle } from '@/components/user/StatusList'
import type { Presence, Profile } from '@/types'

interface ProfileEditorProps {
  onClose: () => void
}

type PictureKind = 'banner' | 'avatar'
type BannerStage = { kind: 'keep' } | { kind: 'new'; file: File } | { kind: 'remove' }
type ProfilePatch = Partial<
  Pick<Profile, 'nickname' | 'custom_status_text' | 'profile_message' | 'status_id' | 'presence_override' | 'status' | 'avatar_url' | 'banner_url'>
>

const SAVE_ERROR = "Couldn't save. Check your connection and try again."

const CROPS = {
  banner: { aspect: 4, output: { width: 960, height: 240 }, title: 'Crop banner' },
  avatar: { aspect: 1, output: { width: 512, height: 512 }, title: 'Crop picture' },
} as const

const PRESENCE_OPTIONS: { value: Presence; label: string }[] = [
  { value: 'online', label: 'Online' },
  { value: 'away', label: 'Away' },
  { value: 'offline', label: 'Invisible' },
]

/** An object URL for a staged file, revoked when the file changes or the editor closes. */
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== 'function') {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return url
}

/**
 * The profile and status editor (design §11): banner, picture, nickname, status message, About,
 * "Show me as" and the shared custom status list, in one `Sheet`. Everything except the status
 * list is staged and written by Save in one `profiles` update; the status list saves straight away.
 */
export function ProfileEditor({ onClose }: ProfileEditorProps) {
  const profile = useAuthStore((s) => s.profile)
  const fetchProfile = useAuthStore((s) => s.fetchProfile)
  const setOverride = usePresenceStore((s) => s.setOverride)

  // Read once when the editor opens. A presence change made on another device while it's open is
  // overwritten by Save; for two people that's acceptable.
  const [initial] = useState(() => ({
    nickname: profile?.nickname ?? '',
    message: profile?.custom_status_text ?? '',
    about: profile?.profile_message ?? '',
    choice: displayed({ presence: 'online' }, usePresenceStore.getState().override),
    statusId: profile?.status_id ?? null,
  }))

  const [nickname, setNickname] = useState(initial.nickname)
  const [message, setMessage] = useState(initial.message)
  const [about, setAbout] = useState(initial.about)
  const [choice, setChoice] = useState<Presence>(initial.choice)
  const [statusId, setStatusIdState] = useState<string | null>(initial.statusId)
  // Mirrors statusId, so Save sees a status the list created (and selected) a moment earlier.
  const statusIdRef = useRef(statusId)
  const setStatusId = (id: string | null) => {
    statusIdRef.current = id
    setStatusIdState(id)
  }

  const [banner, setBanner] = useState<BannerStage>({ kind: 'keep' })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [crop, setCrop] = useState<{ kind: PictureKind; file: File } | null>(null)
  const [mediaError, setMediaError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  // Files already uploaded by an earlier Save that then failed, so a retry doesn't upload again.
  const uploaded = useRef(new Map<File, string>())
  const listRef = useRef<StatusListHandle>(null)
  const bannerInput = useRef<HTMLInputElement>(null)
  const avatarInput = useRef<HTMLInputElement>(null)
  const nickHintId = useId()
  const showMeAsId = useId()

  const bannerPreview = useObjectUrl(banner.kind === 'new' ? banner.file : null)
  const avatarPreview = useObjectUrl(avatarFile)
  const bannerUrl = banner.kind === 'new' ? bannerPreview : banner.kind === 'remove' ? null : profile?.banner_url ?? null
  const hasBanner = banner.kind === 'new' || (banner.kind === 'keep' && !!profile?.banner_url)

  const nicknameBlank = nickname.trim() === ''

  const isDirty = () =>
    nickname !== initial.nickname ||
    message !== initial.message ||
    about !== initial.about ||
    choice !== initial.choice ||
    statusIdRef.current !== initial.statusId ||
    banner.kind !== 'keep' ||
    avatarFile !== null ||
    (listRef.current?.hasOpenEdit() ?? false)

  // Cancel, Escape, a backdrop click and a pull down (phones) all come here. A second request while
  // asking keeps editing.
  const requestClose = () => {
    if (saving) return
    if (confirmDiscard) setConfirmDiscard(false)
    else if (isDirty()) setConfirmDiscard(true)
    else onClose()
  }
  // Whether requestClose closes right away: then a pull down slides the sheet away, else it springs back.
  const closesNow = () => !saving && !confirmDiscard && !isDirty()

  const onPick = (kind: PictureKind) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    setMediaError(null)
    setCrop({ kind, file })
  }

  const onCropped = (file: File) => {
    if (crop?.kind === 'banner') setBanner({ kind: 'new', file })
    else setAvatarFile(file)
    setCrop(null)
  }

  const uploadOnce = async (file: File, path: string) => {
    const done = uploaded.current.get(file)
    if (done) return done
    const { url } = await uploadFile(file, path)
    uploaded.current.set(file, url)
    return url
  }

  const handleSave = async () => {
    if (!profile || saving || nicknameBlank) return
    setError(null)
    setConfirmDiscard(false)
    // An inline status edit still open is saved first; if it can't be, its row shows why.
    if (listRef.current && !(await listRef.current.commit())) return

    setSaving(true)
    const chosen = statusIdRef.current
    const definitions = useStatusStore.getState().definitions
    const override = overrideFor(choice)
    const patch: ProfilePatch = {
      nickname: nickname.trim(),
      custom_status_text: message.trim() || null,
      profile_message: about.trim() || null,
      // Only a status that still exists (it may have been deleted live).
      status_id: chosen && definitions.some((d) => d.id === chosen) ? chosen : null,
      // presence_override is what every device reads; status is kept in step for old cached apps.
      presence_override: override,
      status: choice,
    }
    try {
      if (banner.kind === 'new') patch.banner_url = await uploadOnce(banner.file, `banners/${profile.id}`)
      // Storage objects aren't deleted; an unused upload is a known leftover.
      else if (banner.kind === 'remove') patch.banner_url = null
      if (avatarFile) patch.avatar_url = await uploadOnce(avatarFile, `avatars/${profile.id}`)
      const { error: updateError } = await supabase.from('profiles').update(patch).eq('id', profile.id)
      if (updateError) throw updateError
    } catch {
      setError(SAVE_ERROR)
      setSaving(false)
      return
    }
    // The profile is saved. If these fail, close anyway: the next profile event corrects the view.
    try {
      await setOverride(override)
    } catch {
      /* corrected by the next presence sync */
    }
    try {
      await fetchProfile()
    } catch {
      /* corrected by the next profile event */
    }
    onClose()
  }

  const fieldLabel = 'text-[11px] font-bold uppercase tracking-[.05em] text-[color:var(--muted)]'
  const inputClass =
    'w-full rounded-[9px] border border-[color:var(--line)] bg-[color:var(--field)] px-2.5 py-[7px] text-[13.5px] font-medium text-[color:var(--fg)] outline-none placeholder:text-[color:var(--muted)] focus:border-[color:var(--accent)]'
  const camClass =
    'absolute grid place-items-center rounded-full bg-black/45 text-white outline-none hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]'

  return (
    <>
      <Sheet
        title="Profile"
        onClose={requestClose}
        onSwipeDown={requestClose}
        swipeDownCloses={closesNow}
        action={{ label: saving ? 'Saving…' : 'Save', onClick: () => void handleSave(), disabled: saving || nicknameBlank }}
      >
        <div className="flex flex-col gap-2.5 pb-4">
          {(confirmDiscard || error) && (
            <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-[color:var(--line)] bg-[color:var(--bar)] px-3.5 py-2.5">
              {confirmDiscard && (
                <div className="flex items-center gap-2">
                  <span className="mr-auto text-[13px] font-semibold">Discard your changes?</span>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setConfirmDiscard(false)}
                    className="rounded-lg px-3 py-[5px] text-xs font-bold text-[color:var(--muted)]"
                  >
                    Keep editing
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg bg-[color:var(--danger)] px-3 py-[5px] text-xs font-bold text-[color:var(--on-danger)]"
                  >
                    Discard
                  </button>
                </div>
              )}
              {error && (
                <p role="alert" className="text-[12.5px] text-[color:var(--danger)]">
                  {error}
                </p>
              )}
            </div>
          )}

          {/* Banner */}
          <div
            className="relative aspect-[4/1] w-full flex-none"
            style={{ background: 'linear-gradient(120deg, color-mix(in srgb, var(--accent) 55%, var(--wall)), var(--accent))' }}
          >
            {bannerUrl && <img src={bannerUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />}
            {hasBanner && (
              <button
                type="button"
                onClick={() => setBanner({ kind: 'remove' })}
                className={`${camClass} bottom-2 left-2.5 h-7 px-2.5 text-[11.5px] font-semibold`}
              >
                Remove banner
              </button>
            )}
            <button
              type="button"
              aria-label="Change banner"
              onClick={() => bannerInput.current?.click()}
              className={`${camClass} bottom-2 right-2.5 h-7 w-7`}
            >
              <Icon icon={Camera} size={15} />
            </button>
            <input ref={bannerInput} name="banner" type="file" accept="image/*" tabIndex={-1} aria-hidden="true" className="hidden" onChange={onPick('banner')} />
          </div>

          {/* Picture */}
          <div className="relative -mt-10 ml-3.5 w-16">
            <span className="block rounded-full border-[3px] border-[color:var(--wall)] bg-[color:var(--wall)]">
              <Avatar name={nickname || profile?.nickname || ''} url={avatarPreview ?? profile?.avatar_url} size={58} />
            </span>
            <button
              type="button"
              aria-label="Change picture"
              onClick={() => avatarInput.current?.click()}
              className={`${camClass} -right-1.5 bottom-0 h-6 w-6`}
            >
              <Icon icon={Camera} size={13} />
            </button>
            <input ref={avatarInput} name="avatar" type="file" accept="image/*" tabIndex={-1} aria-hidden="true" className="hidden" onChange={onPick('avatar')} />
          </div>
          {mediaError && (
            <p role="alert" className="px-3.5 text-[12px] text-[color:var(--danger)]">
              {mediaError}
            </p>
          )}

          <div className="flex flex-col gap-[5px] px-3.5">
            <label htmlFor="profile-nickname" className={fieldLabel}>
              Nickname
            </label>
            <input
              id="profile-nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={32}
              required
              aria-invalid={nicknameBlank || undefined}
              aria-describedby={nicknameBlank ? nickHintId : undefined}
              className={inputClass}
            />
            {nicknameBlank && (
              <p id={nickHintId} className="text-[11.5px] text-[color:var(--danger)]">
                Enter a nickname
              </p>
            )}
          </div>

          <div className="flex flex-col gap-[5px] px-3.5">
            <label htmlFor="status-message" className={fieldLabel}>
              Status message
            </label>
            <input
              id="status-message"
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What are you up to?"
              maxLength={128}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-[5px] px-3.5">
            <label htmlFor="profile-about" className={fieldLabel}>
              About
            </label>
            <textarea
              id="profile-about"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="A line or two about you"
              maxLength={190}
              rows={2}
              className={`${inputClass} resize-none`}
            />
            <p className="text-right text-[11px] text-[color:var(--muted)]">{about.length}/190</p>
          </div>

          <div className="flex flex-col gap-[5px] px-3.5">
            <span id={showMeAsId} className={fieldLabel}>
              Show me as
            </span>
            <div role="radiogroup" aria-labelledby={showMeAsId} className="grid grid-cols-3 rounded-[10px] bg-[color:var(--seg)] p-[3px] text-xs font-[650]">
              {PRESENCE_OPTIONS.map((opt) => {
                const on = choice === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setChoice(opt.value)}
                    className={`inline-flex items-center justify-center gap-[5px] rounded-lg py-[5px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] ${
                      on ? 'bg-[color:var(--seg-on)] text-[color:var(--fg)] shadow-[0_1px_2px_var(--shadow)]' : 'text-[color:var(--muted)]'
                    }`}
                  >
                    <i aria-hidden="true" className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: `var(--presence-${opt.value})` }} />
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="px-3.5">
            <StatusList ref={listRef} selectedId={statusId} onSelect={setStatusId} />
          </div>
        </div>
      </Sheet>

      {crop && (
        <ImageCrop
          file={crop.file}
          aspect={CROPS[crop.kind].aspect}
          output={CROPS[crop.kind].output}
          type="image/jpeg"
          title={CROPS[crop.kind].title}
          onCancel={() => setCrop(null)}
          onDone={onCropped}
          onError={(msg) => {
            setMediaError(msg)
            setCrop(null)
          }}
        />
      )}
    </>
  )
}

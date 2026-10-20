import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { ImagePlus } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import { ImageCrop } from '@/components/ui/ImageCrop'
import { Sheet } from '@/components/ui/Sheet'
import { emojiNameError, normaliseEmojiName } from '@/lib/emoji/names'
import { EMOJI_ACCEPT, emojiFileError } from '@/lib/emoji/upload'
import { useEmojiStore } from '@/stores/emojiStore'

interface AddEmojiProps {
  /**
   * A file already chosen (the picker's "Add emoji" tile opens the photo picker itself, inside the
   * tap, as iOS requires). Each new File is read once. null shows the first step's "Choose image".
   */
  file?: File | null
  onClose: () => void
  /** After the emoji is added (it's already in the store). */
  onAdded: (name: string) => void
}

type Step = 'choose' | 'crop' | 'name'

/**
 * Add a custom emoji (design §11): choose a picture, crop it square (GIFs skip this and stay
 * animated), name it, add it. A `Sheet`, with the crop stacked over it as its own sheet.
 */
export function AddEmoji({ file = null, onClose, onAdded }: AddEmojiProps) {
  const byName = useEmojiStore((s) => s.byName)
  const taken = useMemo(() => new Set(Object.keys(byName)), [byName])

  const [step, setStep] = useState<Step>('choose')
  const [chooseError, setChooseError] = useState<string | null>(null)
  /** The still picture being cropped (null for a GIF). */
  const [source, setSource] = useState<File | null>(null)
  /** What will upload: the cropped PNG, or the GIF as it is. */
  const [picture, setPicture] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const hintId = useId()

  const take = (f: File) => {
    const error = emojiFileError(f)
    setChooseError(error)
    setServerError(null)
    if (error) {
      setStep('choose')
      return
    }
    if (f.type === 'image/gif') {
      setSource(null)
      setPicture(f)
      setStep('name')
    } else {
      setSource(f)
      setStep('crop')
    }
  }

  // A file handed in by the picker: read each new one once (during render, not in an effect).
  const [seen, setSeen] = useState<File | null>(null)
  if (file && file !== seen) {
    setSeen(file)
    take(file)
  }

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!picture) return
    const url = URL.createObjectURL(picture)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [picture])

  useEffect(() => {
    if (step === 'name') nameRef.current?.focus({ preventScroll: true })
  }, [step])

  const nameError = name ? emojiNameError(name, taken) : null
  const valid = name !== '' && nameError === null && serverError === null && picture !== null

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!valid || busy || !picture) return
    setBusy(true)
    const { error } = await useEmojiStore.getState().add(name, picture)
    setBusy(false)
    if (error) {
      setServerError(error)
      return
    }
    onAdded(name)
    onClose()
  }

  const back = () => {
    setServerError(null)
    setStep(source ? 'crop' : 'choose')
  }

  let hint: { text: string; tone: 'good' | 'bad' } | null = null
  if (serverError) hint = { text: serverError, tone: 'bad' }
  else if (nameError) hint = { text: nameError, tone: 'bad' }
  else if (name) hint = { text: `:${name}: is free`, tone: 'good' }

  return (
    <>
      <Sheet
        title={step === 'name' ? 'Name it' : 'Choose a picture'}
        onClose={onClose}
        leading={step === 'name' ? 'back' : 'cancel'}
        onLeading={step === 'name' ? back : undefined}
        width={400}
      >
        <input
          ref={inputRef}
          type="file"
          accept={EMOJI_ACCEPT}
          aria-hidden="true"
          tabIndex={-1}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            // Reset, so choosing the same file again still fires a change.
            e.target.value = ''
            if (f) take(f)
          }}
        />

        {step === 'name' ? (
          <form onSubmit={(e) => void submit(e)} className="flex min-h-full flex-col">
            <div className="flex justify-center pb-1 pt-4">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="The new emoji"
                  className="h-[72px] w-[72px] rounded-xl bg-[color:var(--seg)] object-contain"
                />
              )}
            </div>
            <label className="mx-3.5 mt-1.5 flex flex-col gap-[5px] text-[11px] font-bold uppercase tracking-[0.05em] text-[color:var(--muted)]">
              Name
              <span
                className={`flex h-[34px] items-center rounded-[9px] border bg-[color:var(--field)] px-2.5 text-[13.5px] font-medium normal-case tracking-normal ${
                  hint?.tone === 'bad'
                    ? 'border-[color:var(--danger)]'
                    : hint?.tone === 'good'
                      ? 'border-[color:var(--accent)]'
                      : 'border-[color:var(--line)]'
                }`}
              >
                <span aria-hidden="true">:</span>
                <input
                  ref={nameRef}
                  type="text"
                  aria-label="Emoji name"
                  aria-describedby={hintId}
                  aria-invalid={hint?.tone === 'bad' || undefined}
                  value={name}
                  onChange={(e) => {
                    setServerError(null)
                    setName(normaliseEmojiName(e.target.value))
                  }}
                  placeholder="name"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="done"
                  maxLength={40}
                  className="min-w-0 flex-1 bg-transparent px-0.5 text-[16px] text-[color:var(--fg)] outline-none placeholder:text-[color:var(--muted)] md:text-[13.5px]"
                />
                <span aria-hidden="true">:</span>
              </span>
            </label>
            <p
              id={hintId}
              aria-live="polite"
              className={`mx-3.5 mt-[5px] min-h-[15px] text-[11px] font-medium ${
                hint?.tone === 'bad' ? 'text-[color:var(--danger)]' : 'text-[color:var(--accent)]'
              }`}
            >
              {hint?.text}
            </p>
            <p className="px-4 pt-2 text-[11px] leading-[1.45] text-[color:var(--muted)]">
              Lowercase letters, numbers and _ only, 2 to 32 characters. Capitals and spaces are fixed as you type.
            </p>
            <button
              type="submit"
              disabled={!valid || busy}
              className="mx-3.5 mb-4 mt-auto h-[38px] flex-none rounded-[10px] bg-[color:var(--accent)] text-[13.5px] font-bold text-[color:var(--on-accent)] disabled:opacity-45"
            >
              {busy ? 'Adding…' : 'Add emoji'}
            </button>
          </form>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-8 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--seg)] text-[color:var(--muted)]">
              <Icon icon={ImagePlus} size={26} />
            </span>
            <p className="text-[13px] leading-[1.45] text-[color:var(--muted)]">
              PNG, JPG, GIF or WebP. You’ll crop it square next; animated GIFs stay animated and skip the crop.
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="h-[38px] rounded-[10px] bg-[color:var(--accent)] px-5 text-[13.5px] font-bold text-[color:var(--on-accent)]"
            >
              Choose image
            </button>
            {chooseError && (
              <p role="alert" className="text-[12px] font-medium text-[color:var(--danger)]">
                {chooseError}
              </p>
            )}
          </div>
        )}
      </Sheet>

      {step === 'crop' && source && (
        <ImageCrop
          file={source}
          aspect={1}
          output={{ width: 128, height: 128 }}
          type="image/png"
          previews={[
            { size: 16, label: 'reaction' },
            { size: 22, label: 'in text' },
            { size: 44, label: 'on its own' },
          ]}
          title="Crop"
          leading="back"
          doneLabel="Next"
          fileName="emoji.png"
          hint="Drag to move, pinch or slide to zoom. Saved as a 128 × 128 PNG."
          onCancel={() => setStep('choose')}
          onError={setChooseError}
          onDone={(cropped) => {
            setPicture(cropped)
            setServerError(null)
            setStep('name')
          }}
        />
      )}
    </>
  )
}

import { useId, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'

type Result = { tone: 'ok' | 'error'; text: string } | null

const inputClass = 'w-full rounded-[3px] bg-input px-3 py-2 text-sm text-primary outline-none'
const buttonClass =
  'rounded-[3px] bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50'
const headingClass = 'mb-1 block text-xs font-bold uppercase text-secondary'

function ResultLine({ result }: { result: Result }) {
  if (!result) return null
  return (
    <p role="status" className={`mt-2 text-sm font-medium ${result.tone === 'ok' ? 'text-green-400' : 'text-danger'}`}>
      {result.text}
    </p>
  )
}

function FillTheLake() {
  const fillTheLake = useConversationStore((s) => s.fillTheLake)
  const id = useId()
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)
  const [result, setResult] = useState<Result>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (working || password === '') return
    setWorking(true)
    setResult(null)
    const outcome = await fillTheLake(password)
    setWorking(false)
    if (outcome === 'filled') {
      setPassword('')
      setResult({ tone: 'ok', text: 'Lake filled.' })
    } else if (outcome === 'wrong') {
      setResult({ tone: 'error', text: 'Wrong password.' })
    } else {
      setResult({ tone: 'error', text: "Couldn't fill the lake. Try again." })
    }
  }

  return (
    <form onSubmit={submit} className="mb-8">
      <span className={headingClass}>Fill the Lake</span>
      <p className="mb-3 text-sm text-muted">Bring back everything hidden by Drag the Lake, in both spaces.</p>
      <label htmlFor={id} className="mb-1 block text-xs text-secondary">Lake password</label>
      <div className="flex gap-3">
        <input
          id={id}
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <button type="submit" disabled={working || password === ''} className={`flex-shrink-0 ${buttonClass}`}>
          {working ? 'Filling…' : 'Fill the Lake'}
        </button>
      </div>
      <ResultLine result={result} />
    </form>
  )
}

function ChangeLakePassword() {
  const currentId = useId()
  const nextId = useId()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [working, setWorking] = useState(false)
  const [result, setResult] = useState<Result>(null)
  const blank = next.trim() === ''

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (working || blank) return
    setWorking(true)
    setResult(null)
    const { data, error } = await supabase.rpc('set_lake_password', { p_current: current, p_new: next })
    setWorking(false)
    if (error) {
      setResult({ tone: 'error', text: error.message })
    } else if (data === true) {
      setCurrent('')
      setNext('')
      setResult({ tone: 'ok', text: 'Lake password changed.' })
    } else {
      setResult({ tone: 'error', text: 'Current password is wrong.' })
    }
  }

  return (
    <form onSubmit={submit} className="mb-8">
      <span className={headingClass}>Change lake password</span>
      <p className="mb-3 text-sm text-muted">Everyone uses the same lake password.</p>
      <label htmlFor={currentId} className="mb-1 block text-xs text-secondary">Current lake password</label>
      <input
        id={currentId}
        type="password"
        autoComplete="off"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        className={`mb-3 ${inputClass}`}
      />
      <label htmlFor={nextId} className="mb-1 block text-xs text-secondary">New lake password</label>
      <input
        id={nextId}
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        className={`mb-3 ${inputClass}`}
      />
      <button type="submit" disabled={working || blank} className={buttonClass}>
        {working ? 'Saving…' : 'Save'}
      </button>
      <ResultLine result={result} />
    </form>
  )
}

function ReadReceipts() {
  const profile = useAuthStore((s) => s.profile)
  const labelId = useId()
  // Optimistic: the switch moves at once; it moves back if the write fails.
  const [pending, setPending] = useState<boolean | null>(null)
  const on = pending ?? profile?.read_receipts ?? true

  const toggle = async () => {
    if (!profile || pending !== null) return
    const next = !on
    setPending(next)
    const { error } = await supabase.from('profiles').update({ read_receipts: next }).eq('id', profile.id)
    if (!error) {
      const latest = useAuthStore.getState().profile
      if (latest) useAuthStore.setState({ profile: { ...latest, read_receipts: next } })
    }
    setPending(null)
  }

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between gap-4">
        <span id={labelId} className={headingClass}>Read receipts</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={labelId}
          onClick={toggle}
          className={`relative h-6 w-10 flex-shrink-0 rounded-full transition-colors ${
            on ? 'bg-brand' : 'bg-[hsl(var(--color-input-border))]'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              on ? 'translate-x-[18px]' : 'translate-x-0.5'
            } left-0`}
          />
        </button>
      </div>
      <p className="text-sm text-muted">If you turn this off, you won't see when others have read your messages either.</p>
    </div>
  )
}

/** Lives on the Security tab, under the App Lock PIN section. */
export function LakeSettings() {
  return (
    <>
      <FillTheLake />
      <ChangeLakePassword />
      <ReadReceipts />
    </>
  )
}

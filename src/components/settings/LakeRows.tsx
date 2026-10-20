import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useConversationStore } from '@/stores/conversationStore'
import { Icon } from '@/components/ui/Icon'
import { buttonRowClass } from '@/components/settings/Group'

type Result = { tone: 'ok' | 'error'; text: string } | null

const inputClass =
  'h-9 w-full min-w-0 rounded-lg border border-[color:var(--line)] bg-[color:var(--field)] px-3 text-sm text-[color:var(--fg)] outline-none focus:border-[color:var(--accent)]'
const submitClass =
  'h-9 flex-none rounded-lg bg-[color:var(--accent)] px-4 text-sm font-semibold text-[color:var(--on-accent)] transition-opacity disabled:opacity-50'
const labelClass = 'mb-1 block text-xs text-[color:var(--muted)]'

function ResultLine({ result }: { result: Result }) {
  if (!result) return null
  return (
    <p
      role="status"
      className={`mt-2 text-[13px] font-medium ${result.tone === 'ok' ? 'text-[color:var(--accent)]' : 'text-[color:var(--danger)]'}`}
    >
      {result.text}
    </p>
  )
}

/**
 * A row that expands its form below it. The button and the region share one name, so the row is
 * found as `button { name, expanded }` and its form as `region { name }`.
 */
function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const buttonId = useId()
  const regionId = useId()
  return (
    <div className="border-t border-[color:var(--line)] first:border-t-0">
      <button
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((o) => !o)}
        className={`${buttonRowClass} border-t-0 text-[color:var(--accent)]`}
      >
        <span className="flex-1">{label}</span>
        <Icon icon={ChevronDown} size={16} className={`text-[color:var(--muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={regionId} role="region" aria-labelledby={buttonId} className="px-3 pb-3">
          {children}
        </div>
      )}
    </div>
  )
}

function FillTheLakeForm() {
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
    <form onSubmit={submit}>
      <p className="mb-2.5 text-[12.5px] text-[color:var(--muted)]">
        Bring back everything hidden by Drag the Lake, in both spaces.
      </p>
      <label htmlFor={id} className={labelClass}>Lake password</label>
      <div className="flex gap-2">
        <input
          id={id}
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <button type="submit" disabled={working || password === ''} className={submitClass}>
          {working ? 'Filling…' : 'Fill the Lake'}
        </button>
      </div>
      <ResultLine result={result} />
    </form>
  )
}

function ChangeLakePasswordForm() {
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
    <form onSubmit={submit}>
      <p className="mb-2.5 text-[12.5px] text-[color:var(--muted)]">Everyone uses the same lake password.</p>
      <label htmlFor={currentId} className={labelClass}>Current lake password</label>
      <input
        id={currentId}
        type="password"
        autoComplete="off"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        className={`mb-2.5 ${inputClass}`}
      />
      <label htmlFor={nextId} className={labelClass}>New lake password</label>
      <div className="flex gap-2">
        <input
          id={nextId}
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={inputClass}
        />
        <button type="submit" disabled={working || blank} className={submitClass}>
          {working ? 'Saving…' : 'Save'}
        </button>
      </div>
      <ResultLine result={result} />
    </form>
  )
}

/**
 * Security & privacy → The lake: "Fill the Lake" and "Change lake password", each a disclosure row
 * that expands its form inline (logic moved unchanged from LakeSettings). A form stays open after
 * success, with its fields cleared and the result line showing.
 */
export function LakeRows() {
  return (
    <>
      <Disclosure label="Fill the Lake">
        <FillTheLakeForm />
      </Disclosure>
      <Disclosure label="Change lake password">
        <ChangeLakePasswordForm />
      </Disclosure>
    </>
  )
}

import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useStored } from '../storage'
import { Arena } from './Arena'
import {
  DEFAULT_FIGHT_ID,
  EXPANSIONS,
  FIGHTS,
  PARTY,
  expansionName,
  fightLabel,
  findFight,
  type Expansion,
  type FightKind,
  type PartyId,
  type Pt,
} from './fights'
import { MAX_STEPS, clampToArena, fromMock, placeShape, savedSteps, shareUrl, toArena, type SavedPlans, type SavedStep, type Tool } from './plan'
import './raid.css'

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'move', label: 'Move', hint: 'Drag a token to move it.' },
  { id: 'aoe', label: 'AoE circle', hint: 'Tap the arena to drop an AoE.' },
  { id: 'cone', label: 'Cone', hint: 'Tap to aim a cone from the boss.' },
  { id: 'line', label: 'Line', hint: 'Tap to aim a line through the boss.' },
  { id: 'tower', label: 'Tower', hint: 'Tap the arena to place a tower.' },
  { id: 'erase', label: 'Erase', hint: 'Tap a mechanic to remove it.' },
]

const KINDS: { id: FightKind; name: string }[] = [
  { id: 'savage', name: 'Savage' },
  { id: 'extreme', name: 'Extreme' },
]

const ROLE_NAME = { tank: 'Tank', healer: 'Healer', dps: 'DPS' } as const

/** Renders a note's `**key instruction**` in bold. */
function noteText(note: string): ReactNode[] {
  return note.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : <Fragment key={i}>{part}</Fragment>))
}

/** Raid plans: pick a Savage or Extreme fight, then step through and edit its strategy on the arena. */
export default function RaidPlansView() {
  const [expFilter, setExpFilter] = useState<Expansion | 'all'>('all')
  const [kindFilter, setKindFilter] = useState<FightKind | 'all'>('all')
  const [fightId, setFightId] = useStored('raid:fight', DEFAULT_FIGHT_ID)
  const [plans, setPlans] = useStored<SavedPlans>('raid:plans', {})
  const [stepIndex, setStepIndex] = useState(0)
  const [tool, setTool] = useState<Tool>('move')
  const [drag, setDrag] = useState<{ id: PartyId; pt: Pt } | null>(null)
  const [status, setStatus] = useState('')
  const svgRef = useRef<SVGSVGElement>(null)

  const fight = findFight(fightId) ?? findFight(DEFAULT_FIGHT_ID) ?? FIGHTS[0]
  const saved = savedSteps(plans, fight.id)
  const steps = useMemo(() => saved ?? fromMock(fight.steps), [saved, fight])
  const si = Math.min(stepIndex, steps.length - 1)
  const current = steps[si]
  const toolHint = TOOLS.find((t) => t.id === tool)?.hint

  const groups = useMemo(
    () =>
      (['dt', 'ew', 'shb'] as Expansion[])
        .filter((e) => expFilter === 'all' || e === expFilter)
        .flatMap((exp) =>
          KINDS.filter((k) => kindFilter === 'all' || k.id === kindFilter).map((k) => ({
            key: `${exp}-${k.id}`,
            title: `${expansionName(exp)} · ${k.name}`,
            fights: FIGHTS.filter((f) => f.exp === exp && f.kind === k.id),
          })),
        ),
    [expFilter, kindFilter],
  )

  // Bring the selected fight's chip into its row's view (rows scroll sideways on phones).
  const fightsRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const chip = fightsRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    const row = chip?.parentElement
    if (chip && row) row.scrollLeft = Math.max(0, chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2)
  }, [fight.id, expFilter, kindFilter])

  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(''), 2500)
    return () => clearTimeout(t)
  }, [status])

  /** Applies an edit to the current fight's steps, saving the whole plan on this device. */
  function editSteps(fn: (steps: SavedStep[]) => SavedStep[]) {
    setPlans((prev) => {
      const base = savedSteps(prev, fight.id) ?? fromMock(fight.steps)
      return { ...prev, [fight.id]: fn(base) }
    })
  }

  function editStep(fn: (s: SavedStep) => SavedStep) {
    editSteps((all) => all.map((s, i) => (i === si ? fn(s) : s)))
  }

  function pickFight(id: string) {
    setFightId(id)
    setStepIndex(0)
    setDrag(null)
  }

  function pointFor(e: ReactPointerEvent<SVGSVGElement>): Pt | null {
    const svg = svgRef.current
    return svg ? toArena(svg.getBoundingClientRect(), e.clientX, e.clientY) : null
  }

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    const target = e.target as Element
    if (tool === 'move') {
      const token = target.closest('[data-token]')
      if (!token) return
      e.preventDefault()
      const id = token.getAttribute('data-token') as PartyId
      setDrag({ id, pt: current.party[id] })
      e.currentTarget.setPointerCapture?.(e.pointerId)
      return
    }
    if (tool === 'erase') {
      const shape = target.closest('[data-shape]')
      if (!shape) return
      const index = Number(shape.getAttribute('data-shape'))
      editStep((s) => ({ ...s, shapes: s.shapes.filter((_, i) => i !== index) }))
      return
    }
    const p = pointFor(e)
    if (p) {
      const shape = placeShape(tool, p)
      editStep((s) => ({ ...s, shapes: [...s.shapes, shape] }))
    }
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!drag) return
    const p = pointFor(e)
    if (p) setDrag({ id: drag.id, pt: clampToArena(fight.arena, p) })
  }

  function onPointerUp() {
    if (!drag) return
    const { id, pt } = drag
    setDrag(null)
    const [ox, oy] = current.party[id]
    if (ox === pt[0] && oy === pt[1]) return
    editStep((s) => ({ ...s, party: { ...s.party, [id]: pt } }))
  }

  function addStep() {
    if (steps.length >= MAX_STEPS) return
    const n = steps.length + 1
    editSteps((all) => {
      const src = all[si]
      return [...all, { ...src, name: `Step ${n}`, note: `Copy of step ${si + 1}. **Drag tokens and add mechanics** to plan what comes next.` }]
    })
    setStepIndex(steps.length)
  }

  function resetStep() {
    const mock = fight.steps[current.base] ?? fight.steps[0]
    editStep((s) => ({ ...s, party: mock.party, shapes: mock.shapes }))
  }

  function resetPlan() {
    setPlans((prev) => {
      const next = { ...prev }
      delete next[fight.id]
      return next
    })
    setStepIndex((i) => Math.min(i, fight.steps.length - 1))
    setStatus('Plan reset to the guide strategy')
  }

  async function copyLink() {
    const url = shareUrl(fight.id)
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(url)
      setStatus('Link copied')
    } catch {
      setStatus(`Couldn't copy. Link: ${url}`)
    }
  }

  return (
    <div className="xd-view xd-raid">
      <div className="xd-raid-filters">
        <div className="xd-chips" role="group" aria-label="Expansion">
          <button type="button" className="xd-chip" aria-pressed={expFilter === 'all'} onClick={() => setExpFilter('all')}>
            All
          </button>
          {EXPANSIONS.map((e) => (
            <button key={e.id} type="button" className="xd-chip" aria-pressed={expFilter === e.id} onClick={() => setExpFilter(e.id)}>
              {e.name}
            </button>
          ))}
        </div>
        <div className="xd-chips" role="group" aria-label="Type">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className="xd-chip"
              aria-pressed={kindFilter === k.id}
              onClick={() => setKindFilter((cur) => (cur === k.id ? 'all' : k.id))}
            >
              {k.name}
            </button>
          ))}
        </div>
      </div>

      <nav ref={fightsRef} className="xd-fights" aria-label="Fights">
        {groups.map((g) => (
          <section key={g.key} className="xd-fight-group" aria-label={g.title}>
            <span className="xd-eyebrow">{g.title}</span>
            <div className="xd-chips">
              {g.fights.map((f) => (
                <button key={f.id} type="button" className="xd-chip" aria-pressed={f.id === fight.id} onClick={() => pickFight(f.id)}>
                  {fightLabel(f)}
                </button>
              ))}
            </div>
          </section>
        ))}
      </nav>

      <div className="xd-planner">
        <div className="xd-stage glass">
          <div className="xd-tools" role="toolbar" aria-label="Arena tools">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" className="xd-tool" aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>
                {t.label}
              </button>
            ))}
            <span className="xd-tools-gap" aria-hidden="true" />
            <button type="button" className="xd-tool" onClick={() => editStep((s) => ({ ...s, shapes: [] }))}>
              Clear step
            </button>
            <button type="button" className="xd-tool" onClick={resetStep}>
              Reset step
            </button>
          </div>
          <p className="xd-tool-hint">{toolHint}</p>
          <div className="xd-arena-wrap">
            <Arena
              label={`${fightLabel(fight)} arena, step ${si + 1}: ${current.name}`}
              arena={fight.arena}
              party={current.party}
              shapes={current.shapes}
              tool={tool}
              svgRef={svgRef}
              dragging={drag}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          </div>
          <div className="xd-steps" aria-label="Steps">
            {steps.map((s, i) => (
              <button
                key={i}
                type="button"
                className="xd-step"
                aria-current={i === si ? 'step' : undefined}
                onClick={() => {
                  setStepIndex(i)
                  setDrag(null)
                }}
              >
                <b>{i + 1}</b> {s.name}
              </button>
            ))}
            <button type="button" className="xd-step add" onClick={addStep} disabled={steps.length >= MAX_STEPS}>
              + Add step
            </button>
          </div>
        </div>

        <div className="xd-card glass xd-plan-side">
          <span className="xd-eyebrow">{fight.duty}</span>
          <h3 className="xd-plan-title">
            {fightLabel(fight)}
            <span className="xd-pill">{saved ? 'Edited' : 'Guide'}</span>
          </h3>
          <p className="xd-note">
            <b>
              Step {si + 1}: {current.name}.
            </b>{' '}
            {noteText(current.note)}
          </p>
          <h3 className="xd-party-title">Party</h3>
          <div className="xd-list">
            {PARTY.map((p) => (
              <div key={p.id} className="xd-row xd-party-row">
                <span className={`xd-role ${p.role}`}>{p.id}</span>
                <span className="t">
                  <b>{ROLE_NAME[p.role]}</b>
                  <small>{p.job}</small>
                </span>
                <small className="xd-muted">{p.mit}</small>
              </div>
            ))}
          </div>
          <div className="xd-actions">
            <button type="button" className="xd-btn ghost" onClick={copyLink}>
              Copy share link
            </button>
            <button type="button" className="xd-btn" onClick={resetPlan} disabled={!saved}>
              Reset plan
            </button>
          </div>
          <p className="xd-raid-status" role="status" aria-live="polite">
            {status}
          </p>
        </div>
      </div>
    </div>
  )
}

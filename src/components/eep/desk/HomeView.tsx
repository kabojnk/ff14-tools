import { useEffect, useState } from 'react'
import { getDifficultyColor, getRandomDuties, type FF14Duty } from '@/lib/ff14data'
import { useStored } from '@/components/eep/desk/storage'
import { COLLECTION_KINDS, COLLECTIONS, RECIPES, defaultOwned, formatSpan, resets } from '@/components/eep/desk/data'
import type { DeskView } from '@/components/eep/desk/Aetherdesk'

/** The current tier first: what a raider would have pinned on the home page. */
const CURRENT_TIER = [
  ['M9S', 'Vamp Fatale'],
  ['M10S', 'Red Hot and Deep Blue'],
  ['M11S', 'The Tyrant'],
  ['M12S', 'Lindwurm'],
] as const

/** Live reset countdowns, the duty roulette picker, collection progress, the current tier and the crafting list. */
export function HomeView({ onOpen }: { onOpen: (view: DeskView) => void }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  const t = resets(now)

  const [duties, setDuties] = useState<FF14Duty[]>(() => getRandomDuties(3))
  const [owned] = useStored<string[]>('owned', defaultOwned())
  const [craftList] = useStored<string[]>('craft-list', RECIPES.slice(0, 3).map((r) => r.id))
  const ownedSet = new Set(owned)
  const crafting = craftList.map((id) => RECIPES.find((r) => r.id === id)).filter((r) => r !== undefined)

  return (
    <div className="xd-view">
      <div className="xd-grid">
        <section className="xd-card glass c7" aria-labelledby="xd-resets">
          <h3 id="xd-resets">Resets</h3>
          <div className="xd-timers">
            <Timer label="Daily" value={formatSpan(t.daily)} />
            <Timer label="Weekly" value={formatSpan(t.weekly)} />
            <Timer label="Grand Co." value={formatSpan(t.grandCompany)} />
          </div>
        </section>

        <section className="xd-card glass c5" aria-labelledby="xd-roulette">
          <h3 id="xd-roulette">Duty roulette picker</h3>
          <div className="xd-list" aria-live="polite">
            {duties.map((d) => (
              <div key={d.name} className="xd-duty">
                <span>{d.name}</span>
                <span className="xd-pill" style={{ color: getDifficultyColor(d.difficulty) }}>
                  {d.difficulty}
                </span>
              </div>
            ))}
          </div>
          <div className="xd-actions">
            <button type="button" className="xd-btn" onClick={() => setDuties(getRandomDuties(3))}>
              Roll random content
            </button>
          </div>
        </section>

        <section className="xd-card glass c7" aria-labelledby="xd-progress">
          <div className="xd-head">
            <h3 id="xd-progress">Collection progress</h3>
            <button type="button" className="xd-more" onClick={() => onOpen('collect')}>
              View all
            </button>
          </div>
          <div className="xd-stats">
            {COLLECTION_KINDS.map((k) => {
              const items = COLLECTIONS[k].items
              const have = items.filter((i) => ownedSet.has(i.id)).length
              const pct = Math.round((have / items.length) * 100)
              return (
                <div key={k} className="xd-stat">
                  <span className="xd-ring" style={{ ['--p' as string]: pct }}>
                    <i className="num">{pct}%</i>
                  </span>
                  <span>
                    <b className="num">
                      {have} / {items.length}
                    </b>
                    <small>{COLLECTIONS[k].label}</small>
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="xd-card glass c5" aria-labelledby="xd-tier">
          <div className="xd-head">
            <h3 id="xd-tier">AAC Heavyweight (Savage)</h3>
            <button type="button" className="xd-more" onClick={() => onOpen('raid')}>
              Open planner
            </button>
          </div>
          <div className="xd-list">
            {CURRENT_TIER.map(([code, boss]) => (
              <button key={code} type="button" className="xd-row" onClick={() => onOpen('raid')}>
                <span className="xd-ico">{code}</span>
                <span className="t">
                  <b>{boss}</b>
                  <small>Savage · strategy ready</small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="xd-card glass c12" aria-labelledby="xd-craft">
          <div className="xd-head">
            <h3 id="xd-craft">Crafting list</h3>
            <button type="button" className="xd-more" onClick={() => onOpen('craft')}>
              All recipes
            </button>
          </div>
          {crafting.length === 0 ? (
            <p className="xd-empty">Nothing on your list. Add recipes from Crafting.</p>
          ) : (
            <div className="xd-list">
              {crafting.map((r) => (
                <div key={r.id} className="xd-row">
                  <span className="xd-ico">{r.job}</span>
                  <span className="t">
                    <b>{r.name}</b>
                    <small>
                      Lv {r.level} · {r.materials.length} materials
                    </small>
                  </span>
                  <span className="xd-pill">×1</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Timer({ label, value }: { label: string; value: string }) {
  return (
    <div className="xd-timer">
      <span className="xd-eyebrow">{label}</span>
      <b className="num">{value}</b>
    </div>
  )
}

import { FF14_DUTIES } from '@/lib/ff14data'
import { COLLECTION_KINDS, COLLECTIONS, RECIPES } from '@/components/eep/desk/data'
import type { DeskView } from '@/components/eep/desk/Aetherdesk'

const MAX = 8

/** What the search field found: recipes and materials, collectables and duties. */
export function SearchView({ query, onOpen }: { query: string; onOpen: (view: DeskView) => void }) {
  const q = query.toLowerCase()
  const has = (s: string) => s.toLowerCase().includes(q)

  const recipes = RECIPES.filter((r) => has(r.name) || r.materials.some(([m]) => has(m))).slice(0, MAX)
  const collectables = COLLECTION_KINDS.flatMap((k) =>
    COLLECTIONS[k].items.filter((i) => has(i.name) || has(i.source)).map((i) => ({ ...i, kind: COLLECTIONS[k].label })),
  ).slice(0, MAX)
  const duties = FF14_DUTIES.filter((d) => has(d.name) || has(d.expansion)).slice(0, MAX)
  const none = recipes.length + collectables.length + duties.length === 0

  return (
    <div className="xd-view">
      {none && (
        <section className="xd-card glass">
          <p className="xd-empty">No recipes, items or duties match “{query}”. Try a material, a mount or a fight.</p>
        </section>
      )}
      {recipes.length > 0 && (
        <Group title="Recipes">
          {recipes.map((r) => (
            <button key={r.id} type="button" className="xd-row" onClick={() => onOpen('craft')}>
              <span className="xd-ico">{r.job}</span>
              <span className="t">
                <b>{r.name}</b>
                <small>Lv {r.level}</small>
              </span>
            </button>
          ))}
        </Group>
      )}
      {collectables.length > 0 && (
        <Group title="Collections">
          {collectables.map((i) => (
            <button key={i.id} type="button" className="xd-row" onClick={() => onOpen('collect')}>
              <span className="xd-ico" aria-hidden="true">
                {i.icon}
              </span>
              <span className="t">
                <b>{i.name}</b>
                <small>
                  {i.kind} · {i.source}
                </small>
              </span>
            </button>
          ))}
        </Group>
      )}
      {duties.length > 0 && (
        <Group title="Duties">
          {duties.map((d) => (
            <button key={d.name} type="button" className="xd-row" onClick={() => onOpen('raid')}>
              <span className="t">
                <b>{d.name}</b>
                <small>
                  {d.type} · {d.expansion}
                </small>
              </span>
            </button>
          ))}
        </Group>
      )}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="xd-card glass" aria-label={title}>
      <h3>{title}</h3>
      <div className="xd-list">{children}</div>
    </section>
  )
}

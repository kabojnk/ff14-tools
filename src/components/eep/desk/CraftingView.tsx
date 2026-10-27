import { useState } from 'react'
import { useStored } from '@/components/eep/desk/storage'
import { CRAFTERS, CRAFTER_NAME, RECIPES, type Crafter } from '@/components/eep/desk/data'

const stars = (n: number) => '★'.repeat(n)

/** Recipes by crafting job, each with its stats and a materials checklist; the crafting list shows on Home. */
export function CraftingView() {
  const [job, setJob] = useState<Crafter | 'all'>('all')
  const recipes = RECIPES.filter((r) => job === 'all' || r.job === job)
  const [selectedId, setSelectedId] = useState(RECIPES[0].id)
  const recipe = recipes.find((r) => r.id === selectedId) ?? recipes[0]
  const [have, setHave] = useStored<string[]>('materials', ['Claro Walnut Lumber', 'Wind Cluster'])
  const [list, setList] = useStored<string[]>('craft-list', RECIPES.slice(0, 3).map((r) => r.id))

  const toggleHave = (name: string) => setHave((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]))
  const onList = list.includes(recipe.id)
  const toggleList = () => setList((prev) => (prev.includes(recipe.id) ? prev.filter((id) => id !== recipe.id) : [...prev, recipe.id]))
  const done = recipe.materials.filter(([n]) => have.includes(n)).length

  return (
    <div className="xd-view">
      <div className="xd-chips" role="group" aria-label="Crafting job">
        <button type="button" className="xd-chip" aria-pressed={job === 'all'} onClick={() => setJob('all')}>
          All
        </button>
        {CRAFTERS.map((c) => (
          <button key={c} type="button" className="xd-chip" aria-pressed={job === c} title={CRAFTER_NAME[c]} onClick={() => setJob(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="xd-grid">
        <section className="xd-card glass c5" aria-labelledby="xd-recipes">
          <h3 id="xd-recipes">
            Recipes <span className="xd-pill num">{recipes.length}</span>
          </h3>
          <div className="xd-list" role="listbox" aria-labelledby="xd-recipes">
            {recipes.map((r) => (
              <button key={r.id} type="button" role="option" className="xd-row" aria-selected={r.id === recipe.id} onClick={() => setSelectedId(r.id)}>
                <span className="xd-ico">{r.job}</span>
                <span className="t">
                  <b>{r.name}</b>
                  <small>
                    Lv {r.level} {stars(r.stars)}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="xd-card glass c7" aria-labelledby="xd-recipe">
          <span className="xd-eyebrow">
            {CRAFTER_NAME[recipe.job]} · Lv {recipe.level} {stars(recipe.stars)}
          </span>
          <h3 id="xd-recipe" style={{ marginTop: 4, fontSize: 19 }}>
            {recipe.name}
          </h3>
          <div className="xd-specs">
            <Spec label="Durability" value={recipe.durability} />
            <Spec label="Craftsmanship" value={recipe.craftsmanship} />
            <Spec label="Control" value={recipe.control} />
            <Spec label="CP" value={recipe.cp} />
          </div>
          <h3 style={{ marginTop: 16 }}>
            Materials{' '}
            <span className="xd-pill num">
              {done} / {recipe.materials.length}
            </span>
          </h3>
          <div className="xd-bar" role="progressbar" aria-label="Materials gathered" aria-valuemin={0} aria-valuemax={recipe.materials.length} aria-valuenow={done}>
            <i style={{ width: `${(done / recipe.materials.length) * 100}%` }} />
          </div>
          <div className="xd-mats">
            {recipe.materials.map(([name, qty], i) => (
              <label key={name} className="xd-mat">
                <input type="checkbox" id={`xd-mat-${recipe.id}-${i}`} checked={have.includes(name)} onChange={() => toggleHave(name)} />
                <span>{name}</span>
                <span className="q">×{qty}</span>
              </label>
            ))}
          </div>
          <div className="xd-actions">
            <button type="button" className={onList ? 'xd-btn ghost' : 'xd-btn'} onClick={toggleList}>
              {onList ? 'Remove from crafting list' : 'Add to crafting list'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

function Spec({ label, value }: { label: string; value: number }) {
  return (
    <div className="xd-spec">
      <small className="xd-eyebrow">{label}</small>
      <b className="num">{value.toLocaleString('en-US')}</b>
    </div>
  )
}

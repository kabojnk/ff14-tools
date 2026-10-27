import { useStored } from '@/components/eep/desk/storage'
import {
  COLLECTION_KINDS,
  COLLECTIONS,
  defaultOwned,
  sideLabel,
  type Achievement,
  type Collectable,
  type CollectionKind,
  type TripleTriadCard,
} from '@/components/eep/desk/data'

/** Mounts, minions, Triple Triad cards and achievements. Tap an item to mark it collected (kept on this device). */
export function CollectionsView() {
  const [kind, setKind] = useStored<CollectionKind>('collection', 'mounts')
  const shown = COLLECTION_KINDS.includes(kind) ? kind : 'mounts'
  const [owned, setOwned] = useStored<string[]>('owned', defaultOwned())
  const items = COLLECTIONS[shown].items
  const have = items.filter((i) => owned.includes(i.id)).length
  const toggle = (id: string) => setOwned((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  return (
    <div className="xd-view">
      <section className="xd-card glass" aria-label={COLLECTIONS[shown].label}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="xd-seg" role="group" aria-label="Collection">
            {COLLECTION_KINDS.map((k) => (
              <button key={k} type="button" aria-pressed={k === shown} onClick={() => setKind(k)}>
                {COLLECTIONS[k].label}
              </button>
            ))}
          </div>
          <span className="xd-pill num" style={{ marginLeft: 'auto' }}>
            {have} / {items.length} collected
          </span>
        </div>
        <div className="xd-tiles">
          {items.map((item) => (
            <Tile key={item.id} kind={shown} item={item} owned={owned.includes(item.id)} onToggle={() => toggle(item.id)} />
          ))}
        </div>
      </section>
    </div>
  )
}

function Tile({ kind, item, owned, onToggle }: { kind: CollectionKind; item: Collectable; owned: boolean; onToggle: () => void }) {
  const progress = kind === 'achievements' ? (owned ? 100 : (item as Achievement).progress) : null
  return (
    <button type="button" className="xd-tile" aria-pressed={owned} onClick={onToggle}>
      {kind === 'cards' ? <CardFace card={item as TripleTriadCard} /> : <span className="xd-art" aria-hidden="true">{item.icon}</span>}
      <b>
        {kind === 'cards' && <span className="xd-muted num">No. {(item as TripleTriadCard).number} </span>}
        {item.name}
      </b>
      <small>
        {item.source}
        {kind === 'achievements' && ` · ${(item as Achievement).points} pts`}
      </small>
      {progress !== null && (
        <span className="xd-bar" aria-hidden="true">
          <i style={{ width: `${progress}%` }} />
        </span>
      )}
      {owned && (
        <span className="xd-tick" aria-hidden="true">
          ✓
        </span>
      )}
    </button>
  )
}

/** A Triple Triad card: the four side values top-left (top, left, right, bottom, as the game prints them), stars below. */
function CardFace({ card }: { card: TripleTriadCard }) {
  const [top, right, bottom, left] = card.sides
  return (
    <span className="xd-card-face" aria-hidden="true">
      {card.icon}
      <span className="xd-tt">
        <span />
        <span>{sideLabel(top)}</span>
        <span />
        <span>{sideLabel(left)}</span>
        <span />
        <span>{sideLabel(right)}</span>
        <span />
        <span>{sideLabel(bottom)}</span>
        <span />
      </span>
      <span className="xd-stars">{'★'.repeat(card.stars)}</span>
    </span>
  )
}

import { useId, type PointerEvent as ReactPointerEvent, type Ref } from 'react'
import { PARTY, type ArenaShape, type Formation, type PartyId, type Pt, type Shape } from './fights'

const WAYMARKS: [label: string, x: number, y: number, colour: 'a' | 'b' | 'c' | 'd', round: boolean][] = [
  ['A', 200, 50, 'a', true],
  ['B', 350, 200, 'b', true],
  ['C', 200, 350, 'c', true],
  ['D', 50, 200, 'd', true],
  ['1', 95, 95, 'a', false],
  ['2', 305, 95, 'b', false],
  ['3', 305, 305, 'c', false],
  ['4', 95, 305, 'd', false],
]

/** Point at `len` from (x, y) along a bearing (degrees clockwise from north). */
function along(x: number, y: number, deg: number, len: number): string {
  const a = (deg * Math.PI) / 180
  return `${(x + len * Math.sin(a)).toFixed(1)} ${(y - len * Math.cos(a)).toFixed(1)}`
}

function ShapeView({ shape, arena }: { shape: Shape; arena: ArenaShape }) {
  switch (shape[0]) {
    case 'aoe':
      return <circle className="s-aoe" cx={shape[1]} cy={shape[2]} r={shape[3] ?? 46} />
    case 'stack':
      return (
        <g className="s-stack">
          <circle cx={shape[1]} cy={shape[2]} r={30} />
          <circle className="dot" cx={shape[1]} cy={shape[2]} r={4} />
        </g>
      )
    case 'tower':
      return <circle className="s-tower" cx={shape[1]} cy={shape[2]} r={34} />
    case 'cone': {
      const [, x, y, deg] = shape
      return <path className="s-cone" d={`M${x} ${y} L${along(x, y, deg - 30, 420)} A420 420 0 0 1 ${along(x, y, deg + 30, 420)} Z`} />
    }
    case 'line': {
      const [, x, y, deg] = shape
      return <rect className="s-aoe" x={x - 35} y={y - 300} width={70} height={600} transform={`rotate(${deg} ${x} ${y})`} />
    }
    case 'donut': {
      const [, x, y, r] = shape
      return <path className="s-aoe s-donut" fillRule="evenodd" d={`M0 0H400V400H0Z M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`} />
    }
    case 'half': {
      const side = shape[1]
      const r = { n: [0, 0, 400, 200], s: [0, 200, 400, 200], w: [0, 0, 200, 400], e: [200, 0, 200, 400] }[side]
      return <rect className="s-aoe s-half" x={r[0]} y={r[1]} width={r[2]} height={r[3]} />
    }
    case 'split':
      return (
        <g>
          <rect className="s-fire" x={0} y={0} width={200} height={400} />
          <rect className="s-water" x={200} y={0} width={200} height={400} />
        </g>
      )
    case 'ring':
      return arena === 'circle' ? (
        <circle className="s-ring" cx={200} cy={200} r={168} />
      ) : (
        <rect className="s-ring" x={32} y={32} width={336} height={336} rx={8} />
      )
  }
}

interface ArenaProps {
  label: string
  arena: ArenaShape
  party: Formation
  shapes: Shape[]
  tool: string
  svgRef: Ref<SVGSVGElement>
  onPointerDown: (e: ReactPointerEvent<SVGSVGElement>) => void
  onPointerMove: (e: ReactPointerEvent<SVGSVGElement>) => void
  onPointerUp: (e: ReactPointerEvent<SVGSVGElement>) => void
  dragging?: { id: PartyId; pt: Pt } | null
}

/** The 400×400 arena: floor, grid, waymarks, mechanics, boss, then the party on top. */
export function Arena({ label, arena, party, shapes, tool, svgRef, onPointerDown, onPointerMove, onPointerUp, dragging }: ArenaProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const floorId = `xd-floor-${uid}`
  const clipId = `xd-clip-${uid}`
  return (
    <svg
      ref={svgRef}
      className="xd-arena"
      data-tool={tool}
      viewBox="0 0 400 400"
      role="img"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        <radialGradient id={floorId}>
          <stop offset="0" stopColor="rgba(120,170,255,.28)" />
          <stop offset="1" stopColor="rgba(40,60,120,.18)" />
        </radialGradient>
        <clipPath id={clipId}>
          {arena === 'square' ? <rect x={20} y={20} width={360} height={360} rx={14} /> : <circle cx={200} cy={200} r={182} />}
        </clipPath>
      </defs>
      {arena === 'square' ? (
        <rect className="floor" x={20} y={20} width={360} height={360} rx={14} fill={`url(#${floorId})`} />
      ) : (
        <circle className="floor" cx={200} cy={200} r={182} fill={`url(#${floorId})`} />
      )}
      <g className="grid" clipPath={`url(#${clipId})`}>
        {[1, 2, 3].map((i) => (
          <g key={i}>
            <line x1={20 + i * 90} y1={20} x2={20 + i * 90} y2={380} />
            <line x1={20} y1={20 + i * 90} x2={380} y2={20 + i * 90} />
          </g>
        ))}
      </g>
      {WAYMARKS.map(([l, x, y, c, round]) => (
        <g key={l} className={`wm wm-${c}`}>
          {round ? <circle cx={x} cy={y} r={15} /> : <rect x={x - 14} y={y - 14} width={28} height={28} rx={4} />}
          <text x={x} y={y + 5}>{l}</text>
        </g>
      ))}
      <g clipPath={`url(#${clipId})`}>
        {shapes.map((s, i) => (
          <g key={i} className="shape" data-shape={i}>
            <ShapeView shape={s} arena={arena} />
          </g>
        ))}
      </g>
      <g className="boss">
        <circle cx={200} cy={200} r={26} />
        <text x={200} y={204}>BOSS</text>
      </g>
      {PARTY.map(({ id, role }) => {
        const [x, y] = dragging?.id === id ? dragging.pt : party[id]
        return (
          <g key={id} className={`token ${role}`} data-token={id} transform={`translate(${x} ${y})`}>
            <circle r={14} />
            <text y={4}>{id}</text>
          </g>
        )
      })}
    </svg>
  )
}

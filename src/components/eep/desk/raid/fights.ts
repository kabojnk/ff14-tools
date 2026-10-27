/*
 * Raid plan data: every Savage and Extreme fight from Shadowbringers on, each with a mock strategy.
 * Dawntrail Savage (M1S–M12S) gets hand-written steps; the rest are built from step templates picked
 * deterministically per fight, named after the fight's own mechanics where we have them.
 * Coordinates are in the arena's 400×400 viewBox: centre 200,200, north up, square floor 20–380,
 * round floor radius 182.
 */

export type Expansion = 'dt' | 'ew' | 'shb'
export type FightKind = 'savage' | 'extreme'
export type ArenaShape = 'square' | 'circle'
export type Role = 'tank' | 'healer' | 'dps'
export type PartyId = 'MT' | 'OT' | 'H1' | 'H2' | 'M1' | 'M2' | 'R1' | 'R2'
export type Pt = [number, number]
export type Formation = Record<PartyId, Pt>

/**
 * A mechanic drawn on the arena. Angles are degrees clockwise from north.
 * aoe: circle (x, y, radius?) · stack: shared circle · tower: soak circle · cone: 60° sector from (x, y) ·
 * line: 70-wide band through (x, y) · donut: everything outside radius r of (x, y) ·
 * half: that half of the room is hit · split: two-colour halves (west/east) · ring: the arena edge.
 */
export type Shape =
  | ['aoe', number, number, number?]
  | ['stack', number, number]
  | ['tower', number, number]
  | ['cone', number, number, number]
  | ['line', number, number, number]
  | ['donut', number, number, number]
  | ['half', 'n' | 'e' | 's' | 'w']
  | ['split']
  | ['ring']

export interface PlanStep {
  name: string
  /** One or two sentences; `**…**` marks the key instruction. */
  note: string
  party: Formation
  shapes: Shape[]
}

export interface Fight {
  id: string
  /** Savage floor code (M9S); extremes have none. */
  code?: string
  boss: string
  /** Savage tier name or the trial's duty name. */
  duty: string
  exp: Expansion
  kind: FightKind
  arena: ArenaShape
  steps: PlanStep[]
}

export const EXPANSIONS: { id: Expansion; name: string }[] = [
  { id: 'shb', name: 'Shadowbringers' },
  { id: 'ew', name: 'Endwalker' },
  { id: 'dt', name: 'Dawntrail' },
]

export const PARTY: { id: PartyId; role: Role; job: string; mit: string }[] = [
  { id: 'MT', role: 'tank', job: 'Main tank', mit: 'Rampart · Reprisal' },
  { id: 'OT', role: 'tank', job: 'Off tank', mit: 'Shake / Divine Veil' },
  { id: 'H1', role: 'healer', job: 'Pure healer', mit: 'Temperance / Liturgy' },
  { id: 'H2', role: 'healer', job: 'Shield healer', mit: 'Expedient / Kerachole' },
  { id: 'M1', role: 'dps', job: 'Melee', mit: 'Feint' },
  { id: 'M2', role: 'dps', job: 'Melee', mit: 'Feint' },
  { id: 'R1', role: 'dps', job: 'Phys. ranged', mit: 'Tactician / Troubadour' },
  { id: 'R2', role: 'dps', job: 'Caster', mit: 'Addle' },
]

export const PARTY_IDS: PartyId[] = PARTY.map((p) => p.id)

/* ---------- formations ---------- */

/** Clock order around the boss: MT north, then clockwise. */
const CLOCK_ORDER: [PartyId, number][] = [
  ['MT', 0], ['M1', 45], ['OT', 90], ['R1', 135], ['H1', 180], ['M2', 225], ['H2', 270], ['R2', 315],
]

function ring(r: number): Formation {
  const f = {} as Formation
  for (const [id, deg] of CLOCK_ORDER) {
    const a = (deg * Math.PI) / 180
    f[id] = [Math.round(200 + r * Math.sin(a)), Math.round(200 - r * Math.cos(a))]
  }
  return f
}

function shift(base: Formation, dx: number, dy: number): Formation {
  const f = {} as Formation
  for (const id of PARTY_IDS) f[id] = [base[id][0] + dx, base[id][1] + dy]
  return f
}

const LIGHT: Formation = {
  MT: [200, 148], OT: [226, 160], H1: [178, 236], H2: [222, 236], M1: [190, 262], M2: [216, 268], R1: [168, 288], R2: [232, 288],
}

export const FORMATIONS = {
  /** Tanks on the boss, party stacked south. */
  light: LIGHT,
  /** Tanks split north for a shared buster, party south. */
  buster: { MT: [165, 120], OT: [235, 120], M1: [168, 240], M2: [232, 240], H1: [150, 276], R1: [186, 284], R2: [216, 284], H2: [250, 276] },
  clock: ring(80),
  out: ring(150),
  in: ring(48),
  towers: { MT: [130, 130], OT: [270, 130], H1: [130, 270], H2: [270, 270], M1: [154, 154], M2: [246, 154], R1: [154, 246], R2: [246, 246] },
  pairs: { MT: [110, 120], H1: [136, 132], OT: [290, 120], H2: [264, 132], M1: [110, 280], R1: [136, 268], M2: [290, 280], R2: [264, 268] },
  /** Light party 1 west (D), light party 2 east (B). */
  lp: { MT: [112, 176], H1: [96, 214], M1: [128, 212], R1: [112, 246], OT: [288, 176], H2: [304, 214], M2: [272, 212], R2: [288, 246] },
  south: { MT: [170, 246], OT: [230, 246], M1: [150, 284], M2: [250, 284], H1: [176, 320], H2: [224, 320], R1: [130, 330], R2: [270, 330] },
  east: shift(LIGHT, 92, 0),
  west: shift(LIGHT, -92, 0),
} satisfies Record<string, Formation>

export type FormationKey = keyof typeof FORMATIONS

/* ---------- building steps ---------- */

type RawStep = [name: string, note: string, party: FormationKey, shapes?: Shape[]]

function step([name, note, party, shapes = []]: RawStep): PlanStep {
  return { name, note, party: FORMATIONS[party], shapes }
}

const PROTEAN: Shape[] = [['cone', 200, 200, 45], ['cone', 200, 200, 135], ['cone', 200, 200, 225], ['cone', 200, 200, 315]]
const CORNER_TOWERS: Shape[] = [['tower', 130, 130], ['tower', 270, 130], ['tower', 130, 270], ['tower', 270, 270]]
const CARDINAL_TOWERS: Shape[] = [['tower', 200, 90], ['tower', 310, 200], ['tower', 200, 310], ['tower', 90, 200]]

/** Template middle steps, keyed by mechanic. Each takes an optional fight-specific name. */
const TEMPLATES = {
  spread: (n = 'Spread') => step([n, 'Eight spread markers. Go to your **clock spot** on the waymarks, then back in.', 'clock', [['aoe', 200, 120, 34], ['aoe', 280, 200, 34], ['aoe', 200, 280, 34], ['aoe', 120, 200, 34]]]),
  stack: (n = 'Light-party stacks') => step([n, 'Two stack markers on the healers. **H1 group west, H2 group east**; melee stay tight.', 'lp', [['stack', 112, 212], ['stack', 288, 212]]]),
  towers: (n = 'Light-party towers') => step([n, 'Four towers. **Light parties** soak: tanks and healers north, DPS south.', 'towers', CORNER_TOWERS]),
  partners: (n = 'Partner stacks') => step([n, 'Pair up tank+healer and melee+ranged. **Stack with your partner** in your quadrant.', 'pairs', [['stack', 123, 126], ['stack', 277, 126], ['stack', 123, 274], ['stack', 277, 274]]]),
  line: (n = 'Line dodge') => step([n, 'Lines sweep down the sides. Stand in the **middle lane**, between the AoEs.', 'clock', [['line', 70, 200, 0], ['line', 330, 200, 0]]]),
  cone: (n = 'Cone cleave') => step([n, 'The boss cleaves north. Everyone **behind waymark C**, tanks included.', 'south', [['cone', 200, 200, 0]]]),
  donut: (n = 'Donut') => step([n, 'Donut AoE around the boss. **Get inside the hitbox**, then out on the next cast.', 'in', [['donut', 200, 200, 70]]]),
  chariot: (n = 'Chariot') => step([n, 'Point-blank AoE on the boss. **Get out** to the waymarks, then back for uptime.', 'out', [['aoe', 200, 200, 115]]]),
  halves: (n = 'Half-room cleave') => step([n, 'One half of the room gets cleaved. Read the tell and **take the safe half** (east here).', 'east', [['half', 'w']]]),
}

type TemplateKey = keyof typeof TEMPLATES
const POOL: TemplateKey[] = ['spread', 'towers', 'partners', 'stack', 'line', 'cone', 'donut', 'chariot', 'halves']

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Opener, 2–3 middle steps (the fight's named mechanics first, then pool picks by hash), enrage. */
function templated(id: string, raidwide: string, buster: string, named: [TemplateKey, string][]): PlanStep[] {
  const h = hash(id)
  const want = 2 + (h % 2)
  const middle = named.slice(0, want)
  const used = new Set<TemplateKey>(middle.map(([k]) => k))
  for (let i = 0; middle.length < want; i++) {
    const k = POOL[(h + i * 7) % POOL.length]
    if (!used.has(k)) {
      used.add(k)
      middle.push([k, ''])
    }
  }
  return [
    step(['Opener', `${raidwide} raidwide, then ${buster} on the MT. **OT provokes after the hit**; party south.`, 'buster', [['aoe', 165, 120, 40]]]),
    ...middle.map(([k, n]) => TEMPLATES[k](n || undefined)),
    step(['Enrage', 'Heavy raidwides back to back. **LB3 on the last cast**; healers shield before each one.', 'light']),
  ]
}

/* ---------- Dawntrail Savage: hand-written ---------- */

const DT_SAVAGE: Record<string, RawStep[]> = {
  m1s: [
    ['Opener', 'Bloody Scratch raidwide, then Biscuit Maker on the MT. **OT provokes after the first hit**.', 'buster', [['aoe', 165, 120, 40]]],
    ['One-two Paw', 'Two half-room cleaves in a row. Start in the safe half, then **cross over as it resolves**.', 'east', [['half', 'w']]],
    ['Quadruple Crossing', 'Protean cones from the cat, twice. **Clock spots**, then step into the first cones.', 'clock', PROTEAN],
    ['Mouser', 'Paws break tiles north and south. **Light parties** hold B and D on intact tiles.', 'lp', [['aoe', 200, 80, 60], ['aoe', 200, 320, 60]]],
    ['Leaping One-two Paw', 'The cat leaps to a corner and cleaves. **Follow the leap**, take the far half.', 'west', [['half', 'e'], ['aoe', 300, 100, 60]]],
  ],
  m2s: [
    ['Call Me Honey', 'Raidwide, then Drop of Venom. **Everyone stacks south** of the boss.', 'light', [['stack', 200, 262]]],
    ['Honey Beeline', 'A wide line through the middle. **Light parties hug B and D**.', 'lp', [['line', 200, 200, 0]]],
    ['Tempting Twist', 'Donut from the boss. **Get under her**, inside the hitbox.', 'in', [['donut', 200, 200, 70]]],
    ['Alarm Pheromones', 'Bees fly through on the diagonals. **Hold the centre lane** until they pass.', 'in', [['line', 110, 110, 45], ['line', 290, 290, 45]]],
    ['Enrage', 'Raidwides into Heart-Struck towers. **Healer LB3** if the party dips, otherwise tank LB late.', 'light'],
  ],
  m3s: [
    ['Opener', 'Six-hit Brutal Impact, then Knuckle Sandwich. **MT and OT share** the buster.', 'buster', [['stack', 200, 120]]],
    ['Octuple Lariat', 'Chariot plus eight cones. **Out first**, then rotate into the gaps.', 'out', [['aoe', 200, 200, 110]]],
    ['Fuses', 'Short and long fuses. **Short fuses spread** on clock spots; long fuses stay mid.', 'clock', [['aoe', 200, 120, 34], ['aoe', 280, 200, 34], ['aoe', 200, 280, 34], ['aoe', 120, 200, 34]]],
    ['Lariat Combo', 'He dashes across with a half-room lariat. **Follow him through** to the side he left.', 'west', [['half', 'e'], ['line', 200, 200, 90]]],
    ['Final Fusedown', 'Last fuse set, then enrage. **LB3 on the final cast**.', 'light'],
  ],
  m4s: [
    ['Wrath of Zeus', 'Raidwide, then Wicked Jolt on the MT. **OT swaps after the second hit**.', 'buster', [['aoe', 165, 120, 40]]],
    ['Bewitching Flight', 'Beams sweep the east and west lanes. **Stand in the middle** at A or C.', 'light', [['line', 70, 200, 0], ['line', 330, 200, 0]]],
    ['Electrope Edge', 'Lightning on the corners, then Sidewise Spark. **Take the safe side**, west here.', 'west', [['half', 'e'], ['aoe', 90, 90, 40], ['aoe', 90, 310, 40]]],
    ['Ion Cluster', 'Positron and negatron debuffs. **Partners** split to opposite charges.', 'pairs', [['stack', 123, 126], ['stack', 277, 126], ['stack', 123, 274], ['stack', 277, 274]]],
    ['Wicked Bolt', 'Five-hit stack. **Everyone in**, mitigation on hits three and five.', 'light', [['stack', 200, 250]]],
  ],
  m5s: [
    ['Deep Cut', 'Cone buster on both tanks. **Tanks angle north**, everyone else south.', 'south', [['cone', 200, 200, 330], ['cone', 200, 200, 30]]],
    ['Flip to A-side', 'Role cleave then light-party stacks. **Healers lead** the stacks east and west.', 'lp', [['stack', 112, 212], ['stack', 288, 212]]],
    ['Disco Infernal', 'Spotlights on the floor. **Stand in a spotlight** before your burn ticks.', 'towers', CORNER_TOWERS],
    ['Arcady Night Fever', 'Dance cones in sequence. **Follow the steps** clockwise from your clock spot.', 'clock', PROTEAN],
    ['Frogtourage', 'Frogs repeat the moves. **Light parties** dodge their lines on B and D.', 'lp', [['line', 200, 200, 0]]],
  ],
  m6s: [
    ['Mousse Mural', 'Raidwide, then Color Riot. **The tank closer to the boss** takes the cold hit.', 'buster', [['aoe', 165, 120, 40], ['aoe', 235, 120, 40]]],
    ['Sticky Mousse', 'Partner stacks that leave goo. **Stack, then step off** the puddle.', 'pairs', [['stack', 123, 126], ['stack', 277, 126], ['stack', 123, 274], ['stack', 277, 274]]],
    ['Sugarscape: Desert', 'Quicksand swallows the west. **Stay east** and soak your tower.', 'east', [['half', 'w'], ['tower', 290, 120], ['tower', 290, 280]]],
    ['Sugarscape: River', 'Flood lines through the middle. **Light parties** hold north and south banks.', 'towers', [['line', 200, 200, 90]]],
    ['Enrage', 'Mousse Drip into the final raidwide. **LB3 on the cast bar**.', 'light'],
  ],
  m7s: [
    ['Opener', 'Brutal Impact, then Smash Here/There. **Read the cast**: close or far tank takes it.', 'buster', [['aoe', 165, 120, 40]]],
    ['Sinister Seeds', 'Seeds drop on everyone. **Spread to clock spots**, then dodge the vines.', 'clock', [['aoe', 200, 120, 34], ['aoe', 280, 200, 34], ['aoe', 200, 280, 34], ['aoe', 120, 200, 34]]],
    ['Pulp Smash', 'Stack, then protean. **Stack south**, then fan out to your clock spot.', 'light', [['stack', 200, 250], ...PROTEAN]],
    ['Glower Power', 'Line from the boss north. **Everyone south**, partners together.', 'south', [['line', 200, 110, 0]]],
    ['Neo Bombarian Special', 'Knockback, then enrage raidwides. **Anti-knockback** and LB3.', 'light', [['ring']]],
  ],
  m8s: [
    ['Opener', 'Extraplanar Pursuit raidwide, then Great Divide. **Tanks share** the line north.', 'buster', [['line', 200, 100, 0]]],
    ['Windfang', 'Cross AoE with partner stacks. **Intercards**, stack with your partner.', 'pairs', [['line', 200, 200, 0], ['line', 200, 200, 90]]],
    ['Stonefang', 'Donut with spreads. **Get in close**, spread around the hitbox.', 'in', [['donut', 200, 200, 70]]],
    ['Millennial Decay', 'Wolf heads breathe in turn. **Rotate clockwise** with the heads.', 'clock', PROTEAN],
    ['Terrestrial Titans', 'Four towers rise. **Light parties** take the cardinal towers.', 'towers', CARDINAL_TOWERS],
  ],
  m9s: [
    ['Opener', 'Raidwide into tankbuster. Tanks on the boss, party stacks **south of centre**.', 'light'],
    ['Bat swarm', 'Bats fly across in lines. Dodge to the **safe lane** between the beams.', 'clock', [['line', 70, 200, 0], ['line', 330, 200, 0]]],
    ['Blood towers', 'Four towers. **Light parties** soak: tanks and healers north, DPS south.', 'towers', CORNER_TOWERS],
    ['Enrage check', 'All mitigation by role order; healers **shield before the cast**.', 'light'],
  ],
  m10s: [
    ['Opener', 'Both bosses cast a raidwide, then a dual buster. **One tank on each boss**.', 'buster', [['aoe', 165, 120, 40], ['aoe', 235, 120, 40]]],
    ['Split arena', 'Fire side west, water side east. **Partner stacks** on your side.', 'pairs', [['split']]],
    ['Tidal cone', 'Deep Blue cleaves a cone north. Everyone **behind waymark 3**.', 'south', [['cone', 200, 200, 0]]],
    ['Swap', 'Sides swap: tanks invuln-check, party **crosses through the middle**.', 'light'],
  ],
  m11s: [
    ['Crown slam', 'Large donut. Get **inside the hitbox**.', 'in', [['donut', 200, 200, 70]]],
    ['Meteor spread', 'Eight meteors. **Clock spots** on the waymarks.', 'clock', [['aoe', 200, 60], ['aoe', 340, 200], ['aoe', 200, 340], ['aoe', 60, 200]]],
    ['Tyrant cleave', 'A half-room swipe from the west. **Take the east half**, tanks keep the boss centred.', 'east', [['half', 'w']]],
    ['Tank swap', 'OT provokes after the second buster. **Shirk on the swap**.', 'buster', [['aoe', 165, 120, 40]]],
  ],
  m12s: [
    ['Coils', 'Body coils around the edge. **Stack centre**, then out on the tell.', 'light', [['ring']]],
    ['Venom puddles', 'Bait puddles at the edge in **role pairs**.', 'pairs', [['aoe', 120, 90], ['aoe', 280, 90], ['aoe', 120, 310], ['aoe', 280, 310]]],
    ['Wyrm towers', 'Two towers per light party. Use the **A/C split**.', 'towers', CARDINAL_TOWERS],
    ['Enrage', 'Heavy raidwides; **LB3 on the last cast**.', 'light'],
  ],
}

/* ---------- the fight list ---------- */

type Row = [id: string, code: string, boss: string, duty: string, arena: ArenaShape, raidwide?: string, buster?: string, named?: [TemplateKey, string][]]

const SAVAGE: Record<Expansion, Row[]> = {
  shb: [
    ['e1s', 'E1S', 'Eden Prime', "Eden's Gate (Savage)", 'square', 'Eden Gravity', 'Spear of Paradise', [['line', 'Vice and Virtue'], ['donut', 'Delta Attack']]],
    ['e2s', 'E2S', 'Voidwalker', "Eden's Gate (Savage)", 'square', 'Entropy', 'Shadowflame', [['stack', 'Unholy Darkness'], ['spread', 'Dark Fire III']]],
    ['e3s', 'E3S', 'Leviathan', "Eden's Gate (Savage)", 'square', 'Tidal Roar', 'Tidal Rage', [['line', 'Tidal Wave'], ['spread', 'Rip Current']]],
    ['e4s', 'E4S', 'Titan', "Eden's Gate (Savage)", 'circle', 'Stonecrusher', 'Voice of the Land', [['line', 'Landslide'], ['spread', 'Weight of the Land']]],
    ['e5s', 'E5S', 'Ramuh', "Eden's Verse (Savage)", 'circle', 'Judgment Volts', 'Crippling Blow', [['line', 'Stratospear'], ['towers', 'Volt Strike']]],
    ['e6s', 'E6S', 'Garuda & Ifrit', "Eden's Verse (Savage)", 'square', 'Superstorm', 'Instant Incineration', [['halves', 'Conflag Strike'], ['spread', 'Air Bump']]],
    ['e7s', 'E7S', 'The Idol of Darkness', "Eden's Verse (Savage)", 'square', 'Empty Wave', 'Unshadowed Stake', [['halves', 'Betwixt Worlds'], ['stack', 'Empty Flood']]],
    ['e8s', 'E8S', 'Shiva', "Eden's Verse (Savage)", 'circle', 'Absolute Zero', 'Double Slap', [['chariot', 'Axe Kick'], ['donut', 'Scythe Kick'], ['towers', 'Light Rampant']]],
    ['e9s', 'E9S', 'Cloud of Darkness', "Eden's Promise (Savage)", 'square', 'Ground-razing Particle', 'Zero-form Particle', [['halves', 'Empty Plane'], ['towers', 'Particle Concentration']]],
    ['e10s', 'E10S', 'Shadowkeeper', "Eden's Promise (Savage)", 'square', 'Deepshadow Nova', "Shadow's Edge", [['cone', 'Implosion'], ['spread', 'Umbra Smash']]],
    ['e11s', 'E11S', 'Fatebreaker', "Eden's Promise (Savage)", 'circle', 'Burnished Glory', 'Powder Mark', [['line', 'Burnt Strike'], ['stack', 'Elemental Break']]],
    ['e12s', 'E12S', "Eden's Promise / Oracle of Darkness", "Eden's Promise (Savage)", 'circle', 'Maleficium', 'Formless Judgment', [['towers', 'Junction'], ['spread', 'Basic Relativity'], ['stack', 'Shell Crusher']]],
  ],
  ew: [
    ['p1s', 'P1S', 'Erichthonios', 'Asphodelos (Savage)', 'square', 'Warder\'s Wrath', 'Heavy Hand', [['halves', "Gaoler's Flail"], ['spread', 'Shackles of Companionship']]],
    ['p2s', 'P2S', 'Hippokampos', 'Asphodelos (Savage)', 'square', 'Murky Depths', 'Doubled Impact', [['line', 'Channeling Flow'], ['stack', 'Ominous Bubbling']]],
    ['p3s', 'P3S', 'Phoinix', 'Asphodelos (Savage)', 'square', 'Scorched Exaltation', 'Heat of Condemnation', [['chariot', 'Experimental Fireplume'], ['partners', 'Darkened Fire']]],
    ['p4s', 'P4S', 'Hesperos', 'Asphodelos (Savage)', 'square', 'Decollation', 'Elegant Evisceration', [['cone', "Hell's Sting"], ['towers', 'Belone Coils']]],
    ['p5s', 'P5S', 'Proto-Carbuncle', 'Abyssos (Savage)', 'square', 'Sonic Howl', 'Venomous Mass', [['line', 'Ruby Glow'], ['spread', 'Venom Pool']]],
    ['p6s', 'P6S', 'Hegemone', 'Abyssos (Savage)', 'square', 'Aethtic Torment', 'Dual Predation', [['halves', 'Chorus Ixou'], ['spread', 'Pathogenic Cells']]],
    ['p7s', 'P7S', 'Agdistis', 'Abyssos (Savage)', 'circle', 'Spark of Life', 'Condensed Aero II', [['chariot', 'Bough of Attis'], ['partners', 'Inviolate Bonds']]],
    ['p8s', 'P8S', 'Hephaistos', 'Abyssos (Savage)', 'square', 'Ektothermos', 'Flameviper', [['halves', 'Sunforge'], ['towers', 'High Concept']]],
    ['p9s', 'P9S', 'Kokytos', 'Anabaseios (Savage)', 'circle', 'Gluttony\'s Augur', 'Ascendant Fist', [['donut', 'Dualspell'], ['towers', 'Levinstrike Summoning']]],
    ['p10s', 'P10S', 'Pandæmonium', 'Anabaseios (Savage)', 'square', 'Ultima', 'Soul Grasp', [['towers', 'Pandæmoniac Pillars'], ['spread', 'Silkspit']]],
    ['p11s', 'P11S', 'Themis', 'Anabaseios (Savage)', 'circle', 'Eunomia', 'Dike', [['halves', 'Dark and Light'], ['line', 'Jury Overruling'], ['donut', 'Upheld Overruling']]],
    ['p12s', 'P12S', 'Athena', 'Anabaseios (Savage)', 'square', 'On the Soul', 'Glaukopis', [['halves', 'Trinity of Souls'], ['towers', 'Superchain Theory']]],
  ],
  dt: [
    ['m1s', 'M1S', 'Black Cat', 'AAC Light-heavyweight (Savage)', 'square'],
    ['m2s', 'M2S', 'Honey B. Lovely', 'AAC Light-heavyweight (Savage)', 'circle'],
    ['m3s', 'M3S', 'Brute Bomber', 'AAC Light-heavyweight (Savage)', 'square'],
    ['m4s', 'M4S', 'Wicked Thunder', 'AAC Light-heavyweight (Savage)', 'square'],
    ['m5s', 'M5S', 'Dancing Green', 'AAC Cruiserweight (Savage)', 'square'],
    ['m6s', 'M6S', 'Sugar Riot', 'AAC Cruiserweight (Savage)', 'square'],
    ['m7s', 'M7S', 'Brute Abombinator', 'AAC Cruiserweight (Savage)', 'square'],
    ['m8s', 'M8S', 'Howling Blade', 'AAC Cruiserweight (Savage)', 'circle'],
    ['m9s', 'M9S', 'Vamp Fatale', 'AAC Heavyweight (Savage)', 'square'],
    ['m10s', 'M10S', 'Red Hot and Deep Blue', 'AAC Heavyweight (Savage)', 'square'],
    ['m11s', 'M11S', 'The Tyrant', 'AAC Heavyweight (Savage)', 'circle'],
    ['m12s', 'M12S', 'Lindwurm', 'AAC Heavyweight (Savage)', 'circle'],
  ],
}

const EXTREME: Record<Expansion, Row[]> = {
  shb: [
    ['titania-ex', '', 'Titania', 'The Dancing Plague (Extreme)', 'circle', 'Bright Sabbath', 'Pucks Rebuke', [['donut', 'Phantom Rune'], ['line', 'Mist Rune']]],
    ['innocence-ex', '', 'Innocence', 'The Crown of the Immaculate (Extreme)', 'circle', 'Righteous Bolt', 'Rightful Reprobation', [['line', 'Sword of Condemnation'], ['spread', 'Holy Trinity']]],
    ['hades-ex', '', 'Hades', "The Minstrel's Ballad: Hades's Elegy", 'circle', 'Shadow Spread', 'Double Dark', [['spread', 'Ancient Dark IV'], ['cone', 'Dark Current']]],
    ['ruby-ex', '', 'Ruby Weapon', 'Cinder Drift (Extreme)', 'square', 'Optimized Ultima', 'Ravensclaw', [['line', 'Ruby Ray'], ['spread', 'Meteor Stream']]],
    ['varis-ex', '', 'Varis yae Galvus', 'Memoria Misera (Extreme)', 'circle', 'Alea Iacta Est', 'Vivere Militare Est', [['line', 'Terminus Est'], ['cone', 'Altius']]],
    ['wol-ex', '', 'Warrior of Light', 'The Seat of Sacrifice (Extreme)', 'circle', 'Ultimate Crossover', 'Solemn Confiteor', [['donut', 'Coruscant Saber'], ['stack', 'Absolute Holy']]],
    ['emerald-ex', '', 'Emerald Weapon', 'Castrum Marinum (Extreme)', 'square', 'Emerald Shot', 'Optimized Ultima', [['line', 'Emerald Beam'], ['partners', 'Magitek Magnetism']]],
    ['diamond-ex', '', 'Diamond Weapon', 'The Cloud Deck (Extreme)', 'circle', 'Diamond Flash', 'Claw Swipe', [['spread', 'Diamond Rain'], ['cone', 'Articulated Bits']]],
  ],
  ew: [
    ['zodiark-ex', '', 'Zodiark', "The Minstrel's Ballad: Zodiark's Fall", 'square', 'Kokytos', 'Ania', [['halves', 'Algedon'], ['line', 'Paradeigma']]],
    ['hydaelyn-ex', '', 'Hydaelyn', "The Minstrel's Ballad: Hydaelyn's Call", 'circle', 'Highest Holy', "Heros's Sundering", [['spread', 'Crystallize'], ['donut', 'Parhelic Circle']]],
    ['endsinger-ex', '', 'The Endsinger', "The Minstrel's Ballad: Endsinger's Aria", 'circle', 'Elegeia', 'Hubris', [['donut', 'Elegeia Unforgotten'], ['stack', 'Despair Unforgotten']]],
    ['barbariccia-ex', '', 'Barbariccia', "Storm's Crown (Extreme)", 'circle', 'Void Aero IV', 'Curling Iron', [['donut', 'Savage Barbery'], ['spread', 'Hair Spray']]],
    ['rubicante-ex', '', 'Rubicante', 'Mount Ordeals (Extreme)', 'circle', 'Inferno', 'Shattering Heat', [['line', 'Arcane Revelation'], ['spread', 'Flamespire Brand']]],
    ['golbez-ex', '', 'Golbez', 'The Voidcast Dais (Extreme)', 'circle', 'Void Meteor', 'Terrastorm', [['halves', 'Phases of the Blade'], ['partners', 'Abyssal Quasar']]],
    ['zeromus-ex', '', 'Zeromus', 'The Abyssal Fracture (Extreme)', 'circle', 'Abyssal Echoes', 'Visceral Whirl', [['line', 'Sable Thread'], ['spread', 'Big Bang']]],
  ],
  dt: [
    ['valigarmanda-ex', '', 'Valigarmanda', 'Worqor Lar Dor (Extreme)', 'square', 'Skyruin', 'Hail of Feathers', [['donut', 'Strangling Coil'], ['cone', 'Susurrant Breath']]],
    ['zoraal-ja-ex', '', 'Zoraal Ja', 'Everkeep (Extreme)', 'square', 'Actualize', 'Regicidal Rage', [['halves', 'Double-edged Swords'], ['line', 'Chasm of Vollok']]],
    ['queen-eternal-ex', '', 'Queen Eternal', "The Minstrel's Ballad: Sphene's Burden", 'square', 'Legitimate Force', 'Royal Domain', [['halves', 'Legitimate Force'], ['spread', 'Absolute Authority']]],
    ['zelenia-ex', '', 'Zelenia', 'Recollection (Extreme)', 'circle', 'Thorned Catharsis', 'Alexandrian Thunder', [['towers', 'Roseblood Bloom'], ['chariot', 'Shock']]],
    ['necron-ex', '', 'Necron', "The Minstrel's Ballad: Necron's Embrace", 'square', 'Blue Shockwave', 'Grand Cross', [['spread', 'Fear of Death'], ['line', 'Cold Grip']]],
    ['doomtrain-ex', '', 'Doomtrain', 'Hell on Rails (Extreme)', 'square', 'Thundering', 'Headlight', [['line', "Dead Man's Express"], ['halves', 'Plasma Shot']]],
    ['enuo-ex', '', 'Enuo', 'The Unmaking (Extreme)', 'circle', 'Unmaking', 'Void Lance', []],
  ],
}

function build(exp: Expansion, kind: FightKind, rows: Row[]): Fight[] {
  return rows.map(([id, code, boss, duty, arena, raidwide = 'Raidwide', buster = 'a tankbuster', named = []]) => ({
    id,
    code: code || undefined,
    boss,
    duty,
    exp,
    kind,
    arena,
    steps: DT_SAVAGE[id] ? DT_SAVAGE[id].map(step) : templated(id, raidwide, buster, named),
  }))
}

/** Newest expansion first; within one, Savage then Extreme, each in release order. */
export const FIGHTS: Fight[] = (['dt', 'ew', 'shb'] as Expansion[]).flatMap((exp) => [
  ...build(exp, 'savage', SAVAGE[exp]),
  ...build(exp, 'extreme', EXTREME[exp]),
])

export const DEFAULT_FIGHT_ID = 'm9s'

export function findFight(id: string): Fight | undefined {
  return FIGHTS.find((f) => f.id === id)
}

/** "M9S · Vamp Fatale" for savage floors, the boss for trials. */
export function fightLabel(f: Fight): string {
  return f.code ? `${f.code} · ${f.boss}` : f.boss
}

export function expansionName(exp: Expansion): string {
  return EXPANSIONS.find((e) => e.id === exp)?.name ?? exp
}

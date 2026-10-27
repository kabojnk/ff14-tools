/**
 * Aetherdesk's content: plausible FFXIV data for the disguise. Names of materials, jobs and duties are the game's;
 * stats, sources and most collectable names are mock. Nothing here is read from the server.
 */

export const CRAFTERS = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL'] as const
export type Crafter = (typeof CRAFTERS)[number]

export const CRAFTER_NAME: Record<Crafter, string> = {
  CRP: 'Carpenter',
  BSM: 'Blacksmith',
  ARM: 'Armorer',
  GSM: 'Goldsmith',
  LTW: 'Leatherworker',
  WVR: 'Weaver',
  ALC: 'Alchemist',
  CUL: 'Culinarian',
}

export interface Recipe {
  id: string
  name: string
  job: Crafter
  level: number
  stars: number
  durability: number
  craftsmanship: number
  control: number
  cp: number
  materials: [name: string, quantity: number][]
}

const r = (id: string, name: string, job: Crafter, stars: number, materials: Recipe['materials'], level = 100): Recipe => {
  const hard = stars > 0
  return {
    id,
    name,
    job,
    level,
    stars,
    durability: hard ? 70 : 35,
    craftsmanship: hard ? 4900 : 4200 + (level - 90) * 8,
    control: hard ? 4800 : 3900 + (level - 90) * 6,
    cp: hard ? 600 : 520,
    materials,
  }
}

export const RECIPES: Recipe[] = [
  r('crp-rod', 'Claro Walnut Fishing Rod', 'CRP', 2, [['Claro Walnut Lumber', 3], ["Ra'Kaznar Ingot", 1], ['Thunderyards Silk', 1], ['Wind Cluster', 2]]),
  r('crp-lumber', 'Claro Walnut Lumber', 'CRP', 0, [['Claro Walnut Log', 4], ['Wind Crystal', 4]]),
  r('crp-cane', 'Dark Mahogany Cane', 'CRP', 0, [['Dark Mahogany Lumber', 2], ['Gargantua Leather', 1], ['Wind Crystal', 6]], 96),
  r('bsm-scythe', "Ra'Kaznar War Scythe", 'BSM', 2, [["Ra'Kaznar Ingot", 3], ['Claro Walnut Lumber', 1], ['Gargantua Leather', 1], ['Fire Cluster', 2]]),
  r('bsm-knife', "Ra'Kaznar Culinary Knife", 'BSM', 0, [["Ra'Kaznar Ingot", 2], ['Claro Walnut Lumber', 1], ['Fire Crystal', 6]]),
  r('arm-ingot', "Ra'Kaznar Ingot", 'ARM', 0, [["Ra'Kaznar Ore", 4], ['Electrum Sand', 1], ['Fire Crystal', 4]]),
  r('arm-mail', "Ra'Kaznar Chain Mail of Fending", 'ARM', 2, [["Ra'Kaznar Ingot", 4], ['Gargantua Leather', 2], ['Ice Cluster', 2]]),
  r('gsm-ring', "Ra'Kaznar Ring of Healing", 'GSM', 2, [["Ra'Kaznar Ingot", 1], ['Black Star', 2], ['Wind Cluster', 2]]),
  r('gsm-star', 'Black Star', 'GSM', 0, [['Raw Black Star', 3], ['Wind Crystal', 4]]),
  r('ltw-leather', 'Gargantua Leather', 'LTW', 0, [['Gargantua Hide', 3], ['Wind Crystal', 4]]),
  r('ltw-boots', 'Gargantua Boots of Striking', 'LTW', 2, [['Gargantua Leather', 3], ["Ra'Kaznar Ingot", 1], ['Earth Cluster', 2]]),
  r('wvr-silk', 'Thunderyards Silk', 'WVR', 0, [['Thunderyards Silkworm Cocoon', 3], ['Lightning Crystal', 4]]),
  r('wvr-hat', 'Thunderyards Silk Hat of Casting', 'WVR', 2, [['Thunderyards Silk', 3], ['Black Star', 1], ['Lightning Cluster', 2]]),
  r('alc-gem', 'Grade 2 Gemdraught of Strength', 'ALC', 0, [['Ash Mandrake', 2], ['Dark Rice', 1], ['Water Crystal', 6]]),
  r('alc-tincture', 'Gemsap of Mind', 'ALC', 0, [['Turali Pineapple', 1], ['Water Crystal', 4]], 92),
  r('cul-popcorn', 'Caramel Popcorn', 'CUL', 0, [['Popoto', 2], ['Turali Corn', 3], ['Fire Crystal', 6]]),
  r('cul-ceviche', 'Ceviche', 'CUL', 0, [['Alexandrian Bluegill', 1], ['Turali Pineapple', 1], ['Water Crystal', 6]]),
  r('cul-tacos', 'Tacos de Carne Asada', 'CUL', 0, [['Gargantua Steak', 1], ['Turali Corn', 2], ['Fire Crystal', 6]], 98),
]

export type CollectionKind = 'mounts' | 'minions' | 'cards' | 'achievements'

export interface Collectable {
  id: string
  name: string
  source: string
  /** A stand-in for the item's art. */
  icon: string
  /** Owned at first (example progress), until the person changes it. */
  owned?: boolean
}

export interface TripleTriadCard extends Collectable {
  number: number
  stars: 1 | 2 | 3 | 4 | 5
  /** Top, right, bottom, left; 10 shows as A. */
  sides: [number, number, number, number]
}

export interface Achievement extends Collectable {
  points: number
  /** Example progress (0–100) while not earned. */
  progress: number
}

export const MOUNTS: Collectable[] = [
  { id: 'm-alpaca', name: 'Alpaca', source: 'Shaaloani hunts', icon: '🦙', owned: true },
  { id: 'm-turali-chocobo', name: 'Turali Chocobo', source: 'Main scenario', icon: '🐤', owned: true },
  { id: 'm-ataxic-bear', name: 'Ataxic Bear', source: 'Crafting', icon: '🐻', owned: true },
  { id: 'm-valigarmanda', name: 'Valigarmanda Wings', source: 'Worqor Lar Dor (Extreme)', icon: '🦅', owned: true },
  { id: 'm-zoraal', name: 'Zoraal Ja Wings', source: 'Everkeep (Extreme)', icon: '⚔️', owned: true },
  { id: 'm-sphene', name: 'Queen Eternal Wings', source: "Sphene's Burden (Extreme)", icon: '👑' },
  { id: 'm-necron', name: 'Necron Wings', source: "Necron's Embrace (Extreme)", icon: '💀' },
  { id: 'm-doomtrain', name: 'Doomtrain Engine', source: 'Hell on Rails (Extreme)', icon: '🚂' },
  { id: 'm-nihility', name: 'Wings of Nihility', source: 'The Unmaking (Extreme)', icon: '🌑' },
  { id: 'm-bat', name: 'Vamp Fatale Bat Wings', source: 'M9S', icon: '🦇', owned: true },
  { id: 'm-tide', name: 'Deep Blue Rider', source: 'M10S', icon: '🌊' },
  { id: 'm-tyrant', name: "Tyrant's Gauntlet", source: 'M11S', icon: '🦖' },
  { id: 'm-wurm', name: 'Lindwurm Wings', source: 'M12S', icon: '🐉' },
  { id: 'm-emperador', name: 'Sabotender Emperador', source: 'Gold Saucer', icon: '🌵', owned: true },
  { id: 'm-fat-chocobo', name: 'Fat Chocobo', source: 'Collector’s Edition', icon: '🐥', owned: true },
  { id: 'm-magitek', name: 'Magitek Armor', source: 'Main scenario', icon: '🤖', owned: true },
]

export const MINIONS: Collectable[] = [
  { id: 'n-wee-vamp', name: 'Wee Vamp', source: 'M9S coffer', icon: '🦇', owned: true },
  { id: 'n-fry', name: 'Deep Blue Fry', source: 'M10S coffer', icon: '🐟', owned: true },
  { id: 'n-tyrant', name: 'Tiny Tyrant', source: 'M11S coffer', icon: '🦖' },
  { id: 'n-wyrmling', name: 'Lindwyrmling', source: 'M12S coffer', icon: '🐲' },
  { id: 'n-mamool', name: 'Mini Mamool Ja', source: "Yak T'el", icon: '🦎', owned: true },
  { id: 'n-kernel', name: 'Turali Kernel', source: 'Culinarian', icon: '🌽', owned: true },
  { id: 'n-wind-up-sphene', name: 'Wind-up Sphene', source: 'Achievement', icon: '👸' },
  { id: 'n-tonberry', name: 'Tiny Tonberry', source: 'Sastasha (Hard)', icon: '🔪', owned: true },
  { id: 'n-moogle', name: 'Wind-up Moogle', source: 'Moogle Treasure Trove', icon: '🧸', owned: true },
  { id: 'n-cactuar', name: 'Cactuar Cutting', source: 'Gold Saucer', icon: '🌵' },
  { id: 'n-namazu', name: 'Wind-up Namazu', source: 'Namazu beast tribe', icon: '🐟', owned: true },
  { id: 'n-loporrit', name: 'Lop Hare', source: 'Loporrit beast tribe', icon: '🐇' },
]

const card = (number: number, name: string, stars: TripleTriadCard['stars'], sides: TripleTriadCard['sides'], source: string, icon: string, owned?: boolean): TripleTriadCard => ({
  id: `c-${number}`,
  number,
  name,
  stars,
  sides,
  source,
  icon,
  owned,
})

export const CARDS: TripleTriadCard[] = [
  card(1, 'Dodo', 1, [4, 2, 3, 4], 'Triple Triad Trader', '🐦', true),
  card(2, 'Tonberry', 1, [2, 2, 7, 3], 'Sastasha (Hard)', '🔪', true),
  card(3, 'Sabotender', 1, [3, 4, 2, 4], 'Triple Triad Trader', '🌵', true),
  card(4, 'Spriggan', 1, [2, 3, 4, 4], 'Card pack', '🍄', true),
  card(5, 'Pudding', 1, [2, 4, 3, 2], 'Card pack', '🍮', true),
  card(6, 'Bomb', 1, [4, 3, 2, 3], 'Card pack', '💣', true),
  card(12, 'Coeurl', 2, [2, 6, 2, 5], 'NPC: Mother Miounne', '🐆', true),
  card(18, 'Morbol', 2, [6, 2, 2, 6], 'NPC: Wymond', '🌿'),
  card(26, 'Ahriman', 2, [3, 6, 5, 2], 'Card pack', '👁️', true),
  card(41, 'Amalj’aa', 3, [7, 6, 3, 5], 'NPC: Swift', '🦎'),
  card(57, 'Ultima Weapon', 4, [8, 7, 3, 8], 'The Porta Decumana', '🛡️'),
  card(72, 'Shiva', 4, [8, 3, 8, 5], 'Akh Afah Amphitheatre', '❄️', true),
  card(88, 'Bahamut', 5, [9, 3, 9, 6], 'The Final Coil of Bahamut', '🐉'),
  card(104, 'Hydaelyn', 5, [10, 4, 9, 5], 'Hydaelyn’s Call (Extreme)', '💎'),
  card(331, 'Valigarmanda', 4, [8, 4, 9, 4], 'Worqor Lar Dor (Extreme)', '🦅', true),
  card(345, 'Queen Eternal', 5, [9, 5, 10, 3], "Sphene's Burden (Extreme)", '👑'),
  card(358, 'Vamp Fatale', 4, [7, 8, 4, 8], 'M9S', '🦇'),
  card(361, 'Lindwurm', 5, [10, 6, 3, 9], 'M12S', '🐲'),
]

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'a-bat', name: 'Bat Out of Hell', source: 'Clear M9S', icon: '🦇', points: 20, progress: 100, owned: true },
  { id: 'a-hot', name: 'Hot and Bothered', source: 'Clear M10S', icon: '🔥', points: 20, progress: 100, owned: true },
  { id: 'a-tyrant', name: 'Tyranny Toppled', source: 'Clear M11S', icon: '🦖', points: 20, progress: 0 },
  { id: 'a-heavy', name: 'Heavyweight Champion', source: 'Clear M12S', icon: '🏆', points: 30, progress: 0 },
  { id: 'a-crafter', name: 'Master Crafter: Dawntrail', source: '120 / 150 recipes', icon: '🛠️', points: 10, progress: 80 },
  { id: 'a-hunter', name: 'Hunter of Tural', source: '41 / 60 elite marks', icon: '🏹', points: 10, progress: 68 },
  { id: 'a-cards', name: 'Card Collector', source: '262 / 400 cards', icon: '🃏', points: 10, progress: 65 },
  { id: 'a-chronicle', name: 'Chronicler of Tural', source: '9 / 12 quests', icon: '📜', points: 5, progress: 75 },
  { id: 'a-unmaking', name: 'Unmade', source: 'Clear The Unmaking (Extreme)', icon: '🌑', points: 20, progress: 0 },
]

export const COLLECTIONS: Record<CollectionKind, { label: string; items: Collectable[] }> = {
  mounts: { label: 'Mounts', items: MOUNTS },
  minions: { label: 'Minions', items: MINIONS },
  cards: { label: 'Triple Triad', items: CARDS },
  achievements: { label: 'Achievements', items: ACHIEVEMENTS },
}

export const COLLECTION_KINDS: CollectionKind[] = ['mounts', 'minions', 'cards', 'achievements']

/** The example "owned" set before the person has changed anything. */
export function defaultOwned(): string[] {
  return COLLECTION_KINDS.flatMap((k) => COLLECTIONS[k].items.filter((i) => i.owned).map((i) => i.id))
}

/** A Triple Triad side's value as the card prints it (10 is A). */
export const sideLabel = (n: number) => (n >= 10 ? 'A' : String(n))

const DAY = 86_400_000

/** Time until the next occurrence of `hourUtc` (and `weekdayUtc`, 0 = Sunday, if given). */
export function untilReset(now: Date, hourUtc: number, weekdayUtc?: number): number {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc))
  if (weekdayUtc !== undefined) {
    next.setUTCDate(next.getUTCDate() + ((weekdayUtc - next.getUTCDay() + 7) % 7))
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 7)
  } else if (next.getTime() <= now.getTime()) {
    next.setTime(next.getTime() + DAY)
  }
  return next.getTime() - now.getTime()
}

/** "2d 4h", "5h 12m", "9m". */
export function formatSpan(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m % 60}m`
  return `${m}m`
}

/** The game's resets, in UTC: daily duties 15:00, the weekly Tuesday 08:00, Grand Company supply 20:00. */
export function resets(now: Date) {
  return {
    daily: untilReset(now, 15),
    weekly: untilReset(now, 8, 2),
    grandCompany: untilReset(now, 20),
  }
}

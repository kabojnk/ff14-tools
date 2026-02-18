export interface FF14Duty {
  name: string
  type: 'Raid' | 'Alliance Raid' | 'Trial' | 'Extreme Trial' | 'Savage Raid' | 'Ultimate'
  expansion: string
  difficulty: 'Normal' | 'Hard' | 'Extreme' | 'Savage' | 'Ultimate'
}

export const FF14_DUTIES: FF14Duty[] = [
  // A Realm Reborn
  { name: 'The Binding Coil of Bahamut - Turn 1', type: 'Raid', expansion: 'A Realm Reborn', difficulty: 'Normal' },
  { name: 'The Binding Coil of Bahamut - Turn 2', type: 'Raid', expansion: 'A Realm Reborn', difficulty: 'Normal' },
  { name: 'The Binding Coil of Bahamut - Turn 4', type: 'Raid', expansion: 'A Realm Reborn', difficulty: 'Normal' },
  { name: 'The Binding Coil of Bahamut - Turn 5', type: 'Raid', expansion: 'A Realm Reborn', difficulty: 'Normal' },
  { name: 'The Second Coil of Bahamut - Turn 1', type: 'Raid', expansion: 'A Realm Reborn', difficulty: 'Normal' },
  { name: 'The Second Coil of Bahamut - Turn 2', type: 'Raid', expansion: 'A Realm Reborn', difficulty: 'Normal' },
  { name: 'The Second Coil of Bahamut - Turn 3', type: 'Raid', expansion: 'A Realm Reborn', difficulty: 'Normal' },
  { name: 'The Second Coil of Bahamut - Turn 4', type: 'Raid', expansion: 'A Realm Reborn', difficulty: 'Normal' },
  { name: 'The Final Coil of Bahamut - Turn 1', type: 'Raid', expansion: 'A Realm Reborn', difficulty: 'Normal' },
  { name: 'The Final Coil of Bahamut - Turn 2', type: 'Raid', expansion: 'A Realm Reborn', difficulty: 'Normal' },
  { name: 'The Final Coil of Bahamut - Turn 3', type: 'Raid', expansion: 'A Realm Reborn', difficulty: 'Normal' },
  { name: 'The Final Coil of Bahamut - Turn 4', type: 'Raid', expansion: 'A Realm Reborn', difficulty: 'Normal' },
  { name: 'The Crystal Tower: Labyrinth of the Ancients', type: 'Alliance Raid', expansion: 'A Realm Reborn', difficulty: 'Normal' },
  { name: 'The Crystal Tower: Syrcus Tower', type: 'Alliance Raid', expansion: 'A Realm Reborn', difficulty: 'Normal' },
  { name: 'The Crystal Tower: The World of Darkness', type: 'Alliance Raid', expansion: 'A Realm Reborn', difficulty: 'Normal' },
  { name: 'The Bowl of Embers (Extreme)', type: 'Extreme Trial', expansion: 'A Realm Reborn', difficulty: 'Extreme' },
  { name: 'The Howling Eye (Extreme)', type: 'Extreme Trial', expansion: 'A Realm Reborn', difficulty: 'Extreme' },
  { name: 'The Navel (Extreme)', type: 'Extreme Trial', expansion: 'A Realm Reborn', difficulty: 'Extreme' },
  { name: 'The Whorleater (Extreme)', type: 'Extreme Trial', expansion: 'A Realm Reborn', difficulty: 'Extreme' },
  { name: 'The Striking Tree (Extreme)', type: 'Extreme Trial', expansion: 'A Realm Reborn', difficulty: 'Extreme' },
  { name: 'Thornmarch (Extreme)', type: 'Extreme Trial', expansion: 'A Realm Reborn', difficulty: 'Extreme' },
  { name: "Akh Afah Amphitheatre (Extreme)", type: 'Extreme Trial', expansion: 'A Realm Reborn', difficulty: 'Extreme' },
  { name: 'The Minstrel\'s Ballad: Ultima\'s Bane', type: 'Extreme Trial', expansion: 'A Realm Reborn', difficulty: 'Extreme' },

  // Heavensward
  { name: 'Alexander: Gordias (Savage)', type: 'Savage Raid', expansion: 'Heavensward', difficulty: 'Savage' },
  { name: 'Alexander: Midas (Savage)', type: 'Savage Raid', expansion: 'Heavensward', difficulty: 'Savage' },
  { name: 'Alexander: The Creator (Savage)', type: 'Savage Raid', expansion: 'Heavensward', difficulty: 'Savage' },
  { name: 'Alexander: Gordias', type: 'Raid', expansion: 'Heavensward', difficulty: 'Normal' },
  { name: 'Alexander: Midas', type: 'Raid', expansion: 'Heavensward', difficulty: 'Normal' },
  { name: 'Alexander: The Creator', type: 'Raid', expansion: 'Heavensward', difficulty: 'Normal' },
  { name: 'The Void Ark', type: 'Alliance Raid', expansion: 'Heavensward', difficulty: 'Normal' },
  { name: 'The Weeping City of Mhach', type: 'Alliance Raid', expansion: 'Heavensward', difficulty: 'Normal' },
  { name: 'Dun Scaith', type: 'Alliance Raid', expansion: 'Heavensward', difficulty: 'Normal' },
  { name: 'The Limitless Blue (Extreme)', type: 'Extreme Trial', expansion: 'Heavensward', difficulty: 'Extreme' },
  { name: 'Thok ast Thok (Extreme)', type: 'Extreme Trial', expansion: 'Heavensward', difficulty: 'Extreme' },
  { name: 'The Singularity Reactor (Extreme)', type: 'Extreme Trial', expansion: 'Heavensward', difficulty: 'Extreme' },
  { name: 'Containment Bay S1T7 (Extreme)', type: 'Extreme Trial', expansion: 'Heavensward', difficulty: 'Extreme' },
  { name: 'Containment Bay P1T6 (Extreme)', type: 'Extreme Trial', expansion: 'Heavensward', difficulty: 'Extreme' },
  { name: 'Containment Bay Z1T9 (Extreme)', type: 'Extreme Trial', expansion: 'Heavensward', difficulty: 'Extreme' },

  // Stormblood
  { name: 'Omega: Deltascape', type: 'Raid', expansion: 'Stormblood', difficulty: 'Normal' },
  { name: 'Omega: Sigmascape', type: 'Raid', expansion: 'Stormblood', difficulty: 'Normal' },
  { name: 'Omega: Alphascape', type: 'Raid', expansion: 'Stormblood', difficulty: 'Normal' },
  { name: 'Omega: Deltascape (Savage)', type: 'Savage Raid', expansion: 'Stormblood', difficulty: 'Savage' },
  { name: 'Omega: Sigmascape (Savage)', type: 'Savage Raid', expansion: 'Stormblood', difficulty: 'Savage' },
  { name: 'Omega: Alphascape (Savage)', type: 'Savage Raid', expansion: 'Stormblood', difficulty: 'Savage' },
  { name: 'The Royal City of Rabanastre', type: 'Alliance Raid', expansion: 'Stormblood', difficulty: 'Normal' },
  { name: 'The Ridorana Lighthouse', type: 'Alliance Raid', expansion: 'Stormblood', difficulty: 'Normal' },
  { name: 'The Orbonne Monastery', type: 'Alliance Raid', expansion: 'Stormblood', difficulty: 'Normal' },
  { name: 'The Pool of Tribute (Extreme)', type: 'Extreme Trial', expansion: 'Stormblood', difficulty: 'Extreme' },
  { name: 'Emanation (Extreme)', type: 'Extreme Trial', expansion: 'Stormblood', difficulty: 'Extreme' },
  { name: 'The Minstrel\'s Ballad: Shinryu\'s Domain', type: 'Extreme Trial', expansion: 'Stormblood', difficulty: 'Extreme' },
  { name: 'The Jade Stoa (Extreme)', type: 'Extreme Trial', expansion: 'Stormblood', difficulty: 'Extreme' },
  { name: 'The Great Hunt (Extreme)', type: 'Extreme Trial', expansion: 'Stormblood', difficulty: 'Extreme' },
  { name: 'The Minstrel\'s Ballad: Tsukuyomi\'s Pain', type: 'Extreme Trial', expansion: 'Stormblood', difficulty: 'Extreme' },
  { name: 'The Wreath of Snakes (Extreme)', type: 'Extreme Trial', expansion: 'Stormblood', difficulty: 'Extreme' },

  // Shadowbringers
  { name: "Eden's Gate", type: 'Raid', expansion: 'Shadowbringers', difficulty: 'Normal' },
  { name: "Eden's Verse", type: 'Raid', expansion: 'Shadowbringers', difficulty: 'Normal' },
  { name: "Eden's Promise", type: 'Raid', expansion: 'Shadowbringers', difficulty: 'Normal' },
  { name: "Eden's Gate (Savage)", type: 'Savage Raid', expansion: 'Shadowbringers', difficulty: 'Savage' },
  { name: "Eden's Verse (Savage)", type: 'Savage Raid', expansion: 'Shadowbringers', difficulty: 'Savage' },
  { name: "Eden's Promise (Savage)", type: 'Savage Raid', expansion: 'Shadowbringers', difficulty: 'Savage' },
  { name: 'The Copied Factory', type: 'Alliance Raid', expansion: 'Shadowbringers', difficulty: 'Normal' },
  { name: 'The Puppets\' Bunker', type: 'Alliance Raid', expansion: 'Shadowbringers', difficulty: 'Normal' },
  { name: 'The Tower at Paradigm\'s Breach', type: 'Alliance Raid', expansion: 'Shadowbringers', difficulty: 'Normal' },
  { name: 'The Crown of the Immaculate (Extreme)', type: 'Extreme Trial', expansion: 'Shadowbringers', difficulty: 'Extreme' },
  { name: 'The Minstrel\'s Ballad: Hades\'s Elegy', type: 'Extreme Trial', expansion: 'Shadowbringers', difficulty: 'Extreme' },
  { name: 'Cinder Drift (Extreme)', type: 'Extreme Trial', expansion: 'Shadowbringers', difficulty: 'Extreme' },
  { name: 'The Seat of Sacrifice (Extreme)', type: 'Extreme Trial', expansion: 'Shadowbringers', difficulty: 'Extreme' },
  { name: 'Castrum Marinum (Extreme)', type: 'Extreme Trial', expansion: 'Shadowbringers', difficulty: 'Extreme' },
  { name: 'The Cloud Deck (Extreme)', type: 'Extreme Trial', expansion: 'Shadowbringers', difficulty: 'Extreme' },

  // Endwalker
  { name: 'Pandaemonium: Asphodelos', type: 'Raid', expansion: 'Endwalker', difficulty: 'Normal' },
  { name: 'Pandaemonium: Abyssos', type: 'Raid', expansion: 'Endwalker', difficulty: 'Normal' },
  { name: 'Pandaemonium: Anabaseios', type: 'Raid', expansion: 'Endwalker', difficulty: 'Normal' },
  { name: 'Pandaemonium: Asphodelos (Savage)', type: 'Savage Raid', expansion: 'Endwalker', difficulty: 'Savage' },
  { name: 'Pandaemonium: Abyssos (Savage)', type: 'Savage Raid', expansion: 'Endwalker', difficulty: 'Savage' },
  { name: 'Pandaemonium: Anabaseios (Savage)', type: 'Savage Raid', expansion: 'Endwalker', difficulty: 'Savage' },
  { name: 'Aglaia', type: 'Alliance Raid', expansion: 'Endwalker', difficulty: 'Normal' },
  { name: 'Euphrosyne', type: 'Alliance Raid', expansion: 'Endwalker', difficulty: 'Normal' },
  { name: 'Thaleia', type: 'Alliance Raid', expansion: 'Endwalker', difficulty: 'Normal' },
  { name: 'The Minstrel\'s Ballad: Zodiark\'s Fall', type: 'Extreme Trial', expansion: 'Endwalker', difficulty: 'Extreme' },
  { name: 'The Minstrel\'s Ballad: Hydaelyn\'s Call', type: 'Extreme Trial', expansion: 'Endwalker', difficulty: 'Extreme' },
  { name: 'The Minstrel\'s Ballad: Endsinger\'s Aria', type: 'Extreme Trial', expansion: 'Endwalker', difficulty: 'Extreme' },
  { name: 'Storm\'s Crown (Extreme)', type: 'Extreme Trial', expansion: 'Endwalker', difficulty: 'Extreme' },
  { name: 'Mount Ordeals (Extreme)', type: 'Extreme Trial', expansion: 'Endwalker', difficulty: 'Extreme' },
  { name: 'The Voidcast Dais (Extreme)', type: 'Extreme Trial', expansion: 'Endwalker', difficulty: 'Extreme' },
  { name: 'The Abyssal Fracture (Extreme)', type: 'Extreme Trial', expansion: 'Endwalker', difficulty: 'Extreme' },

  // Dawntrail
  { name: 'AAC Light-heavyweight M1', type: 'Raid', expansion: 'Dawntrail', difficulty: 'Normal' },
  { name: 'AAC Light-heavyweight M2', type: 'Raid', expansion: 'Dawntrail', difficulty: 'Normal' },
  { name: 'AAC Light-heavyweight M3', type: 'Raid', expansion: 'Dawntrail', difficulty: 'Normal' },
  { name: 'AAC Light-heavyweight M4', type: 'Raid', expansion: 'Dawntrail', difficulty: 'Normal' },
  { name: 'AAC Light-heavyweight M1 (Savage)', type: 'Savage Raid', expansion: 'Dawntrail', difficulty: 'Savage' },
  { name: 'AAC Light-heavyweight M2 (Savage)', type: 'Savage Raid', expansion: 'Dawntrail', difficulty: 'Savage' },
  { name: 'AAC Light-heavyweight M3 (Savage)', type: 'Savage Raid', expansion: 'Dawntrail', difficulty: 'Savage' },
  { name: 'AAC Light-heavyweight M4 (Savage)', type: 'Savage Raid', expansion: 'Dawntrail', difficulty: 'Savage' },
  { name: 'Jeuno: The First Walk', type: 'Alliance Raid', expansion: 'Dawntrail', difficulty: 'Normal' },
  { name: 'Worqor Lar Dor (Extreme)', type: 'Extreme Trial', expansion: 'Dawntrail', difficulty: 'Extreme' },
  { name: 'Everkeep (Extreme)', type: 'Extreme Trial', expansion: 'Dawntrail', difficulty: 'Extreme' },
  { name: 'The Interphos (Extreme)', type: 'Extreme Trial', expansion: 'Dawntrail', difficulty: 'Extreme' },

  // Ultimates
  { name: 'The Unending Coil of Bahamut (Ultimate)', type: 'Ultimate', expansion: 'Stormblood', difficulty: 'Ultimate' },
  { name: 'The Weapon\'s Refrain (Ultimate)', type: 'Ultimate', expansion: 'Stormblood', difficulty: 'Ultimate' },
  { name: 'The Epic of Alexander (Ultimate)', type: 'Ultimate', expansion: 'Shadowbringers', difficulty: 'Ultimate' },
  { name: 'Dragonsong\'s Reprise (Ultimate)', type: 'Ultimate', expansion: 'Endwalker', difficulty: 'Ultimate' },
  { name: 'The Omega Protocol (Ultimate)', type: 'Ultimate', expansion: 'Endwalker', difficulty: 'Ultimate' },
  { name: 'Futures Rewritten (Ultimate)', type: 'Ultimate', expansion: 'Dawntrail', difficulty: 'Ultimate' },
]

export function getRandomDuties(count: number): FF14Duty[] {
  const shuffled = [...FF14_DUTIES].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

export function getDifficultyColor(difficulty: FF14Duty['difficulty']): string {
  switch (difficulty) {
    case 'Normal': return '#4ade80'
    case 'Hard': return '#facc15'
    case 'Extreme': return '#f97316'
    case 'Savage': return '#ef4444'
    case 'Ultimate': return '#a855f7'
  }
}

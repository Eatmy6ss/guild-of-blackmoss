// Controlled fixtures, not natural loot or player-progression samples.
import assert from 'node:assert/strict'
import { BLACKMOSS, RUSTMINE, ASHFIELD, FROSTGRAVE, ABYSSALTAR, THORNHOLD } from '../src/data/dungeons'
import { EMBERPASS, SCALEHAVEN, FIRERIDGE, PILGRIMPATH, FORGEWORKS, DRAGONMAW } from '../src/data/dungeons-r2'
import { generateMember, maxHpOf } from '../src/sim/gen'
import { rollDrop } from '../src/sim/loot'
import { createRng } from '../src/sim/rng'
import { stepBattle } from '../src/sim/combat'
import { createRun, advanceRun, markPermadeath, settleGrowth, startStep } from '../src/sim/run'
import type { Member, DungeonDef } from '../src/sim/types'

const maps = [BLACKMOSS, RUSTMINE, ASHFIELD, FROSTGRAVE, ABYSSALTAR, THORNHOLD,
  EMBERPASS, SCALEHAVEN, FIRERIDGE, PILGRIMPATH, FORGEWORKS, DRAGONMAW]
const jobs = ['guard', 'priest', 'ranger', 'guard', 'ranger'] as const
const samples = 50
const seedOffset = Number(process.env.PROGRESSION_SEED_OFFSET ?? 0)
const loadouts = {
  'T1-white': ['wpn-t1-sword', 'arm-t1-mail', 'trk-t1-band'],
  'T2-white': ['wpn-t2-bow', 'arm-t2-plate', 'trk-t2-totem'],
  'T2-green': ['wpn-t2-bow', 'arm-t2-plate', 'trk-t2-totem'],
  'T3-green': ['wpn-t3-gale', 'arm-t3-bulwark', 'trk-t3-seer'],
} as const
const slots = ['weapon', 'armor', 'trinket'] as const
const rows: { level: number; protect: boolean; gear: keyof typeof loadouts; dungeon: string; wins: number }[] = []

function equip(base: Member[], loadout: keyof typeof loadouts, seed: number) {
  const members = structuredClone(base)
  members.forEach((m, i) => {
    slots.forEach((slot, j) => {
      const rng = createRng(seed * 100 + i * 3 + j)
      let first = true
      m.equipment[slot] = rollDrop(loadouts[loadout][j], () => {
        // Force only fixture quality; affixes and all battle RNG remain seeded.
        if (first) { first = false; return loadout.endsWith('green') ? 0.3 : 0.9 }
        return rng()
      })
    })
    m.hp = maxHpOf(m)
  })
  return members
}

function measure(base: Member[], dungeon: DungeonDef, seed: number, protect: boolean) {
  const branch = [...dungeon.branches].sort((a, b) => a.risk - b.risk)[0]
  const run = createRun(base, dungeon, branch.id, seed, 0, protect, { heal: 3, fury: 3 }, true)
  let ticks = 0, battles = 0
  while (run.phase === 'battle') {
    const battle = run.battle!
    while (battle.status === 'running' && battle.tick < 6000) stepBattle(battle)
    ticks += battle.tick
    if (battle.status === 'running') return { phase: 'timeout', ticks }
    advanceRun(run)
    markPermadeath(run)
    settleGrowth(run)
    if (run.phase === 'rest') startStep(run, seed * 91 + ++battles * 13)
    if (battles > 100) return { phase: 'timeout', ticks }
  }
  return { phase: run.phase, ticks }
}

console.log(`50 paired seeds (${seedOffset + 1}-${seedOffset + samples}); full three-slot fixtures; same cloned roster across maps/loadouts; safest initial branch; auto; 3/3 potions; no buildings/manual bonuses/events/node choices/new equipment/scar settlement. Growth is enabled. NOT natural progression.`)
console.log('|Level|Protect|Gear|Map|Win|Wipe|Retreat|Timeout|Median ticks|')
console.log('|---|---|---|---|---|---|---|---|---|')
for (const level of [7, 11]) {
  const rosters = Array.from({ length: samples }, (_, seed) =>
    jobs.map((job, i) => generateMember(job, level, 910000 + (seed + seedOffset) * 10 + i, { race: 'human' })))
  for (const protect of [true, false]) {
    for (const gear of Object.keys(loadouts) as (keyof typeof loadouts)[]) {
      const equipped = rosters.map((roster, i) => equip(roster, gear, i + seedOffset + 1))
      for (const dungeon of maps) {
        const results = equipped.map((roster, i) => measure(structuredClone(roster), dungeon, i + seedOffset + 1, protect))
        const count = (phase: string) => results.filter(r => r.phase === phase).length
        assert.equal(count('timeout'), 0, `${level}/${gear}/${dungeon.id}: unfinished battles`)
        rows.push({ level, protect, gear, dungeon: dungeon.id, wins: count('victory') })
        const ticks = results.map(r => r.ticks).sort((a, b) => a - b)
        console.log(`|${level}|${protect}|${gear}|${dungeon.id}|${count('victory')}|${count('defeat')}|${count('retreated')}|${count('timeout')}|${(ticks[24] + ticks[25]) / 2}|`)
      }
    }
  }
}

// Relational contracts at the cross-region level, not exact sample win counts.
for (const protect of [true, false]) {
  for (const gear of ['T2-white', 'T2-green', 'T3-green'] as const) {
    const group = rows.filter(row => row.level === 11 && row.protect === protect && row.gear === gear)
    const firstRegion = group.filter(row => maps.slice(0, 6).some(d => d.id === row.dungeon))
    const hardestRegionOne = Math.min(...firstRegion.map(row => row.wins))
    for (const row of group.filter(row => maps.slice(6).some(d => d.id === row.dungeon))) {
      assert(row.wins < hardestRegionOne, `${gear}/${protect}/${row.dungeon}: cross-region difficulty regressed`)
      if (gear === 'T3-green') {
        const t2 = rows.find(r => r.level === 11 && r.protect === protect && r.gear === 'T2-green' && r.dungeon === row.dungeon)!
        assert(row.wins > t2.wins, `${row.dungeon}: T3 fixture should improve progression`)
        assert(row.wins > 0, `${row.dungeon}: T3 fixture cannot progress`)
      }
    }
  }
}
console.log('PASS: L11 cross-region and T3 progression contracts; no timeouts.')

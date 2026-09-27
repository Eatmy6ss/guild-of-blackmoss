import assert from 'node:assert/strict'
import { EMBERPASS } from '../src/data/dungeons-r2'
import { generateMember } from '../src/sim/gen'
import { createRng } from '../src/sim/rng'
import { rollDrop } from '../src/sim/loot'
import { stepBattle, setFocus, setStance, useHealPotion, useFuryPotion } from '../src/sim/combat'
import { bossIntents } from '../src/sim/mechanics'
import { createRun, advanceRun, markPermadeath, startStep, resetAfterRun } from '../src/sim/run'
import type { Member, Slot } from '../src/sim/types'

const offset = Number(process.env.EMBER_SEED_OFFSET ?? 0)
const jobs = ['guard', 'priest', 'ranger'] as const
const slots: Slot[] = ['weapon', 'armor', 'trinket']
const modes = ['ignore', 'respond', 'auto'] as const
const loadouts = ['T2-white', 'T2-green', 'T3-green'] as const
const gear = {
  T2: [
    ['wpn-t2-greatsword', 'arm-t2-plate', 'trk-t2-totem'],
    ['wpn-t2-staff', 'arm-t2-robe', 'trk-t2-totem'],
    ['wpn-t2-bow', 'arm-t2-chain', 'trk-t2-totem'],
  ],
  T3: [
    ['wpn-t3-ember', 'arm-t3-bulwark', 'trk-t3-pyrexia'],
    ['wpn-t3-dawn', 'arm-t3-drake', 'trk-t3-seer'],
    ['wpn-t3-gale', 'arm-t3-drake', 'trk-t3-pyrexia'],
  ],
}

function roster(seed: number, loadout: typeof loadouts[number]) {
  return jobs.map((job, i) => {
    const m = generateMember(job, 11, 620000 + seed * 10 + i, { race: 'human' })
    m.id = `ember-${seed}-${i}`
    gear[loadout.startsWith('T3') ? 'T3' : 'T2'][i].forEach((id, j) => {
      const rng = createRng(730000 + seed * 10 + i * 3 + j)
      let first = true
      m.equipment[slots[j]] = rollDrop(id, () => {
        if (first) { first = false; return loadout.endsWith('white') ? 0.9 : 0.3 }
        return rng()
      })
    })
    return m
  })
}

function measure(source: Member[], seed: number, mode: typeof modes[number]) {
  const members = structuredClone(source)
  resetAfterRun(members)
  const run = createRun(members, EMBERPASS, 'safepath', seed, 0, true, { heal: 3, fury: 3 }, mode === 'auto')
  let ticks = 0, battles = 0, interrupts = 0, mitigated = 0, slams = 0
  while (run.phase === 'battle') {
    const b = run.battle!
    while (b.status === 'running' && b.tick < 6000) {
      if (mode !== 'auto' && b.tick % 5 === 0) {
        if (mode === 'respond') {
          const intents = bossIntents(b)
          setStance(b, intents.telegraphing ? 'spread' : 'standard')
          const threats = b.combatants.filter(c => c.team === 'enemy' && c.alive)
          const priority = threats.find(c => c.id === intents.casterId)
            ?? threats.find(c => !c.boss && c.bossMechanics?.length)
          setFocus(b, priority?.id)
        }
        const guild = b.combatants.filter(c => c.team === 'guild' && c.alive)
        if (guild.some(c => c.hp / c.maxHp < 0.45)) useHealPotion(b)
        if (b.combatants.some(c => c.alive && c.mech?.enrage?.fired)) useFuryPotion(b)
      }
      stepBattle(b)
    }
    assert.notEqual(b.status, 'running', 'timeout')
    ticks += b.tick
    interrupts += b.events.filter(e => e.type === 'interrupted').length
    mitigated += b.events.filter(e => e.type === 'slam' && e.mitigated).length
    slams += b.events.filter(e => e.type === 'slam').length
    advanceRun(run)
    markPermadeath(run)
    if (run.phase === 'rest') startStep(run, seed * 91 + ++battles * 13)
    assert(battles < 100)
  }
  return { phase: run.phase, deaths: members.filter(m => !m.alive).length, ticks,
    interrupts, mitigated, slams, healUsed: 3 - run.potions.heal }
}

console.log(JSON.stringify({ samples: 50, offset, level: 11,
  policy: 'Same cloned human guard/priest/ranger across commands; seeded affixes; forced fixture quality only; real enemy mechanics and route; frozen XP/scars; protect ON; 3/3 potions; no buildings/events/aura/manual bonuses. Ignore/respond share potion policy. Auto is actual personality AI. Not natural progression or a human skill estimate.' }))
for (const loadout of loadouts) {
  const rosters = Array.from({ length: 50 }, (_, i) => roster(offset + i + 1, loadout))
  const winsByMode: Partial<Record<typeof modes[number], number>> = {}
  for (const mode of modes) {
    const results = rosters.map((r, i) => measure(r, offset + i + 1, mode))
    winsByMode[mode] = results.filter(r => r.phase === 'victory').length
    console.log(JSON.stringify({ loadout, mode, wins: results.filter(r => r.phase === 'victory').length,
      retreats: results.filter(r => r.phase === 'retreated').length,
      defeats: results.filter(r => r.phase === 'defeat').length,
      deaths: results.reduce((n, r) => n + r.deaths, 0),
      interrupts: results.reduce((n, r) => n + r.interrupts, 0),
      mitigated: results.reduce((n, r) => n + r.mitigated, 0),
      slams: results.reduce((n, r) => n + r.slams, 0), results }))
  }
  assert(winsByMode.respond! > winsByMode.ignore!, `${loadout}: responding should improve win rate`)
  if (loadout === 'T3-green') assert(winsByMode.auto! >= 40, 'mature fixture should remain farmable (40/50)')
}

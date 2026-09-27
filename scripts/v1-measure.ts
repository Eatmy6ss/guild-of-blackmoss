// V1 实测:50 场确定性样本,只报告结果不参与调参。
import { BLACKMOSS } from '../src/data/dungeons'
import { createBattle, stepBattle, setFocus, setStance, useFuryPotion, useHealPotion } from '../src/sim/combat'
import { bossIntents } from '../src/sim/mechanics'
import { generateMember } from '../src/sim/gen'
import { createRun, advanceRun, markPermadeath, startStep } from '../src/sim/run'

const JOBS = ['guard', 'priest', 'ranger'] as const
const MAX_TICK = 6000

const makeRng = (seed: number) => {
  let v = seed % 2147483647
  if (v <= 0) v += 2147483646
  return () => {
    v = (v * 16807) % 2147483647
    return (v - 1) / 2147483646
  }
}

function playBattle(seed: number): { win: boolean; wipe: boolean; deaths: number } {
  const rng = makeRng(seed)
  const squad = JOBS.map((job, j) => {
    const m = generateMember(job, 5, 810000 + seed * 10 + j)
    m.equipment[job === 'guard' ? 'armor' : 'weapon'] = {
      id: `v1-${seed}-${j}`,
      baseId: job === 'guard' ? 'arm-t1-mail' : job === 'priest' ? 'wpn-t1-sword' : 'wpn-t1-dagger',
      rolls: [],
    }
    return m
  })
  const encId = BLACKMOSS.encounters.find((e) => e.kind === 'boss')!.id
  const b = createBattle(squad, BLACKMOSS, encId, Math.floor(rng() * 1_000_000))
  while (b.status === 'running' && b.tick < MAX_TICK) {
    if (b.tick % 5 === 0) {
      const boss = b.combatants.find((c) => c.alive && c.bossMechanics)
      const intents = bossIntents(b)
      setStance(b, intents.telegraphing ? 'spread' : 'standard')
      if (boss) setFocus(b, boss.id)
      const alive = b.combatants.filter((c) => c.alive && c.team === 'guild')
      if (alive.length > 0) {
        const lowest = alive.reduce((a, c) => (a.hp / a.maxHp <= c.hp / c.maxHp ? a : c))
        if (lowest.hp / lowest.maxHp < 0.55) useHealPotion(b)
        if (boss?.mech?.['enrage']?.fired === 1) useFuryPotion(b)
      }
    }
    stepBattle(b)
  }
  return {
    win: b.status === 'guild-win',
    wipe: b.status === 'guild-wipe',
    deaths: b.combatants.filter((c) => c.team === 'guild' && !c.alive).length,
  }
}

function playAuto(seed: number, protectOn: boolean): { phase: string; deaths: number } {
  const squad = JOBS.map((job, j) => generateMember(job, 5, 820000 + seed * 10 + j))
  const run = createRun(squad, BLACKMOSS, 'safepath', seed * 7 + 1, 0, protectOn, { heal: 3, fury: 3 }, true)
  let deaths = 0
  let guard = 0
  while (!['victory', 'defeat', 'retreated'].includes(run.phase) && guard++ < 100) {
    const before = run.members.filter((m) => m.alive).length
    const b = run.battle!
    while (b.status === 'running' && b.tick < MAX_TICK) stepBattle(b)
    advanceRun(run)
    markPermadeath(run)
    deaths += before - run.members.filter((m) => m.alive).length
    if (run.phase === 'rest') startStep(run, seed * 91 + guard * 13)
  }
  return { phase: run.phase, deaths }
}

const battles = Array.from({ length: 50 }, (_, i) => playBattle(i + 1))
const battleWins = battles.filter((x) => x.win).length
console.log(`V1 50场指定种子 Boss 胜率 ${battleWins}/50 ${(battleWins * 2).toFixed(0)}%`)
console.log(`V1 50场指定种子团灭 ${battles.filter((x) => x.wipe).length}/50, 阵亡 ${battles.reduce((s, x) => s + x.deaths, 0)}`)

for (const protectOn of [true, false]) {
  const auto = Array.from({ length: 50 }, (_, i) => playAuto(i + 1, protectOn))
  console.log(`V1 50场挂机远征(保护${protectOn ? '开' : '关'})：通关 ${auto.filter((x) => x.phase === 'victory').length}，团灭 ${auto.filter((x) => x.phase === 'defeat').length}，撤退 ${auto.filter((x) => x.phase === 'retreated').length}，阵亡 ${auto.reduce((s, x) => s + x.deaths, 0)}`)
}

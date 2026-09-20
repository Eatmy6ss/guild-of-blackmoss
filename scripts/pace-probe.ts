// 节奏探针:用「会玩」机器人量各遭遇战时长,校准节奏带用(不进门禁)
import { BLACKMOSS } from '../src/data/dungeons'
import { createBattle, stepBattle, setStance, setFocus, useHealPotion, useFuryPotion } from '../src/sim/combat'
import { bossIntents } from '../src/sim/mechanics'
import { generateMember } from '../src/sim/gen'

const JOBS = ['guard', 'priest', 'ranger'] as const

const MAX_TICK = 3000

function runCommanded(encId: string, seed: number, cautious: boolean): { dur: number; win: boolean } {
  const squad = JOBS.map((job, j) => generateMember(job, 5, 970000 + seed * 100 + j))
  const b = createBattle(squad, BLACKMOSS, encId, seed * 31 + 7, 0, 0, false)
  while (b.status === 'running' && b.tick < MAX_TICK) {
    if (b.tick % 5 === 0) {
      const intents = bossIntents(b)
      setStance(b, intents.telegraphing ? 'spread' : 'standard')
      const boss = b.combatants.find((c) => c.boss && c.alive)
      if (boss) setFocus(b, boss.id)
      if (cautious) {
        const lowest = b.combatants
          .filter((c) => c.alive && c.team === 'guild')
          .reduce((a, c) => (a.hp / a.maxHp <= c.hp / c.maxHp ? a : c))
        if (lowest.hp / lowest.maxHp < 0.55) useHealPotion(b)
        if (boss?.mech?.['enrage']?.fired === 1) useFuryPotion(b)
      }
    }
    stepBattle(b)
  }
  return { dur: b.tick / 10, win: b.status === 'guild-win', status: b.status }
}

  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]

const statusTally: Record<string, number> = {}
for (const enc of ['enc-frogs', 'enc-wolves', 'enc-leeches', 'enc-grush', 'enc-talma']) {
  const ds: number[] = []
  let wins = 0
  for (let i = 0; i < 12; i++) {
    const r = runCommanded(enc, i, true) as { dur: number; win: boolean; status?: string }
    ds.push(r.dur)
    if (r.win) wins++
    const k = `${enc}:${r.status ?? '?'}`
    statusTally[k] = (statusTally[k] ?? 0) + 1
  }
  console.log(`${enc}: 中位 ${med(ds).toFixed(1)}s 胜率 ${wins}/12 (min ${Math.min(...ds).toFixed(0)}s max ${Math.max(...ds).toFixed(0)}s)`)
}
console.log('终局状态分布(诊断用):', statusTally)

// 险路资源诊断:会玩机器人打黑苔 shortcut 全程,输出每场后血量/药水
import { BLACKMOSS } from '../src/data/dungeons'
import { createBattle, stepBattle, setStance, setFocus, useHealPotion, useFuryPotion } from '../src/sim/combat'
import { bossIntents } from '../src/sim/mechanics'
import { generateMember } from '../src/sim/gen'
import { createRun, startStep, advanceRun, markPermadeath } from '../src/sim/run'

const JOBS = ['guard', 'priest', 'ranger'] as const
const MAX_TICK = 10000

for (let i = 0; i < 3; i++) {
  const squad = JOBS.map((job, j) => generateMember(job, 5, 200000 + i * 100 + j))
  const run = createRun(squad, BLACKMOSS, 'shortcut', i * 419 + 3)
  let g = 0
  while (run.phase !== 'victory' && run.phase !== 'defeat' && run.phase !== 'retreated' && g++ < 40) {
    const bt = run.battle!
    while (bt.status === 'running' && bt.tick < MAX_TICK) {
      if (bt.tick % 5 === 0) {
        const boss = bt.combatants.find((c) => c.alive && c.bossMechanics)
        const adds = bt.combatants.filter((c) => c.alive && c.team === 'enemy' && !c.bossMechanics)
        const casting = boss?.mech?.['cast-buff'] !== undefined && boss!.mech!['cast-buff'].until !== undefined
        const telegraphing = boss?.mech?.['telegraph-aoe'] !== undefined && boss!.mech!['telegraph-aoe'].until !== undefined
        if (telegraphing) setStance(bt, 'spread')
        else if (bt.commands.stance === 'spread') setStance(bt, 'standard')
        if (casting && boss) setFocus(bt, boss.id)
        else if (adds.length > 0) setFocus(bt, adds.reduce((a, c) => (a.hp <= c.hp ? a : c)).id)
        else if (boss) setFocus(bt, boss.id)
        const ga = bt.combatants.filter((c) => c.alive && c.team === 'guild')
        if (ga.length === 0) break
        const lowest = ga.reduce((a, c) => (a.hp / a.maxHp <= c.hp / c.maxHp ? a : c))
        if (lowest.hp / lowest.maxHp < 0.55) useHealPotion(bt)
        if (boss && boss.mech?.['enrage']?.fired === 1) useFuryPotion(bt)
      }
      stepBattle(bt)
    }
    const hp = bt.combatants.filter((c) => c.team === 'guild').map((c) => `${c.name}:${c.alive ? Math.round((c.hp / c.maxHp) * 100) + '%' : '死'}`).join(' ')
    console.log(`  场 ${g} [${bt.encounterName ?? ''}] ${bt.status} 药 ${JSON.stringify(bt.commands.potions ?? {})} | ${hp}`)
    advanceRun(run)
    markPermadeath(run)
    if (run.phase === 'rest') startStep(run, i * 733 + g * 19)
  }
  console.log(`局 ${i}:终局 ${run.phase}`)
}

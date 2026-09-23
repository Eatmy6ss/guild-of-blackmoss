// 新档全流程实测(制作人反馈①②):开局 L5 三人无装备队,黑苔全路线
// 量化:通关率/阵亡/装备掉落期望/金币收入,三档操作水平对照
import { BLACKMOSS } from '../src/data/dungeons'
import { createBattle, stepBattle, setStance, setFocus, useHealPotion, useFuryPotion } from '../src/sim/combat'
import { bossIntents } from '../src/sim/mechanics'
import { generateMember } from '../src/sim/gen'
import { createRun, startStep, advanceRun, markPermadeath, settleGrowth } from '../src/sim/run'
import { rollWaveDrop } from '../src/sim/loot'
import { ECONOMY } from '../src/data/economy'

const JOBS = ['guard', 'priest', 'ranger'] as const
const MAX_TICK = 6000

type Tier = 'none' | 'meh' | 'good'

function play(seed: number, tier: Tier, geared: boolean) {
  const squad = JOBS.map((job, j) => {
    const m = generateMember(job, 5, 770000 + seed * 100 + j)
    if (geared) {
      // 修复后新档:开局送 1 件职业 T1(guard 甲/牧剑/游侠弓)
      const baseId = job === 'guard' ? 'arm-t1-mail' : job === 'priest' ? 'wpn-t1-sword' : 'wpn-t1-dagger'
      m.equipment[job === 'guard' ? 'armor' : 'weapon'] = { id: `g${j}`, baseId, rolls: [] }
    }
    return m
  })
  const run = createRun(squad, BLACKMOSS, 'safepath', seed * 7 + 1, 0, true, { heal: 3, fury: 3 })
  let deaths = 0
  let g = 0
  while (run.phase !== 'victory' && run.phase !== 'defeat' && run.phase !== 'retreated' && g++ < 40) {
    const bt = run.battle!
    while (bt.status === 'running' && bt.tick < MAX_TICK) {
      if (tier !== 'none' && bt.tick % 5 === 0) {
        const boss = bt.combatants.find((c) => c.alive && c.bossMechanics)
        const intents = bossIntents(bt)
        if (tier === 'good') setStance(bt, intents.telegraphing ? 'spread' : 'standard')
        if (boss) setFocus(bt, boss.id)
        const ga = bt.combatants.filter((c) => c.alive && c.team === 'guild')
        if (ga.length === 0) break
        const lowest = ga.reduce((a, c) => (a.hp / a.maxHp <= c.hp / c.maxHp ? a : c))
        if (lowest.hp / lowest.maxHp < (tier === 'good' ? 0.55 : 0.4)) useHealPotion(bt)
        if (tier === 'good' && boss?.mech?.['enrage']?.fired === 1) useFuryPotion(bt)
      }
      stepBattle(bt)
    }
    const before = run.members.filter((m) => m.alive).length
    advanceRun(run)
    markPermadeath(run)
    deaths += before - run.members.filter((m) => m.alive).length
    if (run.phase === 'rest') startStep(run, seed * 91 + g * 13)
  }
  return { phase: run.phase, deaths, steps: run.steps.length }
}

const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0)

for (const tier of ['none', 'meh', 'good'] as Tier[]) {
  for (const geared of [false, true]) {
    const rs: ReturnType<typeof play>[] = []
    for (let i = 0; i < 24; i++) rs.push(play(i, tier, geared))
    const wins = rs.filter((r) => r.phase === 'victory').length
    const ret = rs.filter((r) => r.phase === 'retreated').length
    const wipe = rs.filter((r) => r.phase === 'defeat').length
    const deathAvg = (rs.reduce((s, r) => s + r.deaths, 0) / rs.length).toFixed(2)
    console.log(
      `${tier.padEnd(5)} ${geared ? '带3件T1' : '裸装  '} | 通关 ${String(wins).padStart(2)}/24 撤退 ${String(ret).padStart(2)} 团灭 ${String(wipe).padStart(2)} | 阵亡均值 ${deathAvg}/局 | 路线 ${med(rs.map((r) => r.steps))} 场`,
    )
  }
}

// 资源账:一轮通关的金币与掉落期望
const waves = 11
const dropE = waves * 0.08
const gold = waves * ECONOMY.battleGold.wave + ECONOMY.battleGold.boss + ECONOMY.clearBonus
console.log(`\n资源账:一轮 ${waves + 1} 场 → 金币 ~${gold} + 装备期望 ${dropE.toFixed(1)} 件(8%/场)+ boss 保底掉落`)
console.log(`对照:新招募冷却成本/阵亡损失(阵亡=人+装备全失)——装备获取是否配得上损耗,由制作人裁定方向`)

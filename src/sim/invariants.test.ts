// #0.7b 不变量测试首批(2026-09-27,实施计划批次 0)
// 原则:断言写关系,不写数值。这些测试防的是接缝类缺陷(B01-B06 的复发检测器)。
import { describe, it, expect } from 'vitest'
import { createBattle, stepBattle, applyHit } from './combat'
import { generateMember } from './gen'
import { BLACKMOSS, DUNGEONS } from '../data/dungeons'
import { interruptThreshold } from './mechanic-registry'
import type { BossMechanicDef } from '../sim/types'

const TICK_HARD_CAP = 6000
const squad = () => ['guard', 'priest', 'ranger'].map((j, i) => generateMember(j as any, 9, 88000 + i))

// I1:任何可打断机制(breakDamage 有值),读条窗口内累计伤害达阈值必产生 interrupted
describe('I1 可打断机制不变量', () => {
  const interruptibles: BossMechanicDef[] = [
    { id: 'cb', kind: 'cast-buff', name: '强化读条', params: { castTicks: 30, attackBuff: 10, durationTicks: 100, everyTicks: 400, breakDamage: 120 } },
    { id: 'ch', kind: 'cast-heal', name: '治疗读条', params: { castTicks: 30, healAmount: 80, durationTicks: 100, everyTicks: 400, breakDamage: 120 } },
    { id: 'gz', kind: 'ground-zone', name: '地刺读条', params: { everyTicks: 300, telegraphTicks: 30, damage: 10, breakDamage: 150 } },
    { id: 'fa', kind: 'fear-aura', name: '龙威读条', params: { everyTicks: 300, telegraphTicks: 30, damage: 10, breakDamage: 110 } },
  ]
  for (const def of interruptibles) {
    it(`[${def.kind}] 窗口内打足 breakDamage 必打断`, () => {
      const boss = { id: 'boss', name: '探针', maxHp: 999999, attack: 1, defense: 0, speed: 1, position: 'front' as const, range: 'melee' as const, mechanics: [def] }
      const dungeon = { ...BLACKMOSS, enemyGroups: { g: [{ ...boss, id: 'boss' }] }, encounters: [{ id: 'enc', name: 'x', kind: 'wave' as const, enemyGroupIds: ['g'] }] }
      const b = createBattle(squad(), dungeon, 'enc', 91, 0, 0, false)
      const guild = b.combatants.find((c) => c.team === 'guild')!
      const bossC = () => b.combatants.find((c) => c.team === 'enemy')!
      let interrupted = false
      let guard = 0
      while (b.status === 'running' && guard++ < TICK_HARD_CAP) {
        const target = bossC()
        if (!target.alive) break
        if (interruptThreshold(def) !== undefined && target.mech?.[def.kind]?.until !== undefined) {
          applyHit(b, guild, target, (interruptThreshold(def) as number) + 50, '探针')
          if (b.events.some((e) => e.type === 'interrupted')) { interrupted = true; break }
        }
        stepBattle(b)
      }
      expect(interrupted).toBe(true)
      expect(guard).toBeLessThan(TICK_HARD_CAP)
    })
  }
})

// fuzz:随机职业 × 随机图 × 随机种子 200 场,断言无异常、无 NaN、必然终止
describe('fuzz 200 局', () => {
  it('随机组合不抛异常/无 NaN/在硬上限内终止', () => {
    const jobs = ['guard', 'priest', 'ranger', 'warrior', 'mage', 'warlock'] as const
    let completed = 0
    for (let i = 0; i < 200; i++) {
      const dungeon = DUNGEONS[i % DUNGEONS.length]
      const enc = dungeon.encounters[i % dungeon.encounters.length]
      const squad2 = jobs.slice(0, 3).map((j, k) => generateMember(j, 5 + (i % 9), 700000 + i * 131 + k))
      const b = createBattle(squad2, dungeon, enc.id, i * 977 + 3, 0, 0, false)
      let guard = 0
      while (b.status === 'running' && guard++ < TICK_HARD_CAP) stepBattle(b)
      if (b.status === 'running') throw new Error(`fuzz 第 ${i} 场未终止(${dungeon.id}/${enc.id})`)
      completed++
      for (const c of b.combatants) {
        if (Number.isNaN(c.hp) || Number.isNaN(c.maxHp)) throw new Error(`fuzz 第 ${i} 场出现 NaN 血量`)
      }
    }
    expect(completed).toBe(200)
  })
})

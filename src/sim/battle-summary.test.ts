import { describe, expect, test } from 'vitest'
import { buildBattleSummary } from './battle-summary'
import type { BattleEvent, Combatant, DeadHero } from './types'

const hero = (id: string): Combatant => ({ id, name: '英雄' + id, team: 'guild' }) as Combatant
const foe = (id: string, name: string): Combatant => ({ id, name, team: 'enemy' }) as Combatant
const dmg = (attackerId: string, targetId: string, amount: number): BattleEvent =>
  ({ tick: 1, type: 'damage', attackerId, targetId, amount }) as BattleEvent
const dead = (name: string, cause: string, affixes?: string[]): DeadHero =>
  ({ id: 'd1', name, job: 'guard', level: 5, cause, death: { kind: 'battle', killerName: '腐化狼', affixes, where: { source: 'dungeon', id: 'abyssaltar' } } }) as DeadHero

describe('A15 战后小结聚合', () => {
  test('败因:敌方对己方伤害按攻击者聚合取前 3,我方输出与治疗不计入', () => {
    const s = buildBattleSummary({
      status: 'guild-wipe',
      combatants: [hero('h1'), foe('e1', '腐化狼'), foe('e2', '沙蝎战首'), foe('e3', '吟诵者')],
      events: [
        dmg('e1', 'h1', 50), dmg('e1', 'h1', 30), dmg('e2', 'h1', 40),
        dmg('h1', 'e1', 999), dmg('e1', 'e2', 10), dmg('e3', 'h1', 5),
        { tick: 2, type: 'heal', targetId: 'h1', amount: 20 } as BattleEvent,
      ],
      deaths: [],
    })
    expect(s.topDamage).toEqual([
      { name: '腐化狼', amount: 80 },
      { name: '沙蝎战首', amount: 40 },
      { name: '吟诵者', amount: 5 },
    ])
    expect(s.wiped).toBe(true)
    expect(s.win).toBe(false)
  })

  test('死因:渲染串透传,结构化字段(killerName/affixes)随行(批次 3 碑文数据源)', () => {
    const s = buildBattleSummary({
      status: 'guild-wipe',
      combatants: [hero('h1')],
      events: [],
      deaths: [dead('老盾卫', '陨落于渊底祭坛', ['bloodrage'])],
    })
    expect(s.deaths[0].cause).toBe('陨落于渊底祭坛')
    expect(s.deaths[0].killerName).toBe('腐化狼')
    expect(s.deaths[0].affixes).toEqual(['bloodrage'])
  })

  test('关键时刻:透传并截断到 4 条', () => {
    const s = buildBattleSummary({
      status: 'guild-win', combatants: [], events: [], deaths: [],
      moments: ['公会首杀:格鲁什', '甲 Lv2→3', '乙 Lv2→3', '丙 Lv2→3', '多余的一条'],
    })
    expect(s.moments).toHaveLength(4)
    expect(s.moments[0]).toBe('公会首杀:格鲁什')
  })
})

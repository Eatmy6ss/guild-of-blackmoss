import { describe, expect, it } from 'vitest'
import { AFFIXES } from '../data/affixes'
import { ITEM_BASES } from '../data/items'
import { createBattle, stepBattle } from './combat'
import { BLACKMOSS } from '../data/dungeons'
import { generateMember } from './gen'
import type { ItemInstance, StatKey } from './types'

// I8 断言(#2.2 接线清单的守卫):对每个 StatKey,构造两个仅该属性不同的探针战斗,
// 战斗轨迹必须不同——抓「加了属性但没接到战斗里」的死属性。
// 同时断言:每个 StatKey 至少有一条词条(7 处接线第 7 处)。

const SQUAD_JOBS = ['guard', 'priest', 'ranger'] as const

function probeFight(seed: number, injected?: { slot: 'weapon' | 'armor' | 'trinket'; roll: { affixId: string; value: number } }): { tick: number; hpSum: number; logs: number } {
  const members = SQUAD_JOBS.map((job, j) => {
    const m = generateMember(job, 6, 310000 + seed * 17 + j)
    m.spec = undefined
    m.equipment = {}
    return m
  })
  if (injected) {
    const host = members[2] // 游侠:承伤/输出/被治疗都会发生
    const base = ITEM_BASES['wpn-t1-sword']!
    const item: ItemInstance = { id: 'probe-inject', baseId: base.id, quality: 'purple', rolls: [injected.roll] }
    if (injected.slot === 'weapon') host.equipment.weapon = item
    else host.equipment[injected.slot] = item
  }
  const b = createBattle(members, BLACKMOSS, 'enc-wolves', seed, 0, 0, false)
  let guard = 0
  while (b.status === 'running' && guard++ < 20000) stepBattle(b)
  return { tick: b.tick, hpSum: b.combatants.reduce((s, c) => s + c.hp, 0), logs: b.log.length }
}

const signatureOf = (r: { tick: number; hpSum: number; logs: number }) => `${r.tick}|${r.hpSum}|${r.logs}`

// 探针注入值:大值保证轨迹可分辨(词条表里同 stat 任取一条,值取其 tier 上界)
function bigRollFor(stat: StatKey): { affixId: string; value: number } | null {
  const aff = Object.values(AFFIXES).find((a) => a.stat === stat)
  if (!aff) return null
  return { affixId: aff.id, value: aff.tiers[aff.tiers.length - 1]!.range[1] }
}

describe('I8 无死属性(#2.2 接线守卫)', () => {
  const ALL: StatKey[] = ['attack', 'maxHp', 'defense', 'speed', 'critChance', 'lifesteal', 'healReceived', 'fireResist', 'critDamage', 'attackSpeed', 'armorPen', 'damageReduction', 'healPower', 'threatMult', 'cdReduction']

  it('每个 StatKey 都有至少一条词条(接线第 7 处)', () => {
    for (const key of ALL) {
      const aff = Object.values(AFFIXES).find((a) => a.stat === key)
      expect(aff, `${key} 无任何词条(接线第 7 处缺失)`).toBeDefined()
      expect(aff!.pools.length, `${key} 的词条无倾向池`).toBeGreaterThan(0)
    }
  })

  for (const key of ALL) {
    it(`I8:${key} 参与战斗(两探针轨迹不同)`, { timeout: 30_000 }, () => {
      const roll = bigRollFor(key)!
      const slot: 'weapon' | 'armor' | 'trinket' = key === 'maxHp' || key === 'damageReduction' || key === 'threatMult' || key === 'healReceived' || key === 'fireResist' ? 'armor' : 'trinket'
      // 装备注入走 trinket 槽会顶掉基础盘?探针成员默认无装备,直接给武器/护甲位塞词条件(基础盘随 base)
      const a = probeFight(71)
      const b = probeFight(71, { slot, roll })
      expect(signatureOf(b), `${key} 注入后战斗轨迹不变=死属性(未接到战斗数学点)`)
        .not.toBe(signatureOf(a))
    })
  }
})

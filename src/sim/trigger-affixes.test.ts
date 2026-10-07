import { describe, expect, it } from 'vitest'
import { createBattle, stepBattle } from './combat'
import { describeItem } from './loot'
import { BLACKMOSS } from '../data/dungeons'
import { generateMember } from './gen'
import { itemStats } from './loot'
import type { ItemInstance } from './types'

// #2.3 触发类词条:血债(击杀回血)/背水(低血攻击)/棘肤(受击反弹)。
// 复用威能钩子(击杀块/last-stand 通道/counterMult 通道),不新建触发系统——I8 同款轨迹守卫。

const ROLLS = {
  'aff-blooddebt': { affixId: 'aff-blooddebt', value: 0.07 },
  'aff-vow': { affixId: 'aff-vow', value: 0.3 },
  'aff-thorn': { affixId: 'aff-thorn', value: 0.2 },
} as const

function fight(seed: number, inject?: keyof typeof ROLLS): { tick: number; hpSum: number; logs: number } {
  const members = (['guard', 'priest', 'ranger'] as const).map((job, j) => {
    const m = generateMember(job, 6, 410000 + seed * 13 + j)
    m.spec = undefined
    m.equipment = {}
    if (inject) {
      // 注入到护甲位(wp 基底不带武器族门槛,萨满/游侠都能穿)
      m.equipment.armor = { id: 'trigger-inject', baseId: 'arm-t2-plate', quality: 'purple', rolls: [ROLLS[inject]] }
    }
    return m
  })
  const b = createBattle(members, BLACKMOSS, 'enc-wolves', seed, 0, 0, false)
  let guard = 0
  while (b.status === 'running' && guard++ < 20000) stepBattle(b)
  return { tick: b.tick, hpSum: b.combatants.reduce((s, c) => s + c.hp, 0), logs: b.log.length }
}

const sig = (r: { tick: number; hpSum: number; logs: number }) => `${r.tick}|${r.hpSum}|${r.logs}`

describe('#2.3 触发类词条', () => {
  for (const key of ['aff-blooddebt', 'aff-vow', 'aff-thorn'] as const) {
    it(`${key} 参与战斗(注入后轨迹不同)`, { timeout: 30_000 }, () => {
      const a = fight(53)
      const b = fight(53, key)
      expect(sig(b), `${key} 注入后战斗轨迹不变=触发未接到钩子`).not.toBe(sig(a))
    })
  }

  it('触发词条不进属性聚合(血债不虚增吸血),describeItem 出触发文案', () => {
    const item: ItemInstance = { id: 't', baseId: 'arm-t2-plate', quality: 'white', rolls: [ROLLS['aff-blooddebt']] }
    // 血债 stat 占位是 lifesteal;基底自带防御 8——触发词条不得虚增属性(只允许基底盘)
    expect(itemStats(item)).toEqual({ defense: 8 })
    const d = describeItem(item)
    expect(d).toContain('血债')
    expect(d).toContain('击杀敌人时回复')
    expect(d).toContain('%')
  })
})

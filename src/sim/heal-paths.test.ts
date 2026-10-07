import { describe, expect, it } from 'vitest'
import { computeHeal, toCombatant } from './combat'
import { generateMember } from './gen'
import type { Combatant } from './types'

// #2.7 治疗定位纠偏:三路径(技能/药水/词缀乘区)统一经 computeHeal。
// 规格:技能=基量×(1+healPower)×(1+healReceived)×healTakenMod;
//      药水=基量原样(明确声明不吃任何治疗属性,禁止隐含行为);
//      healTakenMod=词缀独立乘区(不再覆盖玩家受疗词条)。

const member = () => generateMember('priest', 8, 911)

describe('#2.7 治疗定位纠偏', () => {
  it('computeHeal:技能路径=基量×(1+治疗强度)×(1+受疗)×healTakenMod', () => {
    const src = toCombatant(member())
    src.healPower = 0.2
    const tgt = toCombatant(member())
    tgt.healReceived = 0.5
    tgt.healTakenMod = 0.9
    // 基量 100:100×1.2×1.5×0.9=162
    expect(computeHeal(src, tgt, 100, 'skill')).toBe(162)
  })

  it('药水路径不吃 healPower 也不吃 healReceived(规格声明,非隐含)', () => {
    const src = toCombatant(member())
    src.healPower = 0.5
    const tgt = toCombatant(member())
    tgt.healReceived = 0.5
    tgt.healTakenMod = 0.5
    // 药水只吃词缀乘区 healTakenMod(伤害/治疗类 debuff 是环境规则,不是玩家属性)
    expect(computeHeal(src, tgt, 100, 'potion')).toBe(50)
    expect(computeHeal(src, tgt, 100, 'potion')).not.toBe(100 * 1.5)
  })

  it('healTakenMod 缺省=1;治疗强度只在技能路径生效', () => {
    // 裸对象隔离成员自带受疗(忠诚/精神),只验证公式本身
    const src = { healPower: 0.3 } as Combatant
    const tgt = {} as Combatant
    expect(computeHeal(src, tgt, 100, 'skill')).toBe(130)
    expect(computeHeal(null, tgt, 100, 'tick')).toBe(100)
    expect(computeHeal(src, tgt, 100, 'potion')).toBe(100)
  })
})

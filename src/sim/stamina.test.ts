import { describe, expect, it } from 'vitest'
import { STAMINA, spendStamina, restStamina, staminaAttackMult, staminaScarBonus, staminaOf, staminaLabel, spendRetreatStamina } from './stamina'
import { generateMember } from './gen'

// #4.1 精力系统:出征场次消耗,天数恢复(唯一途径);软地板以下攻击衰减+创伤加成。
// 老档 undefined=满精力零迁移零变。

describe('#4.1 精力系统', () => {
  it('老档 undefined=满精力;消耗到 0 下限;恢复封顶 100', () => {
    const m = generateMember('guard', 5, 91)
    expect(staminaOf({})).toBe(STAMINA.cap) // 老档零变
    for (let i = 0; i < 20; i++) spendStamina(m)
    expect(staminaOf(m)).toBe(0) // 下限 0,不透支
    restStamina([m], 1)
    expect(staminaOf(m)).toBe(STAMINA.restPerDay)
    restStamina([m], 99)
    expect(staminaOf(m)).toBe(STAMINA.cap)
  })

  it('软地板:以下攻击衰减+创伤加成;以上零效果', () => {
    const fresh = generateMember('ranger', 5, 92)
    expect(staminaAttackMult(fresh)).toBe(1)
    expect(staminaScarBonus(fresh)).toBe(0)
    const tired = generateMember('ranger', 5, 93)
    tired.stamina = STAMINA.softFloor - 1
    expect(staminaAttackMult(tired)).toBe(STAMINA.attackMultBelow)
    expect(staminaScarBonus(tired)).toBe(STAMINA.scarBonusBelow)
    expect(staminaLabel(tired)).toContain('疲惫')
  })

  it('场次消耗只对存活成员?——spendStamina 是单成员接口,结算侧自行选择;每天恢复全体', () => {
    const a = generateMember('guard', 5, 94)
    const b = generateMember('priest', 5, 95)
    b.alive = false
    spendStamina(a)
    expect(staminaOf(a)).toBe(STAMINA.cap - STAMINA.perBattle)
    expect(staminaOf(b)).toBe(STAMINA.cap) // 死者无关
    restStamina([a, b])
    expect(staminaOf(a)).toBe(STAMINA.cap) // 恢复全体存活(死者恢复无意义但无害)
  })

  it('#4.3 撤退额外精力惩罚:固定扣减,下限 0', () => {
    const m = generateMember('guard', 5, 96)
    spendRetreatStamina(m)
    expect(staminaOf(m)).toBe(STAMINA.cap - STAMINA.retreatExtra)
    m.stamina = 5
    spendRetreatStamina(m)
    expect(staminaOf(m)).toBe(0)
  })
})

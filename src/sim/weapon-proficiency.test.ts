import { describe, expect, it } from 'vitest'
import { toCombatant } from './combat'
import type { Attributes, Member } from './types'

// R3/W2 验收:非熟练武器攻击降档(×0.85 结构占位);训练场学习后恢复;
// 施法铁律的数据面(canCastJob)在 weapon-families.test.ts,引擎面(抡杖不发弹)随 W4 落地。

const NEUTRAL_ATTRS: Attributes = { str: 10, agi: 10, int: 10, vit: 10, spr: 10, lck: 10 }

function mkMember(job: Member['job'], weaponBaseId?: string, learned?: string[]): Member {
  return {
    id: 'm1', name: '测试', job, level: 5,
    nature: { base: NEUTRAL_ATTRS, growth: NEUTRAL_ATTRS, caps: NEUTRAL_ATTRS },
    personality: { bravery: 50, caution: 50, greed: 50, loyalty: 50 },
    attrs: { ...NEUTRAL_ATTRS },
    hp: 100, exp: 0, bonds: {},
    equipment: weaponBaseId
      ? { weapon: { id: 'i1', baseId: weaponBaseId, rolls: [] } }
      : {},
    alive: true,
    weaponLearned: learned,
  }
}

describe('武器熟练与降档(R3/W2)', () => {
  it('战士拿杖(非熟练):攻击 ×0.85 降档,combatant 标记族与非熟练', () => {
    const bare = toCombatant(mkMember('warrior'))
    const withStaff = toCombatant(mkMember('warrior', 'wpn-t2-staff'))
    expect(withStaff.weaponFamily).toBe('staff')
    expect(withStaff.weaponProficient).toBe(false)
    // 春霖法杖主属性是 healReceived(不加攻击),差值只来自降档乘区
    expect(withStaff.attack).toBe(Math.round(bare.attack * 0.85))
  })

  it('训练场学会杖圣器后:降档恢复,族标记不变', () => {
    const bare = toCombatant(mkMember('warrior'))
    const before = toCombatant(mkMember('warrior', 'wpn-t2-staff'))
    expect(before.attack).toBe(Math.round(bare.attack * 0.85))
    // 学习=成员级 weaponLearned
    const after = toCombatant(mkMember('warrior', 'wpn-t2-staff', ['staff']))
    expect(after.weaponProficient).toBe(true)
    expect(after.attack).toBe(bare.attack)
  })

  it('本命族武器从不降档(不依赖学习)', () => {
    const bare = toCombatant(mkMember('ranger'))
    const withBow = toCombatant(mkMember('ranger', 'wpn-t2-bow'))
    expect(withBow.weaponProficient).toBe(true)
    // 逐风长弓主属性 attack +12:攻击 = 裸装 + 12(无降档乘区)
    expect(withBow.attack).toBe(bare.attack + 12)
  })

  it('空手不构成非熟练(无族即无惩罚)', () => {
    const c = toCombatant(mkMember('mage'))
    expect(c.weaponFamily).toBeUndefined()
    expect(c.weaponProficient).toBe(true)
  })
})

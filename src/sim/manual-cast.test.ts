import { describe, expect, it } from 'vitest'
import { createBattle, castSkillManually } from './combat'
import { generateMember } from './gen'
import { BLACKMOSS } from '../data/dungeons'

// #7.1(U39)RTS 式点选施法:手动通道校验冷却/存活/族门槛;玩家指定目标生效;冷却与 AI 同池。

function fixture() {
  const members = [generateMember('guard', 1, 71), generateMember('ranger', 1, 72), generateMember('priest', 1, 73)]
  for (const m of members) m.level = 10, m.hp = 9999
  const b = createBattle(members, BLACKMOSS, 'enc-frogs', 17, 0, 0, false)
  return { b, members }
}

describe('#7.1 RTS 点选施法', () => {
  it('治疗技能:玩家指定的友方被治疗(而非 AI 默认最脆);施放后进冷却(AI 同池)', () => {
    const { b, members } = fixture()
    const priestC = b.combatants.find((c) => c.memberId === members[2]!.id)!
    const guardC = b.combatants.find((c) => c.memberId === members[0]!.id)!
    guardC.hp = Math.floor(guardC.maxHp * 0.5) // 半血满足治疗时机
    const heal = priestC.skills.find((r) => r.def.effect === 'heal-lowest')
    expect(heal).toBeDefined() // 牧师带治疗
    const before = guardC.hp
    const r = castSkillManually(b, priestC.memberId!, heal!.def.id, guardC.id)
    expect(r.ok).toBe(true)
    expect(guardC.hp).toBeGreaterThan(before)
    expect(heal!.cooldownLeft).toBeGreaterThan(0) // 冷却与 AI 同池
  })

  it('冷却中/不存在技能 拒绝并给原因', () => {
    const { b, members } = fixture()
    expect(castSkillManually(b, members[0]!.id, 'no-such-skill').ok).toBe(false)
    const withSkill = b.combatants.find((c) => c.team === 'guild' && c.skills.length > 0)
    if (withSkill) {
      const r = withSkill.skills[0]!
      r.cooldownLeft = 99
      const res = castSkillManually(b, withSkill.memberId!, r.def.id)
      expect(res.ok).toBe(false)
      expect(res.reason).toContain('冷却')
    }
  })
})

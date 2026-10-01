import { describe, expect, test } from 'vitest'
import { createBattle, useSignature, executeSignature } from './combat'
import { generateMember } from './gen'
import { BLACKMOSS } from '../data/dungeons'
import { SIGNATURE_SKILLS } from '../data/signature'

function castingBattle() {
  const state = createBattle(
    [generateMember('guard', 5, 1), generateMember('priest', 5, 2)],
    BLACKMOSS, 'enc-frogs', 4242,
  )
  const enemy = state.combatants.find((c) => c.team === 'enemy' && c.alive)!
  enemy.bossMechanics = [{ id: 'test-cast', kind: 'telegraph-aoe', name: '测试咏唱', params: { breakDamage: 100 } }]
  enemy.mech = { 'telegraph-aoe': { until: state.tick + 50, taken: 10 } }
  const me = state.combatants.find((c) => c.team === 'guild' && c.alive)!
  me.specId = 'guard-ironwall'
  return { state, me, enemy }
}

describe('A3 #1.1 招牌技:真打断', () => {
  test('受理→执行:置 taken=阈值走打断管线,brokenBy 归属,护盾二段,冷却记录', () => {
    const { state, me, enemy } = castingBattle()
    expect(useSignature(state, me.memberId!, enemy.id)).toBe(true)
    expect(state.commands.signature?.skillId).toBe('sig-ironwall-break')
    executeSignature(state, state.commands.signature!)
    const rt = enemy.mech!['telegraph-aoe']
    expect(rt.taken).toBe(100)
    expect(rt.brokenBy).toBe('破咒盾击')
    expect(rt.until).toBe(state.tick + 50) // 打断由 stepCastWindow 下一 tick 落地(单一路径)
    expect(state.signatureCd?.[me.memberId!]).toBe(state.tick + 60)
    expect(me.absorbShield ?? 0).toBeGreaterThan(0)
    expect(useSignature(state, me.memberId!, enemy.id)).toBe(false) // 冷却中不再受理
  })

  test('拒绝:专精无招牌技 / 目标没在读条 / 战斗已结束', () => {
    const { state, me, enemy } = castingBattle()
    const other = state.combatants.find((c) => c.team === 'guild' && c.alive && c.id !== me.id)!
    other.specId = 'ranger-hawk'
    expect(useSignature(state, other.memberId!, enemy.id)).toBe(false)
    expect(state.commands.signature).toBeUndefined()
    enemy.mech!['telegraph-aoe'].until = state.tick - 1
    expect(useSignature(state, me.memberId!, enemy.id)).toBe(false)
    state.status = 'guild-win'
    expect(useSignature(state, me.memberId!, enemy.id)).toBe(false)
  })

  test('制作人拍板的三个专精注册表齐备,cd 一致(决策窗对齐咏唱周期)', () => {
    expect(SIGNATURE_SKILLS['guard-ironwall']?.name).toBe('破咒盾击')
    expect(SIGNATURE_SKILLS['warrior-charge']?.name).toBe('锁足冲锋')
    expect(SIGNATURE_SKILLS['priest-discipline']?.name).toBe('诫命沉默')
    expect(new Set(Object.values(SIGNATURE_SKILLS).map((s) => s.cdTicks)).size).toBe(1)
  })
})

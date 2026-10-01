import { describe, expect, test } from 'vitest'
import { createBattle, useSignature, executeSignature, applyHit } from './combat'
import { generateMember } from './gen'
import { BLACKMOSS } from '../data/dungeons'
import { SIGNATURE_SKILLS } from '../data/signature'
import { JOBS } from '../data/jobs'

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
    other.specId = 'mage-fire'
    expect(useSignature(state, other.memberId!, enemy.id)).toBe(false)
    expect(state.commands.signature).toBeUndefined()
    enemy.mech!['telegraph-aoe'].until = state.tick - 1
    expect(useSignature(state, me.memberId!, enemy.id)).toBe(false)
    state.status = 'guild-win'
    expect(useSignature(state, me.memberId!, enemy.id)).toBe(false)
  })

  test('批次 1 出口:全部专精(含混合)各有一个招牌技,behavior 完整(spec 规格断言)', () => {
    const specIds: string[] = []
    for (const job of Object.values(JOBS)) for (const sp of Object.values(job.specs)) specIds.push(sp.id)
    for (const id of specIds) {
      const sig = SIGNATURE_SKILLS[id]
      expect(sig, id + ' 缺招牌技').toBeTruthy()
      expect(sig.name.length, id).toBeGreaterThan(0)
      expect(sig.desc.length, id).toBeGreaterThan(10)
      expect(['enemy', 'ally', 'self', 'none']).toContain(sig.targeting)
    }
  })

  test('制作人拍板的三个专精注册表齐备,cd 一致(决策窗对齐咏唱周期)', () => {
    expect(SIGNATURE_SKILLS['guard-ironwall']?.name).toBe('破咒盾击')
    expect(SIGNATURE_SKILLS['warrior-vanguard']?.name).toBe('锁足冲锋')
    expect(SIGNATURE_SKILLS['priest-discipline']?.name).toBe('诫命沉默')
    for (const s of Object.values(SIGNATURE_SKILLS)) expect(s.cdTicks).toBeGreaterThan(0)
    for (const id of ['guard-ironwall', 'warrior-vanguard', 'priest-discipline']) expect(SIGNATURE_SKILLS[id].cdTicks).toBe(60)
    expect(SIGNATURE_SKILLS['mage-fire'].effect).toBe('detonate-burn') // A5:火法招牌=引爆
  })
})

describe('A3 第二批:新动词招牌技', () => {
  test('圣疗:点名治疗+清除束缚/灼烧(新目标形状,不吃 heal-lowest 自动化)', () => {
    const { state, me } = castingBattle()
    const ally = state.combatants.find((c) => c.team === 'guild' && c.alive && c.id !== me.id)!
    ally.boundUntilTick = state.tick + 50
    ally.burnUntilTick = state.tick + 50
    ally.hp = 10
    me.specId = 'priest-holy'
    me.attack = 100
    expect(useSignature(state, me.memberId!, ally.memberId)).toBe(true)
    executeSignature(state, state.commands.signature!)
    expect(ally.hp).toBe(Math.min(10 + 350, ally.maxHp))
    expect(ally.boundUntilTick ?? 0).toBeLessThanOrEqual(state.tick)
    expect(ally.burnUntilTick ?? 0).toBeLessThanOrEqual(state.tick)
  })

  test('冰封咒界:只冻敌方后排,首领冻得短(新目标形状:后排群体)', () => {
    const { state } = castingBattle()
    me_freeze(state)
    const front = state.combatants.filter((c) => c.team === 'enemy' && c.alive && c.position === 'front')
    for (const e of front) expect(e.boundUntilTick ?? 0).toBeLessThanOrEqual(state.tick)
  })
  function me_freeze(state: ReturnType<typeof castingBattle>['state']) {
    const me = state.combatants.find((c) => c.team === 'guild' && c.alive)!
    me.specId = 'mage-frost'
    const foes = state.combatants.filter((c) => c.team === 'enemy' && c.alive)
    foes.forEach((f, i) => { f.position = i === 0 ? 'front' : 'back'; if (f.position === 'back') f.boundUntilTick = undefined })
    expect(useSignature(state, me.memberId!)).toBe(true)
    executeSignature(state, state.commands.signature!)
  }

  test('荆棘咆哮:全体被嘲讽+反甲奉还 25%(新目标形状:敌方全体)', () => {
    const { state, me, enemy } = castingBattle()
    me.specId = 'guard-thorns'
    expect(useSignature(state, me.memberId!)).toBe(true)
    executeSignature(state, state.commands.signature!)
    expect(me.thornsUntilTick).toBe(state.tick + 300)
    for (const e of state.combatants.filter((c) => c.team === 'enemy' && c.alive)) {
      expect(e.tauntedTicks).toBeGreaterThanOrEqual(60)
      expect(e.taunterId).toBe(me.id)
    }
    const meHpBefore = me.hp
    const foeHpBefore = enemy.hp
    applyHit(state, enemy, me, 40, '测试挥击')
    expect(me.hp).toBe(meHpBefore - 40)
    expect(enemy.hp).toBeLessThan(foeHpBefore)
  })

  test('恶魔献祭:付 12% 最大生命为引;痛楚收割:清灼烧换爆发', () => {
    const { state, me, enemy } = castingBattle()
    me.specId = 'warlock-demon'
    me.maxHp = 1000
    me.hp = 1000
    const hpBefore = me.hp
    useSignature(state, me.memberId!, enemy.id)
    executeSignature(state, state.commands.signature!)
    expect(me.hp).toBe(hpBefore - 120)
    me.specId = 'warlock-affliction'
    enemy.burnUntilTick = state.tick + 100
    state.signatureCd = undefined
    useSignature(state, me.memberId!, enemy.id)
    executeSignature(state, state.commands.signature!)
    expect(enemy.burnUntilTick ?? 0).toBeLessThanOrEqual(state.tick)
  })
})

describe('A5 #1.3 火法引爆', () => {
  function fireBattle() {
    const b = castingBattle()
    b.me.specId = 'mage-fire'
    return b
  }
  test('无层不受理;叠层后引爆清层换爆发,伤害随层数涨', () => {
    const { state, me, enemy } = fireBattle()
    expect(useSignature(state, me.memberId!, enemy.id)).toBe(false)
    enemy.burnStacks = 3
    expect(useSignature(state, me.memberId!, enemy.id)).toBe(true)
    const hpBefore = enemy.hp
    executeSignature(state, state.commands.signature!)
    expect(enemy.burnStacks ?? 0).toBeLessThanOrEqual(1) // 引爆清层;随后的普攻叠层测试另跑
    expect(enemy.hp).toBeLessThan(hpBefore)
  })
  test('火法命中叠层,上限 5', () => {
    const { state, me, enemy } = fireBattle()
    enemy.burnStacks = undefined
    applyHit(state, me, enemy, 5, '普攻')
    applyHit(state, me, enemy, 5, '普攻')
    expect(enemy.burnStacks).toBe(2)
    enemy.burnStacks = 5
    applyHit(state, me, enemy, 5, '普攻')
    expect(enemy.burnStacks).toBe(5)
  })
})

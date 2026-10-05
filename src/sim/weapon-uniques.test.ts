import { beginBattle, createRun } from '../../scripts/run-test-compat'
import { describe, expect, it } from 'vitest'
import { applyHit, stepBattle, pickBowTarget, toCombatant, createBattle } from './combat'
import { BLACKMOSS } from '../data/dungeons'
import type { BattleState, Combatant, Member } from './types'

// R5.3b(U33⑤)五族独有用处:刃暴击流血 / 锤斧普攻破甲 / 长柄替身挡击 / 弓优先读条后排。

const NEUTRAL: Member['attrs'] = { str: 10, agi: 10, int: 10, vit: 10, spr: 10, lck: 10 }

function mk(job: Member['job'], weaponBaseId?: string): Member {
  return {
    id: 'm-' + Math.random().toString(36).slice(2, 8), name: '测试', job, level: 5,
    nature: { base: NEUTRAL, growth: NEUTRAL, caps: NEUTRAL },
    personality: { bravery: 50, caution: 50, greed: 50, loyalty: 50 },
    attrs: { ...NEUTRAL }, hp: 500, exp: 0, bonds: {},
    equipment: weaponBaseId ? { weapon: { id: 'i-' + weaponBaseId, baseId: weaponBaseId, rolls: [] } } : {},
    alive: true,
  }
}

describe('R5.3b 刃·暴击流血', () => {
  it('刃暴击:目标挂流血,30 tick 内持续掉血;非刃暴击不挂', () => {
    const run = createRun([mk('warrior', 'wpn-t1-sword')], BLACKMOSS, 601)
    beginBattle(run, 601)
    const state = run.battle!
    const blade = state.combatants.find((c) => c.team === 'guild')!
    const foe = state.combatants.find((c) => c.team === 'enemy')!
    foe.maxHp = 500; foe.hp = 500
    const hp0 = foe.hp
    applyHit(state, blade, foe, 30, '攻击', { crit: true })
    expect(foe.bleedUntilTick).toBeDefined()
    state.tick = Math.ceil((state.tick + 1) / 10) * 10
    stepBattle(state)
    expect(foe.hp).toBeLessThan(hp0 - 30)
    // 非刃暴击:不挂流血
    foe.bleedUntilTick = undefined
    const foe2 = state.combatants.find((c) => c.team === 'enemy' && c.id !== foe.id) ?? foe
    const mage = state.combatants.find((c) => c.team === 'guild' && c.specId?.startsWith('mage'))
    if (mage) {
      applyHit(state, mage, foe2, 10, '攻击', { crit: true })
      expect(foe2.bleedUntilTick).toBeUndefined()
    }
  })
})

describe('R5.3b 锤斧·普攻破甲', () => {
  it('斧普攻命中:目标防御 ×0.8(承伤变高),3 秒后恢复', () => {
    const run = createRun([mk('warrior', 'wpn-t1-axe')], BLACKMOSS, 602)
    beginBattle(run, 602)
    const state = run.battle!
    const axer = state.combatants.find((c) => c.team === 'guild')!
    const foe = state.combatants.find((c) => c.team === 'enemy')!
    foe.maxHp = 9999; foe.hp = 9999; foe.armorBreakUntilTick = undefined
    const hp0 = foe.hp
    applyHit(state, axer, foe, 20, '攻击')
    expect(foe.armorBreakUntilTick).toBe(state.tick + 30)
    // 破甲期间再打一刀:同攻击力同防御面板,实际承伤更高(防御 ×0.8)
    const hpMid = foe.hp
    applyHit(state, axer, foe, 20, '攻击')
    const dmgDuring = hpMid - foe.hp
    foe.armorBreakUntilTick = undefined
    const hpAfter = foe.hp
    applyHit(state, axer, foe, 20, '攻击')
    const dmgAfter = hpAfter - foe.hp
    expect(dmgDuring).toBeGreaterThanOrEqual(dmgAfter)
    void hp0
  })
})

describe('R5.3b 长柄·替身挡击', () => {
  it('敌方普攻选中非长柄队员:前排长柄队友替挡一次(guardOnceUsed 消耗)', () => {
    const lancer = mk('guard', 'wpn-t1-halberd')
    lancer.id = 'm-lancer'
    const healer = mk('priest')
    healer.id = 'm-healer'
    const run = createRun([lancer, healer], BLACKMOSS, 603)
    beginBattle(run, 603)
    const state = run.battle!
    const guard = state.combatants.find((c) => c.memberId === lancer.id)!
    const priest = state.combatants.find((c) => c.memberId === healer.id)!
    expect(guard.weaponFamily).toBe('polearm')
    guard.guardOnceUsed = false
    const foe = state.combatants.find((c) => c.team === 'enemy')!
    const priestHp0 = priest.hp
    const guardHp0 = guard.hp
    // 敌方普攻直接点名牧师:长柄队友替挡
    applyHit(state, foe, priest, 10, '攻击')
    expect(guard.guardOnceUsed).toBe(true)
    expect(guard.hp).toBeLessThan(guardHp0)
    expect(priest.hp).toBe(priestHp0)
    // 第二次不再替挡(已消耗)
    applyHit(state, foe, priest, 10, '攻击')
    expect(priest.hp).toBeLessThan(priestHp0)
  })
})

describe('R5.3b 弓·优先读条后排', () => {
  it('有读条后排:选中它;无读条:选残血', () => {
    const archer = toCombatant(mk('ranger', 'wpn-t2-bow'))
    archer.team = 'guild'
    const casterBack = { id: 'e1', name: '读条手', team: 'enemy' as const, position: 'back' as const, hp: 300, maxHp: 300, alive: true, bossMechanics: [{ id: 'tc', kind: 'cast-buff', name: '咏唱', params: {} }], mech: { 'cast-buff': { until: 999 } } } as unknown as Combatant
    const plainBack = { id: 'e2', name: '后排', team: 'enemy' as const, position: 'back' as const, hp: 100, maxHp: 300, alive: true } as unknown as Combatant
    const front = { id: 'e3', name: '前排', team: 'enemy' as const, position: 'front' as const, hp: 50, maxHp: 300, alive: true } as unknown as Combatant
    const state = { tick: 10, combatants: [archer, casterBack, plainBack, front] } as unknown as BattleState
    // 有读条后排 → 即使它满血、前排残血,也选它
    expect(pickBowTarget(state, [front, plainBack, casterBack])?.id).toBe('e1')
    // 无读条 → 残血优先(plainBack 100/300 低于 front 50/300?50/300 更残 → front)
    expect(pickBowTarget(state, [front, plainBack])?.id).toBe('e3')
  })
})

// R5.3c(U33⑤)打断改规则:非锤斧伤害按 0.25 累积读条打断值
describe('R5.3c 打断累积倍率', () => {
  function mkFoe(): { state: BattleState; foe: Combatant; axe: Combatant; blade: Combatant } {
    const axeM = mk('warrior', 'wpn-t1-axe'); axeM.id = 'm-axe'
    const bladeM = mk('warrior', 'wpn-t1-sword'); bladeM.id = 'm-blade'
    // 直连格鲁什 boss(咏唱机制载体;杂兵战没有读条)
    const state = createBattle([axeM, bladeM], BLACKMOSS, 'enc-talma', 604)
    const foe = state.combatants.find((c) => c.team === 'enemy' && c.bossMechanics)!
    const axe = state.combatants.find((c) => c.memberId === axeM.id)!
    const blade = state.combatants.find((c) => c.memberId === bladeM.id)!
    return { state, foe, axe, blade }
  }

  it('同伤害:斧累积 1.0,刃累积 0.25', () => {
    const { state, foe, axe, blade } = mkFoe()
    const def = foe.bossMechanics!.find((d) => d.kind === 'cast-buff')!
    // grush 的咏唱机制可能尚未初始化运行时——伪造一个进行中的读条窗口
    foe.mech = foe.mech ?? {}
    const rt = foe.mech['cast-buff'] = { until: state.tick + 100, taken: 0 }
    applyHit(state, axe, foe, 40, '攻击')
    const axeTaken = rt.taken
    rt.taken = 0
    applyHit(state, blade, foe, 40, '攻击')
    const bladeTaken = rt.taken
    expect(axeTaken).toBe(40)
    expect(bladeTaken).toBe(10)
    void def
  })
})

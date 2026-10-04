import { describe, expect, it } from 'vitest'
import { toCombatant, createBattle, stepBattle } from './combat'
import { BLACKMOSS } from '../data/dungeons'
import type { Member } from './types'

// R3/W4 验收:五族攻击方式——武器决定站位与攻击方式;
// 弓/杖(施法)/长柄可打后排(经 allowedPool 单一路径);锤斧慢而重;不谙法术者抡杖(施法铁律)。

const NEUTRAL: Member['attrs'] = { str: 10, agi: 10, int: 10, vit: 10, spr: 10, lck: 10 }

function mkMember(job: Member['job'], weaponBaseId?: string): Member {
  return {
    id: 'm1', name: '测试', job, level: 5,
    nature: { base: NEUTRAL, growth: NEUTRAL, caps: NEUTRAL },
    personality: { bravery: 50, caution: 50, greed: 50, loyalty: 50 },
    attrs: { ...NEUTRAL },
    hp: 100, exp: 0, bonds: {},
    equipment: weaponBaseId ? { weapon: { id: 'i1', baseId: weaponBaseId, rolls: [] } } : {},
    alive: true,
  }
}

describe('站位与攻击方式由武器决定(R3/W4)', () => {
  it('刃=前排近战;游侠拿刃也会站到前排(过段条件①)', () => {
    expect(toCombatant(mkMember('warrior', 'wpn-t1-sword')).position).toBe('front')
    const rangerBlade = toCombatant(mkMember('ranger', 'wpn-t1-dagger'))
    expect(rangerBlade.position).toBe('front')
    expect(rangerBlade.range).toBe('melee')
  })

  it('弓=后排射击', () => {
    const c = toCombatant(mkMember('ranger', 'wpn-t2-bow'))
    expect(c.position).toBe('back')
    expect(c.range).toBe('ranged')
  })

  it('杖圣器:施法职业后排法弹;物理职业前排抡(施法铁律,过段条件②)', () => {
    const mage = toCombatant(mkMember('mage', 'wpn-t2-staff'))
    expect(mage.position).toBe('back')
    expect(mage.range).toBe('ranged')
    const warrior = toCombatant(mkMember('warrior', 'wpn-t2-staff'))
    expect(warrior.position).toBe('front')
    expect(warrior.range).toBe('melee')
  })

  it('长柄=前排站立+越线打后排(伤 ×0.92 结构占位)', () => {
    const c = toCombatant(mkMember('guard', 'wpn-t1-halberd'))
    expect(c.position).toBe('front')
    expect(c.range).toBe('ranged')
    expect(c.weaponDmgMult).toBeCloseTo(0.92)
  })

  it('锤斧=前排近战,出手 ×1.25 慢、普攻 ×1.15 重(C4 占位)', () => {
    const axe = toCombatant(mkMember('warrior', 'wpn-t1-axe'))
    expect(axe.position).toBe('front')
    expect(axe.range).toBe('melee')
    expect(axe.weaponDmgMult).toBeCloseTo(1.15)
    // 默认专精 warrior-weapons 的 statMods.speed=-1:speed=8-1+敏捷×0.04=7.4
    const speed = 8 - 1 + 10 * 0.04
    expect(axe.attackInterval).toBe(Math.max(6, Math.round((60 / speed) * 1.25)))
    expect(axe.attackInterval).toBe(Math.max(6, Math.round(60 / speed)) + 2)
  })

  it('空手沿用职业站位(行为零变)', () => {
    const ranger = toCombatant(mkMember('ranger'))
    expect(ranger.position).toBe('back')
    expect(ranger.range).toBe('ranged')
    expect(ranger.weaponDmgMult).toBeUndefined()
  })
})

describe('长柄越线打后排(实战单测)', () => {
  it('持长柄者集火后排萨满:前排蛙人还活着时,萨满就已经掉血', () => {
    const lancer = mkMember('guard', 'wpn-t2-tidebreak')
    lancer.level = 8
    lancer.hp = 9999
    const state = createBattle([lancer], BLACKMOSS, 'enc-frogs', 4242)
    const shaman = state.combatants.find((c) => c.team === 'enemy' && c.position === 'back')
    expect(shaman, 'enc-frogs 应有后排单位').toBeTruthy()
    // 集火后排:guild 侧目标选择优先 focusId
    state.commands.focusId = shaman!.id
    let sawReachHit = false
    for (let i = 0; i < 600 && state.status === 'running'; i++) {
      stepBattle(state)
      const sh = state.combatants.find((c) => c.name === '蛙人萨满')
      const frontAlive = state.combatants.some((c) => c.team === 'enemy' && c.alive && c.position === 'front')
      if (sh && sh.hp < sh.maxHp && frontAlive) { sawReachHit = true; break }
    }
    expect(sawReachHit, '长柄应越过存活前排打到后排').toBe(true)
  })
})

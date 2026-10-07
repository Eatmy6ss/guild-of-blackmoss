import { describe, expect, it } from 'vitest'
import { AFFIXES } from '../data/affixes'
import { ITEM_BASES } from '../data/items'
import { createBattle, stepBattle, applyHit } from './combat'
import { BLACKMOSS } from '../data/dungeons'
import { generateMember } from './gen'
import type { Combatant, Member, StatKey } from './types'

// 名号去重会继续消费生成 RNG，因此先生成模板再克隆，不能重复调用生成器冒充同一个人。
const TEMPLATES = {
  ranger: generateMember('ranger', 6, 310071),
  priest: generateMember('priest', 6, 310073),
  ally: generateMember('priest', 6, 310072),
}

// 同基底、同角色、同种子，仅词条变化。通过实际行为验收，不靠整场胜负猜测接线。
function probe(equipment: Member['equipment'] = {}, healer = false) {
  const member = structuredClone(healer ? TEMPLATES.priest : TEMPLATES.ranger)
  member.spec = undefined
  member.equipment = equipment
  const allyMember = structuredClone(TEMPLATES.ally)
  allyMember.spec = undefined
  allyMember.equipment = {}
  const state = createBattle([member, allyMember], BLACKMOSS, 'enc-wolves', 71)
  const host = state.combatants.find(c => c.memberId === member.id)!
  const ally = state.combatants.find(c => c.memberId === allyMember.id)!
  const enemy = state.combatants.find(c => c.team === 'enemy')!
  state.combatants = [host, ally, enemy]
  for (const c of state.combatants) {
    c.hp = c.maxHp
    c.cooldownLeft = 1000000
    for (const skill of c.skills) skill.cooldownLeft = 1000000
  }
  enemy.hp = enemy.maxHp = 1000000
  enemy.defense = 20
  enemy.traits = []
  return { state, host, ally, enemy }
}
type Probe = ReturnType<typeof probe>

function attack(p: Probe, attacker = p.host) {
  attacker.skills = []
  attacker.cooldownLeft = 0
  stepBattle(p.state)
  const event = [...p.state.events].reverse().find(e => e.type === 'damage' && e.attackerId === attacker.id)
  expect(event, '场景必须实际命中').toBeDefined()
  return event!.amount!
}

function healing(p: Probe, source: Combatant, target: Combatant) {
  const skill = source.skills.find(s => s.def.effect === 'heal-lowest')!
  expect(skill, '场景必须有真实治疗技能').toBeDefined()
  source.skills = [skill]
  skill.cooldownLeft = 0
  source.cooldownLeft = 0
  target.maxHp = 10000
  target.hp = 1
  stepBattle(p.state)
  const event = p.state.events.find(e => e.type === 'heal' && e.attackerId === source.id && e.targetId === target.id)
  expect(event, '场景必须实际治疗缺血目标').toBeDefined()
  return event!.amount!
}

function crits(p: Probe) {
  for (let i = 0; i < 160; i++) attack(p)
  return p.state.events.filter(e => e.type === 'damage' && e.attackerId === p.host.id && e.crit).length
}

// Record 要求新增 StatKey 同时登记相关行为场景；不是只检查属性已投影到 Combatant。
const CASES: Record<StatKey, { lower?: boolean; healer?: boolean; measure: (p: Probe) => number }> = {
  attack: { measure: p => attack(p) },
  maxHp: { measure: p => { applyHit(p.state, p.enemy, p.host, 40, '测试命中'); return p.host.hp } },
  defense: { lower: true, measure: p => { p.enemy.attack = 100; p.enemy.critChance = 0; return attack(p, p.enemy) } },
  speed: { measure: p => {
    p.host.skills = []
    p.host.cooldownLeft = 0
    for (let i = 0; i < 300; i++) stepBattle(p.state)
    return p.state.events.filter(e => e.type === 'damage' && e.attackerId === p.host.id).length
  } },
  critChance: { measure: crits },
  lifesteal: { measure: p => { p.host.hp = 1; applyHit(p.state, p.host, p.enemy, 100, '测试命中'); return p.host.hp } },
  healReceived: { measure: p => healing(p, p.ally, p.host) },
  fireResist: { lower: true, measure: p => {
    const before = p.host.hp
    p.state.envHeat = { damage: 100, everyTicks: 10, next: 1 }
    stepBattle(p.state)
    return before - p.host.hp
  } },
  critDamage: { measure: p => { p.host.critChance = 1; return attack(p) } },
  attackSpeed: { measure: p => CASES.speed.measure(p) },
  armorPen: { measure: p => attack(p) },
  damageReduction: { lower: true, measure: p => {
    const before = p.host.hp
    applyHit(p.state, p.enemy, p.host, 100, '测试命中')
    return before - p.host.hp
  } },
  healPower: { healer: true, measure: p => healing(p, p.host, p.ally) },
  threatMult: { measure: p => {
    applyHit(p.state, p.host, p.enemy, 100, '测试命中')
    return p.enemy.threat[p.host.id]
  } },
  cdReduction: { healer: true, lower: true, measure: p => {
    healing(p, p.host, p.ally)
    return p.host.skills[0].cooldownLeft
  } },
}

describe('I8 属性接线：单变量行为探针', () => {
  for (const key of Object.keys(CASES) as StatKey[]) {
    it(`${key} 的装备词条改变对应行为`, () => {
      const aff = Object.values(AFFIXES).find(a => !a.trigger && a.stat === key)!
      expect(aff, `${key} 缺少属性词条`).toBeDefined()
      expect(aff.pools.length).toBeGreaterThan(0)
      const c = CASES[key]
      const equipment: Member['equipment'] = {
        armor: { id: 'probe-armor', baseId: 'arm-t1-mail', quality: 'green', rolls: [] },
      }
      const base = probe(equipment, c.healer)
      const changed = structuredClone(equipment)
      changed.armor!.rolls = [{ affixId: aff.id, value: aff.tiers[aff.tiers.length - 1].range[1] }]
      const enhanced = probe(changed, c.healer)
      const before = c.measure(base)
      const after = c.measure(enhanced)
      if (c.lower) expect(after).toBeLessThan(before)
      else expect(after).toBeGreaterThan(before)
    })
  }
})

describe('I8 套装接线：同装备，仅套装身份变化', () => {
  for (const setName of ['gray-crown', 'wind-hunt'] as const) {
    it(`${setName} 两件套在保留相同基底和威能时生效`, () => {
      const bases = Object.values(ITEM_BASES).filter(b => b.setName === setName)
        .filter((b, i, all) => all.findIndex(x => x.slot === b.slot) === i).slice(0, 2)
      expect(bases).toHaveLength(2)
      const equipment: Member['equipment'] = {}
      for (const b of bases) equipment[b.slot] = { id: `set-${b.slot}`, baseId: b.id, quality: 'white', rolls: [] }
      const enabled = probe(equipment)
      // 仅在创建对照战斗时移除套装归属。基底、槽位、威能、品质均保持，立即还原注册表。
      let disabled: Probe
      try {
        for (const b of bases) delete b.setName
        disabled = probe(equipment)
      } finally {
        for (const b of bases) b.setName = setName
      }
      if (setName === 'gray-crown') {
        expect(enabled.host.setCrown).toBe(2)
        expect(disabled.host.setCrown).toBe(0)
        expect(attack(enabled)).toBeGreaterThan(attack(disabled))
      } else {
        expect(enabled.host.setHunt).toBe(2)
        expect(disabled.host.setHunt).toBe(0)
        expect(crits(enabled)).toBeGreaterThan(crits(disabled))
      }
    })
  }
})

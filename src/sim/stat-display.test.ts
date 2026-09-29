import { expect, test } from 'vitest'
import { createBattle, statLayers, stepBattle, toCombatant } from './combat'
import { generateMember } from './gen'
import { describeItem, equipmentStats, formatStat, STAT_FORMAT, STAT_NAME } from './loot'
import { describeEquipmentSet, equipmentSetBonus } from './equipment-sets'
import { BLACKMOSS } from '../data/dungeons'
import { ITEM_BASES } from '../data/items'
import type { ItemInstance, StatKey } from './types'

test('装备分层包含火抗和攻速，数值精度与物品说明一致', () => {
  const member = generateMember('priest', 1, 704, { race: 'human' })
  const item: ItemInstance = { id: 'display', baseId: 'arm-t3-drake', rolls: [
    { affixId: 'aff-def', value: 6.56 }, { affixId: 'aff-spd', value: 2.4 },
  ] }
  member.equipment = { armor: item }
  const equipment = statLayers(member).find(layer => layer.label === '装备')!.text
  expect(equipment).toContain('火抗 25%')
  expect(equipment).toContain('攻速 2.4')
  expect(equipment).toContain('防御 6.6')
  expect(describeItem(item)).toContain('加固+6.6')
})

test('I5：所有 StatKey 单位完整，正负与零值遵循统一精度', () => {
  const percent = new Set<StatKey>(['critChance', 'lifesteal', 'healReceived', 'fireResist'])
  expect(Object.keys(STAT_FORMAT).sort()).toEqual(Object.keys(STAT_NAME).sort())
  for (const stat of Object.keys(STAT_NAME) as StatKey[]) {
    expect(formatStat(stat, 0.125, true)).toBe(percent.has(stat) ? '+12.5%' : '+0.1')
    expect(formatStat(stat, -0.125, true)).toBe(percent.has(stat) ? '-12.5%' : '-0.1')
    expect(formatStat(stat, -0.00001, true)).toBe(percent.has(stat) ? '0%' : '0')
    expect(formatStat(stat, 0, true)).toBe(percent.has(stat) ? '0%' : '0')
  }
})

test('性格、种族与装备的百分比共用规则，精度变化不修改成员或战斗属性', () => {
  const member = generateMember('priest', 1, 709, { race: 'bloodelf' })
  member.personality = { bravery: 51, caution: 49, greed: 55, loyalty: 45 }
  const before = structuredClone(member)
  const projected = toCombatant(member)
  const layers = statLayers(member)
  expect(layers.find(l => l.label === '性格·勇猛')?.text).toBe('+0.1% 攻击')
  expect(layers.find(l => l.label === '性格·谨慎')?.text).toBe('-0.2% 防御')
  expect(layers.find(l => l.label === '性格·贪婪')?.text).toBe('+0.3% 暴击')
  expect(layers.find(l => l.label === '性格·忠诚')?.text).toBe('-0.6% 受疗')
  expect(layers.find(l => l.label.startsWith('种族·'))?.text).toContain('%')
  expect(member).toEqual(before)
  expect({ ...toCombatant(member), id: projected.id }).toEqual(projected)
})

test('套装说明与实际暴击、普攻收益一致；零/一件不激活，三件封顶', () => {
  const member = generateMember('ranger', 1, 708, { race: 'human' })
  const hunt = Object.values(ITEM_BASES).filter(base => base.setName === 'wind-hunt')
  const slots = ['weapon', 'armor', 'trinket'] as const
  const baselineCrit = toCombatant(member).critChance
  for (let count = 0; count <= 3; count++) {
    member.equipment = {}
    for (const slot of slots.slice(0, count)) {
      const base = hunt.find(item => item.slot === slot)!
      member.equipment[slot] = { id: `set-${slot}`, baseId: base.id, rolls: [] }
    }
    // 扣除装备自身暴击（猎风饰品也有暴击基础盘），剩余才是套装收益。
    expect(toCombatant(member).critChance - baselineCrit - (equipmentStats(member.equipment).critChance ?? 0))
      .toBeCloseTo(equipmentSetBonus('wind-hunt', count))
    const description = describeEquipmentSet('wind-hunt', count)
    if (count === 0) expect(description).toBe('')
    else if (count === 1) expect(description).not.toContain('%')
    else expect(description).toContain(formatStat('critChance', equipmentSetBonus('wind-hunt', count), true))
  }
  for (const id of ['gray-crown', 'wind-hunt'] as const) {
    expect(equipmentSetBonus(id, 1)).toBe(0)
    expect(equipmentSetBonus(id, 2)).toBeGreaterThan(0)
    expect(equipmentSetBonus(id, 3)).toBeGreaterThan(equipmentSetBonus(id, 2))
    expect(equipmentSetBonus(id, 4)).toBe(equipmentSetBonus(id, 3))
  }
  // 走真实普攻，隔离其他乘区，用同随机种子比较灰冠伤害。
  function attackDamage(count: number) {
    const battle = createBattle([member], BLACKMOSS, BLACKMOSS.encounters[0].id, 708)
    const attacker = battle.combatants.find(c => c.team === 'guild')!
    attacker.skills = []
    attacker.attack = 10000
    attacker.critChance = 0
    attacker.synergyIds = []
    attacker.setCrown = count
    attacker.legacyFocus = false
    attacker.legacyElitewarden = false
    for (const enemy of battle.combatants.filter(c => c.team === 'enemy')) {
      enemy.hp = enemy.maxHp = 1000000
      enemy.defense = 0
      enemy.cooldownLeft = 1000
      enemy.bossMechanics = undefined
    }
    stepBattle(battle)
    return battle.events.find(e => e.type === 'damage' && e.attackerId === attacker.id)!.amount!
  }
  const baseDamage = attackDamage(0)
  expect(baseDamage).toBeGreaterThan(0)
  expect(attackDamage(1)).toBe(baseDamage)
  for (const count of [2, 3]) {
    expect(Math.abs(attackDamage(count) - baseDamage * (1 + equipmentSetBonus('gray-crown', count)))).toBeLessThanOrEqual(1)
    expect(describeEquipmentSet('gray-crown', count)).toContain(`${equipmentSetBonus('gray-crown', count) * 100}%`)
  }
})

test('负词条说明不出现双符号，受疗基础与词条都显示百分比', () => {
  const text = describeItem({ id: 'signed', baseId: 'wpn-t2-staff', rolls: [{ affixId: 'aff-heal', value: -0.125 }] })
  expect(text).toContain('受疗+6%')
  expect(text).toContain('受疗-12.5%')
  expect(text).not.toContain('+-')
})

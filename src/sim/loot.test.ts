import { describe, expect, it } from 'vitest'
import { AFFIXES } from '../data/affixes'
import { ITEM_BASES } from '../data/items'
import { exportSave, importSave, migrate } from '../state/save'
import { itemStateFromSave, addInventoryItems, serializeGuildItems, resolveMembers } from '../state/item-registry'
import { toCombatant } from './combat'
import { generateMember } from './gen'
import { createLootRng, describeItem, equipmentStats, itemStats, rollAffixes, rollBossDrops, rollDrop, rollWaveDrop } from './loot'
import type { AffixBudget } from './loot'
import type { ItemInstance } from './types'

function scripted(...values: number[]): () => number {
  return () => {
    const value = values.shift()
    if (value === undefined) throw new Error('意外消耗随机数')
    return value
  }
}

const pool = Object.values(AFFIXES)
const budget: AffixBudget = { count: [2, 3], tierScale: 2.1, qualityScale: 1.25, bonusChance: 0.6 }

describe('词条预算', () => {
  it('T3 紫装追加词条继承相同的阶级和品质预算，并在完整区间抽样（B04）', () => {
    // 普通攻击/生命均抽下限；追加防御抽上半区，应该高于同预算下限 2.63。
    const item = rollDrop('wpn-t3-dawn', scripted(0, 0, 0, 0, 0, 0, 0, 0, 0.5))
    expect(item.quality).toBe('purple')
    expect(item.rolls).toEqual([
      { affixId: 'aff-atk', value: 5.25 },
      { affixId: 'aff-hp', value: 26.25 },
      { affixId: 'aff-def', value: 6.56 },
    ])
    expect(describeItem(item)).toContain('加固+6.6')
  })

  it('I4：相同预算、词条和抽样下，普通与追加路径逐项相同', () => {
    for (const affix of pool) {
      for (const tierScale of [1, 1.5, 2.1, 2.8]) {
        for (const qualityScale of [0.9, 1.08, 1.25]) {
          for (const valueDraw of [0, 0.137, 0.5, 0.999999]) {
            const sameBudget: AffixBudget = { count: [0, 1], tierScale, qualityScale, bonusChance: 0.6 }
            const ordinary = rollAffixes(sameBudget, [affix], scripted(0.99, 0, valueDraw))
            const bonus = rollAffixes(sameBudget, [affix], scripted(0, 0, 0, valueDraw))
            expect(ordinary).toHaveLength(1)
            expect(bonus, `${affix.id}/${tierScale}/${qualityScale}/${valueDraw}`).toEqual(ordinary)
          }
        }
      }
    }
    // 当前没有 T4 实物；预算接口仍需按既定 2.8 倍处理，不沿用旧追加分支的 1.5。
    expect(rollAffixes({ ...budget, count: [0, 1], tierScale: 2.8 }, [AFFIXES['aff-def']], scripted(0, 0, 0, 0.5)))
      .toEqual([{ affixId: 'aff-def', value: 8.75 }])
  })

  it('追加保留 60% 边界、最多一条、不超过基底上限，池不足也不会重复', () => {
    expect(rollAffixes(budget, pool, scripted(0, 0, 0, 0, 0, 0.6))).toHaveLength(2)
    const added = rollAffixes(budget, pool, scripted(0, 0, 0, 0, 0, 0.599999, 0, 0))
    expect(added).toHaveLength(3)
    expect(new Set(added.map(r => r.affixId)).size).toBe(3)
    expect(rollAffixes(budget, pool, scripted(0.99, 0, 0, 0, 0, 0, 0))).toHaveLength(3)
    expect(rollAffixes({ ...budget, count: [2, 2] }, pool, scripted(0, 0, 0, 0, 0))).toHaveLength(2)
    expect(rollAffixes(budget, [pool[0]], () => 0)).toHaveLength(1)
    expect(rollAffixes(budget, [], () => 0)).toEqual([])
    expect(rollAffixes({ ...budget, count: [0, 0] }, pool, scripted(0))).toEqual([])
  })

  it('所有实际基底和品质的词条落在预算区间内，生成不修改定义', () => {
    const basesBefore = structuredClone(ITEM_BASES)
    const affixesBefore = structuredClone(AFFIXES)
    const scales: Record<number, number> = { 1: 1, 2: 1.5, 3: 2.1, 4: 2.8 }
    const round2 = (n: number) => Math.round(n * 100) / 100
    for (const base of Object.values(ITEM_BASES)) {
      for (const [qualityDraw, multiplier] of [[0.9, 0.9], [0.3, 1.08], [0.01, 1.25]]) {
        for (let seed = 1; seed <= 12; seed++) {
          const source = createLootRng(seed)
          let first = true
          const item = rollDrop(base.id, () => {
            if (!first) return source()
            first = false
            return qualityDraw
          })
          expect(item.rolls.length).toBeGreaterThanOrEqual(base.affixCount[0])
          expect(item.rolls.length).toBeLessThanOrEqual(base.affixCount[1])
          expect(new Set(item.rolls.map(r => r.affixId)).size).toBe(item.rolls.length)
          for (const roll of item.rolls) {
            const [lo, hi] = AFFIXES[roll.affixId].range
            expect(roll.value).toBeGreaterThanOrEqual(round2(round2(lo * scales[base.tier]) * multiplier))
            expect(roll.value).toBeLessThanOrEqual(round2(round2(hi * scales[base.tier]) * multiplier))
          }
        }
      }
    }
    expect(ITEM_BASES).toEqual(basesBefore)
    expect(AFFIXES).toEqual(affixesBefore)
  })

  it('品质分界、保底和品质偏置仍由掉落入口决定，普通词条保留两阶段精度', () => {
    const dropAt = (qualityDraw: number, opts?: Parameters<typeof rollDrop>[2]) => {
      // 固定两条的基底，不触发追加；0.137 检查先阶级取整、再品质取整。
      return rollDrop('trk-t2-totem', scripted(qualityDraw, 0, 0, 0.137, 0, 0.137), opts)
    }
    expect(dropAt(0.119999).quality).toBe('purple')
    expect(dropAt(0.12).quality).toBe('green')
    expect(dropAt(0.499999).quality).toBe('green')
    expect(dropAt(0.5).quality).toBe('white')
    expect(dropAt(0.9, { minQuality: 'green' }).quality).toBe('green')
    expect(dropAt(0.9, { minQuality: 'purple' }).quality).toBe('purple')
    expect(dropAt(0.15, { qualityBias: 0.05 }).quality).toBe('purple')
    expect(dropAt(0.15, { qualityBias: -0.05 }).quality).toBe('green')
    expect(dropAt(0.9).rolls).toEqual([{ affixId: 'aff-atk', value: 3.44 }, { affixId: 'aff-hp', value: 17.2 }])
    expect(dropAt(0.3).rolls).toEqual([{ affixId: 'aff-atk', value: 4.13 }, { affixId: 'aff-hp', value: 20.64 }])
    // 63e29e3 的实际输出：浮点下 3.82 × 1.25 的两阶段取整为 4.77，兼容保留。
    expect(dropAt(0.01).rolls).toEqual([{ affixId: 'aff-atk', value: 4.77 }, { affixId: 'aff-hp', value: 23.89 }])
  })

  it('真实杂兵掉落使用修复后的追加预算，Boss 保底使用同一生成入口', () => {
    const wave = rollWaveDrop('emberpass', () => 0)!
    expect(wave.baseId).toBe('arm-t3-drake')
    expect(wave.rolls).toEqual([
      { affixId: 'aff-atk', value: 5.25 },
      { affixId: 'aff-hp', value: 26.25 },
      { affixId: 'aff-def', value: 2.63 },
    ])
    const options = { minQuality: 'purple' as const, pity: true }
    const boss = rollBossDrops([{ baseId: 'wpn-t3-dawn', chance: 0 }], 29, options)
    const directRng = createLootRng(29)
    directRng() // 已消费的 Boss 表掉率判定。
    const direct = rollDrop('wpn-t3-dawn', directRng, options)
    expect(boss).toHaveLength(1)
    expect({ ...boss[0], id: direct.id }).toEqual(direct)
    expect(rollBossDrops([{ baseId: 'wpn-t3-dawn', chance: 0 }], 29)).toEqual([])
  })

  it('旧装备和新掉落经过迁移、存档导入与战斗投影仍使用已存词条，不重掷', () => {
    const oldPurple: ItemInstance = { id: 'old-purple', baseId: 'wpn-t3-dawn', quality: 'purple', rolls: [
      { affixId: 'aff-atk', value: 5.25 }, { affixId: 'aff-hp', value: 26.25 }, { affixId: 'aff-def', value: 1.5 },
    ] }
    const oldWithoutQuality: ItemInstance = { id: 'old-legacy', baseId: 'wpn-t1-sword', rolls: [{ affixId: 'aff-hp', value: 17.13 }] }
    const member = generateMember('guard', 1, 29, { race: 'human' })
    member.equipment = { weapon: oldPurple }
    const migrated = migrate({ version: 1, members: [member], inventory: [oldWithoutQuality], memorial: [], manual: [], protectOn: true })
    const newItem = rollDrop('wpn-t3-dawn', () => 0)
    const registered = addInventoryItems(itemStateFromSave(migrated), [newItem, { ...oldPurple, id: 'old-relic' }])
    registered.state.inventory.pop()
    registered.state.pendingRelics.push({ uid: registered.items[1].id, hero: '测试亡者', redeem: 10 })
    Object.assign(migrated, serializeGuildItems(registered.state, resolveMembers(migrated.members, registered.state)))
    const before = structuredClone(migrated)
    const restored = importSave(exportSave(migrated))!
    expect(restored).not.toBeNull()
    expect(restored.inventory).toEqual(before.inventory)
    expect(restored.pendingRelics).toEqual(before.pendingRelics)
    const [restoredMember] = resolveMembers(restored.members, itemStateFromSave(restored))
    expect(restoredMember.equipment).toEqual({ weapon: { ...oldPurple, id: restored.members[0].equipment.weapon } })
    expect(itemStats(restoredMember.equipment.weapon!)).toEqual({ attack: 31.25, maxHp: 26.25, defense: 1.5 })
    expect(equipmentStats({ weapon: restored.items[restored.inventory[1]] })).toEqual({ attack: 31.25, maxHp: 26.25, defense: 2.63 })
    const oldUnit = toCombatant(restoredMember)
    const newUnit = toCombatant({ ...restoredMember, equipment: { weapon: restored.items[restored.inventory[1]] } })
    expect(newUnit.defense).toBeGreaterThan(oldUnit.defense)
    expect(newUnit.attack).toBe(oldUnit.attack)
    expect(newUnit.maxHp).toBe(oldUnit.maxHp)
    expect(migrated).toEqual(before)
  })
})

// R5.1c(U33②):精英掉落品质下限绿
describe('R5.1c 精英品质下限', () => {
  it('精英必不掉白装(rng 钉死通过掉率判定)', () => {
    for (let i = 0; i < 20; i++) {
      const item = rollWaveDrop('blackmoss', () => 0.1, true, 0, () => `t-${i}`)
      expect(item).not.toBeNull()
      expect(item!.quality).not.toBe('white')
    }
  })
})

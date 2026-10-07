import { describe, expect, it } from 'vitest'
import { addInventoryItems, createGuildItems, dismantleBulk, refineRegisteredQuality, upgradeRegisteredRoll } from '../state/item-registry'
import { rollDrop, compareWithEquipped } from '../sim/loot'
import { powerScore } from '../sim/combat'
import { generateMember } from '../sim/gen'
import { createRng } from '../sim/rng'
import type { ItemInstance } from '../sim/types'

// #2.5 批量分解(锁定保护)/ #2.6 确定性改造(词条升档/品质提升)。

function seeded(): ReturnType<typeof createGuildItems> {
  const state = createGuildItems([])
  const a = rollDrop('wpn-t1-sword', createRng(11))
  const b = rollDrop('arm-t2-plate', createRng(12))
  const c = rollDrop('wpn-t3-dawn', createRng(13))
  const added = addInventoryItems(state, [a, b, c])
  return added.state as ReturnType<typeof createGuildItems>
}

describe('#2.5 批量分解', () => {
  it('T3 拆星髓 2/件,T1/T2 折金币;锁定件跳过;空结果 null', () => {
    const state = seeded()
    const uids = [...state.inventory]
    state.items[uids[0]]!.locked = true // 第一件锁定
    const r = dismantleBulk(state, uids, 1)!
    expect(r.count).toBe(2) // 锁定件被兜底跳过
    expect(r.gold).toBeGreaterThan(0)
    expect(r.marrow).toBe(2) // 只剩 T3 一件
    expect(r.state.inventory).toHaveLength(1)
    expect(dismantleBulk(r.state, uids, 1)).toBeNull() // 没有可拆的
  })
})

describe('#2.6 确定性改造', () => {
  it('词条升档:值按更高档区间重掷;锁定件拒绝;越界词条 null', () => {
    const state = seeded()
    const uid = state.inventory[0]!
    state.items[uid]!.rolls = [{ affixId: 'aff-atk', value: 3 }]
    const r = upgradeRegisteredRoll(state, uid, 0, createRng(21))!
    expect(r.item.rolls[0]!.value).toBeGreaterThan(0)
    state.items[uid]!.locked = true
    expect(upgradeRegisteredRoll(state, uid, 0, createRng(22))).toBeNull()
    expect(upgradeRegisteredRoll(state, uid, 99, createRng(23))).toBeNull()
  })

  it('品质提升:white→green→purple;锁定与已满拒绝', () => {
    const state = seeded()
    const uid = state.inventory[0]!
    state.items[uid]!.quality = 'white'
    const r1 = refineRegisteredQuality(state, uid)!
    expect(r1.to).toBe('green')
    const r2 = refineRegisteredQuality(r1.state, uid)!
    expect(r2.to).toBe('purple')
    expect(refineRegisteredQuality(r2.state, uid)).toBeNull() // 已满
    state.items[uid]!.locked = true
    expect(refineRegisteredQuality(r2.state, uid)).toBeNull()
  })
})

// E04 复测(#2.4 出口条件):评分涨了但打输的换装,必须能被对比面板解释。
describe('#2.4 E04 复测:取舍语境', () => {
  it('powerScore 更高≠全面更优:对比面板显示负 delta,解释换装风险', () => {
    const m = generateMember('guard', 6, 77)
    // 候选:纯攻击件(评分贡献 8×3=24);已装备:血防件(20×0.4+3×4=20)
    const candidate: ItemInstance = { id: 'cand', baseId: 'wpn-t1-sword', quality: 'white', rolls: [{ affixId: 'aff-atk', value: 8 }] }
    const equipped: ItemInstance = { id: 'eq', baseId: 'wpn-t1-sword', quality: 'white', rolls: [{ affixId: 'aff-hp', value: 20 }, { affixId: 'aff-def', value: 3 }] }
    m.equipment.weapon = equipped
    const candScore = powerScore({ ...m, equipment: { weapon: candidate } })
    const eqScore = powerScore(m)
    expect(candScore).toBeGreaterThan(eqScore) // 评分确实涨了
    const cmp = compareWithEquipped(candidate, equipped)
    const negatives = cmp.rows.filter((r) => r.delta < 0)
    expect(negatives.length).toBeGreaterThan(0) // 但对比面板显示亏损项(解释"为什么可能打输")
    expect(negatives.map((r) => r.key)).toContain('maxHp')
  })
})

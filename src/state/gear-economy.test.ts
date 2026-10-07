import { describe, expect, it } from 'vitest'
import { addInventoryItems, createGuildItems, dismantleBulk, refineRegisteredQuality, upgradeRegisteredRoll } from '../state/item-registry'
import { rollDrop } from '../sim/loot'
import { createRng } from '../sim/rng'

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

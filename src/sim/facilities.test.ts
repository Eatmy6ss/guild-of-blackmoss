import { describe, expect, it } from 'vitest'
import { recastRoll, rollDrop } from './loot'
import { addInventoryItems, createGuildItems, inheritRegisteredRelic, recastRegisteredItem } from '../state/item-registry'
import { createRng } from './rng'

// R4.2b 设施各管玩法(redesign §6):铁匠铺重铸 / 祠堂遗物传承。

describe('R4.2b 铁匠铺·重铸', () => {
  it('recastRoll:词条方向不变、数值按 tier×品质重掷;越界词条返回 null', () => {
    const item = rollDrop('wpn-t1-sword', createRng(7))
    expect(item.rolls.length).toBeGreaterThan(0)
    let changed: typeof item | null = null
    for (let seed = 1; seed <= 40 && !changed; seed++) {
      const next = recastRoll(item, 0, createRng(seed * 37))
      if (next) changed = next
    }
    expect(changed).not.toBeNull() // 40 个种子内数值应有变化(区间非单点)
    expect(changed!.rolls[0]!.affixId).toBe(item.rolls[0]!.affixId) // 方向不变
    expect(changed!.id).toBe(item.id)
    expect(recastRoll(item, 99, createRng(1))).toBeNull() // 越界词条
  })

  it('recastRegisteredItem:注册表内重掷并落盘;未登记 uid 返回 null', () => {
    const state = createGuildItems([])
    const item = rollDrop('wpn-t1-sword', createRng(9))
    const added = addInventoryItems(state, [item])
    const uid = added.items[0]!.id
    const r = recastRegisteredItem(added.state, uid, 0, createRng(3))
    if (r) {
      expect(r.item.id).toBe(uid)
      expect(r.state.items[uid]!.rolls[0]).toBeDefined()
    }
    expect(recastRegisteredItem(added.state, 'nope', 0, createRng(1))).toBeNull()
  })
})

describe('R4.2b 祠堂·遗物传承', () => {
  it('inheritRegisteredRelic:六成赎回费接走遗物;钱不够或未知 uid 返回 null', () => {
    const state = createGuildItems([])
    state.items['it_4'] = { id: 'it_4', baseId: 'wpn-t1-sword', quality: 'white', rolls: [] }
    state.itemSeq = 5
    state.pendingRelics.push({ uid: 'it_4', hero: '阵亡者', redeem: 100 })
    const r = inheritRegisteredRelic(state, 'it_4', 60)!
    expect(r.cost).toBe(60)
    expect(r.state.pendingRelics).toHaveLength(0)
    expect(r.state.inventory).toContain('it_4')
    expect(inheritRegisteredRelic(state, 'it_4', 59)).toBeNull()
    expect(inheritRegisteredRelic(state, 'nope', 999)).toBeNull()
  })
})

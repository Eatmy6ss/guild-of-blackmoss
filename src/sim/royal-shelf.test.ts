import { describe, expect, it } from 'vitest'
import { ROYAL_SHELF } from '../data/kingdom'
import { ITEM_BASES } from '../data/items'
import { AFFIXES } from '../data/affixes'
import { kingdomTrust, newKingdomState, royalGoodLock } from './kingdom'

// R4.4 王国货架:信任门槛 + 数据合法性(基底/词缀真实存在,数值在 tier×品质区间内)。

describe('R4.4 王国货架', () => {
  it('商品数据合法:基底与词缀真实存在,roll 值落在 tier×品质区间内', () => {
    for (const good of ROYAL_SHELF) {
      expect(good.gold).toBeGreaterThan(0)
      if (!good.item) continue
      const base = ITEM_BASES[good.item.baseId]
      expect(base, good.item.baseId).toBeDefined()
      const tierScale = base!.tier === 2 ? 1.5 : 1
      const q = good.item.quality === 'green' ? 1.08 : 1
      for (const r of good.item.rolls) {
        const aff = AFFIXES[r.affixId]
        expect(aff, r.affixId).toBeDefined()
        expect(r.value).toBeGreaterThanOrEqual(aff!.range[0] * tierScale * q - 1e-9)
        expect(r.value).toBeLessThanOrEqual(aff!.range[1] * tierScale * q + 1e-9)
      }
    }
  })

  it('royalGoodLock:信任不足拒绝,达到档位放行;判定不改信任', () => {
    const state = newKingdomState()
    const top = ROYAL_SHELF[ROYAL_SHELF.length - 1]!
    expect(royalGoodLock(top, state)).not.toBeNull()
    state.completed.push({ id: 'crown-road', choice: 'coin', day: 1 }) // 信任 +10
    expect(kingdomTrust(state)).toBe(10)
    expect(royalGoodLock(ROYAL_SHELF[0]!, state)).toBeNull() // 0 档商品恒可购
    expect(royalGoodLock(top, state)).not.toBeNull() // 顶档仍锁
  })
})

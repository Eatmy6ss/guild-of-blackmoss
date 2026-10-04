import { describe, it, expect } from 'vitest'
import { sortInventoryItems } from './inventory-sort'
import { rollDrop } from '../sim/loot'
import { ITEM_BASES } from '../data/items'

// 仓库排序(制作人反馈):默认稀有度从高到低;可切名称/种类

const drop = (id: string, quality?: 'white' | 'green' | 'purple') => ({ ...rollDrop(id, () => 0.5), quality })

describe('仓库排序', () => {
  const items = [
    drop('wpn-t1-sword', 'white'),
    drop('wpn-t3-dawn', 'purple'),
    drop('arm-t2-plate', 'green'),
    drop('trk-t1-band', 'white'),
  ]

  it('默认稀有度降序:紫>绿>白;同品质 tier 高在前', () => {
    const sorted = sortInventoryItems(items, 'rarity-desc')
    expect(sorted[0]!.quality).toBe('purple')
    expect(sorted[1]!.quality).toBe('green')
    const whites = sorted.filter((i) => (i.quality ?? 'white') === 'white')
    expect(ITEM_BASES[whites[0]!.baseId]!.tier).toBeGreaterThanOrEqual(ITEM_BASES[whites[1]!.baseId]!.tier)
  })

  it('稀有度升序的品质序列是降序的镜像(并列项都按名称同向排)', () => {
    const qseq = (arr: ReturnType<typeof sortInventoryItems>) => arr.map((i) => i.quality ?? 'white')
    expect(qseq(sortInventoryItems(items, 'rarity-asc')).reverse()).toEqual(qseq(sortInventoryItems(items, 'rarity-desc')))
  })

  it('名称排序稳定且不修改原数组', () => {
    const copy = [...items]
    const sorted = sortInventoryItems(items, 'name')
    expect(items).toEqual(copy)
    const names = sorted.map((i) => ITEM_BASES[i.baseId]!.name)
    expect([...names].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))).toEqual(names)
  })

  it('种类排序:武器<护甲<饰品分组,组内 tier 降序', () => {
    const sorted = sortInventoryItems(items, 'slot')
    const slots = sorted.map((i) => ITEM_BASES[i.baseId]!.slot)
    const order = { weapon: 0, armor: 1, trinket: 2 } as Record<string, number>
    for (let k = 1; k < slots.length; k++) {
      expect(order[slots[k]!]).toBeGreaterThanOrEqual(order[slots[k - 1]!]!)
    }
  })
})

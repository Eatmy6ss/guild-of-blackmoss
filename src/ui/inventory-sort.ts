// 仓库排序(制作人自测反馈 2026-10-04):默认稀有度从高到低,可切换。
// 稀有度=品质(紫>绿>白)优先,同品质按装备 tier 降序,再按名称;种类排序=武器/护甲/饰品分组。

import { ITEM_BASES } from '../data/items'
import type { ItemInstance } from '../sim/types'

export type InvSort = 'rarity-desc' | 'rarity-asc' | 'name' | 'slot'

export const INV_SORT_LABEL: Record<InvSort, string> = {
  'rarity-desc': '稀有度 ↓',
  'rarity-asc': '稀有度 ↑',
  name: '名称 A-Z',
  slot: '种类',
}

const QUALITY_RANK: Record<string, number> = { purple: 2, green: 1, white: 0 }
const SLOT_ORDER: Record<string, number> = { weapon: 0, armor: 1, trinket: 2 }

function qualityRank(i: ItemInstance): number {
  return QUALITY_RANK[i.quality ?? 'white'] ?? 0
}

export function sortInventoryItems(items: ItemInstance[], mode: InvSort): ItemInstance[] {
  const copy = [...items]
  copy.sort((a, b) => {
    const ba = ITEM_BASES[a.baseId]
    const bb = ITEM_BASES[b.baseId]
    if (mode === 'name') return (ba?.name ?? a.baseId).localeCompare(bb?.name ?? b.baseId, 'zh-Hans-CN')
    if (mode === 'slot') {
      const s = (SLOT_ORDER[ba?.slot ?? ''] ?? 9) - (SLOT_ORDER[bb?.slot ?? ''] ?? 9)
      if (s !== 0) return s
      return (bb?.tier ?? 0) - (ba?.tier ?? 0) || qualityRank(b) - qualityRank(a)
    }
    const q = qualityRank(b) - qualityRank(a)
    if (q !== 0) return mode === 'rarity-asc' ? -q : q
    const t = (bb?.tier ?? 0) - (ba?.tier ?? 0)
    if (t !== 0) return mode === 'rarity-asc' ? -t : t
    return (ba?.name ?? a.baseId).localeCompare(bb?.name ?? b.baseId, 'zh-Hans-CN')
  })
  return copy
}

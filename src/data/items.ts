import type { ItemBaseDef } from '../sim/types'

// 装备基础盘（M0：3 槽位 × 2 阶）。boss 掉落表引用这里的 id（Q22）
export const ITEM_BASES: Record<string, ItemBaseDef> = {
  'wpn-t1-sword': {
    id: 'wpn-t1-sword', name: '铁剑', slot: 'weapon', tier: 1,
    stat: 'attack', value: 6, affixCount: [1, 2],
  },
  'wpn-t2-bow': {
    id: 'wpn-t2-bow', name: '猎风长弓', slot: 'weapon', tier: 2,
    stat: 'attack', value: 12, affixCount: [2, 3],
  },
  'arm-t1-mail': {
    id: 'arm-t1-mail', name: '锁甲背心', slot: 'armor', tier: 1,
    stat: 'defense', value: 4, affixCount: [1, 2],
  },
  'arm-t2-plate': {
    id: 'arm-t2-plate', name: '沼地重铠', slot: 'armor', tier: 2,
    stat: 'maxHp', value: 40, affixCount: [2, 3],
  },
  'trk-t1-band': {
    id: 'trk-t1-band', name: '铜戒指', slot: 'trinket', tier: 1,
    stat: 'critChance', value: 0.03, affixCount: [1, 1],
  },
  'trk-t2-totem': {
    id: 'trk-t2-totem', name: '蛙神图腾', slot: 'trinket', tier: 2,
    stat: 'attack', value: 5, affixCount: [2, 2],
  },
}

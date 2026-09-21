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
  // ===== 装备扩容(2026-09-22):6→20,基础盘风格化(高攻少词条/均衡/多词条) =====
  'wpn-t1-axe': {
    id: 'wpn-t1-axe', name: '砍柴斧', slot: 'weapon', tier: 1,
    stat: 'attack', value: 8, affixCount: [0, 1],
  },
  'wpn-t1-dagger': {
    id: 'wpn-t1-dagger', name: '细刃匕首', slot: 'weapon', tier: 1,
    stat: 'critChance', value: 0.04, affixCount: [2, 2],
  },
  'wpn-t2-greatsword': {
    id: 'wpn-t2-greatsword', name: '双手巨剑', slot: 'weapon', tier: 2,
    stat: 'attack', value: 15, affixCount: [1, 2],
  },
  'wpn-t2-staff': {
    id: 'wpn-t2-staff', name: '橡木法杖', slot: 'weapon', tier: 2,
    stat: 'healReceived', value: 0.06, affixCount: [2, 3],
  },
  'wpn-t2-crossbow': {
    id: 'wpn-t2-crossbow', name: '军用弩', slot: 'weapon', tier: 2,
    stat: 'attack', value: 11, affixCount: [2, 2],
  },
  'arm-t1-leather': {
    id: 'arm-t1-leather', name: '硬皮甲', slot: 'armor', tier: 1,
    stat: 'speed', value: 1, affixCount: [1, 2],
  },
  'arm-t2-chain': {
    id: 'arm-t2-chain', name: '矿工链甲', slot: 'armor', tier: 2,
    stat: 'defense', value: 7, affixCount: [2, 3],
  },
  'arm-t2-robe': {
    id: 'arm-t2-robe', name: '织法者长袍', slot: 'armor', tier: 2,
    stat: 'healReceived', value: 0.05, affixCount: [2, 3],
  },
  'arm-t2-bulwark': {
    id: 'arm-t2-bulwark', name: '壁垒胸铠', slot: 'armor', tier: 2,
    stat: 'maxHp', value: 55, affixCount: [1, 2],
  },
  'trk-t1-charm': {
    id: 'trk-t1-charm', name: '平安符', slot: 'trinket', tier: 1,
    stat: 'maxHp', value: 15, affixCount: [1, 2],
  },
  'trk-t2-rune': {
    id: 'trk-t2-rune', name: '先知符印', slot: 'trinket', tier: 2,
    stat: 'critChance', value: 0.05, affixCount: [2, 2],
  },
  'trk-t2-medic': {
    id: 'trk-t2-medic', name: '医者徽记', slot: 'trinket', tier: 2,
    stat: 'healReceived', value: 0.08, affixCount: [1, 2],
  },
  // ===== 六线专属武器(掉落表按主题挂到对应 boss) =====
  'wpn-line-guard': {
    id: 'wpn-line-guard', name: '黑苔塔盾剑', slot: 'weapon', tier: 2,
    stat: 'defense', value: 5, affixCount: [2, 3],
  },
  'wpn-line-priest': {
    id: 'wpn-line-priest', name: '圣辉权杖', slot: 'weapon', tier: 2,
    stat: 'healReceived', value: 0.09, affixCount: [2, 3],
  },
  'wpn-line-ranger': {
    id: 'wpn-line-ranger', name: '鹰羽长弓', slot: 'weapon', tier: 2,
    stat: 'critChance', value: 0.06, affixCount: [2, 3],
  },
  'wpn-line-warrior': {
    id: 'wpn-line-warrior', name: '碎甲巨斧', slot: 'weapon', tier: 2,
    stat: 'attack', value: 17, affixCount: [1, 2],
  },
  'wpn-line-mage': {
    id: 'wpn-line-mage', name: '霜火宝珠杖', slot: 'weapon', tier: 2,
    stat: 'attack', value: 13, affixCount: [2, 3],
  },
  'wpn-line-warlock': {
    id: 'wpn-line-warlock', name: '缚魂咒典', slot: 'weapon', tier: 2,
    stat: 'lifesteal', value: 0.06, affixCount: [2, 3],
  },
}

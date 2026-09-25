import type { ItemBaseDef } from '../sim/types'

// 装备基础盘（M0：3 槽位 × 2 阶）。boss 掉落表引用这里的 id（Q22）
export const ITEM_BASES: Record<string, ItemBaseDef> = {
  'wpn-t1-sword': {
    id: 'wpn-t1-sword', name: '戍卒铁剑', slot: 'weapon', tier: 1,
    stat: 'attack', value: 6, affixCount: [1, 2],
  },
  'wpn-t2-bow': {
    id: 'wpn-t2-bow', name: '逐风长弓', slot: 'weapon', tier: 2,
    stat: 'attack', value: 12, affixCount: [2, 3], legacy: 'killheal', setName: 'wind-hunt',
  },
  'arm-t1-mail': {
    id: 'arm-t1-mail', name: '戍卒锁甲', slot: 'armor', tier: 1,
    stat: 'defense', value: 4, affixCount: [1, 2],
  },
  'arm-t2-plate': {
    id: 'arm-t2-plate', name: '泽地重铠', slot: 'armor', tier: 2,
    stat: 'defense', value: 8, affixCount: [2, 3], legacy: 'bulwark',
  },
  'trk-t1-band': {
    id: 'trk-t1-band', name: '戍卒铜戒', slot: 'trinket', tier: 1,
    stat: 'critChance', value: 0.03, affixCount: [1, 1],
  },
  'trk-t2-totem': {
    id: 'trk-t2-totem', name: '蛙神图腾', slot: 'trinket', tier: 2,
    stat: 'attack', value: 5, affixCount: [2, 2], legacy: 'mend',
  },
  // ===== 装备扩容(2026-09-22):6→20,基础盘风格化(高攻少词条/均衡/多词条) =====
  'wpn-t1-axe': {
    id: 'wpn-t1-axe', name: '开荒斧', slot: 'weapon', tier: 1,
    stat: 'attack', value: 8, affixCount: [0, 1],
  },
  'wpn-t1-dagger': {
    id: 'wpn-t1-dagger', name: '哨探短刃', slot: 'weapon', tier: 1,
    stat: 'critChance', value: 0.04, affixCount: [2, 2],
  },
  'wpn-t2-greatsword': {
    id: 'wpn-t2-greatsword', name: '折颈巨剑', slot: 'weapon', tier: 2,
    stat: 'attack', value: 15, affixCount: [1, 2], legacy: 'focus',
  },
  'wpn-t2-staff': {
    id: 'wpn-t2-staff', name: '春霖法杖', slot: 'weapon', tier: 2,
    stat: 'healReceived', value: 0.06, affixCount: [2, 3], legacy: 'mend',
  },
  'wpn-t2-crossbow': {
    id: 'wpn-t2-crossbow', name: '戍弩', slot: 'weapon', tier: 2,
    stat: 'attack', value: 11, affixCount: [2, 2],
  },
  'arm-t1-leather': {
    id: 'arm-t1-leather', name: '斥候皮甲', slot: 'armor', tier: 1,
    stat: 'speed', value: 1, affixCount: [1, 2],
  },
  'arm-t2-chain': {
    id: 'arm-t2-chain', name: '巷道链甲', slot: 'armor', tier: 2,
    stat: 'defense', value: 7, affixCount: [2, 3],
  },
  'arm-t2-robe': {
    id: 'arm-t2-robe', name: '织法者长袍', slot: 'armor', tier: 2,
    stat: 'healReceived', value: 0.05, affixCount: [2, 3],
  },
  'arm-t2-bulwark': {
    id: 'arm-t2-bulwark', name: '断崖胸铠', slot: 'armor', tier: 2,
    stat: 'maxHp', value: 55, affixCount: [1, 2], legacy: 'bulwark',
  },
  'trk-t1-charm': {
    id: 'trk-t1-charm', name: '行路平安符', slot: 'trinket', tier: 1,
    stat: 'maxHp', value: 15, affixCount: [1, 2],
  },
  'trk-t2-rune': {
    id: 'trk-t2-rune', name: '先知符印', slot: 'trinket', tier: 2,
    stat: 'critChance', value: 0.05, affixCount: [2, 2], legacy: 'focus',
  },
  'trk-t2-medic': {
    id: 'trk-t2-medic', name: '医者徽记', slot: 'trinket', tier: 2,
    stat: 'healReceived', value: 0.08, affixCount: [1, 2], legacy: 'mend',
  },
  // ===== 六线专属武器(掉落表按主题挂到对应 boss) =====
  'wpn-line-guard': {
    id: 'wpn-line-guard', name: '苔盾剑', slot: 'weapon', tier: 2,
    stat: 'defense', value: 5, affixCount: [2, 3], legacy: 'bulwark',
  },
  'wpn-line-priest': {
    id: 'wpn-line-priest', name: '晨祷权杖', slot: 'weapon', tier: 2,
    stat: 'healReceived', value: 0.09, affixCount: [2, 3], legacy: 'mend',
  },
  'wpn-line-ranger': {
    id: 'wpn-line-ranger', name: '鹘眼长弓', slot: 'weapon', tier: 2,
    stat: 'critChance', value: 0.06, affixCount: [2, 3], legacy: 'focus', setName: 'wind-hunt',
  },
  'wpn-line-warrior': {
    id: 'wpn-line-warrior', name: '碎颚斧', slot: 'weapon', tier: 2,
    stat: 'attack', value: 17, affixCount: [1, 2], legacy: 'elitewarden',
  },
  'wpn-line-mage': {
    id: 'wpn-line-mage', name: '霜火宝珠', slot: 'weapon', tier: 2,
    stat: 'attack', value: 13, affixCount: [2, 3], legacy: 'emberward',
  },
  'wpn-line-warlock': {
    id: 'wpn-line-warlock', name: '缚魂典', slot: 'weapon', tier: 2,
    stat: 'lifesteal', value: 0.06, affixCount: [2, 3], legacy: 'killheal',
  },
  // ===== 六线专属防具+饰品(试玩反馈④:装备多样性——职阶专精可换装) =====
  'arm-line-guard': {
    id: 'arm-line-guard', name: '甲壳壁垒铠', slot: 'armor', tier: 2,
    stat: 'defense', value: 6, affixCount: [2, 3], legacy: 'bulwark',
  },
  'trk-line-guard': {
    id: 'trk-line-guard', name: '誓约之石', slot: 'trinket', tier: 2,
    stat: 'defense', value: 3, affixCount: [2, 2], legacy: 'bulwark',
  },
  'arm-line-priest': {
    id: 'arm-line-priest', name: '晚祷祭袍', slot: 'armor', tier: 2,
    stat: 'healReceived', value: 0.07, affixCount: [2, 3], legacy: 'mend',
  },
  'trk-line-priest': {
    id: 'trk-line-priest', name: '祈祷烛台', slot: 'trinket', tier: 2,
    stat: 'maxHp', value: 30, affixCount: [2, 2], legacy: 'triumph',
  },
  'arm-line-ranger': {
    id: 'arm-line-ranger', name: '风皮猎衣', slot: 'armor', tier: 2,
    stat: 'speed', value: 2, affixCount: [2, 3], legacy: 'focus', setName: 'wind-hunt',
  },
  'trk-line-ranger': {
    id: 'trk-line-ranger', name: '鹘眼坠饰', slot: 'trinket', tier: 2,
    stat: 'critChance', value: 0.06, affixCount: [2, 2], legacy: 'focus', setName: 'wind-hunt',
  },
  'arm-line-warrior': {
    id: 'arm-line-warrior', name: '血宴甲', slot: 'armor', tier: 2,
    stat: 'lifesteal', value: 0.05, affixCount: [2, 3], legacy: 'killheal',
  },
  'trk-line-warrior': {
    id: 'trk-line-warrior', name: '骨髓哨', slot: 'trinket', tier: 2,
    stat: 'attack', value: 6, affixCount: [2, 2], legacy: 'elitewarden',
  },
  'arm-line-mage': {
    id: 'arm-line-mage', name: '符织披风', slot: 'armor', tier: 2,
    stat: 'critChance', value: 0.05, affixCount: [2, 3], legacy: 'focus',
  },
  'trk-line-mage': {
    id: 'trk-line-mage', name: '秘法核心', slot: 'trinket', tier: 2,
    stat: 'attack', value: 5, affixCount: [2, 2], legacy: 'focus',
  },
  'arm-line-warlock': {
    id: 'arm-line-warlock', name: '缚魂裹布', slot: 'armor', tier: 2,
    stat: 'lifesteal', value: 0.07, affixCount: [2, 3], legacy: 'killheal',
  },
  'trk-line-warlock': {
    id: 'trk-line-warlock', name: '血契印戒', slot: 'trinket', tier: 2,
    stat: 'lifesteal', value: 0.08, affixCount: [1, 2], legacy: 'killheal',
  },
  // ===== 副本特化招牌(试玩反馈④:对应副本特化——挂在各图 boss 掉落表+杂兵加权) =====
  'trk-sign-frogeye': {
    id: 'trk-sign-frogeye', name: '蛙神之眼', slot: 'trinket', tier: 2,
    stat: 'healReceived', value: 0.1, affixCount: [2, 3], legacy: 'mend',
  },
  'arm-sign-minershell': {
    id: 'arm-sign-minershell', name: '矿监铁壳', slot: 'armor', tier: 2,
    stat: 'defense', value: 9, affixCount: [2, 3], legacy: 'bulwark',
  },
  'wpn-sign-warbrand': {
    id: 'wpn-sign-warbrand', name: '灰隼军刀', slot: 'weapon', tier: 2,
    stat: 'attack', value: 14, affixCount: [2, 3], legacy: 'focus',
  },
  'trk-sign-frostheart': {
    id: 'trk-sign-frostheart', name: '霜心坠', slot: 'trinket', tier: 2,
    stat: 'defense', value: 5, affixCount: [2, 3], legacy: 'bulwark',
  },
  'wpn-sign-bloodletter': {
    id: 'wpn-sign-bloodletter', name: '医官放血刃', slot: 'weapon', tier: 2,
    stat: 'critChance', value: 0.07, affixCount: [2, 3], legacy: 'killheal',
  },
  'arm-sign-thornmail': {
    id: 'arm-sign-thornmail', name: '荆墙重铠', slot: 'armor', tier: 2,
    stat: 'defense', value: 10, affixCount: [1, 3], legacy: 'elitewarden',
  },
  // ===== 版图二·龙脊山脉:火抗装备线(灼热地形逼迫的套装取舍,制作人拍板) =====
  'arm-dragon-scalemail': {
    id: 'arm-dragon-scalemail', name: '鳞音锁甲', slot: 'armor', tier: 2,
    stat: 'fireResist', value: 0.18, affixCount: [2, 3], legacy: 'emberward',
  },

// ===== T3 灰冠纪元(装备 2.0,2026-09-25):版图二毕业+高塔深层,全带传承威能 =====
  'wpn-t3-dawn': {
    id: 'wpn-t3-dawn', name: '渊晨巨剑', slot: 'weapon', tier: 3,
    stat: 'attack', value: 26, affixCount: [2, 3], legacy: 'focus', setName: 'gray-crown',
  },
  'wpn-t3-tide': {
    id: 'wpn-t3-tide', name: '缚潮咒典', slot: 'weapon', tier: 3,
    stat: 'lifesteal', value: 0.1, affixCount: [2, 3], legacy: 'killheal', setName: 'gray-crown',
  },
  'wpn-t3-gale': {
    id: 'wpn-t3-gale', name: '隼击长弓', slot: 'weapon', tier: 3,
    stat: 'critChance', value: 0.08, affixCount: [2, 3], legacy: 'focus', setName: 'gray-crown',
  },
  'wpn-t3-ember': {
    id: 'wpn-t3-ember', name: '烬渊宝珠', slot: 'weapon', tier: 3,
    stat: 'attack', value: 23, affixCount: [2, 3], legacy: 'emberward', setName: 'gray-crown',
  },
  'wpn-t3-vox': {
    id: 'wpn-t3-vox', name: '春霖圣杖', slot: 'weapon', tier: 3,
    stat: 'healReceived', value: 0.12, affixCount: [2, 3], legacy: 'mend', setName: 'gray-crown',
  },
  'arm-t3-bulwark': {
    id: 'arm-t3-bulwark', name: '灰冠壁垒', slot: 'armor', tier: 3,
    stat: 'defense', value: 16, affixCount: [2, 3], legacy: 'bulwark', setName: 'gray-crown',
  },
  'arm-t3-drake': {
    id: 'arm-t3-drake', name: '渊龙鳞铠', slot: 'armor', tier: 3,
    stat: 'fireResist', value: 0.25, affixCount: [2, 3], legacy: 'emberward', setName: 'gray-crown',
  },
  'arm-t3-whisper': {
    id: 'arm-t3-whisper', name: '缚魂裹尸布', slot: 'armor', tier: 3,
    stat: 'lifesteal', value: 0.09, affixCount: [2, 3], legacy: 'killheal', setName: 'gray-crown',
  },
  'arm-t3-gale': {
    id: 'arm-t3-gale', name: '风脊猎衣', slot: 'armor', tier: 3,
    stat: 'speed', value: 3, affixCount: [2, 3], legacy: 'focus', setName: 'gray-crown',
  },
  'trk-t3-vanguard': {
    id: 'trk-t3-vanguard', name: '前卫印玺', slot: 'trinket', tier: 3,
    stat: 'defense', value: 8, affixCount: [2, 3], legacy: 'bulwark', setName: 'gray-crown',
  },
  'trk-t3-seer': {
    id: 'trk-t3-seer', name: '先知圣徽', slot: 'trinket', tier: 3,
    stat: 'critChance', value: 0.07, affixCount: [2, 3], legacy: 'focus', setName: 'gray-crown',
  },
  'trk-t3-pyrexia': {
    id: 'trk-t3-pyrexia', name: '血宴杯', slot: 'trinket', tier: 3,
    stat: 'attack', value: 8, affixCount: [2, 3], legacy: 'killheal', setName: 'gray-crown',
  },

  'trk-dragon-talisman': {
    id: 'trk-dragon-talisman', name: '驭火者坠', slot: 'trinket', tier: 2,
    stat: 'fireResist', value: 0.15, affixCount: [1, 2], legacy: 'emberward', setName: 'gray-crown',
  },
  'wpn-dragon-brand': {
    id: 'wpn-dragon-brand', name: '烙焰长剑', slot: 'weapon', tier: 2,
    stat: 'attack', value: 14, affixCount: [2, 3], legacy: 'emberward', setName: 'gray-crown',
  },
}

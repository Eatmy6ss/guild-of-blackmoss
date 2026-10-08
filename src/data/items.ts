import type { ItemBaseDef } from '../sim/types'

// 装备基础盘（M0：3 槽位 × 2 阶）。boss 掉落表引用这里的 id（Q22）
export const ITEM_BASES: Record<string, ItemBaseDef> = {
  'wpn-t1-sword': {
    id: 'wpn-t1-sword', name: '黑苔卫戍军长剑', flavor: '剑锷刻着服役编号。名字的位置，留给回营的人。', slot: 'weapon', family: 'blade', tier: 1, pool: 'dps',
    stat: 'attack', value: 6, affixCount: [1, 2],
  },
  'wpn-t2-bow': {
    id: 'wpn-t2-bow', name: '逐风者的长弓', flavor: '弓梢系着褪色的路标布。它的主人总比风晚一步归来。', slot: 'weapon', family: 'bow', tier: 2,
    stat: 'attack', value: 12, affixCount: [2, 3], legacy: 'killheal', setName: 'wind-hunt',
  },
  'arm-t1-mail': {
    id: 'arm-t1-mail', name: '戍卒锁甲', slot: 'armor', tier: 1, pool: 'tank',
    stat: 'defense', value: 4, affixCount: [1, 2],
  },
  'arm-t2-plate': {
    id: 'arm-t2-plate', name: '泽地重铠', slot: 'armor', tier: 2, pool: 'tank',
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
    id: 'wpn-t1-axe', name: '荒野开拓者之斧', flavor: '先砍倒挡路的老树，再面对树后醒来的东西。', slot: 'weapon', family: 'axe', tier: 1, pool: 'dps',
    stat: 'attack', value: 8, affixCount: [0, 1],
  },
  'wpn-t1-dagger': {
    id: 'wpn-t1-dagger', name: '夜巡者的短刃', flavor: '黑苔的巡夜人不磨亮刀背，以免月光先暴露自己。', slot: 'weapon', family: 'blade', tier: 1, pool: 'dps',
    stat: 'critChance', value: 0.04, affixCount: [2, 2],
  },
  'wpn-t2-greatsword': {
    id: 'wpn-t2-greatsword', name: '断脊者重剑', flavor: '剑刃上的豁口从未补平。持剑人说，那是它记住的战斗。', slot: 'weapon', family: 'blade', tier: 2, pool: 'dps',
    stat: 'attack', value: 15, affixCount: [1, 2], legacy: 'focus',
  },
  'wpn-t2-staff': {
    id: 'wpn-t2-staff', name: '春霖看护者之杖', flavor: '枯木杖头仍留着一截新芽，像战地帐篷里迟来的春天。', slot: 'weapon', family: 'staff', tier: 2, pool: 'healer',
    stat: 'healReceived', value: 0.06, affixCount: [2, 3], legacy: 'mend',
  },
  'wpn-t2-crossbow': {
    id: 'wpn-t2-crossbow', name: '锈坑哨卫强弩', flavor: '矿道容不下完整的弓身，却总能容下一支弩箭。', slot: 'weapon', family: 'bow', tier: 2, pool: 'dps',
    stat: 'attack', value: 11, affixCount: [2, 2],
  },
  // ===== R3/W4 长柄六件(U31):数值走现有 tier 曲线;美术暂用剑帧占位(明确不做清单) =====
  'wpn-t1-halberd': {
    id: 'wpn-t1-halberd', name: '戍卒长戟', slot: 'weapon', family: 'polearm', tier: 1, pool: 'tank',
    stat: 'attack', value: 7, affixCount: [0, 1],
  },
  'wpn-t1-spear': {
    id: 'wpn-t1-spear', name: '巡林刺矛', slot: 'weapon', family: 'polearm', tier: 1, pool: 'dps',
    stat: 'attack', value: 6, affixCount: [1, 2],
  },
  'wpn-t2-banner': {
    id: 'wpn-t2-banner', name: '荆棘旗枪', slot: 'weapon', family: 'polearm', tier: 2, pool: 'tank',
    stat: 'defense', value: 4, affixCount: [1, 2], legacy: 'bulwark',
  },
  'wpn-t2-tidebreak': {
    id: 'wpn-t2-tidebreak', name: '断潮矛', slot: 'weapon', family: 'polearm', tier: 2, pool: 'tank',
    stat: 'attack', value: 14, affixCount: [1, 2],
  },
  'wpn-t3-bulwarkpike': {
    id: 'wpn-t3-bulwarkpike', name: '铁壁拒马枪', slot: 'weapon', family: 'polearm', tier: 3, pool: 'tank',
    stat: 'defense', value: 12, affixCount: [2, 3], legacy: 'bulwark',
  },
  'wpn-t3-dragonpole': {
    id: 'wpn-t3-dragonpole', name: '龙脊长柄', slot: 'weapon', family: 'polearm', tier: 3, pool: 'tank',
    stat: 'attack', value: 24, affixCount: [2, 3], legacy: 'focus',
  },
  'arm-t1-leather': {
    id: 'arm-t1-leather', name: '斥候皮甲', slot: 'armor', tier: 1, pool: 'dps',
    stat: 'speed', value: 1, affixCount: [1, 2],
  },
  'arm-t2-chain': {
    id: 'arm-t2-chain', name: '巷道链甲', slot: 'armor', tier: 2, pool: 'dps',
    stat: 'defense', value: 7, affixCount: [2, 3],
  },
  'arm-t2-robe': {
    id: 'arm-t2-robe', name: '织法者长袍', slot: 'armor', tier: 2, pool: 'caster',
    stat: 'healReceived', value: 0.05, affixCount: [2, 3],
  },
  'arm-t2-bulwark': {
    id: 'arm-t2-bulwark', name: '断崖胸铠', slot: 'armor', tier: 2, pool: 'tank',
    stat: 'maxHp', value: 55, affixCount: [1, 2], legacy: 'bulwark',
  },
  'trk-t1-charm': {
    id: 'trk-t1-charm', name: '行路平安符', slot: 'trinket', tier: 1,
    stat: 'maxHp', value: 15, affixCount: [1, 2],
  },
  'trk-t2-rune': {
    id: 'trk-t2-rune', name: '先知符印', slot: 'trinket', tier: 2, pool: 'caster',
    stat: 'critChance', value: 0.05, affixCount: [2, 2], legacy: 'focus',
  },
  'trk-t2-medic': {
    id: 'trk-t2-medic', name: '医者徽记', slot: 'trinket', tier: 2, pool: 'healer',
    stat: 'healReceived', value: 0.08, affixCount: [1, 2], legacy: 'mend',
  },
  // ===== 六线专属武器(掉落表按主题挂到对应 boss) =====
  'wpn-line-guard': {
    id: 'wpn-line-guard', name: '苔垒守望者之剑', flavor: '盾墙后流传着一句誓言：苔痕可以越过城砖，敌人不行。', slot: 'weapon', family: 'blade', tier: 2, pool: 'tank',
    stat: 'defense', value: 5, affixCount: [2, 3], legacy: 'bulwark',
  },
  'wpn-line-priest': {
    id: 'wpn-line-priest', name: '晨祷者的赐福权杖', flavor: '杖柄被一代代掌心磨得光亮，祷词却始终只有一句：愿他们归来。', slot: 'weapon', family: 'staff', tier: 2, pool: 'healer',
    stat: 'healReceived', value: 0.09, affixCount: [2, 3], legacy: 'mend',
  },
  'wpn-line-ranger': {
    id: 'wpn-line-ranger', name: '隼眼追猎者长弓', flavor: '猎人从不夸耀射程，只把断弦埋在失手的地方。', slot: 'weapon', family: 'bow', tier: 2, pool: 'dps',
    stat: 'critChance', value: 0.06, affixCount: [2, 3], legacy: 'focus', setName: 'wind-hunt',
  },
  'wpn-line-warrior': {
    id: 'wpn-line-warrior', name: '碎颚者战斧', flavor: '斧柄缠着换过许多次的皮带。斧头的名字从未换过。', slot: 'weapon', family: 'axe', tier: 2, pool: 'dps',
    stat: 'attack', value: 17, affixCount: [1, 2], legacy: 'elitewarden',
  },
  'wpn-line-mage': {
    id: 'wpn-line-mage', name: '霜烬交织宝珠', flavor: '一半结着细霜，一半映着余烬。两种光从不越过中央的裂纹。', slot: 'weapon', family: 'staff', tier: 2, pool: 'caster',
    stat: 'attack', value: 13, affixCount: [2, 3], legacy: 'emberward',
  },
  'wpn-line-warlock': {
    id: 'wpn-line-warlock', name: '缚魂者的禁忌魔典', flavor: '封底留有历任主人的签名。最后一页，墨迹尚未干透。', slot: 'weapon', family: 'staff', tier: 2, pool: 'caster',
    stat: 'lifesteal', value: 0.06, affixCount: [2, 3], legacy: 'killheal',
  },
  // ===== 六线专属防具+饰品(试玩反馈④:装备多样性——职阶专精可换装) =====
  'arm-line-guard': {
    id: 'arm-line-guard', name: '甲壳壁垒铠', slot: 'armor', tier: 2,
    stat: 'defense', value: 6, affixCount: [2, 3], legacy: 'bulwark',
  },
  'trk-line-guard': {
    id: 'trk-line-guard', name: '誓约之石', slot: 'trinket', tier: 2, pool: 'tank',
    stat: 'defense', value: 3, affixCount: [2, 2], legacy: 'bulwark',
  },
  'arm-line-priest': {
    id: 'arm-line-priest', name: '晚祷祭袍', slot: 'armor', tier: 2,
    stat: 'healReceived', value: 0.07, affixCount: [2, 3], legacy: 'mend',
  },
  'trk-line-priest': {
    id: 'trk-line-priest', name: '祈祷烛台', slot: 'trinket', tier: 2, pool: 'healer',
    stat: 'maxHp', value: 30, affixCount: [2, 2], legacy: 'triumph',
  },
  'arm-line-ranger': {
    id: 'arm-line-ranger', name: '风皮猎衣', slot: 'armor', tier: 2,
    stat: 'speed', value: 2, affixCount: [2, 3], legacy: 'focus', setName: 'wind-hunt',
  },
  'trk-line-ranger': {
    id: 'trk-line-ranger', name: '鹘眼坠饰', slot: 'trinket', tier: 2, pool: 'dps',
    stat: 'critChance', value: 0.06, affixCount: [2, 2], legacy: 'focus', setName: 'wind-hunt',
  },
  'arm-line-warrior': {
    id: 'arm-line-warrior', name: '血宴甲', slot: 'armor', tier: 2,
    stat: 'lifesteal', value: 0.05, affixCount: [2, 3], legacy: 'killheal',
  },
  'trk-line-warrior': {
    id: 'trk-line-warrior', name: '骨髓哨', slot: 'trinket', tier: 2, pool: 'dps',
    stat: 'attack', value: 6, affixCount: [2, 2], legacy: 'elitewarden',
  },
  'arm-line-mage': {
    id: 'arm-line-mage', name: '符织披风', slot: 'armor', tier: 2,
    stat: 'critChance', value: 0.05, affixCount: [2, 3], legacy: 'focus',
  },
  'trk-line-mage': {
    id: 'trk-line-mage', name: '秘法核心', slot: 'trinket', tier: 2, pool: 'caster',
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
    id: 'wpn-sign-warbrand', name: '灰隼军团军刀', flavor: '旧战场的灰掩住了旗帜，护手上的隼翼纹仍然清晰。', slot: 'weapon', family: 'blade', tier: 2,
    stat: 'attack', value: 14, affixCount: [2, 3], legacy: 'focus',
  },
  'trk-sign-frostheart': {
    id: 'trk-sign-frostheart', name: '霜心坠', slot: 'trinket', tier: 2,
    stat: 'defense', value: 5, affixCount: [2, 3], legacy: 'bulwark',
  },
  'wpn-sign-bloodletter': {
    id: 'wpn-sign-bloodletter', name: '无眠医官的放血刃', flavor: '刀鞘内侧刻着一列名字，没人能说清那是获救者还是亡者。', slot: 'weapon', family: 'blade', tier: 2,
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
    id: 'wpn-t3-dawn', name: '渊晨，灰冠守望者之刃', flavor: '灰冠早已蒙尘。剑身朝向深渊时，仍映出一线天光。', slot: 'weapon', family: 'blade', tier: 3, pool: 'dps',
    stat: 'attack', value: 26, affixCount: [2, 3], legacy: 'focus', setName: 'gray-crown',
  },
  'wpn-t3-tide': {
    id: 'wpn-t3-tide', name: '深潮低语，缚魂者的禁典', flavor: '页边满是退潮留下的盐渍。翻到末页时，远处仿佛又响起潮声。', slot: 'weapon', family: 'staff', tier: 3, pool: 'caster',
    stat: 'lifesteal', value: 0.1, affixCount: [2, 3], legacy: 'killheal', setName: 'gray-crown',
  },
  'wpn-t3-gale': {
    id: 'wpn-t3-gale', name: '隼誓，风脊追猎者之弓', flavor: '弓背铭文只剩半句：若群山留住我的脚步，就让此箭替我归乡。', slot: 'weapon', family: 'bow', tier: 3, pool: 'dps',
    stat: 'critChance', value: 0.08, affixCount: [2, 3], legacy: 'focus', setName: 'gray-crown',
  },
  'wpn-t3-ember': {
    id: 'wpn-t3-ember', name: '烬心，龙渊不灭之火', flavor: '龙渊的炉火熄灭后，这枚宝珠仍照着一片不肯冷却的余烬。', slot: 'weapon', family: 'staff', tier: 3, pool: 'caster',
    stat: 'attack', value: 23, affixCount: [2, 3], legacy: 'emberward', setName: 'gray-crown',
  },
  'wpn-t3-vox': {
    id: 'wpn-t3-vox', name: '春霖，复苏者的圣杖', flavor: '杖身刻满被划去的悼词，空白处长出了细小的叶纹。', slot: 'weapon', family: 'staff', tier: 3, pool: 'healer',
    stat: 'healReceived', value: 0.12, affixCount: [2, 3], legacy: 'mend', setName: 'gray-crown',
  },
  'arm-t3-bulwark': {
    id: 'arm-t3-bulwark', name: '灰冠壁垒', slot: 'armor', tier: 3, pool: 'tank',
    stat: 'defense', value: 16, affixCount: [2, 3], legacy: 'bulwark', setName: 'gray-crown',
  },
  'arm-t3-drake': {
    id: 'arm-t3-drake', name: '渊龙鳞铠', slot: 'armor', tier: 3, pool: 'tank',
    stat: 'fireResist', value: 0.25, affixCount: [2, 3], legacy: 'emberward', setName: 'gray-crown',
  },
  'arm-t3-whisper': {
    id: 'arm-t3-whisper', name: '缚魂裹尸布', slot: 'armor', tier: 3, pool: 'caster',
    stat: 'lifesteal', value: 0.09, affixCount: [2, 3], legacy: 'killheal', setName: 'gray-crown',
  },
  'arm-t3-gale': {
    id: 'arm-t3-gale', name: '风脊猎衣', slot: 'armor', tier: 3, pool: 'dps',
    stat: 'speed', value: 3, affixCount: [2, 3], legacy: 'focus', setName: 'gray-crown',
  },
  'trk-t3-vanguard': {
    id: 'trk-t3-vanguard', name: '前卫印玺', slot: 'trinket', tier: 3, pool: 'tank',
    stat: 'defense', value: 8, affixCount: [2, 3], legacy: 'bulwark', setName: 'gray-crown',
  },
  'trk-t3-seer': {
    id: 'trk-t3-seer', name: '先知圣徽', slot: 'trinket', tier: 3, pool: 'healer',
    stat: 'critChance', value: 0.07, affixCount: [2, 3], legacy: 'focus', setName: 'gray-crown',
  },
  'trk-t3-pyrexia': {
    id: 'trk-t3-pyrexia', name: '血宴杯', slot: 'trinket', tier: 3, pool: 'dps',
    stat: 'attack', value: 8, affixCount: [2, 3], legacy: 'killheal', setName: 'gray-crown',
  },

  'trk-dragon-talisman': {
    id: 'trk-dragon-talisman', name: '驭火者坠', slot: 'trinket', tier: 2,
    stat: 'fireResist', value: 0.15, affixCount: [1, 2], legacy: 'emberward', setName: 'gray-crown',
  },
  'wpn-dragon-brand': {
    id: 'wpn-dragon-brand', name: '烙焰，鳞音誓约之剑', flavor: '鳞音圣地的誓词刻在剑脊上，烧灼的痕迹止于最后一个字。', slot: 'weapon', family: 'blade', tier: 2,
    stat: 'attack', value: 14, affixCount: [2, 3], legacy: 'emberward', setName: 'gray-crown',
  },
}

// #2.8 断言:池标注必须合法(注册表键名实读校验,坑台账纪律)
{
  const POOLS = ['common', 'tank', 'healer', 'dps', 'caster']
  for (const [k, b] of Object.entries(ITEM_BASES)) {
    if (b.pool && !POOLS.includes(b.pool)) throw new Error(`基底 ${k} pool 非法:${b.pool}`)
  }
}

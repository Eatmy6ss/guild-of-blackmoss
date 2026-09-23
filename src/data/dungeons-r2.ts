import type { DungeonDef } from '../sim/types'

// ============================================================
// 版图二 · 龙脊山脉(鳞音圣战)——提案 docs/region2-proposal.md 已批注
// env:'heat' = 灼热地形(战斗中周期全队火伤,火抗减免)
// boss 尊名风格:WoW 化「尊号·名」
// ============================================================

export const EMBERPASS: DungeonDef = {
  id: 'emberpass',
  name: '烬石隘口',
  size: 3,
  branches: [
    { id: 'shortcut', name: '龙脊小径', risk: 3, reward: 2, desc: '快而险:翻越崩石,鳞音教哨卡密集' },
    { id: 'safepath', name: '盘山官道', risk: 1, reward: 1, desc: '稳而慢:商队踩出来的路,几乎无埋伏' },
  ],
  enemyPower: 1.2,
  expectedLevel: 11,
  enemyGroups: {
    dragonkin: [
      { id: 'dk-a', traits: ['dragon-scale'], name: '龙裔鳞卫', maxHp: 650, attack: 19, defense: 8, speed: 7, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'dk-b', traits: ['dragon-scale'], name: '龙裔鳞卫', maxHp: 650, attack: 19, defense: 8, speed: 7, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'dk-c', traits: ['ember-breath'], name: '龙裔吐息手', maxHp: 560, attack: 21, defense: 4, speed: 8, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    pilgrims: [
      { id: 'pg-a', traits: ['dragon-fear'], name: '朝圣狂徒', maxHp: 520, attack: 19, defense: 3, speed: 10, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'pg-b', traits: ['dragon-fear'], name: '朝圣狂徒', maxHp: 520, attack: 19, defense: 3, speed: 10, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'pg-c', traits: [], skills: [{ id: 'pg-chant', name: '圣音齐诵', effect: 'heal-lowest', target: 'ally', cooldownTicks: 100 }], name: '唱诗朝圣者', maxHp: 440, attack: 12, defense: 2, speed: 9, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
  },
  bosses: {
    kazraxes: {
      id: 'kazraxes',
      name: '烬喉者·卡兹拉克斯',
      maxHp: 3600,
      attack: 24,
      defense: 10,
      speed: 8,
      position: 'front',
      range: 'melee',
      mechanics: [
        { id: 'kz-slam', kind: 'telegraph-aoe', name: '熔石崩落', params: { telegraphTicks: 30, damage: 34, everyTicks: 110 } },
        { id: 'kz-call', kind: 'summon', name: '召朝圣狂徒', params: { atHpPct: 0.6, count: 2, groupId: 'pilgrims' } },
        { id: 'kz-enrage', kind: 'enrage', name: '隘口之怒', params: { atTick: 300, attackMult: 1.7 } },
      ],
      dropTable: [
        { baseId: 'arm-dragon-scalemail', chance: 0.3 },
        { baseId: 'trk-dragon-talisman', chance: 0.3 },
        { baseId: 'wpn-dragon-brand', chance: 0.25 },
      ],
    },
  },
  routeNodes: [
    { id: 'ep-sentinels', name: '崩石哨卡', kind: 'battle', encounterId: 'enc-dragonkin', desc: '龙裔鳞卫把守的隘口正面' },
    { id: 'ep-shrine', name: '路边圣龛', kind: 'event', desc: '鳞音教的路边圣龛还燃着香' },
    { id: 'ep-camp', name: '朝圣营地', kind: 'battle', encounterId: 'enc-pilgrims', desc: '借宿的朝圣者未必是好人' },
    { id: 'ep-rest', name: '背风岩窝', kind: 'rest', desc: '山风被岩壁挡住,火塘还有余温' },
    { id: 'ep-cache', name: '坠商货担', kind: 'treasure', desc: '掉下悬崖的商队货担挂在枯树上' },
  ],
  encounters: [
    { id: 'enc-dragonkin', name: '龙裔鳞卫', kind: 'wave', enemyGroupIds: ['dragonkin'] },
    { id: 'enc-pilgrims', name: '朝圣狂徒', kind: 'wave', enemyGroupIds: ['pilgrims'] },
    { id: 'enc-mix', name: '隘口混编', kind: 'wave', enemyGroupIds: ['dragonkin', 'pilgrims'] },
    { id: 'enc-kazraxes', name: '烬喉者·卡兹拉克斯', kind: 'boss', enemyGroupIds: [], bossId: 'kazraxes' },
  ],
}

export const SCALEHAVEN: DungeonDef = {
  id: 'scalehaven',
  name: '鳞音圣地带',
  size: 3,
  branches: [
    { id: 'shortcut', name: '圣像大道', risk: 3, reward: 2, desc: '快而险:从圣像脚下穿行,教众无处不在' },
    { id: 'safepath', name: '香客绕道', risk: 1, reward: 1, desc: '稳而慢:绕开圣地带的核心' },
  ],
  enemyPower: 1.25,
  expectedLevel: 12,
  enemyGroups: {
    fanatics: [
      { id: 'fn-a', traits: ['dragon-fear', 'dragon-scale'], name: '狂信卫士', maxHp: 1080, attack: 24, defense: 9, speed: 8, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'fn-b', traits: ['dragon-fear', 'dragon-scale'], name: '狂信卫士', maxHp: 1080, attack: 24, defense: 9, speed: 8, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
    drakeguard: [
      { id: 'dg-a', traits: ['ember-breath'], name: '龙裔祭卫', maxHp: 940, attack: 26, defense: 6, speed: 8, position: 'front', range: 'melee', archetype: 'striker' },
      { id: 'dg-b', traits: [], skills: [{ id: 'dg-heal', name: '祷焰共赞', effect: 'heal-lowest', target: 'ally', cooldownTicks: 95 }], name: '圣火祭司', maxHp: 760, attack: 16, defense: 3, speed: 9, position: 'back', range: 'ranged', archetype: 'striker' },
      { id: 'dg-c', traits: ['dragon-scale'], name: '龙裔祭卫', maxHp: 940, attack: 26, defense: 6, speed: 8, position: 'front', range: 'melee', archetype: 'striker' },
    ],
  },
  bosses: {
    ignathos: {
      id: 'ignathos',
      name: '焚祷大祭司·伊格纳托斯',
      maxHp: 4100,
      attack: 26,
      defense: 8,
      speed: 9,
      position: 'back',
      range: 'ranged',
      mechanics: [
        { id: 'ig-heal', kind: 'cast-heal', name: '祷焰共赞', params: { castTicks: 30, healAmount: 180, everyTicks: 260, breakDamage: 120 } },
        { id: 'ig-breath', kind: 'breath-charge', name: '圣火喷吐', params: { telegraphTicks: 33, damage: 36, everyTicks: 170 } },
        { id: 'ig-fear', kind: 'fear-aura', name: '龙威圣歌', params: { castTicks: 30, durationTicks: 200, everyTicks: 260, breakDamage: 110 } },
        { id: 'ig-enrage', kind: 'enrage', name: '圣焰焚身', params: { atTick: 320, attackMult: 1.75 } },
      ],
      dropTable: [
        { baseId: 'trk-dragon-talisman', chance: 0.35 },
        { baseId: 'wpn-dragon-brand', chance: 0.3 },
        { baseId: 'arm-dragon-scalemail', chance: 0.25 },
      ],
    },
  },
  routeNodes: [
    { id: 'sh-avenue', name: '圣像大道', kind: 'battle', encounterId: 'enc-fanatics', desc: '百步一圣像,十步一狂信' },
    { id: 'sh-alms', name: '施舍台', kind: 'event', desc: '教团的施舍台,收不收是个问题' },
    { id: 'sh-choir', name: '唱诗庭院', kind: 'battle', encounterId: 'enc-drakeguard', desc: '祭卫与圣火祭司的颂唱声' },
    { id: 'sh-rest', name: '香客房', kind: 'rest', desc: '香客歇脚的客房,被褥干净' },
    { id: 'sh-relic', name: '供品库房', kind: 'treasure', desc: '历代香客供进的珍品' },
  ],
  encounters: [
    { id: 'enc-fanatics', name: '狂信卫士', kind: 'wave', enemyGroupIds: ['fanatics'] },
    { id: 'enc-drakeguard', name: '龙裔祭卫', kind: 'wave', enemyGroupIds: ['drakeguard'] },
    { id: 'enc-ignathos', name: '焚祷大祭司·伊格纳托斯', kind: 'boss', enemyGroupIds: [], bossId: 'ignathos' },
  ],
}

export const FIRERIDGE: DungeonDef = {
  id: 'fireridge',
  name: '火脊巢穴',
  size: 3,
  branches: [
    { id: 'shortcut', name: '熔岩栈道', risk: 3, reward: 2, desc: '快而险:贴着熔岩走的独木栈' },
    { id: 'safepath', name: '风口斜坡', risk: 1, reward: 1, desc: '稳而慢:风大,但至少凉快些' },
  ],
  enemyPower: 1.35,
  expectedLevel: 13,
  env: 'heat',
  enemyGroups: {
    salamanders: [
      { id: 'sl-a', traits: ['ember-breath'], name: '火脊蜥蜴', maxHp: 580, attack: 22, defense: 8, speed: 9, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'sl-b', traits: ['ember-breath'], name: '火脊蜥蜴', maxHp: 580, attack: 22, defense: 8, speed: 9, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'sl-c', traits: ['dragon-scale'], name: '焰背蜥后', maxHp: 500, attack: 24, defense: 5, speed: 10, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    whelps: [
      { id: 'wp-a', traits: ['dragon-scale'], name: '龙渊幼龙', maxHp: 640, attack: 23, defense: 9, speed: 8, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'wp-b', traits: ['ember-breath', 'dragon-fear'], name: '龙裔驭火者', maxHp: 500, attack: 25, defense: 5, speed: 10, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
  },
  bosses: {
    valselon: {
      id: 'valselon',
      name: '烬翎幼龙·瓦尔塞隆',
      maxHp: 4400,
      attack: 28,
      defense: 9,
      speed: 9,
      position: 'front',
      range: 'melee',
      mechanics: [
        { id: 'vs-breath', kind: 'breath-charge', name: '烬翎吐息', params: { telegraphTicks: 33, damage: 40, everyTicks: 165 } },
        { id: 'vs-phase', kind: 'phase-invuln', name: '振翅升空', params: { everyTicks: 300, durationTicks: 30 } },
        { id: 'vs-enrage', kind: 'enrage', name: '巢穴之怒', params: { atTick: 260, attackMult: 1.8 } },
      ],
      dropTable: [
        { baseId: 'wpn-dragon-brand', chance: 0.35 },
        { baseId: 'arm-dragon-scalemail', chance: 0.3 },
        { baseId: 'trk-dragon-talisman', chance: 0.3 },
      ],
    },
  },
  routeNodes: [
    { id: 'fr-ledges', name: '蜥群岩架', kind: 'battle', encounterId: 'enc-salamanders', desc: '岩架上晒着成片的火脊蜥蜴' },
    { id: 'fr-eggs', name: '龙蛋窟', kind: 'event', desc: '满窟的龙蛋——每个都值一座宅子' },
    { id: 'fr-nest', name: '幼龙巢区', kind: 'battle', encounterId: 'enc-whelps', desc: '幼龙和驭火者的巡巢圈' },
    { id: 'fr-rest', name: '风口岩棚', kind: 'rest', desc: '唯一凉快些的地方,火抗的人才能睡得着' },
    { id: 'fr-cache', name: '先驱者遗装', kind: 'treasure', desc: '先前来探巢的先驱者留下的东西' },
  ],
  encounters: [
    { id: 'enc-salamanders', name: '火脊蜥蜴', kind: 'wave', enemyGroupIds: ['salamanders'] },
    { id: 'enc-whelps', name: '幼龙巡巢', kind: 'wave', enemyGroupIds: ['whelps'] },
    { id: 'enc-valselon', name: '烬翎幼龙·瓦尔塞隆', kind: 'boss', enemyGroupIds: [], bossId: 'valselon' },
  ],
}

export const PILGRIMPATH: DungeonDef = {
  id: 'pilgrim-path',
  name: '朝圣者古道',
  size: 3,
  branches: [
    { id: 'shortcut', name: '雪线垭口', risk: 3, reward: 2, desc: '快而险:雪线之上的风口垭口' },
    { id: 'safepath', name: '古道石阶', risk: 1, reward: 1, desc: '稳而慢:千年古道,台阶被磨得发亮' },
  ],
  enemyPower: 1.15,
  expectedLevel: 11,
  enemyGroups: {
    ghostpilgrims: [
      { id: 'gp-a', traits: ['dragon-fear'], name: '朝圣者亡魂', maxHp: 820, attack: 21, defense: 4, speed: 10, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'gp-b', traits: ['dragon-fear'], name: '朝圣者亡魂', maxHp: 820, attack: 21, defense: 4, speed: 10, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'gp-c', traits: [], name: '提灯亡魂', maxHp: 700, attack: 18, defense: 2, speed: 9, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    ridgehounds: [
      { id: 'rh-a', traits: ['pack-hunter'], name: '山脊霜狼', maxHp: 900, attack: 23, defense: 4, speed: 13, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'rh-b', traits: ['pack-hunter'], name: '山脊霜狼', maxHp: 900, attack: 23, defense: 4, speed: 13, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'rh-c', traits: ['last-stand'], name: '头狼', maxHp: 1000, attack: 25, defense: 5, speed: 14, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
  },
  bosses: {
    oengus: {
      id: 'oengus',
      name: '圣痕主教·奥恩格卢斯',
      maxHp: 3900,
      attack: 23,
      defense: 8,
      speed: 8,
      position: 'back',
      range: 'ranged',
      mechanics: [
        { id: 'og-zone', kind: 'ground-zone', name: '圣火成带', params: { castTicks: 30, durationTicks: 110, everyTicks: 320, breakDamage: 200 } },
        { id: 'og-fear', kind: 'fear-aura', name: '圣痕威压', params: { castTicks: 30, durationTicks: 200, everyTicks: 280, breakDamage: 110 } },
        { id: 'og-buff', kind: 'cast-buff', name: '古道祝圣', params: { castTicks: 30, attackBuff: 10, durationTicks: 130, everyTicks: 260, breakDamage: 110 } },
      ],
      dropTable: [
        { baseId: 'trk-dragon-talisman', chance: 0.3 },
        { baseId: 'arm-dragon-scalemail', chance: 0.25 },
        { baseId: 'wpn-dragon-brand', chance: 0.25 },
      ],
    },
  },
  routeNodes: [
    { id: 'pp-lanterns', name: '长明灯阶', kind: 'battle', encounterId: 'enc-ghostpilgrims', desc: '亡魂提着灯,还在走没走完的路' },
    { id: 'pp-shrine', name: '路碑圣龛', kind: 'event', desc: '千年路碑,刻满还愿者的名字' },
    { id: 'pp-hunt', name: '霜狼猎径', kind: 'battle', encounterId: 'enc-ridgehounds', desc: '狼群守着古道的必经处' },
    { id: 'pp-rest', name: '朝圣者灶屋', kind: 'rest', desc: '灶膛的火几百年没灭过' },
    { id: 'pp-offering', name: '还愿品堆', kind: 'treasure', desc: '还愿者留下的谢礼堆成了小山' },
  ],
  encounters: [
    { id: 'enc-ghostpilgrims', name: '朝圣者亡魂', kind: 'wave', enemyGroupIds: ['ghostpilgrims'] },
    { id: 'enc-ridgehounds', name: '山脊霜狼', kind: 'wave', enemyGroupIds: ['ridgehounds'] },
    { id: 'enc-oengus', name: '圣痕主教·奥恩格卢斯', kind: 'boss', enemyGroupIds: [], bossId: 'oengus' },
  ],
}

export const FORGEWORKS: DungeonDef = {
  id: 'forge-works',
  name: '熔铸工坊',
  size: 3,
  branches: [
    { id: 'shortcut', name: '熔炉主廊', risk: 3, reward: 2, desc: '快而险:锻炉之间穿行,热浪扑面' },
    { id: 'safepath', name: '矿车轨道', risk: 1, reward: 1, desc: '稳而慢:推着矿车绕行' },
  ],
  enemyPower: 1.3,
  expectedLevel: 12,
  enemyGroups: {
    forgewrought: [
      { id: 'fw-a', traits: ['heavy-plate', 'dragon-scale'], name: '锻偶卫队', maxHp: 860, attack: 21, defense: 12, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'fw-b', traits: ['heavy-plate', 'dragon-scale'], name: '锻偶卫队', maxHp: 860, attack: 21, defense: 12, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
    ],
    emberkin: [
      { id: 'ek-a', traits: ['ember-breath'], name: '烬晶元素', maxHp: 620, attack: 23, defense: 5, speed: 10, position: 'back', range: 'ranged', archetype: 'striker' },
      { id: 'ek-b', traits: ['dragon-fear'], name: '锻炉监工', maxHp: 680, attack: 20, defense: 7, speed: 9, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'ek-c', traits: [], skills: [{ id: 'ek-stoke', name: '添柴', effect: 'heal-lowest', target: 'ally', cooldownTicks: 100 }], name: '炉工学徒', maxHp: 540, attack: 13, defense: 3, speed: 9, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
  },
  bosses: {
    gramas: {
      id: 'gramas',
      name: '锻主·格拉玛斯',
      maxHp: 4300,
      attack: 27,
      defense: 14,
      speed: 7,
      position: 'front',
      range: 'melee',
      mechanics: [
        { id: 'gr-anvil', kind: 'telegraph-aoe', name: '铁砧镇地', params: { telegraphTicks: 30, damage: 38, everyTicks: 115 } },
        { id: 'gr-hook', kind: 'pull', name: '锻钩拽拉', params: { everyTicks: 250, durationTicks: 500 } },
        { id: 'gr-enrage', kind: 'enrage', name: '炉心过载', params: { atTick: 300, attackMult: 1.75 } },
      ],
      dropTable: [
        { baseId: 'arm-dragon-scalemail', chance: 0.3 },
        { baseId: 'wpn-dragon-brand', chance: 0.3 },
        { baseId: 'trk-dragon-talisman', chance: 0.25 },
      ],
    },
  },
  routeNodes: [
    { id: 'fo-hall', name: '锻炉大厅', kind: 'battle', encounterId: 'enc-forgewrought', desc: '锻偶列队守着主炉' },
    { id: 'fo-mold', name: '废模坑', kind: 'event', desc: '报废的铸模里还卡着半成品的胚料' },
    { id: 'fo-ember', name: '烬晶料场', kind: 'battle', encounterId: 'enc-emberkin', desc: '烬晶元素在料场游荡' },
    { id: 'fo-rest', name: '工头歇脚间', kind: 'rest', desc: '工头的皮沙发,火炉边上' },
    { id: 'fo-vault', name: '成品库', kind: 'treasure', desc: '出窑未久的成品架上还热着' },
  ],
  encounters: [
    { id: 'enc-forgewrought', name: '锻偶卫队', kind: 'wave', enemyGroupIds: ['forgewrought'] },
    { id: 'enc-emberkin', name: '烬晶与监工', kind: 'wave', enemyGroupIds: ['emberkin'] },
    { id: 'enc-gramas', name: '锻主·格拉玛斯', kind: 'boss', enemyGroupIds: [], bossId: 'gramas' },
  ],
}

export const DRAGONMAW: DungeonDef = {
  id: 'dragonmaw',
  name: '龙渊之心',
  size: 5,
  branches: [
    { id: 'shortcut', name: '渊口垂降', risk: 3, reward: 2, desc: '快而险:绳索垂进龙渊,没有退路' },
    { id: 'safepath', name: '教团秘道', risk: 1, reward: 1, desc: '稳而慢:教团运祭品的老路' },
  ],
  enemyPower: 1.5,
  expectedLevel: 13,
  env: 'heat',
  enemyGroups: {
    dragonspawn: [
      { id: 'ds-a', traits: ['dragon-scale', 'dragon-fear'], name: '龙渊鳞卫', maxHp: 760, attack: 22, defense: 11, speed: 8, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'ds-b', traits: ['dragon-scale', 'dragon-fear'], name: '龙渊鳞卫', maxHp: 760, attack: 22, defense: 11, speed: 8, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'ds-c', traits: ['ember-breath'], name: '龙渊驭火者', maxHp: 640, attack: 24, defense: 6, speed: 10, position: 'back', range: 'ranged', archetype: 'striker' },
      { id: 'ds-d', traits: [], skills: [{ id: 'ds-heal', name: '渊底圣歌', effect: 'heal-lowest', target: 'ally', cooldownTicks: 95 }], name: '龙渊祭司', maxHp: 580, attack: 14, defense: 4, speed: 9, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    drakeelite: [
      { id: 'de-a', traits: ['ember-breath', 'dragon-scale'], name: '渊龙亲卫', maxHp: 820, attack: 24, defense: 10, speed: 9, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'de-b', traits: ['ember-breath', 'dragon-scale'], name: '渊龙亲卫', maxHp: 820, attack: 24, defense: 10, speed: 9, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'de-c', traits: ['dragon-fear', 'last-stand'], name: '渊龙先锋', maxHp: 700, attack: 25, defense: 6, speed: 11, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
  },
  bosses: {
    valosaris: {
      id: 'valosaris',
      name: '鳞音教主·瓦洛萨里斯',
      // 团本压轴·全机制总考:六机制(版图一考题全回收+版图二新考题)——龙化三阶段由战报叙事承载
      maxHp: 4200,
      attack: 26,
      defense: 11,
      speed: 9,
      position: 'front',
      range: 'melee',
      mechanics: [
        { id: 'vl-buff', kind: 'cast-buff', name: '龙化初临', params: { castTicks: 30, attackBuff: 12, durationTicks: 140, everyTicks: 260, breakDamage: 120 } },
        { id: 'vl-bind', kind: 'bind', name: '鳞渊锁缚', params: { atHpPct: 0.72, bindTicks: 26, damage: 20 } },
        { id: 'vl-breath', kind: 'breath-charge', name: '龙渊吐息', params: { telegraphTicks: 33, damage: 44, everyTicks: 165 } },
        { id: 'vl-fear', kind: 'fear-aura', name: '真龙威压', params: { castTicks: 30, durationTicks: 200, everyTicks: 280, breakDamage: 120 } },
        { id: 'vl-call', kind: 'summon', name: '召渊龙亲卫', params: { atHpPct: 0.45, count: 2, groupId: 'drakeelite' } },
        { id: 'vl-enrage', kind: 'enrage', name: '完全龙化', params: { atTick: 340, attackMult: 1.85 } },
      ],
      dropTable: [
        { baseId: 'wpn-dragon-brand', chance: 0.4 },
        { baseId: 'arm-dragon-scalemail', chance: 0.35 },
        { baseId: 'trk-dragon-talisman', chance: 0.35 },
      ],
    },
  },
  routeNodes: [
    { id: 'dm-vanguard', name: '渊口鳞墙', kind: 'battle', encounterId: 'enc-dragonspawn', desc: '鳞卫在渊口列阵,教旗猎猎' },
    { id: 'dm-altar', name: '献祭祭坛', kind: 'event', desc: '祭坛上的火还没熄,祭品的痕迹还新' },
    { id: 'dm-elite', name: '亲卫巡渊', kind: 'battle', encounterId: 'enc-drakeelite', desc: '渊龙亲卫的巡渊路线' },
    { id: 'dm-rest', name: '教团内殿', kind: 'rest', desc: '教团自己的内殿,居然最凉快' },
    { id: 'dm-treasure', name: '教团圣库', kind: 'treasure', desc: '历代教团聚敛的圣库' },
    { id: 'dm-final', name: '龙眠深渊', kind: 'elite', encounterId: 'enc-drakeelite', desc: '最深处——龙眠之地,教主就在那里' },
  ],
  encounters: [
    { id: 'enc-dragonspawn', name: '龙渊鳞卫', kind: 'wave', enemyGroupIds: ['dragonspawn'] },
    { id: 'enc-drakeelite', name: '渊龙亲卫', kind: 'wave', enemyGroupIds: ['drakeelite'] },
    { id: 'enc-valosaris', name: '鳞音教主·瓦洛萨里斯', kind: 'boss', enemyGroupIds: [], bossId: 'valosaris' },
  ],
}

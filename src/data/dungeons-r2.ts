import type { DungeonDef, EnemyDef } from '../sim/types'

// ============================================================
// 版图二 · 龙脊山脉(鳞音圣战)——提案 docs/region2-proposal.md 已批注
// env:'heat' = 灼热地形(战斗中周期全队火伤,火抗减免)
// boss 尊名风格:WoW 化「尊号·名」
// ============================================================

const EMBER_CHANTER: EnemyDef = {
  id: 'pg-c', name: '唱诗朝圣者', traits: [], maxHp: 440, attack: 12, defense: 2, speed: 9,
  position: 'back', range: 'ranged', archetype: 'striker',
  mechanics: [
    { id: 'pg-chant', kind: 'cast-heal', name: '圣音齐诵', params: { firstTick: 75, castTicks: 40, healAmount: 180, everyTicks: 160, breakDamage: 110 } },
  ],
}
const EMBER_FANATIC: EnemyDef = {
  id: 'pg-a', traits: ['dragon-fear'], name: '朝圣狂徒', maxHp: 520, attack: 19, defense: 3,
  speed: 10, position: 'front', range: 'melee', archetype: 'bruiser',
}

export const EMBERPASS: DungeonDef = {
  id: 'emberpass',
  name: '烬石隘口',
  size: 3,
  terrains: {
    road: { weight: 3, names: ['龙脊小径', '盘山官道', '崩石哨卡'], encounters: ['enc-dragonkin', 'enc-mix'] },
    sanctum: { weight: 2, names: ['路边圣龛'], encounters: [] },
    camp: { weight: 2, names: ['朝圣营地', '背风岩窝'], encounters: ['enc-pilgrims'] },
    wild: { weight: 2, names: ['焦林', '灰烬灌木丛'], encounters: [] },
    lava: { weight: 2, names: ['烬石'], encounters: ['enc-mix'] },
  },
    rating: 1.919,
  expectedLevel: 11,
  enemyGroups: {
    dragonkin: [
      { id: 'dk-a', traits: ['dragon-scale'], name: '龙裔鳞卫', maxHp: 650, attack: 19, defense: 8, speed: 7, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'dk-b', traits: ['dragon-scale'], name: '龙裔鳞卫', maxHp: 650, attack: 19, defense: 8, speed: 7, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'dk-c', traits: [], name: '龙裔吐息手', maxHp: 560, attack: 21, defense: 4, speed: 8, position: 'back', range: 'ranged', archetype: 'striker',
        mechanics: [{ id: 'dk-breath', kind: 'telegraph-aoe', name: '灼风吐息', params: { firstTick: 45, telegraphTicks: 30, damage: 78, damageType: 'fire', everyTicks: 130 } }] },
    ],
    pilgrims: [
      EMBER_FANATIC,
      { ...EMBER_FANATIC, id: 'pg-b' },
      EMBER_CHANTER,
    ],
    reinforcements: [{ ...EMBER_FANATIC, id: 'kz-guard' }, { ...EMBER_CHANTER, id: 'kz-chanter' }],
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
        { id: 'kz-call', kind: 'summon', name: '隘口援军', params: { atHpPct: 0.6, count: 2, groupId: 'reinforcements', recoveryTicks: 60 } },
        { id: 'kz-enrage', kind: 'enrage', name: '隘口之怒', params: { atTick: 300, attackMult: 1.7 } },
      ],
      dropTable: [
        { baseId: 'arm-t3-drake', chance: 0.3 },
        { baseId: 'trk-t3-pyrexia', chance: 0.3 },
        { baseId: 'wpn-t3-ember', chance: 0.25 },
      ],
    },
  },
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
  terrains: {
    sanctum: { weight: 4, names: ['圣像大道', '施舍台', '唱诗庭院'], encounters: ['enc-fanatics', 'enc-drakeguard'] },
    road: { weight: 2, names: ['香客绕道'], encounters: ['enc-fanatics'] },
    camp: { weight: 2, names: ['香客房'], encounters: [] },
    grave: { weight: 2, names: ['殉道者墓', '无名坟丘'], encounters: [] },
  },
    rating: 2.652,
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
        { baseId: 'trk-t3-seer', chance: 0.35 },
        { baseId: 'wpn-t3-gale', chance: 0.3 },
        { baseId: 'arm-t3-drake', chance: 0.25 },
      ],
    },
  },
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
  terrains: {
    lava: { weight: 4, names: ['熔岩栈道', '蜥群岩架'], encounters: ['enc-salamanders'] },
    under: { weight: 3, names: ['龙蛋窟'], encounters: ['enc-whelps'] },
    road: { weight: 2, names: ['风口斜坡'], encounters: ['enc-whelps'] },
    camp: { weight: 2, names: ['风口岩棚'], encounters: [] },
    wild: { weight: 2, names: ['硫磺灌木', '焦木林'], encounters: [] },
  },
    rating: 2.799,
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
        { baseId: 'wpn-t3-ember', chance: 0.35 },
        { baseId: 'arm-t3-drake', chance: 0.3 },
        { baseId: 'trk-t3-pyrexia', chance: 0.3 },
      ],
    },
  },
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
  terrains: {
    road: { weight: 3, names: ['古道石阶', '雪线垭口'], encounters: ['enc-ghostpilgrims', 'enc-ridgehounds'] },
    sanctum: { weight: 2, names: ['路碑圣龛'], encounters: [] },
    grave: { weight: 3, names: ['长明灯阶'], encounters: ['enc-ghostpilgrims'] },
    camp: { weight: 2, names: ['朝圣者灶屋'], encounters: [] },
  },
    rating: 2.27,
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
        { baseId: 'trk-t3-seer', chance: 0.3 },
        { baseId: 'arm-t3-drake', chance: 0.25 },
        { baseId: 'wpn-t3-dawn', chance: 0.25 },
      ],
    },
  },
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
  terrains: {
    lava: { weight: 4, names: ['锻炉大厅', '熔炉主廊'], encounters: ['enc-forgewrought'] },
    under: { weight: 3, names: ['矿车轨道'], encounters: ['enc-emberkin'] },
    ruin: { weight: 3, names: ['废模坑'], encounters: ['enc-emberkin'] },
    camp: { weight: 2, names: ['工头歇脚间'], encounters: [] },
    water: { weight: 2, names: ['冷却渠', '蒸汽水槽'], encounters: [] },
  },
    rating: 2.727,
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
        { baseId: 'arm-t3-bulwark', chance: 0.3 },
        { baseId: 'wpn-t3-ember', chance: 0.3 },
        { baseId: 'trk-t3-vanguard', chance: 0.25 },
      ],
    },
  },
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
  terrains: {
    sanctum: { weight: 3, names: ['献祭祭坛', '教团内殿'], encounters: [] },
    lava: { weight: 4, names: ['渊口鳞墙', '龙渊'], encounters: ['enc-dragonspawn', 'enc-drakeelite'] },
    under: { weight: 3, names: ['龙眠深渊'], encounters: ['enc-drakeelite'] },
    grave: { weight: 2, names: ['祭品骸骨', '龙餐坟场'], encounters: [] },
    camp: { weight: 2, names: ['教团营垒', '祭司帐篷'], encounters: [] },
  },
  rating: 2.887,
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
        { baseId: 'wpn-t3-dawn', chance: 0.3 },
        { baseId: 'arm-t3-bulwark', chance: 0.3 },
        { baseId: 'trk-t3-pyrexia', chance: 0.25 },
        { baseId: 'wpn-t3-ember', chance: 0.4 },
        { baseId: 'arm-t3-drake', chance: 0.35 },
        { baseId: 'trk-t3-seer', chance: 0.35 },
      ],
    },
  },
  encounters: [
    { id: 'enc-dragonspawn', name: '龙渊鳞卫', kind: 'wave', enemyGroupIds: ['dragonspawn'] },
    { id: 'enc-drakeelite', name: '渊龙亲卫', kind: 'wave', enemyGroupIds: ['drakeelite'] },
    { id: 'enc-valosaris', name: '鳞音教主·瓦洛萨里斯', kind: 'boss', enemyGroupIds: [], bossId: 'valosaris' },
  ],
}

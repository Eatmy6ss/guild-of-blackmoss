import type { DungeonDef } from '../sim/types'

// M0 唯一副本：3 人本，2 boss，覆盖全部 5 种机制（机制引擎 D8-9 实装）
export const BLACKMOSS: DungeonDef = {
  id: 'blackmoss',
  name: '黑苔沼泽',
  size: 3,
  branches: [
    {
      id: 'shortcut',
      name: '蛙人小径',
      risk: 3,
      reward: 2,
      desc: '快而险：蛙人拦路，但离 boss 巢穴更近',
    },
    {
      id: 'safepath',
      name: '枯木栈道',
      risk: 1,
      reward: 1,
      desc: '慢而稳：多绕一段路，几乎无埋伏',
    },
  ],
  enemyGroups: {
    frogs: [
      { id: 'frog-a', name: '沼泽蛙人', maxHp: 450, attack: 8, defense: 4, speed: 7, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'frog-b', name: '沼泽蛙人', maxHp: 450, attack: 8, defense: 4, speed: 7, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'frog-c', name: '蛙人萨满', maxHp: 340, attack: 11, defense: 2, speed: 8, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    wolves: [
      { id: 'wolf-a', name: '腐化狼', maxHp: 540, attack: 14, defense: 3, speed: 12, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'wolf-b', name: '腐化狼', maxHp: 540, attack: 14, defense: 3, speed: 12, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
    // D15 反馈调参：节奏太快——新增缓冲场（肉度高、威胁低的杂兵）
    'frogs-frail': [
      { id: 'frog-add-a', name: '沼泽蛙人', maxHp: 280, attack: 8, defense: 3, speed: 7, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'frog-add-b', name: '沼泽蛙人', maxHp: 280, attack: 8, defense: 3, speed: 7, position: 'front', range: 'melee', archetype: 'shield' },
    ],
    'wolves-frail': [
      { id: 'wolf-add-a', name: '腐化狼', maxHp: 360, attack: 9, defense: 2, speed: 11, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'wolf-add-b', name: '腐化狼', maxHp: 360, attack: 9, defense: 2, speed: 11, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
    leeches: [
      { id: 'leech-a', name: '沼泽水蛭', maxHp: 420, attack: 8, defense: 2, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'leech-b', name: '沼泽水蛭', maxHp: 420, attack: 8, defense: 2, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'leech-c', name: '沼泽水蛭', maxHp: 420, attack: 9, defense: 2, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
    ],
  },
  bosses: {
    'grush': {
      id: 'grush',
      name: '沼泽食人魔·格鲁什',
      // 节奏改版:boss TTK 目标 35-45s——血 ×1.3;零指挥 54% 越界回调:血 2500/震地 30
      maxHp: 2500,
      attack: 18,
      defense: 8,
      speed: 7,
      position: 'front',
      range: 'melee',
      mechanics: [
        {
          id: 'grush-slam',
          kind: 'telegraph-aoe',
          name: '震地猛击',
          // D13:40 伤害/每 9s——硬吃 = 每 9s 全队 120 chip,分散 = 28;不切阵型会掉进保护线
          params: { telegraphTicks: 30, damage: 30, everyTicks: 100 },
        },
        {
          id: 'grush-call',
          kind: 'summon',
          name: '呼唤蛙人',
          // D15 反馈:召唤 1→2,增援压力翻倍
          params: { atHpPct: 0.5, count: 2, groupId: 'frogs-frail' },
        },
      ],
      dropTable: [
        { baseId: 'wpn-t2-bow', chance: 0.35 },
        { baseId: 'arm-t2-plate', chance: 0.35 },
      ],
    },
    'talma': {
      id: 'talma',
      name: '深渊祭司·塔尔玛',
      // D15 反馈:压迫感应强于格鲁什——全面加压(试玩反馈 #4)
      // 指挥有感补偿:打断变可达后中位胜率 86→98 越界,加血+狂暴提前把压力买回来
      // 节奏改版:血 ×1.25;中位 94% 越界回压:攻 15/束缚伤 22/狂暴提前 130
      maxHp: 3000,
      attack: 13,
      defense: 6,
      speed: 9,
      position: 'back',
      range: 'ranged',
      mechanics: [
        {
          id: 'talma-call',
          kind: 'summon',
          name: '唤起腐狼',
          params: { atHpPct: 0.75, count: 2, groupId: 'wolves-frail' },
        },
        {
          id: 'talma-void',
          kind: 'cast-buff',
          name: '虚空咏唱',
          // 指挥有感修正:实测 5 级小队 25tick 内仅能打出 65-80 伤害,180 门槛让打断形同虚设
          // (打断是指令映射的核心 payoff,门槛必须可达)——窗口 3s 供人反应,门槛压到小队可及
          params: { castTicks: 30, attackBuff: 10, durationTicks: 120, everyTicks: 240, breakDamage: 110 },
        },
        {
          id: 'talma-bind',
          kind: 'bind',
          name: '深渊束缚',
          // 节奏改版:0.5→0.6——战斗拉长后小队到不了半血线,束缚提前到 60% 保证中段机制必触发
          params: { atHpPct: 0.6, bindTicks: 24, damage: 18 },
        },
        {
          id: 'talma-enrage',
          kind: 'enrage',
          name: '狂暴软墙',
          params: { atTick: 140, attackMult: 1.8 },
        },
      ],
      dropTable: [
        { baseId: 'trk-t2-totem', chance: 0.5 },
        { baseId: 'wpn-t2-bow', chance: 0.2 },
      ],
    },
  },
  encounters: [
    { id: 'enc-frogs', name: '蛙人哨兵', kind: 'wave', enemyGroupIds: ['frogs'] },
    { id: 'enc-wolves', name: '腐化狼群', kind: 'wave', enemyGroupIds: ['wolves'] },
    { id: 'enc-leeches', name: '沼泽水蛭', kind: 'wave', enemyGroupIds: ['leeches'] },
    { id: 'enc-grush', name: '沼泽食人魔·格鲁什', kind: 'boss', enemyGroupIds: [], bossId: 'grush' },
    { id: 'enc-talma', name: '深渊祭司·塔尔玛', kind: 'boss', enemyGroupIds: [], bossId: 'talma' },
  ],
}

// 副本 #2(节奏改版后开工):锈坑矿道——废弃矿坑,尸化矿工与穴居生物
// boss 掘锚的机制组合(蓄力+召唤+定时狂暴)与黑苔双 boss(蓄力+召唤 / 咏唱+束缚+狂暴)刻意错开
export const RUSTMINE: DungeonDef = {
  id: 'rustmine',
  name: '锈坑矿道',
  size: 3,
  branches: [
    {
      id: 'cartline',
      name: '矿车轨道',
      risk: 3,
      reward: 3,
      desc: '直下主矿脉：穴蝠盘踞，但矿脉深处遗物更多',
    },
    {
      id: 'airshaft',
      name: '通风巷道',
      risk: 1,
      reward: 1,
      desc: '绕行风道：路远,但几乎不会遇到埋伏',
    },
  ],
  enemyGroups: {
    miners: [
      { id: 'miner-a', name: '尸化矿工', maxHp: 460, attack: 9, defense: 5, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'miner-b', name: '尸化矿工', maxHp: 460, attack: 9, defense: 5, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'lampkeeper', name: '矿灯术士', maxHp: 340, attack: 11, defense: 2, speed: 8, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    bats: [
      { id: 'bat-a', name: '锈穴蝠', maxHp: 420, attack: 13, defense: 2, speed: 14, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'bat-b', name: '锈穴蝠', maxHp: 420, attack: 13, defense: 2, speed: 14, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'bat-c', name: '锈穴蝠', maxHp: 340, attack: 12, defense: 2, speed: 14, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
    spiders: [
      { id: 'spider-a', name: '岩蛛', maxHp: 500, attack: 12, defense: 4, speed: 8, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'spider-b', name: '岩蛛', maxHp: 500, attack: 12, defense: 4, speed: 8, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'spider-queen', name: '毒蛛后', maxHp: 360, attack: 13, defense: 2, speed: 9, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    'bats-frail': [
      { id: 'bat-add-a', name: '锈穴蝠', maxHp: 300, attack: 10, defense: 2, speed: 13, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'bat-add-b', name: '锈穴蝠', maxHp: 300, attack: 10, defense: 2, speed: 13, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
  },
  bosses: {
    delveanchor: {
      id: 'delveanchor',
      name: '矿脉吞噬者·掘锚',
      // 节奏带:35-45s。慢速重锤(6 速=每 1s 一击),坑道坍塌逼走位,65% 呼蝠群,200tick 过载狂暴
      maxHp: 2600,
      attack: 16,
      defense: 7,
      speed: 6,
      position: 'front',
      range: 'melee',
      mechanics: [
        {
          id: 'delve-collapse',
          kind: 'telegraph-aoe',
          name: '坑道坍塌',
          params: { telegraphTicks: 36, damage: 32, everyTicks: 110 },
        },
        {
          id: 'delve-call',
          kind: 'summon',
          name: '唤出蝠群',
          params: { atHpPct: 0.65, count: 2, groupId: 'bats-frail' },
        },
        {
          id: 'delve-overload',
          kind: 'enrage',
          name: '过载运转',
          params: { atTick: 200, attackMult: 1.7 },
        },
      ],
      dropTable: [
        { baseId: 'arm-t2-plate', chance: 0.4 },
        { baseId: 'trk-t2-totem', chance: 0.25 },
        { baseId: 'wpn-t2-bow', chance: 0.2 },
      ],
    },
  },
  encounters: [
    { id: 'enc-miners', name: '尸化矿工队', kind: 'wave', enemyGroupIds: ['miners'] },
    { id: 'enc-bats', name: '锈穴蝠群', kind: 'wave', enemyGroupIds: ['bats'] },
    { id: 'enc-spiders', name: '岩蛛巢室', kind: 'wave', enemyGroupIds: ['spiders'] },
    { id: 'enc-delveanchor', name: '矿脉吞噬者·掘锚', kind: 'boss', enemyGroupIds: [], bossId: 'delveanchor' },
  ],
}

// 副本 #3:灰烬旧战场——一代王朝的葬身之地,骸骨仍在列队
// boss 摩尔德雷克首个「双指令 boss」:葬仪横扫逼分散 + 亡者号角逼打断 + 唤怨灵逼转火,
// 三条指挥线同时在手,难度阶梯压在 #4/#5 之前
export const ASHFIELD: DungeonDef = {
  id: 'ashfield',
  name: '灰烬旧战场',
  size: 3,
  branches: [
    {
      id: 'boneroad',
      name: '白骨大道',
      risk: 3,
      reward: 3,
      desc: '直取王帐废墟：骸骨列队守路，但军械库的遗物就在深处',
    },
    {
      id: 'riverwash',
      name: '河滩绕行',
      risk: 1,
      reward: 1,
      desc: '沿灰河绕行：路远泥泞，但亡者不喜水声',
    },
  ],
  enemyGroups: {
    skeletons: [
      { id: 'skeleton-a', name: '骸骨盾兵', maxHp: 460, attack: 9, defense: 5, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'skeleton-b', name: '骸骨盾兵', maxHp: 460, attack: 9, defense: 5, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'wraith-caster', name: '怨灵术士', maxHp: 340, attack: 11, defense: 2, speed: 8, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    wraiths: [
      { id: 'wraith-a', name: '战场怨灵', maxHp: 400, attack: 12, defense: 2, speed: 14, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'wraith-b', name: '战场怨灵', maxHp: 400, attack: 12, defense: 2, speed: 14, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'wraith-c', name: '战场怨灵', maxHp: 360, attack: 12, defense: 2, speed: 14, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
    knights: [
      { id: 'tombknight-a', name: '墓骑', maxHp: 520, attack: 12, defense: 4, speed: 8, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'tombknight-b', name: '墓骑', maxHp: 520, attack: 12, defense: 4, speed: 8, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'elegist', name: '挽歌者', maxHp: 360, attack: 13, defense: 2, speed: 9, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    'wraiths-frail': [
      { id: 'wraith-add-a', name: '战场怨灵', maxHp: 300, attack: 10, defense: 2, speed: 13, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'wraith-add-b', name: '战场怨灵', maxHp: 300, attack: 10, defense: 2, speed: 13, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
  },
  bosses: {
    moldreke: {
      id: 'moldreke',
      name: '破誓大公·摩尔德雷克',
      // 节奏带 35-45s:横扫(分散)/号角(打断)/怨灵(转火)三线指挥,参数沿用已校准线
      maxHp: 2600,
      attack: 15,
      defense: 7,
      speed: 7,
      position: 'front',
      range: 'melee',
      mechanics: [
        {
          id: 'mold-sweep',
          kind: 'telegraph-aoe',
          name: '葬仪横扫',
          params: { telegraphTicks: 36, damage: 30, everyTicks: 105 },
        },
        {
          id: 'mold-horn',
          kind: 'cast-buff',
          name: '亡者号角',
          params: { castTicks: 30, attackBuff: 9, durationTicks: 120, everyTicks: 240, breakDamage: 110 },
        },
        {
          id: 'mold-call',
          kind: 'summon',
          name: '唤起怨灵',
          params: { atHpPct: 0.6, count: 2, groupId: 'wraiths-frail' },
        },
      ],
      dropTable: [
        { baseId: 'wpn-t2-bow', chance: 0.4 },
        { baseId: 'arm-t2-plate', chance: 0.25 },
      ],
    },
  },
  encounters: [
    { id: 'enc-skeletons', name: '骸骨列队', kind: 'wave', enemyGroupIds: ['skeletons'] },
    { id: 'enc-wraiths', name: '怨灵游荡', kind: 'wave', enemyGroupIds: ['wraiths'] },
    { id: 'enc-knights', name: '墓骑巡境', kind: 'wave', enemyGroupIds: ['knights'] },
    { id: 'enc-moldreke', name: '破誓大公·摩尔德雷克', kind: 'boss', enemyGroupIds: [], bossId: 'moldreke' },
  ],
}

/** 副本注册表(UI 选择/完整性校验用)——新副本在这里登记 */
export const DUNGEONS: DungeonDef[] = [BLACKMOSS, RUSTMINE, ASHFIELD]

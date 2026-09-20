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

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
      { id: 'frog-a', name: '沼泽蛙人', maxHp: 320, attack: 9, defense: 2, speed: 10, position: 'front', range: 'melee' },
      { id: 'frog-b', name: '沼泽蛙人', maxHp: 320, attack: 9, defense: 2, speed: 10, position: 'front', range: 'melee' },
      { id: 'frog-c', name: '蛙人萨满', maxHp: 240, attack: 10, defense: 1, speed: 9, position: 'back', range: 'ranged' },
    ],
    wolves: [
      { id: 'wolf-a', name: '腐化狼', maxHp: 360, attack: 13, defense: 2, speed: 12, position: 'front', range: 'melee' },
      { id: 'wolf-b', name: '腐化狼', maxHp: 360, attack: 13, defense: 2, speed: 12, position: 'front', range: 'melee' },
    ],
    // D15 反馈调参：节奏太快——新增缓冲场（肉度高、威胁低的杂兵）
    'frogs-frail': [
      { id: 'frog-add-a', name: '沼泽蛙人', maxHp: 200, attack: 8, defense: 1, speed: 9, position: 'front', range: 'melee' },
      { id: 'frog-add-b', name: '沼泽蛙人', maxHp: 200, attack: 8, defense: 1, speed: 9, position: 'front', range: 'melee' },
    ],
    'wolves-frail': [
      { id: 'wolf-add-a', name: '腐化狼', maxHp: 260, attack: 9, defense: 1, speed: 11, position: 'front', range: 'melee' },
      { id: 'wolf-add-b', name: '腐化狼', maxHp: 260, attack: 9, defense: 1, speed: 11, position: 'front', range: 'melee' },
    ],
    leeches: [
      { id: 'leech-a', name: '沼泽水蛭', maxHp: 300, attack: 8, defense: 1, speed: 8, position: 'front', range: 'melee' },
      { id: 'leech-b', name: '沼泽水蛭', maxHp: 300, attack: 8, defense: 1, speed: 8, position: 'front', range: 'melee' },
      { id: 'leech-c', name: '沼泽水蛭', maxHp: 300, attack: 9, defense: 1, speed: 8, position: 'front', range: 'melee' },
    ],
  },
  bosses: {
    'grush': {
      id: 'grush',
      name: '沼泽食人魔·格鲁什',
      maxHp: 1900,
      attack: 18,
      defense: 6,
      speed: 7,
      position: 'front',
      range: 'melee',
      mechanics: [
        {
          id: 'grush-slam',
          kind: 'telegraph-aoe',
          name: '震地猛击',
          // D13:40 伤害/每 9s——硬吃 = 每 9s 全队 120 chip,分散 = 28;不切阵型会掉进保护线
          params: { telegraphTicks: 30, damage: 26, everyTicks: 100 },
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
      maxHp: 2000,
      attack: 14,
      defense: 5,
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
          params: { castTicks: 25, attackBuff: 10, durationTicks: 120, everyTicks: 240, breakDamage: 180 },
        },
        {
          id: 'talma-bind',
          kind: 'bind',
          name: '深渊束缚',
          params: { atHpPct: 0.5, bindTicks: 24, damage: 14 },
        },
        {
          id: 'talma-enrage',
          kind: 'enrage',
          name: '狂暴软墙',
          params: { atTick: 160, attackMult: 1.6 },
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

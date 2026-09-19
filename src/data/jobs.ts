import type { JobDef } from '../sim/types'

// 三职业（M0 范围）：守卫/牧师/游侠，覆盖轻协同铁三角
// 数值全部是占位，D13-14 平衡轮再调
export const JOBS: Record<string, JobDef> = {
  guard: {
    id: 'guard',
    name: '守卫',
    role: 'tank',
    attackAttr: 'str',
    position: 'front',
    range: 'melee',
    // D15 反馈调参：坦克太硬（试玩反馈 #2）——削基础血与防御，压力感给足
    base: { maxHp: 104, attack: 6, defense: 7, speed: 8, critChance: 0.05 },
    growth: { maxHp: 12, attack: 1.0, defense: 1.0 },
    skills: [
      {
        id: 'guard-taunt',
        name: '威吓',
        effect: 'taunt',
        target: 'enemy',
        cooldownTicks: 60,
      },
    ],
    synergy: ['shield-wall'],
  },
  priest: {
    id: 'priest',
    name: '牧师',
    role: 'healer',
    attackAttr: 'int',
    position: 'back',
    range: 'ranged',
    base: { maxHp: 80, attack: 5.4, defense: 4, speed: 9, critChance: 0.05 },
    growth: { maxHp: 8, attack: 1.1, defense: 0.7 },
    skills: [
      {
        id: 'priest-heal',
        name: '圣光术',
        effect: 'heal-lowest',
        target: 'ally',
        cooldownTicks: 15,
      },
    ],
    synergy: ['blessed-formation'],
  },
  ranger: {
    id: 'ranger',
    name: '游侠',
    role: 'dps',
    attackAttr: 'agi',
    position: 'back',
    range: 'ranged',
    base: { maxHp: 90, attack: 8.4, defense: 4, speed: 11, critChance: 0.12 },
    growth: { maxHp: 9, attack: 1.4, defense: 0.7 },
    skills: [
      {
        id: 'ranger-aimed',
        name: '瞄准射击',
        effect: 'heavy-strike',
        target: 'enemy',
        cooldownTicks: 70,
      },
    ],
    synergy: ['shield-wall'],
  },
}

// 轻协同词条（Q13）：效果引擎 D3-4 实装
export const SYNERGY: Record<string, { name: string; desc: string }> = {
  'shield-wall': {
    name: '盾墙掩护',
    desc: '守卫存活时，游侠伤害 +15%',
  },
  'blessed-formation': {
    name: '祝福阵型',
    desc: '牧师存活时，全队防御 +10%',
  },
}

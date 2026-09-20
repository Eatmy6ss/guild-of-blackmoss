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
    // 节奏改版(2026-09-20):攻速分化=守卫适中 0.9s/刀(60/7≈9tick);血量×1.5 拉长双向 TTK
    base: { maxHp: 156, attack: 7, defense: 9, speed: 7, critChance: 0.05 },
    growth: { maxHp: 18, attack: 1.0, defense: 1.0 },
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
    // 节奏改版:牧师最慢 1.4s/刀(60/4.3≈14tick,治疗循环靠圣光而非平砍);血量×1.5;
    // 攻击 5.4→7.0 = 圣光术治疗量同步 +30%(血池×1.5 后治疗吞吐必须跟上,否则撑不到 boss 中段机制)
    base: { maxHp: 120, attack: 7.0, defense: 5, speed: 4.3, critChance: 0.05 },
    growth: { maxHp: 12, attack: 1.2, defense: 0.7 },
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
    // 节奏改版:游侠最快 0.6s/刀(60/10=6tick);血量×1.5,攻击微降抵消杂兵变肉
    base: { maxHp: 135, attack: 8.0, defense: 4, speed: 10, critChance: 0.12 },
    growth: { maxHp: 13, attack: 1.4, defense: 0.7 },
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

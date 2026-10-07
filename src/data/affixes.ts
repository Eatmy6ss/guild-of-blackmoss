import type { AffixDef } from '../sim/types'

// 词条表(#2.1 tier 化,批次 2/U37):8 条存活命名词条,同词条不同 tier 只改区间不新增 id。
// 删除同属性多档(atk2/brutal/hp2/thick/vital/guard/swift/keen/leech/emberproof)——
// 它们的区间成为存活词条的 tier 2/3 区间(沿用原数值,不重新设计)。
// 老档 rolls 里的被删 id 由存档迁移 v30 映射(值保留),映射表见 AFFIX_RENAMES。

export const AFFIXES: Record<string, AffixDef> = {
  'aff-atk': {
    id: 'aff-atk', name: '锋利', stat: 'attack',
    // t1=原锋利 t2=原蛮力 t3=原残暴
    tiers: [{ tier: 1, range: [2, 6] }, { tier: 2, range: [4, 9] }, { tier: 3, range: [6, 11] }],
    pools: ['dps'],
  },
  'aff-hp': {
    id: 'aff-hp', name: '坚韧', stat: 'maxHp',
    // t1=原坚韧 t2=原活力(hp2) t3=原生气(vital)
    tiers: [{ tier: 1, range: [10, 30] }, { tier: 2, range: [20, 45] }, { tier: 3, range: [40, 80] }],
    pools: ['tank'],
  },
  'aff-def': {
    id: 'aff-def', name: '加固', stat: 'defense',
    tiers: [{ tier: 1, range: [1, 4] }, { tier: 2, range: [3, 6] }],
    pools: ['tank'],
  },
  'aff-spd': {
    id: 'aff-spd', name: '轻捷', stat: 'speed',
    tiers: [{ tier: 1, range: [1, 3] }, { tier: 2, range: [2, 4] }],
    pools: ['common'],
  },
  'aff-crit': {
    id: 'aff-crit', name: '致命', stat: 'critChance',
    tiers: [{ tier: 1, range: [0.02, 0.08] }, { tier: 2, range: [0.05, 0.1] }],
    pools: ['dps'],
  },
  'aff-steal': {
    id: 'aff-steal', name: '吸血', stat: 'lifesteal',
    tiers: [{ tier: 1, range: [0.03, 0.08] }, { tier: 2, range: [0.06, 0.12] }],
    pools: ['dps'],
  },
  'aff-heal': {
    id: 'aff-heal', name: '受疗', stat: 'healReceived',
    tiers: [{ tier: 1, range: [0.05, 0.12] }],
    pools: ['healer', 'tank'],
  },
  'aff-fireguard': {
    id: 'aff-fireguard', name: '驭火', stat: 'fireResist',
    tiers: [{ tier: 1, range: [0.08, 0.18] }, { tier: 2, range: [0.15, 0.28] }],
    pools: ['common'],
  },
  // ===== #2.2 批次 2 新属性词条(数值 C4 占位) =====
  'aff-critdmg': {
    id: 'aff-critdmg', name: '暴烈', stat: 'critDamage',
    tiers: [{ tier: 1, range: [0.15, 0.35] }, { tier: 2, range: [0.25, 0.5] }],
    pools: ['dps'],
  },
  'aff-atkspd': {
    id: 'aff-atkspd', name: '迅疾', stat: 'attackSpeed',
    tiers: [{ tier: 1, range: [0.08, 0.15] }, { tier: 2, range: [0.12, 0.22] }],
    pools: ['dps', 'common'],
  },
  'aff-pen': {
    id: 'aff-pen', name: '破甲', stat: 'armorPen',
    tiers: [{ tier: 1, range: [2, 4] }, { tier: 2, range: [3, 6] }],
    pools: ['dps'],
  },
  'aff-bulwarkheart': {
    id: 'aff-bulwarkheart', name: '磐心', stat: 'damageReduction',
    tiers: [{ tier: 1, range: [0.04, 0.08] }, { tier: 2, range: [0.06, 0.12] }],
    pools: ['tank'],
  },
  'aff-holyheal': {
    id: 'aff-holyheal', name: '圣愈', stat: 'healPower',
    tiers: [{ tier: 1, range: [0.1, 0.2] }, { tier: 2, range: [0.15, 0.3] }],
    pools: ['healer', 'caster'],
  },
  'aff-dread': {
    id: 'aff-dread', name: '慑魄', stat: 'threatMult',
    tiers: [{ tier: 1, range: [0.15, 0.3] }, { tier: 2, range: [0.25, 0.45] }],
    pools: ['tank'],
  },
  'aff-focusmind': {
    id: 'aff-focusmind', name: '凝神', stat: 'cdReduction',
    tiers: [{ tier: 1, range: [0.08, 0.15] }, { tier: 2, range: [0.12, 0.2] }],
    pools: ['caster', 'healer'],
  },
  // ===== #2.3 触发类词条(复用威能钩子:击杀回血/低血攻击/受击反弹;数值 C4 占位) =====
  'aff-blooddebt': {
    id: 'aff-blooddebt', name: '血债', stat: 'lifesteal', trigger: 'kill-heal',
    tiers: [{ tier: 1, range: [0.02, 0.04] }, { tier: 2, range: [0.04, 0.07] }],
    pools: ['dps'],
  },
  'aff-vow': {
    id: 'aff-vow', name: '背水', stat: 'attack', trigger: 'low-hp-attack',
    tiers: [{ tier: 1, range: [0.12, 0.2] }, { tier: 2, range: [0.18, 0.3] }],
    pools: ['dps', 'tank'],
  },
  'aff-thorn': {
    id: 'aff-thorn', name: '棘肤', stat: 'defense', trigger: 'hit-reflect',
    tiers: [{ tier: 1, range: [0.08, 0.15] }, { tier: 2, range: [0.12, 0.2] }],
    pools: ['tank'],
  },
}

/** v30 迁移映射:被删多档词条 → 存活词条(rolls 值保留,重掷时才按 tier 重取区间) */
export const AFFIX_RENAMES: Record<string, string> = {
  'aff-atk2': 'aff-atk',
  'aff-brutal': 'aff-atk',
  'aff-hp2': 'aff-hp',
  'aff-thick': 'aff-hp',
  'aff-vital': 'aff-hp',
  'aff-guard': 'aff-def',
  'aff-swift': 'aff-spd',
  'aff-keen': 'aff-crit',
  'aff-leech': 'aff-steal',
  'aff-emberproof': 'aff-fireguard',
}

// 注册表键名断言(坑台账:键名必须对数据表实读校验,warrior 键名事故的教训)
{
  const required = ['id', 'name', 'stat', 'tiers', 'pools'] as const
  const tiersAscending = (a: AffixDef) => a.tiers.every((t, i) => i === 0 || t.tier > a.tiers[i - 1]!.tier)
  for (const aff of Object.values(AFFIXES)) {
    for (const key of required) if (aff[key] === undefined) throw new Error(`词条 ${aff.id} 缺少 ${key}`)
    if (!tiersAscending(aff)) throw new Error(`词条 ${aff.id} 的 tiers 未按 tier 升序`)
    if (aff.pools.length === 0) throw new Error(`词条 ${aff.id} 无倾向池`)
  }
  for (const [from, to] of Object.entries(AFFIX_RENAMES)) {
    if (!AFFIXES[to]) throw new Error(`AFFIX_RENAMES 指向不存在的词条:${from}→${to}`)
    if (AFFIXES[from]) throw new Error(`AFFIX_RENAMES 的源词条仍存活:${from}`)
  }
}

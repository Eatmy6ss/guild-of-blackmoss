import type { AffixDef } from '../sim/types'

// 词缀池（Q17）：掉落时 roll。M0 先 8 条，D10 实装掉落
export const AFFIXES: Record<string, AffixDef> = {
  'aff-atk': { id: 'aff-atk', name: '锋利', stat: 'attack', range: [2, 6] },
  'aff-hp': { id: 'aff-hp', name: '坚韧', stat: 'maxHp', range: [10, 30] },
  'aff-def': { id: 'aff-def', name: '加固', stat: 'defense', range: [1, 4] },
  'aff-spd': { id: 'aff-spd', name: '轻捷', stat: 'speed', range: [1, 3] },
  'aff-crit': { id: 'aff-crit', name: '致命', stat: 'critChance', range: [0.02, 0.08] },
  'aff-steal': { id: 'aff-steal', name: '吸血', stat: 'lifesteal', range: [0.03, 0.08] },
  'aff-atk2': { id: 'aff-atk2', name: '蛮力', stat: 'attack', range: [4, 9] },
  'aff-hp2': { id: 'aff-hp2', name: '活力', stat: 'maxHp', range: [20, 45] },
}

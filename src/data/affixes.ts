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
  // 装备扩容(2026-09-22):8→16,新方向含受疗
  'aff-thick': { id: 'aff-thick', name: '厚实', stat: 'maxHp', range: [25, 60] },
  'aff-swift': { id: 'aff-swift', name: '迅捷', stat: 'speed', range: [2, 4] },
  'aff-leech': { id: 'aff-leech', name: '血噬', stat: 'lifesteal', range: [0.06, 0.12] },
  'aff-keen': { id: 'aff-keen', name: '精准', stat: 'critChance', range: [0.05, 0.1] },
  'aff-heal': { id: 'aff-heal', name: '受疗', stat: 'healReceived', range: [0.05, 0.12] },
  'aff-guard': { id: 'aff-guard', name: '御守', stat: 'defense', range: [3, 6] },
  'aff-brutal': { id: 'aff-brutal', name: '残暴', stat: 'attack', range: [6, 11] },
  'aff-vital': { id: 'aff-vital', name: '生气', stat: 'maxHp', range: [40, 80] },
}

import { formatPercent, formatStat } from './loot'

// 已有两套的数值源；不增加新套装或改变激活门槛。
export const EQUIPMENT_SETS = {
  'gray-crown': { name: '灰冠', twoPiece: 0.05, threePiece: 0.1 },
  'wind-hunt': { name: '猎风', twoPiece: 0.03, threePiece: 0.06 },
} as const

type SetId = keyof typeof EQUIPMENT_SETS

export function equipmentSetBonus(id: SetId, count: number): number {
  const set = EQUIPMENT_SETS[id]
  return count >= 3 ? set.threePiece : count >= 2 ? set.twoPiece : 0
}

export function describeEquipmentSet(id: SetId, count: number): string {
  if (count <= 0) return ''
  const bonus = equipmentSetBonus(id, count)
  const effect = id === 'gray-crown'
    ? `伤害 ${formatPercent(bonus, true)}`
    : `暴击 ${formatStat('critChance', bonus, true)}`
  return `${EQUIPMENT_SETS[id].name} ${count} 件${bonus ? `（${effect}）` : ''}`
}

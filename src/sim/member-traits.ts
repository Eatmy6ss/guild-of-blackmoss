import type { Member } from './types'
import { ITEM_BASES } from '../data/items'

export const TRAIT_LABELS: Record<string, string> = { drinker: '爱喝酒', lucky: '幸运儿', cool: '冷静' }
/** 已有特性保留，仅为空缺成员立特性。 */
export function assignTrait(member: Member, rng = Math.random): boolean {
  if (member.trait || rng() >= 0.55) return false
  member.trait = ['drinker', 'lucky', 'cool'][Math.floor(rng() * 3)]
  return true
}
/** 同来源不按人数叠加，幸运儿与拾荒为两个独立来源。 */
export function waveDropBonus(members: Member[]): number {
  const alive = members.filter(m => m.alive)
  const scavenger = alive.some(m => Object.values(m.equipment).some(e => e && ITEM_BASES[e.baseId]?.legacy === 'scavenger'))
  return (scavenger ? 0.04 : 0) + (alive.some(m => m.trait === 'lucky') ? 0.02 : 0)
}

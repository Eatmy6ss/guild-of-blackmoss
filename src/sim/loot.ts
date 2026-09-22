import type { ItemBaseDef, ItemInstance, ItemQuality, Slot, StatKey } from './types'
import { ITEM_BASES } from '../data/items'
import { AFFIXES } from '../data/affixes'

// 掉落系统（D10，Q17/Q22）：boss 掉什么固定（掉落表），什么词条掉落时 roll。
// 装备属性 = 基础盘 + 词条聚合，战斗投影时一次性加算。

let itemSeq = 0

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 词条 roll：条数在装备基础盘区间内，不重复同一条缀 id，数值在区间内 */
function rollAffixes(rng: () => number, base: ItemBaseDef): ItemInstance['rolls'] {
  const [minC, maxC] = base.affixCount
  const count = minC + Math.floor(rng() * (maxC - minC + 1))
  const pool = Object.values(AFFIXES)
  const used = new Set<string>()
  const rolls: ItemInstance['rolls'] = []
  // 装备纪元(宪法 v3.3):词条区间按 tier 表递增——版图一 T1-T2,版图二 T3-T4
  const TIER_SCALE: Record<number, number> = { 1: 1, 2: 1.5, 3: 2.1, 4: 2.8 }
  const tierScale = TIER_SCALE[base.tier] ?? 1
  for (let i = 0; i < count; i++) {
    const candidates = pool.filter((a) => !used.has(a.id))
    if (candidates.length === 0) break
    const aff = candidates[Math.floor(rng() * candidates.length)]
    used.add(aff.id)
    const lo = aff.range[0] * tierScale
    const hi = aff.range[1] * tierScale
    rolls.push({
      affixId: aff.id,
      value: round2(lo + rng() * (hi - lo)),
    })
  }
  return rolls
}

/** 品级(宪法 v3.3 装备三轴):白/绿/紫——紫史诗:词条更多、数值更高 */
export const QUALITY_BIAS_BASE = 0.12
function rollQuality(rng: () => number, bias = 0): ItemQuality {
  const purple = 0.12 + bias
  const green = 0.38 + bias * 0.5
  const r = rng()
  if (r < purple) return 'purple'
  if (r < purple + green) return 'green'
  return 'white'
}

export function rollDrop(baseId: string, rng: () => number, opts?: { qualityBias?: number }): ItemInstance {
  const base = ITEM_BASES[baseId]
  const quality = rollQuality(rng, opts?.qualityBias ?? 0)
  const rolls = rollAffixes(rng, base)
  const qAdj = quality === 'purple' ? { mult: 1.25, add: 1 } : quality === 'green' ? { mult: 1.08, add: 0 } : { mult: 0.9, add: -0 }
  const adjusted = rolls.map((r) => ({ ...r, value: round2(r.value * qAdj.mult) }))
  if (qAdj.add > 0 && base.affixCount[1] > adjusted.length && rng() < 0.6) {
    const pool = Object.values(AFFIXES).filter((x) => !adjusted.some((r) => r.affixId === x.id))
    if (pool.length > 0) {
      const aff = pool[Math.floor(rng() * pool.length)]
      adjusted.push({ affixId: aff.id, value: round2(aff.range[0] * (base.tier >= 2 ? 1.5 : 1)) })
    }
  }
  return { id: `i${++itemSeq}`, baseId, quality, rolls: adjusted }
}

/** boss 固定掉落表结算：每条按 chance 独立 roll；pity=true 时空手则保底一件（D14 首杀保底） */
export function rollBossDrops(
  dropTable: { baseId: string; chance: number }[],
  seed: number,
  opts?: { pity?: boolean },
): ItemInstance[] {
  const rng = createLootRng(seed)
  const drops: ItemInstance[] = []
  for (const entry of dropTable) {
    if (rng() < entry.chance) drops.push(rollDrop(entry.baseId, rng))
  }
  if (drops.length === 0 && opts?.pity && dropTable.length > 0) {
    // 保底掉 chance 最高的条目（通常即本 boss 的代表掉落）
    const best = dropTable.reduce((a, b) => (b.chance >= a.chance ? b : a))
    drops.push(rollDrop(best.baseId, rng))
  }
  return drops
}

export function createLootRng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ===== 属性聚合 =====

export type StatBundle = Partial<Record<StatKey, number>>

export function itemStats(item: ItemInstance): StatBundle {
  const base = ITEM_BASES[item.baseId]
  const out: StatBundle = { [base.stat]: base.value }
  for (const r of item.rolls) {
    const aff = AFFIXES[r.affixId]
    out[aff.stat] = round2((out[aff.stat] ?? 0) + r.value)
  }
  return out
}

export function equipmentStats(equipment: Partial<Record<Slot, ItemInstance>>): StatBundle {
  const out: StatBundle = {}
  for (const item of Object.values(equipment)) {
    if (!item) continue
    const s = itemStats(item)
    for (const k of Object.keys(s) as StatKey[]) {
      out[k] = round2((out[k] ?? 0) + (s[k] ?? 0))
    }
  }
  return out
}

export function describeItem(item: ItemInstance): string {
  const base = ITEM_BASES[item.baseId]
  const qName = item.quality === 'purple' ? '【史诗】' : item.quality === 'green' ? '【精良】' : ''
  const parts = [qName + `${STAT_NAME[base.stat]}+${fmt(base.stat, base.value)}`]
  for (const r of item.rolls) {
    const aff = AFFIXES[r.affixId]
    parts.push(`${aff.name}+${fmt(aff.stat, r.value)}`)
  }
  return `${base.name}（${parts.join('，')}）`
}

function fmt(stat: StatKey, v: number): string {
  return stat === 'critChance' || stat === 'lifesteal'
    ? `${Math.round(v * 100)}%`
    : `${Math.round(v * 10) / 10}`
}

export const STAT_NAME: Record<StatKey, string> = {
  attack: '攻击',
  maxHp: '生命',
  defense: '防御',
  speed: '攻速',
  critChance: '暴击',
  lifesteal: '吸血', healReceived: '受疗',
}

export function slotsOf(item: ItemInstance): Slot {
  return ITEM_BASES[item.baseId].slot
}

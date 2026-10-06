import type { AffixDef, ItemInstance, ItemQuality, Slot, StatKey } from './types'
import { ITEM_BASES } from '../data/items'
import { AFFIXES } from '../data/affixes'
import { createRng, type Rng } from './rng'

// 掉落系统（D10，Q17/Q22）：boss 掉什么固定（掉落表），什么词条掉落时 roll。
// 装备属性 = 基础盘 + 词条聚合，战斗投影时一次性加算。

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// 装备纪元：版图一 T1-T2，版图二 T3-T4；品质仅提供数值与追加条数预算。
const TIER_SCALE: Record<number, number> = { 1: 1, 2: 1.5, 3: 2.1, 4: 2.8 }

export interface AffixBudget {
  count: readonly [number, number]
  tierScale: number
  qualityScale: number
  /** 初始条数未达到上限时，最多追加一条的概率。 */
  bonusChance?: number
}

/** 普通/追加共用抽取、去重与数值规则；先抽普通词条，保持既有随机数顺序。 */
export function rollAffixes(budget: AffixBudget, pools: readonly AffixDef[], rng: () => number): ItemInstance['rolls'] {
  const [minC, maxC] = budget.count
  const count = minC + Math.floor(rng() * (maxC - minC + 1))
  const used = new Set<string>()
  const rolls: ItemInstance['rolls'] = []
  function rollOne(): boolean {
    const candidates = pools.filter((a) => !used.has(a.id))
    if (candidates.length === 0) return false
    const aff = candidates[Math.floor(rng() * candidates.length)]
    used.add(aff.id)
    // 保留普通词条原有两次取整，避免其他品质及百分比属性漂移。
    rolls.push({
      affixId: aff.id,
      value: round2(affixValue(aff, budget.tierScale, rng) * budget.qualityScale),
    })
    return true
  }
  for (let i = 0; i < count; i++) {
    if (!rollOne()) break
  }
  const bonusChance = budget.bonusChance ?? 0
  if (bonusChance > 0 && rolls.length < maxC && rng() < bonusChance) rollOne()
  return rolls
}

/** 阶级区间取值供普通与追加共用；品质倍率由同一个预算入口统一应用。 */
export function affixValue(aff: AffixDef, tierScale: number, rng: () => number): number {
  const lo = aff.range[0] * tierScale
  const hi = aff.range[1] * tierScale
  return round2(lo + rng() * (hi - lo))
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

export function rollDrop(
  baseId: string,
  rng: () => number,
  opts?: { qualityBias?: number; minQuality?: ItemQuality; id?: string },
): ItemInstance {
  const base = ITEM_BASES[baseId]
  let quality = rollQuality(rng, opts?.qualityBias ?? 0)
  if (opts?.minQuality === 'green' && quality === 'white') quality = 'green'
  if (opts?.minQuality === 'purple') quality = 'purple'
  const qAdj = quality === 'purple' ? { mult: 1.25, bonusChance: 0.6 } : quality === 'green' ? { mult: 1.08, bonusChance: 0 } : { mult: 0.9, bonusChance: 0 }
  const rolls = rollAffixes({
    count: base.affixCount,
    tierScale: TIER_SCALE[base.tier] ?? 1,
    qualityScale: qAdj.mult,
    bonusChance: qAdj.bonusChance,
  }, Object.values(AFFIXES), rng)
  return { id: opts?.id ?? `i${crypto.randomUUID()}`, baseId, quality, rolls }
}

/** boss 固定掉落表结算：每条按 chance 独立 roll；pity=true 时空手则保底一件（D14 首杀保底） */
export function rollBossDrops(
  dropTable: { baseId: string; chance: number }[],
  seed: number | Rng,
  opts?: { pity?: boolean; qualityBias?: number; minQuality?: ItemQuality; itemId?: () => string },
): ItemInstance[] {
  const rng = typeof seed === 'number' ? createLootRng(seed) : seed
  const drops: ItemInstance[] = []
  for (const entry of dropTable) {
    if (rng() < entry.chance) drops.push(rollDrop(entry.baseId, rng, { ...opts, id: opts?.itemId?.() }))
  }
  if (drops.length === 0 && opts?.pity && dropTable.length > 0) {
    // 保底掉 chance 最高的条目（通常即本 boss 的代表掉落）
    const best = dropTable.reduce((a, b) => (b.chance >= a.chance ? b : a))
    drops.push(rollDrop(best.baseId, rng, { ...opts, id: opts?.itemId?.() }))
  }
  return drops
}

export function createLootRng(seed: number): () => number {
  return createRng(seed)
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
  const parts = [qName + `${STAT_NAME[base.stat]}${formatStat(base.stat, base.value, true)}`]
  for (const r of item.rolls) {
    const aff = AFFIXES[r.affixId]
    parts.push(`${aff.name}${formatStat(aff.stat, r.value, true)}`)
  }
  const LEGACY_NAMES: Record<string, string> = { focus: '锋镝', killheal: '饮血', bulwark: '磐石', mend: '春霖', elitewarden: '嗜功', emberward: '烬衣', triumph: '凯歌', scavenger: '拾荒' }
  const legacy = base.legacy ? '〔' + (LEGACY_NAMES[base.legacy] ?? base.legacy) + '〕' : ''
  return `${base.name}${legacy}（${parts.join('，')}）`
}

/** 新增 StatKey 时必须声明单位，类型检查会阻止遗漏。 */
export const STAT_FORMAT: Record<StatKey, 'number' | 'percent'> = {
  attack: 'number', maxHp: 'number', defense: 'number', speed: 'number',
  critChance: 'percent', lifesteal: 'percent', healReceived: 'percent', fireResist: 'percent',
}

function formatValue(value: number, unit: 'number' | 'percent', signed: boolean): string {
  const rounded = Math.round(value * (unit === 'percent' ? 100 : 1) * 10) / 10
  return `${signed && rounded > 0 ? '+' : ''}${rounded}${unit === 'percent' ? '%' : ''}`
}

/** 最多一位小数；符号由展示场景决定，零值不加号，不显示负零。 */
export function formatStat(stat: StatKey, value: number, signed = false): string {
  return formatValue(value, STAT_FORMAT[stat], signed)
}

/** 伤害倍率、经验等不是装备 StatKey，使用同一百分比规则。 */
export function formatPercent(value: number, signed = false): string {
  return formatValue(value, 'percent', signed)
}

export const STAT_NAME: Record<StatKey, string> = {
  attack: '攻击',
  maxHp: '生命',
  defense: '防御',
  speed: '攻速',
  critChance: '暴击',
  lifesteal: '吸血', healReceived: '受疗',
  fireResist: '火抗',
}

export function slotsOf(item: ItemInstance): Slot {
  return ITEM_BASES[item.baseId].slot
}

// ===== 杂兵掉落(试玩三轮:刷图过程要有装备反馈,不然长草)=====

/** 各副本杂兵的装备纪元:版图一前两图 T1,后三图/团本 T2;版图二全 T3。
 *  荆棘要塞最终 Boss 是进入版图二的装备门槛,版图二从此切入 T3 纪元。 */
export const DUNGEON_TIER: Record<string, number> = {
  blackmoss: 1,
  rustmine: 1,
  ashfield: 2,
  frostgrave: 2,
  abyssaltar: 2,
  thornhold: 2,
  emberpass: 3,
  scalehaven: 3,
  fireridge: 3,
  'pilgrim-path': 3,
  'forge-works': 3,
  dragonmaw: 3,
}

/** 副本特化装备池(试玩反馈④:装备多样性——在对应图刷会有专属掉落) */
const DUNGEON_SIGNS: Record<string, string[]> = {
  blackmoss: ['trk-sign-frogeye', 'wpn-line-guard', 'wpn-line-priest'],
  rustmine: ['arm-sign-minershell', 'wpn-line-ranger', 'wpn-line-mage'],
  ashfield: ['wpn-sign-warbrand', 'wpn-line-warrior', 'arm-line-guard'],
  frostgrave: ['trk-sign-frostheart', 'wpn-line-mage', 'arm-line-priest'],
  abyssaltar: ['wpn-sign-bloodletter', 'wpn-line-warlock', 'arm-line-warrior'],
  thornhold: ['arm-sign-thornmail', 'wpn-line-ranger', 'arm-line-ranger'],
  emberpass: ['arm-t3-drake', 'wpn-t3-ember', 'trk-t3-pyrexia'],
  scalehaven: ['trk-t3-seer', 'wpn-t3-vox', 'arm-t3-drake'],
  fireridge: ['wpn-t3-ember', 'arm-t3-drake', 'trk-t3-pyrexia'],
  'pilgrim-path': ['wpn-t3-dawn', 'arm-t3-gale', 'trk-t3-seer'],
  'forge-works': ['arm-t3-bulwark', 'wpn-t3-ember', 'trk-t3-vanguard'],
  dragonmaw: ['wpn-t3-dawn', 'arm-t3-drake', 'trk-t3-pyrexia'],
}

export function dungeonItemTier(dungeonId: string): number {
  return DUNGEON_TIER[dungeonId] ?? 1
}

/** 杂兵小概率掉装备(反馈②:8%→12%,阵亡损耗与装备获取对齐)——白/绿为主
 *  特化加权:50% 先抽本图招牌池,刷对应副本有专属目标
 *  F10 修复(2026-09-25):精英节点兑现「掉落翻倍」承诺——概率 ×2(24%),品质略优
 *  R5/U33①:chanceMult=地形回报的掉落率倍率(水域 ×1.5;暴露 upside ×2 在 R5.1b 接入) */
export function rollWaveDrop(dungeonId: string, rng: () => number, elite = false, scavBonus = 0, itemId?: () => string, chanceMult = 1): ItemInstance | null {
  if (rng() >= (elite ? 0.24 : 0.12) * chanceMult + scavBonus) return null
  const tier = dungeonItemTier(dungeonId)
  const signIds = DUNGEON_SIGNS[dungeonId] ?? []
  const signPool = signIds
    .map((id) => ITEM_BASES[id])
    .filter((b) => b && b.tier === tier)
  if (signPool.length > 0 && rng() < 0.5) {
    const base = signPool[Math.floor(rng() * signPool.length)]
    return rollDrop(base.id, rng, { qualityBias: elite ? 0.05 : -0.05, minQuality: elite ? 'green' : undefined, id: itemId?.() })
  }
  const pool = Object.values(ITEM_BASES).filter((b) => b.tier === tier)
  if (pool.length === 0) return null
  const base = pool[Math.floor(rng() * pool.length)]
  return rollDrop(base.id, rng, { qualityBias: elite ? 0.05 : -0.05, minQuality: elite ? 'green' : undefined, id: itemId?.() })
}

/** R4.2b 铁匠铺·重铸(redesign §6 设施各管玩法):按原词条重掷数值——词条方向不变,
 *  数值按该装备 tier×品质口径重新起落;数值没变=白打,返回 null(调用方不扣费)。C4 占位费用在 ECONOMY.recastCost。 */
export function recastRoll(item: ItemInstance, rollIndex: number, rng: () => number): ItemInstance | null {
  const roll = item.rolls[rollIndex]
  if (!roll) return null
  const aff = AFFIXES[roll.affixId]
  if (!aff) return null
  const base = ITEM_BASES[item.baseId]
  const qualityScale = item.quality === 'purple' ? 1.25 : item.quality === 'green' ? 1.08 : 0.9
  const value = round2(affixValue(aff, TIER_SCALE[base?.tier ?? 1] ?? 1, rng) * qualityScale)
  if (value === roll.value) return null
  const rolls = item.rolls.map((r, i) => (i === rollIndex ? { ...r, value } : r))
  return { ...item, rolls }
}

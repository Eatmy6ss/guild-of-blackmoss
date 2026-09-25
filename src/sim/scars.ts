// S1 创伤系统一期(2026-09-25,DESIGN 14):属性创伤——远征/爬塔的后果沉淀为持久减益,
// 疗养所花金币+祝福恢复,可能失败(15%)甚至恶化(轻→重 15%)。
// 公会级疗养熟练度:同维度每治疗一次成功率 +5%(上限 +25%)——治得多了就会了。
// 红线(DESIGN 14.3):普通掉血零风险;每人上限 3 条;触发口径已拍板(草案口径)。

import type { Member } from './types'

/** 创伤影响的六维 */
export type ScarStat = 'str' | 'agi' | 'int' | 'vit' | 'spr' | 'lck'

/** 一条创伤:某维度 -value(1=轻度 2=重度) */
export interface Scar {
  stat: ScarStat
  value: 1 | 2
  /** 展示文案(生成时定稿) */
  text: string
}

/** 疗养熟练度(公会级):维度 → 治疗尝试次数 */
export type HealingMastery = Record<string, number>

export const SCAR_CAP = 3
/** 每次治疗尝试的熟练度成长 */
export const HEALING_MASTERY_STEP = 0.05
export const HEALING_MASTERY_CAP = 0.25
/** 治疗基础成功率 85%,熟练度最高补到 100%+(封顶 1) */
export const HEAL_BASE_RATE = 0.85
/** 治疗失败的恶化概率:轻度升为重度 */
export const WORSEN_CHANCE = 0.15

const STAT_NAME: Record<ScarStat, string> = {
  str: '力量', agi: '敏捷', int: '智力', vit: '体质', spr: '精神', lck: '幸运',
}
const SCAR_TEXT: Record<ScarStat, string> = {
  str: '旧伤未愈,再也使不满当年的力气',
  agi: '手抖得厉害,扣不动扳机',
  int: '脑子里总有声音挥之不去',
  vit: '断过的骨头一到阴天就疼',
  spr: '眼神空了——有些东西看一眼就忘不掉',
  lck: '运气在那次用光了',
}

export const scarStatName = (stat: ScarStat) => STAT_NAME[stat]

/** 触发判定(结算时调用一次;多源取最高概率,普通掉血不在来源内=零风险) */
export function rollScarChance(ctx: { bossBattle: boolean; nearDeath: boolean; witnessedDeath: boolean; towerFloor: number }): number {
  let p = 0
  if (ctx.bossBattle) p = Math.max(p, 0.1)
  if (ctx.nearDeath) p = Math.max(p, 0.25)
  if (ctx.witnessedDeath) p = Math.max(p, 0.2)
  if (ctx.towerFloor >= 6) p = Math.max(p, 0.05)
  return p
}

/** 生成一条创伤:随机维度,轻度 -1(可恶化为 -2) */
export function rollScar(rng: () => number): Scar {
  const stats = Object.keys(STAT_NAME) as ScarStat[]
  const stat = stats[Math.floor(rng() * stats.length)]!
  const value: 1 | 2 = 1
  return { stat, value, text: SCAR_TEXT[stat] }
}

/** 该成员还能否新增创伤(上限 3 条) */
export function canGainScar(m: Member): boolean {
  return (m.scars?.length ?? 0) < SCAR_CAP
}

/** 疗养成功率:基础 85% + 熟练度(每尝试 +5%,cap +25%) */
export function healRate(mastery: number): number {
  return Math.min(1, HEAL_BASE_RATE + Math.min(mastery * HEALING_MASTERY_STEP, HEALING_MASTERY_CAP))
}

/** 疗养判定结果 */
export type HealResult = 'success' | 'worsen' | 'fail'

/** 尝试治疗:成功移除;失败按概率恶化(轻度→重度);均累计熟练度 */
export function attemptHeal(m: Member, scarIndex: number, mastery: number, rng: () => number): { result: HealResult; scar: Scar; masteryGain: number } {
  const scar = m.scars![scarIndex]!
  const success = rng() < healRate(mastery)
  if (success) {
    m.scars!.splice(scarIndex, 1)
    return { result: 'success', scar, masteryGain: 1 }
  }
  if (scar.value === 1 && rng() < WORSEN_CHANCE) {
    scar.value = 2
    m.scars![scarIndex] = scar
    return { result: 'worsen', scar, masteryGain: 2 }
  }
  return { result: 'fail', scar, masteryGain: 1 }
}

/** 成员创伤的属性总减益(战斗/面板聚合用) */
export function scarPenalty(m: Member): Partial<Record<ScarStat, number>> {
  const out: Partial<Record<ScarStat, number>> = {}
  for (const sc of m.scars ?? []) {
    out[sc.stat] = (out[sc.stat] ?? 0) - sc.value
  }
  return out
}

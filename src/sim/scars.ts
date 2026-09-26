// S1 创伤系统一期(2026-09-25,DESIGN 14):属性创伤——远征/爬塔的后果沉淀为持久减益,
// 疗养所分档收费，轻/重失败率为 15%/35%；轻伤治疗失败后有 15% 概率恶化。
// 公会级疗养熟练度:同维度每治疗一次成功率 +5%(上限 +25%)——治得多了就会了。
// 红线(DESIGN 14.3):普通掉血零风险；每人上限 3 条；具体整合口径见 R02。

import type { Member, Combatant, BattleState } from './types'

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
export function rollScarChance(ctx: { mechanicHits: number; nearDeath: boolean; witnessedDeath: boolean; towerFloor: number }): number {
  // 命中 n 次至少触发一次的概率；其他来源取最高，每场至多一条。
  let p = ctx.mechanicHits === 1 ? 0.1 : 1 - Math.pow(0.9, Math.max(0, ctx.mechanicHits))
  if (ctx.nearDeath) p = Math.max(p, 0.25)
  if (ctx.witnessedDeath) p = Math.max(p, 0.2)
  if (ctx.towerFloor >= 6) p = Math.max(p, 0.05)
  return p
}

export function recordScarMechanic(source: Combatant, target: Combatant): void {
  if (source.boss && source.team === 'enemy' && target.team === 'guild' && target.alive) {
    target.scarMechanicHits = (target.scarMechanicHits ?? 0) + 1
  }
}

/** 同一趟远征/高塔的目睹死亡来源，最多给每名成员增加一条创伤。 */
export interface ScarRun {
  members: Member[]
  battle: BattleState | null
  witnessScarredIds?: string[]
}

/** 只检查本场实际参战的幸存者；塔深层维持每层随机一人 5% 的额外来源。 */
export function settleScars(run: ScarRun, witnessedDeath: boolean, towerFloor = 0, rng = Math.random): { member: Member; scar: Scar }[] {
  const b = run.battle
  if (!b || b.status === 'running' || b.scarsSettled) return []
  b.scarsSettled = true
  const alive = run.members.filter(m => m.alive && canGainScar(m) && b.combatants.some(c => c.team === 'guild' && c.memberId === m.id && c.alive))
  const deepTarget = towerFloor >= 6 ? alive[Math.floor(rng() * alive.length)] : undefined
  const changes: { member: Member; scar: Scar }[] = []
  for (const m of alive) {
    const c = b.combatants.find(c => c.team === 'guild' && c.memberId === m.id)!
    const witness = witnessedDeath && !(run.witnessScarredIds ?? []).includes(m.id)
    const p = rollScarChance({ mechanicHits: c.scarMechanicHits ?? 0, nearDeath: c.hp / c.maxHp < 0.15, witnessedDeath: witness, towerFloor: m === deepTarget ? towerFloor : 0 })
    if (p <= 0 || rng() >= p) continue
    const scar = rollScar(rng)
    m.scars = [...(m.scars ?? []), scar]
    if (witness) (run.witnessScarredIds ??= []).push(m.id)
    changes.push({ member: m, scar })
  }
  return changes
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

/** 疗养成功率：轻度 85% / 重度 65% + 熟练度（最多 +25%）。 */
export function healRate(mastery: number, severity: Scar['value'] = 1): number {
  const attempts = Number.isFinite(mastery) ? Math.max(0, mastery) : 0
  return Math.min(1, (severity === 2 ? 0.65 : HEAL_BASE_RATE) + Math.min(attempts * HEALING_MASTERY_STEP, HEALING_MASTERY_CAP))
}

/** DESIGN 14.2：费用和成功率均按严重度；UI 与扣费共用此口径。 */
export function healingTerms(scar: Scar, mastery = 0) {
  return { gold: scar.value === 2 ? 120 : 60, blessing: scar.value === 2 ? 3 : 1, rate: healRate(mastery, scar.value) }
}

/** 疗养判定结果 */
export type HealResult = 'success' | 'worsen' | 'fail'

/** 尝试治疗:成功移除;失败按概率恶化(轻度→重度);均累计熟练度 */
export function attemptHeal(m: Member, scarIndex: number, mastery: number, rng: () => number): { result: HealResult; scar: Scar; masteryGain: number } | null {
  const scar = m.scars?.[scarIndex]
  if (!m.alive || !scar) return null
  const success = rng() < healingTerms(scar, mastery).rate
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

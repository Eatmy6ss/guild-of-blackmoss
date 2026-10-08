// 批次 5 #5.1 悬赏加码条款(IMPLEMENTATION-PLAN §8):接副本时自选、可叠加、奖励乘算——
// 难度由玩家主动出价,而非系统强加;这是副本阶梯又不污染「反复刷」的关键。
// 命名接缝:远征条款=bountyClauses(本文件);塔规则词缀=RunCore.clauses(tower-rule.ts)——同一「clauses」概念不许两条实现路径。
// 数值全部 C4 占位,随批次 5 出口与 G3 统调校准。

import type { Member } from './types'

export type BountyClauseId = 'haste' | 'lightload' | 'greenhorn' | 'deepdive' | 'noquarter'

export interface BountyClauseDef {
  id: BountyClauseId
  name: string
  icon: string
  desc: string
  /** 奖励乘算(金币与经验;熟练度/掉落不乘——成长与装备进度不随出价膨胀,C4) */
  rewardMult: number
}

export const BOUNTY_CLAUSES: BountyClauseDef[] = [
  { id: 'haste', name: '急行军', icon: '⏳', desc: '整趟限时,超时即败(时限随副本层数而定)', rewardMult: 1.3 },
  { id: 'lightload', name: '轻装', icon: '🚫', desc: '本次远征不可携带药水(出发清空,途中禁用)', rewardMult: 1.4 },
  { id: 'greenhorn', name: '带新人', icon: '🌱', desc: '须编入 1 名低于队伍均级 5 级的新人;新人倒下则本条款作废', rewardMult: 1.5 },
  { id: 'deepdive', name: '深潜', icon: '🗺', desc: '禁走暗道,逐层推进', rewardMult: 1.3 },
  { id: 'noquarter', name: '不设防', icon: '⚔', desc: '关闭撤退保护,阵亡即永久', rewardMult: 2.0 },
]

export const CLAUSE_BY_ID: Record<string, BountyClauseDef> = Object.fromEntries(BOUNTY_CLAUSES.map((c) => [c.id, c]))

/** 带新人:低于队伍均级 5 级(C4)的在编成员 id;无则条款不满足 */
export const GREENHORN_GAP = 5

export function greenhornId(members: Member[], expeditionIds: string[]): string | null {
  const team = expeditionIds.map((id) => members.find((m) => m.id === id)).filter((m): m is Member => !!m && m.alive)
  if (team.length === 0) return null
  const avg = team.reduce((s, m) => s + m.level, 0) / team.length
  const junior = team.find((m) => m.level <= avg - GREENHORN_GAP)
  return junior?.id ?? null
}

/** 生效条款集(带新人若新人已倒下则剔除)——乘算只对仍生效的条款 */
export function activeClauses(clauses: string[], greenhornDown: boolean): string[] {
  return clauses.filter((id) => !(id === 'greenhorn' && greenhornDown))
}

/** 奖励乘算聚合(只乘仍生效的条款) */
export function clauseRewardMult(clauses: string[], greenhornDown = false): number {
  return activeClauses(clauses, greenhornDown).reduce((mult, id) => mult * (CLAUSE_BY_ID[id]?.rewardMult ?? 1), 1)
}

/** 急行军 tick 预算:每预计行程层(C4 占位;实时 10 tick/秒,6 层≈4.8 分钟限时) */
export const HASTE_TICKS_PER_LAYER = 800

export function hasteBudget(layers: number): number {
  return Math.max(0, Math.round(layers * HASTE_TICKS_PER_LAYER))
}

/** #5.2 快速通道:走过暗道的趟,非 Boss 场的金币/经验倍率(C4;Boss 与掉落不减——赶进度换收益薄) */
export const FAST_LANE_GOLD_MULT = 0.5

/** 条款面板读数(出征界面/地图状态条共用) */
export function clauseLabels(clauses: string[]): string {
  return clauses.map((id) => `${CLAUSE_BY_ID[id]?.icon ?? ''}${CLAUSE_BY_ID[id]?.name ?? id}`).join(' ')
}

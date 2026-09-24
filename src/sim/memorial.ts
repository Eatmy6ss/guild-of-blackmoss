// K02 纪念品质光环(2026-09-25,U11 制作人拍板):
//   「方案 2 比较好,品质光环比较合适。但是也要有上限,不然死了很多传奇人物的话,
//    数值也有点膨胀过度」
// 阵亡光环由亡者**生平成就**生成纪念品质(与人头数解耦,堵住"牺牲新人换伤害"的激励漏洞),
// 总光环封顶。涌现叙事抓手:品质由编年史/首杀/塔纪录/委托当时快照生成,纪念堂可回顾。

import type { DeadHero } from './types'

/** 纪念品质:凡逝/青史/传奇 */
export type LegacyQuality = 'common' | 'honored' | 'legendary'

/** 生平事迹快照(阵亡登记时的公会上下文) */
export interface LegacyContext {
  /** 公会已首杀的 Boss 数(当时) */
  bossKills: number
  /** 高塔最深纪录(当时) */
  towerBest: number
  /** 王国委托已结案数(当时) */
  commissionsDone: number
  /** 编年史条数(当时)——涌现叙事的长度 */
  chronicleCount: number
}

/** 各品质的光环加成 */
export const LEGACY_AURA: Record<LegacyQuality, number> = {
  common: 0.01,
  honored: 0.02,
  legendary: 0.03,
}

/** 总光环封顶(U11:防数值膨胀) */
export const LEGACY_AURA_CAP = 0.06

export interface LegacyRecord {
  quality: LegacyQuality
  score: number
  deeds: string[]
}

/** 由生前行走的世界生成纪念品质(deeds 可直接进纪念堂与编年史) */
export function computeLegacy(hero: DeadHero, ctx: LegacyContext): LegacyRecord {
  const deeds: string[] = []
  let score = 0
  // 修行的长度:等级
  score += hero.level
  deeds.push(`Lv${hero.level} 的佣兵生涯`)
  // 见证的世界:当时公会已斩落的 Boss
  if (ctx.bossKills > 0) {
    score += ctx.bossKills * 2
    deeds.push(`见证 ${ctx.bossKills} 位 Boss 陨落`)
  }
  // 攀过的深度:塔的最深纪录
  if (ctx.towerBest > 0) {
    score += Math.floor(ctx.towerBest / 2)
    deeds.push(`塔的最深纪录 ${ctx.towerBest} 层`)
  }
  // 兑现的托付:王国委托
  if (ctx.commissionsDone > 0) {
    score += ctx.commissionsDone
    deeds.push(`结案 ${ctx.commissionsDone} 份王国委托`)
  }
  // 留下的故事:编年史
  if (ctx.chronicleCount >= 5) {
    score += Math.floor(ctx.chronicleCount / 5)
    deeds.push(`编年史 ${ctx.chronicleCount} 条`)
  }
  const quality: LegacyQuality = score >= 25 ? 'legendary' : score >= 14 ? 'honored' : 'common'
  return { quality, score, deeds }
}

/** 生平分(老档无 legacy 字段 = 凡逝,行为兼容) */
export function legacyScore(hero: DeadHero): number {
  if (!hero.legacy) return hero.level
  return hero.legacy.score
}

export function legacyQuality(hero: DeadHero): LegacyQuality {
  return hero.legacy?.quality ?? 'common'
}

/** 全队伤害光环:Σ 各亡者品质加成,封顶 LEGACY_AURA_CAP(K02:替代旧 memorial.length*2%) */
export function memorialAura(memorial: DeadHero[]): number {
  const sum = memorial.reduce((s, h) => s + LEGACY_AURA[legacyQuality(h)], 0)
  return Math.min(LEGACY_AURA_CAP, sum)
}

/** 纪念堂读出:按品质分组的数量 */
export function legacyCounts(memorial: DeadHero[]): Record<LegacyQuality, number> {
  const out: Record<LegacyQuality, number> = { common: 0, honored: 0, legendary: 0 }
  for (const h of memorial) out[legacyQuality(h)]++
  return out
}

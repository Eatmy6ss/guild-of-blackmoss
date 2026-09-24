import { RACES } from '../data/races'
import type { Member } from './types'

// 模拟灵魂层·第一层:士气与关系(M1 P2)
// 宪法检验:每个数值都能长出故事——"士气 22 的牧师拒绝出击"比"缺一个人"更像游戏。

export const MORALE = {
  /** 士气下限时拒绝出击 */
  refuseThreshold: 25,
  /** 队友阵亡:目击者士气 -X(共历生死的另一面) */
  deathShock: 20,
  /** 撤退遗弃(束缚被留下):全员 -X */
  abandonGuilt: 15,
  /** 庆功宴:全员 +X(花金币,酒馆) */
  feastBoost: 30,
  /** 战间歇整顺手回的士气 */
  restRecover: 10,
  /** 每次胜利全员 +X */
  victoryBoost: 6,
  /** 关系:目睹同伴倒下,与倒下者默契额外 +X(患难见真情) */
  witnessBond: 2,
  /** 关系:遗弃事件,被弃者对全队 -X(信任裂痕) */
  abandonGrudge: 3,
  /** 默契加成上限修正:关系裂痕(负偏移)超过此数,该对默契星数减半 */
  grudgeBreak: 3,
} as const

/**
 * 队友阵亡:目击者士气受创 + 与倒下者默契深化(患难见真情)。
 * M1 P2 性格倾斜:勇猛者扛得住死讯(冲击减半),忠诚者与逝者的羁绊更深。
 */
export function applyDeathShock(
  deadId: string,
  witnesses: Member[],
): void {
  for (const m of witnesses) {
    const brave = m.personality.bravery / 100
    // 亡灵轻被动(宪法 v3):已经死过一次,阵亡冲击减半
    const race = m.race ? RACES[m.race] : RACES.human
    const undeadHalf = race.passive.undeadWill || m.augments?.includes('aug-resolve') ? 0.5 : 1
    const loss = MORALE.deathShock * (1 - brave * 0.5) * undeadHalf
    m.morale = clamp((m.morale ?? 60) - loss)
    if (m.id !== deadId) {
      const loyal = m.personality.loyalty / 100
      m.bonds[deadId] = (m.bonds[deadId] ?? 0) + MORALE.witnessBond + Math.round(loyal * 2)
    }
  }
}

/** 遗弃:被束缚者被撤退留下(在 markPermadeath 之前调用,人还活着) */
export function applyAbandon(left: Member[], abandoners: Member[]): void {
  for (const m of left) {
    m.morale = clamp((m.morale ?? 60) - MORALE.abandonGuilt * 2)
    m.grudges = (m.grudges ?? 0) + MORALE.abandonGrudge
  }
  for (const a of abandoners) {
    a.morale = clamp((a.morale ?? 60) - MORALE.abandonGuilt)
  }
}

/** 庆功宴(酒馆,花金币):全员士气回升(F05:接通祠堂加成 boost) */
export function applyFeast(members: Member[], boost: number = MORALE.feastBoost): void {
  for (const m of members) {
    if (!m.alive) continue
    m.morale = clamp((m.morale ?? 60) + boost)
  }
}

/** 胜利士气 */
export function applyVictory(members: Member[]): void {
  for (const m of members) {
    if (m.alive) m.morale = clamp((m.morale ?? 60) + MORALE.victoryBoost)
  }
}

/** 战间歇整顺手回复 */
export function applyRestMorale(members: Member[]): void {
  for (const m of members) {
    if (m.alive) m.morale = clamp((m.morale ?? 60) + MORALE.restRecover)
  }
}

export function clamp(v: number): number {
  return Math.max(0, Math.min(100, v))
}

/** 出击资格:士气过低的英雄拒绝(故事的入口,不是惩罚——他们只是心碎了) */
export function refusesToMarch(m: Member): boolean {
  return (m.morale ?? 60) < MORALE.refuseThreshold
}

export function moraleLabel(m: Member): string {
  const v = m.morale ?? 60
  if (v >= 80) return '高昂'
  if (v >= 55) return '平稳'
  if (v >= 40) return '低落'
  if (v >= MORALE.refuseThreshold) return '消沉'
  return '心碎'
}

/** 事件用:士气增减(正负皆可,clamp 0-100) */
export function applyMoraleDelta(members: Member[], delta: number): void {
  for (const m of members) {
    if (!m.alive) continue
    m.morale = clamp((m.morale ?? 60) + delta)
  }
}

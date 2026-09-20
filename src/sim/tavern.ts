import type { ItemInstance, JobId, Member } from './types'
import { generateMember } from './gen'
import { ECONOMY, VISITOR_STORIES } from '../data/economy'

// 酒馆与经济(M1 P0 切片 2):招募三路径的纯逻辑。
// 路径一:随机上门(事件,免费签,不受冷却——缘分不排队)
// 路径二:定向悬赏(花金指定职业,受冷却)
// 路径三:酒馆传闻(花金+祝福三选一,候选品质更高,受冷却)
// 软锁保护:存活 <3 时冷却减半;上门事件不受冷却,任何情况都有恢复通道。

export type Rng = () => number

/** 装备变卖价:tier 基础 + 词条加值(T2 > T1,词条越多越值钱) */
export function sellValue(item: ItemInstance, mult = 1): number {
  const tier = item.baseId.includes('-t2-') ? 2 : 1
  return Math.round((ECONOMY.sell.perTier * tier + item.rolls.length * ECONOMY.sell.perRoll) * mult)
}

/** 招募冷却:招募一位后需完成的远征次数。人手不足(<3,凑不齐远征队)时为 0——
 * 紧急招募免冷却,否则 2 人+冷却=永久卡死(实测抓到的软锁) */
export function cooldownNeeded(aliveCount: number): number {
  return aliveCount < 3 ? 0 : ECONOMY.cooldownRuns
}

/** 平均远征等级(候选等级的锚点) */
export function avgLevel(members: Member[]): number {
  const alive = members.filter((m) => m.alive)
  if (alive.length === 0) return 5
  return Math.round(alive.reduce((s, m) => s + m.level, 0) / alive.length)
}

export interface Visitor {
  member: Member
  story: string
}

/** 路径一:随机上门事件——一位带着故事的冒险者(免费签,缘分不排队) */
export function rollVisitor(rng: Rng, members: Member[], tavernLevel = 0): Visitor {
  const levelBonus = tavernLevel >= 2 ? 1 : 0
  const level = Math.max(
    1,
    avgLevel(members) + ECONOMY.visitorLevel.base + levelBonus + Math.floor(rng() * (ECONOMY.visitorLevel.spread + 1)),
  )
  const jobs: JobId[] = ['guard', 'priest', 'ranger']
  const job = jobs[Math.floor(rng() * jobs.length)]
  const member = generateMember(job, level, Math.floor(rng() * 0x7fffffff))
  const story = VISITOR_STORIES[Math.floor(rng() * VISITOR_STORIES.length)]
  return { member, story: `${member.name} ${story}` }
}

/** 路径二:定向悬赏——花金指定职业招一人 */
export function bountyCandidate(rng: Rng, members: Member[], job: JobId): Member {
  const level = Math.max(1, avgLevel(members) + Math.floor(rng() * 3) - 1)
  return generateMember(job, level, Math.floor(rng() * 0x7fffffff))
}

/** 路径三:酒馆传闻——花金+祝福抽三选一,候选等级更高 */
export function taleCandidates(rng: Rng, members: Member[], count = 3): Member[] {
  const level = Math.max(1, avgLevel(members) + ECONOMY.taleLevelBonus)
  const jobs: JobId[] = ['guard', 'priest', 'ranger']
  return Array.from({ length: count }, () => {
    const job = jobs[Math.floor(rng() * jobs.length)]
    return generateMember(job, level, Math.floor(rng() * 0x7fffffff))
  })
}

/** 离线累积:离开的时间里,存活英雄们接零工赚金币(有上限——世界不替你玩) */
export function offlineGain(
  members: Member[],
  lastSeen: number,
  now: number,
): { hours: number; gold: number } {
  const alive = members.filter((m) => m.alive).length
  if (lastSeen <= 0 || alive === 0 || now <= lastSeen) return { hours: 0, gold: 0 }
  const rawHours = (now - lastSeen) / 3600000
  if (rawHours < ECONOMY.offline.minHours) return { hours: 0, gold: 0 }
  const hours = Math.min(ECONOMY.offline.capHours, rawHours)
  const gold = Math.floor(alive * ECONOMY.offline.perHeroPerHour * hours)
  return { hours: Math.round(hours * 10) / 10, gold }
}

export { ECONOMY }

import type { ItemInstance, JobId, Member } from './types'
import { generateMember } from './gen'
import { pick, weighted } from './rng'
import { RACES } from '../data/races'
import { JOBS } from '../data/jobs'
import { ECONOMY, VISITOR_STORIES } from '../data/economy'

// 酒馆与经济(M1 P0 切片 2):招募三路径的纯逻辑。
// 路径一:随机上门(事件,免费签,不受冷却——缘分不排队)
// 路径二:定向悬赏(花金指定职业,受冷却)
// 路径三:酒馆传闻(花金+祝福三选一,候选品质更高,受冷却)
// 软锁保护:存活 <3 时冷却减半;上门事件不受冷却,任何情况都有恢复通道。
// 治疗保底(自检 P1-1):无存活治疗者时,访客/传闻必含治疗线——不能让运气把公会锁死在打不过 boss 的阵容上。

export type Rng = () => number

/** 治疗保底(矩阵感知):无存活治疗者 → 必出治疗线,且种族从牧师可用族中 roll(兽人/亡灵无牧师);否则按种族矩阵随机 */
function pickCandidate(rng: Rng, members: Member[], level: number, forcedJob?: JobId): Member {
  const hasHealer = members.some((m) => m.alive && JOBS[m.job]?.role === 'healer')
  let race: string
  let job: JobId
  if (forcedJob) {
    // 悬赏:玩家指定职业,种族从该职业可用族中 roll
    race = pick(rng, Object.values(RACES).filter((r) => r.allowedLines.includes(forcedJob)).map((r) => r.id))
    job = forcedJob
  } else if (!hasHealer) {
    // 治疗保底优先于种族限制:种族改从牧师可用族中 roll
    race = pick(rng, Object.values(RACES).filter((r) => r.allowedLines.includes('priest')).map((r) => r.id))
    job = 'priest'
  } else {
    // 节奏方差控制(宪法 v3.2 缺陷三):队伍缺的线 ×3,已有两员及以上的线 ×0.5;种族向未出场族轻倾斜
    const alive = members.filter((m) => m.alive)
    const lineCount: Record<string, number> = {}
    for (const m of alive) lineCount[m.job] = (lineCount[m.job] ?? 0) + 1
    const weights: Record<string, number> = {}
    for (const line of Object.keys(JOBS)) {
      weights[line] = (lineCount[line] ?? 0) === 0 ? 3 : (lineCount[line] ?? 0) >= 2 ? 0.5 : 1
    }
    const raceCount: Record<string, number> = {}
    for (const m of alive) if (m.race) raceCount[m.race] = (raceCount[m.race] ?? 0) + 1
    const raceWeights: Record<string, number> = {}
    for (const r of Object.keys(RACES)) raceWeights[r] = (raceCount[r] ?? 0) === 0 ? 1.5 : 1
    race = weighted(rng, raceWeights)
    const allowed = RACES[race].allowedLines.filter((l) => weights[l] > 0)
    job = weighted(rng, Object.fromEntries(allowed.map((l) => [l, weights[l] ?? 1]))) as JobId
  }
  return generateMember(job, level, Math.floor(rng() * 0x7fffffff), { race })
}

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
  const member = pickCandidate(rng, members, level)
  const story = VISITOR_STORIES[Math.floor(rng() * VISITOR_STORIES.length)]
  return { member, story: `${member.name} ${story}` }
}

/** 路径二:定向悬赏——花金指定职业招一人 */
export function bountyCandidate(rng: Rng, members: Member[], job: JobId): Member {
  const level = Math.max(1, avgLevel(members) + Math.floor(rng() * 3) - 1)
  return pickCandidate(rng, members, level, job)
}

/** 路径三:酒馆传闻——花金+祝福抽三选一,候选等级更高 */
export function taleCandidates(rng: Rng, members: Member[], count = 3): Member[] {
  const level = Math.max(1, avgLevel(members) + ECONOMY.taleLevelBonus)
  return Array.from({ length: count }, () => pickCandidate(rng, members, level))
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

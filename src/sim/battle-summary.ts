import type { BattleEvent, BattleState, Combatant, DeadHero } from './types'

// A15 战后小结(ROADMAP §3.1):纯聚合,不改战斗。
// 败因=battle events 里对我方输出最高的敌方单位;死因消费 A1 的结构化 DeadHero.death。

export interface SummaryDeath {
  name: string
  job: string
  level: number
  cause: string
  killerName?: string
  mechanic?: string
  affixes?: string[]
}

export interface BattleSummary {
  status: BattleState['status']
  win: boolean
  wiped: boolean
  deaths: SummaryDeath[]
  topDamage: { name: string; amount: number }[]
  moments: string[]
}

/** 对我方输出最高的敌方前 3 名(败因/最危险敌人);events 只读聚合,无副作用 */
export function buildBattleSummary(input: {
  status: BattleState['status']
  combatants: Combatant[]
  events: BattleEvent[]
  deaths: DeadHero[]
  moments?: string[]
}): BattleSummary {
  const byId = new Map(input.combatants.map((c) => [c.id, c]))
  const guildIds = new Set(input.combatants.filter((c) => c.team === 'guild').map((c) => c.id))
  const damage = new Map<string, number>()
  for (const e of input.events) {
    if (e.type !== 'damage' || e.attackerId === undefined || !guildIds.has(e.targetId)) continue
    const atk = byId.get(e.attackerId)
    if (!atk || atk.team !== 'enemy') continue
    damage.set(e.attackerId, (damage.get(e.attackerId) ?? 0) + (e.amount ?? 0))
  }
  const topDamage = [...damage.entries()]
    .map(([id, amount]) => ({ name: byId.get(id)?.name ?? id, amount }))
    .filter((d) => d.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
  return {
    status: input.status,
    win: input.status === 'guild-win',
    wiped: input.status === 'guild-wipe',
    deaths: input.deaths.map((d) => ({
      name: d.name,
      job: d.job,
      level: d.level,
      cause: d.cause,
      killerName: d.death?.killerName,
      mechanic: d.death?.mechanic,
      affixes: d.death?.affixes,
    })),
    topDamage,
    moments: (input.moments ?? []).slice(0, 4),
  }
}

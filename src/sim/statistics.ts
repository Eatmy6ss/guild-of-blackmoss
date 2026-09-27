import type { BattleState } from './types'

export interface OutcomeCounts {
  wins: number
  losses: number
  retreats: number
}

export interface BattleCounts extends OutcomeCounts {
  deaths: number
}

export const GOLD_SOURCES = {
  expedition: '远征战斗',
  clear: '通关奖励',
  tower: '高塔楼层',
  event: '事件与宝箱',
  sales: '装备出售',
  kingdom: '王国委托',
  offline: '离线零工',
} as const
export type GoldSource = keyof typeof GOLD_SOURCES

export interface GameplayStatistics {
  sinceDay: number
  expeditionBattles: BattleCounts
  towerFloors: BattleCounts
  expeditions: OutcomeCounts
  goldEarned: Record<GoldSource, number>
  healing: { attempts: number; gold: number; blessing: number }
}

const outcomes = (): OutcomeCounts => ({ wins: 0, losses: 0, retreats: 0 })
export function newStatistics(sinceDay = 1): GameplayStatistics {
  return {
    sinceDay,
    expeditionBattles: { ...outcomes(), deaths: 0 },
    towerFloors: { ...outcomes(), deaths: 0 },
    expeditions: outcomes(),
    goldEarned: { expedition: 0, clear: 0, tower: 0, event: 0, sales: 0, kingdom: 0, offline: 0 },
    healing: { attempts: 0, gold: 0, blessing: 0 },
  }
}

const count = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export function normalizeStatistics(value: unknown, day = 1): GameplayStatistics {
  const raw = object(value)
  const stats = newStatistics(Math.max(1, count(raw.sinceDay) || count(day)))
  for (const key of ['expeditionBattles', 'towerFloors', 'expeditions', 'goldEarned', 'healing'] as const) {
    const source = object(raw[key])
    const target = stats[key] as unknown as Record<string, number>
    for (const field of Object.keys(target)) target[field] = count(source[field])
  }
  return stats
}

export type StatisticsAction =
  | { type: 'battle'; mode: 'expeditionBattles' | 'towerFloors'; status: BattleState['status']; deaths: number }
  | { type: 'expedition'; result: keyof OutcomeCounts }
  | { type: 'gold'; source: GoldSource; amount: number }
  | { type: 'healing'; gold: number; blessing: number }

export function expeditionStatistics(run: { phase: string; statisticsRecorded?: boolean }): StatisticsAction | null {
  if (run.statisticsRecorded) return null
  const result = run.phase === 'victory' ? 'wins' : run.phase === 'defeat' ? 'losses' : run.phase === 'retreated' ? 'retreats' : null
  if (!result) return null
  run.statisticsRecorded = true
  return { type: 'expedition', result }
}

/** Call at guarded settlement boundaries; React updaters must remain pure. */
export function recordStatistics(stats: GameplayStatistics, action: StatisticsAction): GameplayStatistics {
  if (action.type === 'battle') {
    if (action.status === 'running') return stats
    const result = action.status === 'guild-win' ? 'wins' : action.status === 'guild-wipe' ? 'losses' : 'retreats'
    const old = stats[action.mode]
    return { ...stats, [action.mode]: { ...old, [result]: old[result] + 1, deaths: old.deaths + count(action.deaths) } }
  }
  if (action.type === 'expedition') {
    return { ...stats, expeditions: { ...stats.expeditions, [action.result]: stats.expeditions[action.result] + 1 } }
  }
  if (action.type === 'gold') {
    return { ...stats, goldEarned: { ...stats.goldEarned, [action.source]: stats.goldEarned[action.source] + count(action.amount) } }
  }
  return { ...stats, healing: {
    attempts: stats.healing.attempts + 1,
    gold: stats.healing.gold + count(action.gold),
    blessing: stats.healing.blessing + count(action.blessing),
  } }
}

export const totalOutcomes = (value: OutcomeCounts): number => value.wins + value.losses + value.retreats
export const winRate = (value: OutcomeCounts): string =>
  totalOutcomes(value) ? `${(value.wins / totalOutcomes(value) * 100).toFixed(1)}%` : '—'
export const totalGoldEarned = (stats: GameplayStatistics): number => Object.values(stats.goldEarned).reduce((a, b) => a + b, 0)

export function exportStatistics(stats: GameplayStatistics, day: number): string {
  const line = (name: string, value: OutcomeCounts) =>
    `${name}：场次 ${totalOutcomes(value)}，胜 ${value.wins}，负 ${value.losses}，撤退 ${value.retreats}，胜率 ${winRate(value)}`
  return [
    '黑苔公会 · 实测统计 v1',
    `统计起始：第 ${stats.sinceDay} 日；当前：第 ${day} 日`,
    line('远征战斗', stats.expeditionBattles),
    line('高塔楼层', stats.towerFloors),
    line('整趟远征', stats.expeditions),
    `死亡人数：${stats.expeditionBattles.deaths + stats.towerFloors.deaths}（远征 ${stats.expeditionBattles.deaths}，高塔 ${stats.towerFloors.deaths}）`,
    `团灭次数：${stats.expeditionBattles.losses + stats.towerFloors.losses}（远征 ${stats.expeditionBattles.losses}，高塔 ${stats.towerFloors.losses}）`,
    `金币收入合计：${totalGoldEarned(stats)}`,
    ...Object.entries(GOLD_SOURCES).map(([key, name]) => `  ${name}：${stats.goldEarned[key as GoldSource]}`),
    `疗养：${stats.healing.attempts} 次，支出 ${stats.healing.gold} 金 / ${stats.healing.blessing} 祝福`,
    '口径：仅含启用统计后的已结算记录；胜率分母含撤退；高塔按楼层统计；金币为毛收入，不含初始资产；疗养含失败尝试。',
    '保存：随公会资产在安全边界落盘；途中刷新会一同回滚。手动与挂机合计，不用于自动调参。',
  ].join('\n')
}

import { COMMISSIONS, COMMISSION_LIMIT, KINGDOM_RANKS, type CommissionDef } from '../data/kingdom'
import { ECONOMY } from '../data/economy'
import { dungeonLock } from '../data/regions'
import type { ItemInstance } from './types'
import type { DungeonRun } from './run'

export type RoyalRewardChoice = 'coin' | 'supplies'
export interface CommissionRecord { id: string; progress: number; acceptedDay: number }
export interface CommissionReceipt { id: string; choice: RoyalRewardChoice; day: number }
export interface KingdomState { active: CommissionRecord[]; completed: CommissionReceipt[] }
export interface KingdomContext { manual: string[]; buildings: Record<string, number>; day: number }
export type KingdomEvent =
  | { kind: 'battle'; dungeonId: string; bossId?: string }
  | { kind: 'clear'; dungeonId: string }
  | { kind: 'building'; buildingId: string; level: number }

export const newKingdomState = (): KingdomState => ({ active: [], completed: [] })
const definition = (id: string) => COMMISSIONS.find((q) => q.id === id)
const natural = (v: unknown, fallback = 0) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback

/** Tolerate missing or damaged commission fields without discarding an otherwise valid old guild. */
export function normalizeKingdom(raw: unknown): KingdomState {
  if (!raw || typeof raw !== 'object') return newKingdomState()
  const data = raw as Partial<KingdomState>
  const seen = new Set<string>()
  const completed: CommissionReceipt[] = []
  for (const r of Array.isArray(data.completed) ? data.completed : []) {
    if (!r || !definition(r.id) || seen.has(r.id) || !['coin', 'supplies'].includes(r.choice)) continue
    seen.add(r.id)
    completed.push({ id: r.id, choice: r.choice, day: natural(r.day, 1) })
  }
  const active: CommissionRecord[] = []
  for (const r of Array.isArray(data.active) ? data.active : []) {
    const q = r && definition(r.id)
    if (!q || seen.has(r.id) || active.length >= COMMISSION_LIMIT) continue
    seen.add(r.id)
    active.push({ id: r.id, progress: Math.min(q.objective.target, natural(r.progress)), acceptedDay: natural(r.acceptedDay, 1) })
  }
  return { active, completed }
}

export function kingdomTrust(state: KingdomState): number {
  return state.completed.reduce((sum, r) => sum + (definition(r.id)?.trust ?? 0), 0)
}
export function kingdomRank(state: KingdomState) {
  const trust = kingdomTrust(state)
  return [...KINGDOM_RANKS].reverse().find((rank) => trust >= rank.threshold)!
}
export function royalPotionCost(kind: 'heal' | 'fury', state: KingdomState): number {
  return Math.ceil(ECONOMY.potionCost[kind] * (1 - kingdomRank(state).discount))
}

export function commissionLock(q: CommissionDef, state: KingdomState, context: KingdomContext): string | null {
  const missing = q.requires.filter((id) => !state.completed.some((r) => r.id === id))
  if (missing.length) return `先结案：${missing.map((id) => definition(id)?.title ?? id).join('、')}`
  if (q.objective.kind !== 'building') {
    const lock = dungeonLock(q.objective.dungeonId, context.manual)
    if (lock) return `目的地尚未开放：${lock}`
  }
  return null
}

export function acceptCommission(state: KingdomState, id: string, context: KingdomContext): KingdomState {
  const q = definition(id)
  if (!q || state.active.length >= COMMISSION_LIMIT || state.active.some((r) => r.id === id) || state.completed.some((r) => r.id === id) || commissionLock(q, state, context)) return state
  const progress = q.objective.kind === 'building' ? Math.min(q.objective.target, context.buildings[q.objective.buildingId] ?? 0) : 0
  return { ...state, active: [...state.active, { id, progress, acceptedDay: context.day }] }
}

export function abandonCommission(state: KingdomState, id: string): KingdomState {
  return { ...state, active: state.active.filter((r) => r.id !== id) }
}

/** Called only for settled victories, full clears or successful construction. Never backfill combat history. */
export function advanceCommissions(state: KingdomState, event: KingdomEvent): KingdomState {
  let changed = false
  const active = state.active.map((r) => {
    const q = definition(r.id)
    if (!q) return r
    const obj = q.objective
    let next = r.progress
    if (obj.kind === 'building' && event.kind === 'building' && obj.buildingId === event.buildingId) next = event.level
    if (obj.kind !== 'building' && event.kind !== 'building' && obj.dungeonId === event.dungeonId) {
      if (obj.kind === 'battles' && event.kind === 'battle') next++
      if (obj.kind === 'boss' && event.kind === 'battle' && obj.bossId === event.bossId) next++
      if (obj.kind === 'clear' && event.kind === 'clear') next++
    }
    const progress = Math.min(obj.target, Math.max(r.progress, next))
    if (progress === r.progress) return r
    changed = true
    return { ...r, progress }
  })
  return changed ? { ...state, active } : state
}

/** Inspect the encounter before advanceRun changes its index. Rest/defeat/retreat cannot count twice. */
export function settleKingdomBattle(state: KingdomState, run: DungeonRun): KingdomState {
  if (run.phase !== 'battle' || run.battle?.status !== 'guild-win') return state
  const encounter = run.dungeon.encounters.find((e) => e.id === run.steps[run.stepIdx])
  if (!encounter) return state
  let next = advanceCommissions(state, { kind: 'battle', dungeonId: run.dungeon.id, bossId: encounter.bossId })
  if (run.stepIdx === run.steps.length - 1) next = advanceCommissions(next, { kind: 'clear', dungeonId: run.dungeon.id })
  return next
}

export function commissionReward(q: CommissionDef, choice: RoyalRewardChoice) {
  return {
    gold: choice === 'coin' ? q.gold : q.gold - 40,
    blessing: choice === 'supplies' ? 1 : 0,
    heal: choice === 'supplies' ? 2 : 0,
    fury: choice === 'coin' ? 1 : 0,
    trust: q.trust,
    item: q.item ? { ...q.item, rolls: q.item.rolls.map((r) => ({ ...r })), id: `royal-${q.id}` } as ItemInstance : undefined,
  }
}

export function claimCommission(state: KingdomState, id: string, choice: RoyalRewardChoice, day: number) {
  const q = definition(id)
  const record = state.active.find((r) => r.id === id)
  if (!q || !record || record.progress < q.objective.target || state.completed.some((r) => r.id === id) || !['coin', 'supplies'].includes(choice)) return null
  return {
    state: { active: state.active.filter((r) => r.id !== id), completed: [...state.completed, { id, choice, day }] } satisfies KingdomState,
    reward: commissionReward(q, choice),
    commission: q,
  }
}

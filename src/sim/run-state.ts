import type { DungeonRun } from './run'
import type { TowerRun } from './tower'
import type { Member } from './types'
import type { GuildEventDef } from '../data/guild-events'
import { DUNGEONS } from '../data/dungeons'
import { GUILD_EVENTS } from '../data/guild-events'
import { syncRunParty } from './run-core'

export type ActiveRun = DungeonRun | TowerRun
type Impact = { t: string; tone?: 'pos' | 'neg' | 'hook' }
type GrowthSnapshot = { level: number; power: number; bondTotal: number; bonds: Record<string, number> }

/** React 远征控制/反馈的容器，生命周期仍由现有 DungeonRun/TowerRun 表达。 */
export interface RunUIState {
  activeRun: ActiveRun | null
  playing: boolean
  dungeonId: string
  expeditionIds: string[]
  lastBranch: string
  autoLoop: boolean
  eventId: string | null
  eventResult: string | null
  eventImpacts: Impact[]
  pendingDeparture: string | null
  pendingConsequence: { eventId: string; dueDay: number } | null
  dropIds: string[]
  notices: string[]
  growthSnapshot: Record<string, GrowthSnapshot>
}

export function initialRunState(): RunUIState {
  return { activeRun: null, playing: false, dungeonId: 'blackmoss', expeditionIds: [],
    lastBranch: 'shortcut', autoLoop: false, eventId: null, eventResult: null, eventImpacts: [],
    pendingDeparture: null, pendingConsequence: null, dropIds: [], notices: [], growthSnapshot: {} }
}

export type RunAction = { type: 'patch'; patch: Partial<RunUIState> } | { type: 'replace'; state: RunUIState }
/** 纯控制 reducer；结算仍调用 settleEncounter，不另算奖励。 */
export function runReducer(state: RunUIState, action: RunAction): RunUIState {
  return action.type === 'replace' ? action.state : { ...state, ...action.patch }
}

export function checkpointRunState(state: RunUIState, roster: Member[]): RunUIState {
  // 引擎的可选字段可被清为 undefined；在持久边界统一为 JSON 的缺省形态。
  const next = JSON.parse(JSON.stringify(state)) as RunUIState
  if (next.activeRun) syncRunParty(next.activeRun, roster)
  return next
}

export function pendingRunEvent(state: RunUIState): GuildEventDef | null {
  return GUILD_EVENTS.find(e => e.id === state.eventId) ?? null
}

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')
const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const uint = (v: unknown) => count(v) && Number(v) <= 0xffffffff
const nullableString = (v: unknown) => v === null || typeof v === 'string'

/** 对不完整断点拒绝恢复，不能悄悄把奖励已到账的远征退回起点。 */
export function validateRunState(value: unknown, roster: { id: string; hp: number }[]): value is RunUIState {
  if (!object(value)) return false
  const s = value
  if (typeof s.playing !== 'boolean' || typeof s.autoLoop !== 'boolean' ||
      !DUNGEONS.some(d => d.id === s.dungeonId) || !strings(s.expeditionIds) ||
      !strings(s.dropIds) || !strings(s.notices) || typeof s.lastBranch !== 'string' ||
      !nullableString(s.eventId) || !nullableString(s.eventResult) || !nullableString(s.pendingDeparture) ||
      !Array.isArray(s.eventImpacts) || s.eventImpacts.some((i: unknown) => !object(i) || typeof i.t !== 'string') ||
      !object(s.growthSnapshot)) return false
  if (s.eventId && !GUILD_EVENTS.some(e => e.id === s.eventId)) return false
  if (s.eventResult !== null && !s.eventId) return false
  if (s.pendingConsequence !== null && (!object(s.pendingConsequence) ||
      !GUILD_EVENTS.some(e => e.id === s.pendingConsequence.eventId) || !count(s.pendingConsequence.dueDay))) return false
  if (s.expeditionIds.some((id: string) => !roster.some(m => m.id === id))) return false
  const r = s.activeRun
  if (r === null) return true
  if (!object(r) || r.schema !== 1 || typeof r.id !== 'string' || !r.id ||
      !finite(r.seed) || !uint(r.rngState) || !strings(r.memberIds) || r.memberIds.length === 0 ||
      new Set(r.memberIds).size !== r.memberIds.length || !Array.isArray(r.party) ||
      r.party.length !== r.memberIds.length || !strings(r.affixes) || !strings(r.clauses) ||
      !object(r.pendingLoot) || !strings(r.pendingLoot.items) ||
      !count(r.pendingLoot.gold) || !count(r.pendingLoot.starMarrow) || !count(r.pendingLoot.exp) ||
      !object(r.potions) || !count(r.potions.heal) || !count(r.potions.fury)) return false
  // U22 预留字段(批次 3 消费):存在即校验形态,缺省合法
  if (r.spares !== undefined && !strings(r.spares)) return false
  if (r.monsterAffixes !== undefined && (!object(r.monsterAffixes) ||
      Object.values(r.monsterAffixes).some((v) => !strings(v)))) return false
  if (r.memberIds.some((id: string, i: number) => !roster.some(m => m.id === id) ||
      !object(r.party[i]) || r.party[i].memberId !== id || !finite(r.party[i].hp) || r.party[i].hp < 0)) return false
  if (r.kind === 'dungeon') {
    const d = DUNGEONS.find(d => d.id === r.dungeonId)
    if (!d || !['battle','rest','victory','defeat','retreated'].includes(r.phase) ||
        !strings(r.steps) || r.steps.length === 0 || !count(r.stepIdx) || r.stepIdx >= r.steps.length ||
        !strings(r.nodeIds) || !strings(r.routeTaken) || !Array.isArray(r.eliteAt) ||
        r.eliteAt.some((x: unknown) => !count(x)) || !Array.isArray(r.buffs) ||
        r.buffs.some((b: unknown) => !object(b) || typeof b.id !== 'string' || !object(b.mods)) ||
        !finite(r.auraBonus) || typeof r.protectOn !== 'boolean' ||
        r.steps.some((id: string) => !d.encounters.some(e => e.id === id)) ||
        r.nodeIds.some((id: string) => id !== 'boss-direct' && !d.routeNodes.some(n => n.id === id))) return false
  } else if (r.kind === 'tower') {
    if (!['battle','rest','ended'].includes(r.phase) || !count(r.floor) || r.floor < 1 || !count(r.goldEarned) ||
        (r.insuredNextFloor !== undefined && r.insuredNextFloor !== r.floor + 1)) return false
  } else return false
  const b = r.battle
  if (!object(b) || !count(b.tick) || !finite(b.rngState) || !count(b.unitSeq) ||
      !['running','guild-win','guild-wipe','retreated'].includes(b.status) || !Array.isArray(b.combatants) ||
      !Array.isArray(b.log) || !Array.isArray(b.events) || !object(b.commands)) return false
  const ids = new Set<string>()
  for (const c of b.combatants) {
    if (!object(c) || typeof c.id !== 'string' || ids.has(c.id) || !['guild','enemy'].includes(c.team) ||
        typeof c.alive !== 'boolean' || !finite(c.hp) || !finite(c.maxHp) || c.hp < 0 || c.maxHp <= 0 ||
        !finite(c.attack) || !finite(c.defense) || !finite(c.cooldownLeft) || !finite(c.attackInterval) ||
        !Array.isArray(c.skills) || c.skills.some((k: unknown) => !object(k) || !object(k.def) || !finite(k.cooldownLeft)) ||
        !object(c.threat) || !strings(c.synergyIds) ||
        (c.memberId !== undefined && !r.memberIds.includes(c.memberId))) return false
    ids.add(c.id)
  }
  if (b.unitSeq < Math.max(0, ...b.combatants.map((c: { id: string }) => Number(c.id.slice(1)) || 0))) return false
  for (const id of r.memberIds) if (!b.combatants.some((c: { memberId?: string; team: string }) => c.team === 'guild' && c.memberId === id) && roster.find(m => m.id === id)!.hp > 0) return false
  for (const key of ['healStock','furyStock','healCd','furyCd','furyUntil']) if (!count(b.commands[key])) return false
  if (!['advance','standard','tighten','spread'].includes(b.commands.stance) ||
      typeof b.commands.autoMode !== 'boolean' || typeof b.commands.protectRetreat !== 'boolean') return false
  if (r.phase !== 'battle' && b.status === 'running') return false
  if (s.eventId && r.phase !== 'rest') return false
  return true
}

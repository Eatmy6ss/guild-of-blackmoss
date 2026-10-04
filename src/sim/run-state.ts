import type { DungeonRun } from './run'
import type { TowerRun } from './tower'
import type { Member } from './types'
import type { GuildEventDef } from '../data/guild-events'
import { DUNGEONS } from '../data/dungeons'
import { GUILD_EVENTS } from '../data/guild-events'
import { syncRunParty } from './run-core'
import type { BattleSummary } from './battle-summary'

export type ActiveRun = DungeonRun | TowerRun
type Impact = { t: string; tone?: 'pos' | 'neg' | 'hook' }
type GrowthSnapshot = { level: number; power: number; bondTotal: number; bonds: Record<string, number> }

/** React 远征控制/反馈的容器，生命周期仍由现有 DungeonRun/TowerRun 表达。 */
export interface RunUIState {
  activeRun: ActiveRun | null
  playing: boolean
  dungeonId: string
  expeditionIds: string[]
  autoLoop: boolean
  eventId: string | null
  eventResult: string | null
  eventImpacts: Impact[]
  /** 出发被到期后果暂缓的标记(U27④ 后无岔路可记,只存 'go') */
  pendingDeparture: string | null
  pendingConsequence: { eventId: string; dueDay: number } | null
  dropIds: string[]
  notices: string[]
  /** R1.2 反馈:最近一次节点选择的可见后果(休整/宝箱/挂机代选事件等),选下一条路时清空 */
  lastNodeResult: string | null
  growthSnapshot: Record<string, GrowthSnapshot>
  /** A15 战后小结:最近一场战斗的败因/死因/关键时刻(战斗结束横幅下展示) */
  lastSummary?: BattleSummary
}

export function initialRunState(): RunUIState {
  return { activeRun: null, playing: false, dungeonId: 'blackmoss', expeditionIds: [],
    autoLoop: false, eventId: null, eventResult: null, eventImpacts: [],
    pendingDeparture: null, pendingConsequence: null, dropIds: [], notices: [], lastNodeResult: null, growthSnapshot: {} }
}

export type RunAction = { type: 'patch'; patch: Partial<RunUIState> } | { type: 'replace'; state: RunUIState }
/** 纯控制 reducer；结算仍调用 settleEncounter，不另算奖励。 */
export function runReducer(state: RunUIState, action: RunAction): RunUIState {
  return action.type === 'replace' ? action.state : { ...state, ...action.patch }
}

export function checkpointRunState(state: RunUIState, roster: Member[]): RunUIState {
  // 引擎的可选字段可被清为 undefined；在持久边界统一为 JSON 的缺省形态。
  const next = JSON.parse(JSON.stringify(state)) as RunUIState
  if (next.activeRun) {
    // A13 后续:战斗事件只保留最近 120 条入档(渲染走游标增量,恢复时光标从末尾续;
    // 败因统计走 guildDmgTaken 增量台账,不依赖事件历史)
    if (next.activeRun.battle && Array.isArray(next.activeRun.battle.events) && next.activeRun.battle.events.length > 120) {
      next.activeRun.battle.events = next.activeRun.battle.events.slice(-120)
    }
    syncRunParty(next.activeRun, roster)
  }
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
      !strings(s.dropIds) || !strings(s.notices) || !nullableString(s.lastNodeResult) ||
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
  // A15 战后小结:可选,存在即做轻量形态校验
  const s2 = s.lastSummary
  if (s2 !== undefined && (!object(s2) || typeof s2.win !== 'boolean' || typeof s2.wiped !== 'boolean' ||
      !Array.isArray(s2.deaths) || s2.deaths.some((d: unknown) => !object(d) || typeof (d as { cause?: unknown }).cause !== 'string') ||
      !Array.isArray(s2.topDamage) || !strings(s2.moments))) return false
  if (r.memberIds.some((id: string, i: number) => !roster.some(m => m.id === id) ||
      !object(r.party[i]) || r.party[i].memberId !== id || !finite(r.party[i].hp) || r.party[i].hp < 0)) return false
  if (r.kind === 'dungeon') {
    const d = DUNGEONS.find(d => d.id === r.dungeonId)
    if (!d || !['battle','rest','victory','defeat','retreated'].includes(r.phase) ||
        !object(r.map) || !count(r.map.seed) || !Array.isArray(r.map.layers) || r.map.layers.length < 2 ||
        !Array.isArray(r.map.edges) || r.map.edges.some((e: unknown) => !Array.isArray(e) || e.length !== 2 ||
          typeof (e as string[])[0] !== 'string' || typeof (e as string[])[1] !== 'string') ||
        !nullableString(r.nodeId) || !strings(r.path) || !count(r.battlesFought) ||
        (r.conditions !== undefined && !strings(r.conditions)) ||
        r.path.length > 0 && r.nodeId !== r.path[r.path.length - 1] ||
        (r.nodeId === '' ) !== (r.path.length === 0) ||
        !Array.isArray(r.buffs) ||
        r.buffs.some((b: unknown) => !object(b) || typeof b.id !== 'string' || !object(b.mods)) ||
        !finite(r.auraBonus) || typeof r.protectOn !== 'boolean') return false
    // 地图节点/边必须落在本副本内;battle/elite/boss 的遭遇必须存在
    const nodes = new Set(r.map.layers.flat().map((n: { id?: unknown }) => n.id))
    for (const layer of r.map.layers) {
      if (!Array.isArray(layer)) return false
      for (const n of layer) {
        if (!object(n) || typeof n.id !== 'string' || !count(n.layer) || typeof n.terrain !== 'string' ||
            !['battle','elite','event','rest','treasure','secret','boss'].includes(n.kind) ||
            typeof n.name !== 'string') return false
        if (n.encounterId !== undefined && !d.encounters.some(e => e.id === n.encounterId)) return false
      }
    }
    for (const [a, b] of r.map.edges as [string, string][]) if (!nodes.has(a) || !nodes.has(b)) return false
    if (r.path.some((id: string) => !nodes.has(id))) return false
  } else if (r.kind === 'tower') {
    if (!['battle','rest','ended'].includes(r.phase) || !count(r.floor) || r.floor < 1 || !count(r.goldEarned) ||
        (r.insuredNextFloor !== undefined && r.insuredNextFloor !== r.floor + 1)) return false
  } else return false
  const b = r.battle
  // U27① 地图远征:battle 为 null 在「还没打过任何一场」时是合法断点——
  // 首层待选、走过非战斗节点(休整/事件/宝箱)、没打就撤退都算;
  // victory/defeat 必然打过的判断在 advanceRun 里,此处只挡明显矛盾(phase=battle 却无战)。
  if (b === null) {
    if (r.kind !== 'dungeon' || !['rest', 'retreated'].includes(r.phase)) return false
    return true
  }
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

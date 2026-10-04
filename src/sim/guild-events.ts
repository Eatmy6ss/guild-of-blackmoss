import { GUILD_EVENTS, EVENT_CHANCE, type GuildEventDef, type EventOutcome, type EventRegion } from '../data/guild-events'
import type { TerrainId } from './dungeon-map'
import { REGIONS } from '../data/regions'

// 大事事件解析(sim 层,纯逻辑):按权重掷结果、按概率触发事件。效果应用在 UI 层。

export type Rng = () => number
export type { EventRegion }

/** 按权重掷出某个选项的结果 */
export function pickOutcome(def: GuildEventDef, choiceIdx: number, roll: number): EventOutcome {
  const choice = def.choices[choiceIdx]
  if (!choice) throw new Error(`选项不存在: ${def.id}#${choiceIdx}`)
  const total = choice.outcomes.reduce((s, o) => s + o.weight, 0)
  let r = roll * total
  for (const o of choice.outcomes) {
    r -= o.weight
    if (r <= 0) return o
  }
  return choice.outcomes[choice.outcomes.length - 1]
}

/** 事件抽取位置(U27④):town=回城;node=副本 event 节点(带地形后可抽地形池) */
export type EventWhere = { where: 'town'; visited?: Record<string, number> } | { where: 'node'; dungeonId: string; terrain?: TerrainId }

/** 后续幕 id 集(动态推导):被任意 delayed 指向的事件永不随机抽中——只由合法前因进入(F08) */
export const SECOND_ACT_IDS: ReadonlySet<string> = new Set(
  GUILD_EVENTS.flatMap((e) => e.choices.flatMap((c) => c.outcomes.map((o) => o.effects?.delayed?.eventId).filter(Boolean) as string[])),
)

function regionOfDungeon(dungeonId: string): EventRegion | undefined {
  for (const r of REGIONS) {
    if ([...r.main, ...r.side, r.finale].includes(dungeonId)) return r.id as EventRegion
  }
  return undefined
}

/** 事件池(U27④):回城只抽 town;节点抽「本副本专属 + 本地地形(限版图)」,永不含 town,后续幕除外(F08) */
export function eventPool(where: EventWhere): GuildEventDef[] {
  if (where.where === 'town') {
    const visited = where.visited
    return GUILD_EVENTS.filter((e) => {
      if (e.scope.kind !== 'town' || SECOND_ACT_IDS.has(e.id)) return false
      // 前置(草案 §4.2):requires.visited=该副本已有熟练度才可抽
      if (e.requires?.visited && !(visited && (visited[e.requires.visited] ?? 0) > 0)) return false
      return true
    })
  }
  const region = regionOfDungeon(where.dungeonId)
  return GUILD_EVENTS.filter((e) => {
    if (SECOND_ACT_IDS.has(e.id)) return false
    const s = e.scope
    if (s.kind === 'dungeon') return s.ids.includes(where.dungeonId)
    if (s.kind === 'terrain') {
      if (!where.terrain || !s.terrains.includes(where.terrain)) return false
      return !s.regions || (region !== undefined && s.regions.includes(region))
    }
    return false
  })
}

/** 掷事件:node 必触发(event 节点);town 走 EVENT_CHANCE(与访客 roll 互斥由调用方处理) */
export function rollGuildEvent(rng: Rng, where: EventWhere): GuildEventDef | null {
  if (where.where === 'town' && rng() >= EVENT_CHANCE) return null
  const pool = eventPool(where)
  return pool[Math.floor(rng() * pool.length)] ?? null
}

/** 某事件被 delayed 指向时的触发地与副本限定(events-draft §2.2):取指向方的 at/dungeonId */
export function consequenceOf(eventId: string): { at: 'town' | 'dungeon'; dungeonId?: string } | null {
  for (const e of GUILD_EVENTS) {
    for (const c of e.choices) {
      for (const o of c.outcomes) {
        const d = o.effects?.delayed
        if (d?.eventId === eventId) return { at: d.at, dungeonId: d.dungeonId }
      }
    }
  }
  return null
}

/** 副本档延迟后果能否在「本副本的 event 节点」触发:at=dungeon 且(不限副本 或 指定副本匹配) */
export function consequenceFiresIn(eventId: string, dungeonId: string): boolean {
  const c = consequenceOf(eventId)
  return c?.at === 'dungeon' && (c.dungeonId === undefined || c.dungeonId === dungeonId)
}

export function eventCount(): number {
  return GUILD_EVENTS.length
}

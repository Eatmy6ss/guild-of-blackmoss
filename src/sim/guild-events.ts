import { GUILD_EVENTS, EVENT_CHANCE, type GuildEventDef, type EventOutcome } from '../data/guild-events'

// 大事事件解析(sim 层,纯逻辑):按权重掷结果、按概率触发事件。效果应用在 UI 层。

export type Rng = () => number

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

/** 回城时掷事件:EVENT_CHANCE 概率随机返回一个事件,否则 null(与访客 roll 互斥由调用方处理) */
export type EventRegion = 'blackmoss-wild' | 'dragonridge'

/** 后续幕 id 集(动态推导):被任意 delayed 指向的事件永不随机抽中——只由合法前因进入(F08) */
export const SECOND_ACT_IDS: ReadonlySet<string> = new Set(
  GUILD_EVENTS.flatMap((e) => e.choices.flatMap((c) => c.outcomes.map((o) => o.effects?.delayed?.eventId).filter(Boolean) as string[])),
)

export function rollGuildEvent(rng: Rng, opts?: { force?: boolean; context?: { region?: EventRegion } }): GuildEventDef | null {
  // 路线事件节点必触发(试玩反馈:45% 概率门槛只适用于回城 roll)
  if (!opts?.force && rng() >= EVENT_CHANCE) return null
  // F08(2026-09-25):后续幕隔离+地域过滤——随机池只含「可首次遭遇」的事件
  const pool = GUILD_EVENTS.filter((e) => {
    if (SECOND_ACT_IDS.has(e.id)) return false
    if (e.region && (!opts?.context?.region || !e.region.includes(opts.context.region))) return false
    return true
  })
  return pool[Math.floor(rng() * pool.length)] ?? null
}

export function eventCount(): number {
  return GUILD_EVENTS.length
}

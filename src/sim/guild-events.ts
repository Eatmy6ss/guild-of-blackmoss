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
export function rollGuildEvent(rng: Rng): GuildEventDef | null {
  if (rng() >= EVENT_CHANCE) return null
  return GUILD_EVENTS[Math.floor(rng() * GUILD_EVENTS.length)] ?? null
}

export function eventCount(): number {
  return GUILD_EVENTS.length
}

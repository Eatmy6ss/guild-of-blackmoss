import type { DeathCause } from './types'

// A2 事实账本(ROADMAP §3.3):说书人的查询层——编年史存成品句子,账本存可查的结构化事实。
// 纪律:只追加(修剪按保留策略,不改写);App 不裸写,一律走本模块函数;从 v22 起记录,旧档为空。

export type FactKind =
  | 'death' | 'scar' | 'relic-bind' | 'relic-redeem' | 'item-inherit'
  | 'wish-done' | 'event-choice' | 'consequence-due' | 'first-kill'
  | 'bond-star' | 'tower-record'

export interface Fact {
  /** 单调序号(同 itemSeq 纪律:永不复用) */
  id: number
  day: number
  kind: FactKind
  /** memberId 列表(事件类可为空) */
  actors: string[]
  /** id→名字映射(写入口顺手带,说书人模板取人名用;不必全员) */
  names?: Record<string, string>
  refs: { itemUid?: string; eventId?: string; bossId?: string; dungeonId?: string; floor?: number }
  /** kind = death 时必填(断言守) */
  cause?: DeathCause
  /** 本事实由哪些旧事实引起(consequence-due → event-choice) */
  links?: number[]
}

export interface FactLedger {
  nextId: number
  facts: Fact[]
}

export const EMPTY_LEDGER: FactLedger = { nextId: 1, facts: [] }

/** 永久保留的事实种类;其余只留最近 keepDays 天(体积策略,天数为结构占位) */
const PERMANENT: readonly FactKind[] = ['death', 'relic-bind', 'relic-redeem', 'item-inherit']
export const FACT_KEEP_DAYS = 30

/** 唯一追加入口。约束断言(写关系不写数值):death 必带 cause;relic-bind 同一 itemUid 同一时刻仅一个有效 */
export function appendFact(ledger: FactLedger, day: number, draft: Omit<Fact, 'id' | 'day'>): Fact {
  if (draft.kind === 'death' && !draft.cause) throw new Error('账本约束:death 事实必须携带 DeathCause')
  if (draft.kind === 'relic-bind' && draft.refs.itemUid) {
    const active = ledger.facts.find(
      (f) => f.kind === 'relic-bind' && f.refs.itemUid === draft.refs.itemUid &&
        !ledger.facts.some((r) => r.kind === 'relic-redeem' && r.refs.itemUid === draft.refs.itemUid && r.id > f.id),
    )
    if (active) throw new Error('账本约束:itemUid ' + draft.refs.itemUid + ' 已有未解除的 relic-bind')
  }
  const fact: Fact = { id: ledger.nextId++, day, ...draft }
  ledger.facts.push(fact)
  return fact
}

/** 体积修剪:永久类全留,其余只保留最近 keepDays 天内的事实(按 day 字段,倒序保序) */
export function pruneFacts(ledger: FactLedger, currentDay: number, keepDays = FACT_KEEP_DAYS): void {
  const floor = currentDay - keepDays
  ledger.facts = ledger.facts.filter((f) => f.day >= floor || PERMANENT.includes(f.kind))
}

/** 查询:遗物的前主人链(说书人:"这件遗物又等来了下一位主人") */
export function factsByItem(ledger: FactLedger, itemUid: string): Fact[] {
  return ledger.facts.filter((f) => f.refs.itemUid === itemUid)
}

/** 查询:某成员的全部事实("他终于去了那个地方") */
export function factsByMember(ledger: FactLedger, memberId: string): Fact[] {
  return ledger.facts.filter((f) => f.actors.includes(memberId))
}

/** 查询:某事件的最近一次选择(consequence-due 建链用) */
export function latestEventChoice(ledger: FactLedger, eventId: string): Fact | undefined {
  return [...ledger.facts].reverse().find((f) => f.kind === 'event-choice' && f.refs.eventId === eventId)
}

export function factById(ledger: FactLedger, id: number): Fact | undefined {
  return ledger.facts.find((f) => f.id === id)
}

/** JSON 往返防御:坏档/缺字段回落空账本(永不抛) */
export function normalizeLedger(value: unknown): FactLedger {
  const v = value as FactLedger | undefined
  if (!v || !Array.isArray(v.facts) || typeof v.nextId !== 'number' || !Number.isSafeInteger(v.nextId)) {
    return { ...EMPTY_LEDGER, facts: [], nextId: 1 }
  }
  return { nextId: v.nextId, facts: v.facts.filter((f) => f && typeof f.id === 'number' && typeof f.kind === 'string') }
}

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
  refs: { itemUid?: string; eventId?: string; bossId?: string; dungeonId?: string; floor?: number; encounter?: number; nearDeath?: boolean; scarNth?: number; stars?: number }
  /** kind = death 时必填(断言守) */
  cause?: DeathCause
  /** 本事实由哪些旧事实引起(consequence-due → event-choice) */
  links?: number[]
}

export interface FactLedger {
  nextId: number
  facts: Fact[]
  /** B4:说书人已讲到的水位(讲一条推到 nextId) */
  toldThrough?: number
  /** B4:本趟远征出发时的账本水位(碰撞类事实只认这之后的) */
  expeditionStart?: number
  /** U26⑥/Q4-B:每类故事最近用过的模板下标(最多留 2 个,防偏科) */
  recentTemplates?: Partial<Record<string, number[]>>
}

export const EMPTY_LEDGER: FactLedger = { nextId: 1, facts: [] }

/** S9:账本断言严格性——DEV=throw,正式构建=warn 后跳过;测试可切换 */
export let strictAssertions = true // 正式入口(main.tsx)按构建模式关闭;测试默认严格
export function setStrictAssertions(v: boolean): void {
  strictAssertions = v
}
function assertOrWarn(message: string): boolean {
  if (strictAssertions) throw new Error(message)
  console.warn('账本约束(跳过写入):' + message)
  return false
}

/** 永久保留的事实种类;其余只留最近 keepDays 天(体积策略,天数为结构占位) */
const PERMANENT: readonly FactKind[] = ['death', 'relic-bind', 'relic-redeem', 'item-inherit']
export const FACT_KEEP_DAYS = 30

/** 唯一追加入口。约束断言(写关系不写数值):death 必带 cause;relic-bind 同一 itemUid 同一时刻仅一个有效 */
export function appendFact(ledger: FactLedger, day: number, draft: Omit<Fact, 'id' | 'day'>): Fact | undefined {
  // 极端坏档也不回绕/复用编号；暂停历史写入不能中断资产结算。
  if (!Number.isSafeInteger(ledger.nextId) || ledger.nextId < 1 || ledger.nextId >= Number.MAX_SAFE_INTEGER) {
    console.warn('账本约束(跳过写入):事实编号已超出安全范围')
    return undefined
  }
  if (draft.kind === 'death' && !draft.cause) {
    assertOrWarn('death 事实必须携带 DeathCause')
    return undefined
  }
  if (draft.kind === 'relic-bind' && draft.refs.itemUid) {
    const active = ledger.facts.find(
      (f) => f.kind === 'relic-bind' && f.refs.itemUid === draft.refs.itemUid &&
        !ledger.facts.some((r) => r.kind === 'relic-redeem' && r.refs.itemUid === draft.refs.itemUid && r.id > f.id),
    )
    if (active) {
      assertOrWarn('itemUid ' + draft.refs.itemUid + ' 已有未解除的 relic-bind')
      return undefined
    }
  }
  const fact: Fact = { id: ledger.nextId++, day, ...draft }
  ledger.facts.push(fact)
  return fact
}

/** B4:出发时打水位(碰撞类事实只认这之后的) */
export function markExpeditionStart(ledger: FactLedger): void {
  ledger.expeditionStart = ledger.nextId
}

/** B4:讲完一条故事,水位推到账本末尾;U26⑥:记录模板下标,同类只排除最近 2 个 */
export function markTold(ledger: FactLedger, storyType?: string, templateIdx?: number): void {
  ledger.toldThrough = ledger.nextId
  if (!storyType || templateIdx === undefined || !Number.isSafeInteger(templateIdx) || templateIdx < 0) return
  const recent = { ...(ledger.recentTemplates ?? {}) }
  const arr = [...(recent[storyType] ?? []), templateIdx].slice(-2)
  recent[storyType] = arr
  ledger.recentTemplates = recent
}

/** 体积修剪:永久类全留,其余只保留最近 keepDays 天内的事实(按 day 字段,倒序保序) */
export function pruneFacts(ledger: FactLedger, currentDay: number, keepDays = FACT_KEEP_DAYS): void {
  const floor = currentDay - keepDays
  const kept = ledger.facts.filter((f) => f.day >= floor || PERMANENT.includes(f.kind))
  const byId = new Map(ledger.facts.map((f) => [f.id, f]))
  const ids = new Set(kept.map((f) => f.id))
  // 留下兑现记录时也留下它可查询的来源，不让时间修剪割断事实链。
  for (let i = 0; i < kept.length; i++) for (const id of kept[i].links ?? []) {
    const origin = byId.get(id)
    if (origin && !ids.has(id)) { ids.add(id); kept.push(origin) }
  }
  ledger.facts = ledger.facts.filter((f) => ids.has(f.id))
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

const FACT_KINDS: Record<FactKind, true> = {
  death: true, scar: true, 'relic-bind': true, 'relic-redeem': true, 'item-inherit': true,
  'wish-done': true, 'event-choice': true, 'consequence-due': true, 'first-kill': true,
  'bond-star': true, 'tower-record': true,
}
const DEATH_KINDS: Record<DeathCause['kind'], true> = { battle: true, mechanic: true, event: true, scar: true, other: true }
const MECHANIC_KINDS: Record<NonNullable<DeathCause['mechanic']>, true> = {
  'telegraph-aoe': true, 'cast-buff': true, 'cast-heal': true, 'slow-touch': true, pull: true,
  'ground-zone': true, 'phase-invuln': true, summon: true, bind: true, enrage: true,
  'breath-charge': true, 'fear-aura': true,
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const identity = (v: unknown): v is number => count(v) && v > 0

function normalizedCause(value: unknown): DeathCause | undefined {
  if (!object(value) || !text(value.kind) || !Object.hasOwn(DEATH_KINDS, value.kind) || !object(value.where)) return
  const w = value.where
  if ((w.source !== 'dungeon' && w.source !== 'tower') || !text(w.id)) return
  const cause = { ...value, where: { ...w } } as unknown as DeathCause
  if (w.floor !== undefined && (!identity(w.floor))) delete cause.where.floor
  if (value.killerName !== undefined && !text(value.killerName)) delete cause.killerName
  if (value.mechanic !== undefined && (!text(value.mechanic) || !Object.hasOwn(MECHANIC_KINDS, value.mechanic))) delete cause.mechanic
  if (value.affixes !== undefined) {
    if (Array.isArray(value.affixes)) cause.affixes = value.affixes.filter(text)
    else delete cause.affixes
  }
  return cause
}

/** 只修复历史账本，不碰公会资产；不重编编号，合法 JSON 的键序/缺省形态保留。 */
export function normalizeLedger(value: unknown): FactLedger {
  if (!object(value)) return { nextId: 1, facts: [] }
  const raw = Array.isArray(value.facts) ? value.facts.filter(object) : []
  let nextId = identity(value.nextId) ? value.nextId : 1
  const counts = new Map<number, number>()
  for (const f of raw) if (identity(f.id)) {
    nextId = Math.max(nextId, Math.min(Number.MAX_SAFE_INTEGER, f.id + 1))
    counts.set(f.id, (counts.get(f.id) ?? 0) + 1)
  }
  const facts: Fact[] = [], seen = new Set<number>(), bound = new Set<string>()
  for (const f of raw.filter((entry) => identity(entry.id)).sort((a, b) => Number(a.id) - Number(b.id))) {
    // 重复编号来源有歧义，整组舍弃；PendingConsequence 也按 id 引用，不能保留一条后误绑。
    if (!identity(f.id) || counts.get(f.id) !== 1 || seen.has(f.id) || !identity(f.day) || !text(f.kind) || !Object.hasOwn(FACT_KINDS, f.kind)) continue
    const refs = { ...(object(f.refs) ? f.refs : {}) } as Fact['refs']
    for (const key of ['itemUid', 'eventId', 'bossId', 'dungeonId'] as const) if (refs[key] !== undefined && !text(refs[key])) delete refs[key]
    for (const key of ['floor', 'scarNth', 'stars'] as const) if (refs[key] !== undefined && !identity(refs[key])) delete refs[key]
    if (refs.encounter !== undefined && !count(refs.encounter)) delete refs.encounter
    if (refs.nearDeath !== undefined && typeof refs.nearDeath !== 'boolean') delete refs.nearDeath
    const cause = normalizedCause(f.cause)
    if (f.kind === 'death' && !cause) continue
    if (['relic-bind', 'relic-redeem', 'item-inherit'].includes(f.kind) && !refs.itemUid) continue
    if (f.kind === 'relic-bind' && bound.has(refs.itemUid!)) continue
    const fact = { ...f, actors: Array.isArray(f.actors) ? f.actors.filter(text) : [], refs } as unknown as Fact
    if (f.names !== undefined) {
      if (object(f.names)) fact.names = Object.fromEntries(Object.entries(f.names).filter(([, name]) => text(name))) as Record<string, string>
      else delete fact.names
    }
    if (cause) fact.cause = cause
    else delete fact.cause
    if (f.links !== undefined) {
      if (Array.isArray(f.links)) fact.links = [...new Set(f.links.filter(identity))]
      else delete fact.links
    }
    if (f.kind === 'relic-bind') bound.add(refs.itemUid!)
    if (f.kind === 'relic-redeem') bound.delete(refs.itemUid!)
    facts.push(fact); seen.add(f.id)
  }
  const byId = new Map(facts.map((f) => [f.id, f]))
  for (const f of facts) if (f.links) f.links = f.links.filter((id) => {
    const origin = byId.get(id)
    return !!origin && counts.get(id) === 1 && id < f.id && origin.day <= f.day &&
      (f.kind !== 'consequence-due' || (origin.kind === 'event-choice' && !!origin.refs.eventId))
  })
  const ledger = { ...value, nextId, facts } as unknown as FactLedger
  for (const key of ['toldThrough', 'expeditionStart'] as const) {
    if (value[key] !== undefined && (!count(value[key]) || value[key] > nextId)) delete ledger[key]
  }
  if (value.recentTemplates !== undefined) {
    if (object(value.recentTemplates)) ledger.recentTemplates = Object.fromEntries(Object.entries(value.recentTemplates)
      .filter(([, recent]) => Array.isArray(recent))
      .map(([type, recent]) => [type, (recent as unknown[]).filter(count).slice(-2)]))
    else delete ledger.recentTemplates
  }
  return ledger
}

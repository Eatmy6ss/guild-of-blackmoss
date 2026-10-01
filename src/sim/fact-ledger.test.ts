import { describe, expect, test } from 'vitest'
import { appendFact, EMPTY_LEDGER, factById, factsByItem, factsByMember, latestEventChoice, normalizeLedger, pruneFacts, FACT_KEEP_DAYS, type FactLedger } from './fact-ledger'
import type { DeathCause } from './types'

const cause: DeathCause = { kind: 'battle', where: { source: 'dungeon', id: 'abyssaltar' } }

describe('A2 事实账本', () => {
  test('断言:death 必带 cause;relic-bind 同一 itemUid 同时刻仅一个有效(赎回前重复拒绝,赎回后可再绑)', () => {
    const l: FactLedger = { ...EMPTY_LEDGER, facts: [], nextId: 1 }
    expect(() => appendFact(l, 1, { kind: 'death', actors: ['m1'], refs: {} })).toThrow()
    appendFact(l, 1, { kind: 'death', actors: ['m1'], refs: {}, cause })
    appendFact(l, 1, { kind: 'relic-bind', actors: ['m1'], refs: { itemUid: 'it_5' } })
    expect(() => appendFact(l, 2, { kind: 'relic-bind', actors: ['m2'], refs: { itemUid: 'it_5' } })).toThrow()
    appendFact(l, 3, { kind: 'relic-redeem', actors: [], refs: { itemUid: 'it_5' } })
    appendFact(l, 4, { kind: 'relic-bind', actors: ['m2'], refs: { itemUid: 'it_5' } })
    expect(l.facts.filter((f) => f.kind === 'relic-bind')).toHaveLength(2)
  })

  test('链:consequence-due 经 latestEventChoice 指向已存在的 event-choice;id 单调不复用', () => {
    const l: FactLedger = { ...EMPTY_LEDGER, facts: [], nextId: 1 }
    const choice = appendFact(l, 5, { kind: 'event-choice', actors: ['m1'], refs: { eventId: 'ev-toll' } })
    const link = latestEventChoice(l, 'ev-toll')
    const due = appendFact(l, 12, { kind: 'consequence-due', actors: [], refs: { eventId: 'ev-toll' }, links: link ? [link.id] : undefined })
    expect(due.links).toEqual([choice.id])
    expect(factById(l, choice.id)?.kind).toBe('event-choice')
    expect(l.nextId).toBe(3)
  })

  test('修剪:永久类(death/relic-*)全留,普通类只留最近 N 天', () => {
    const l: FactLedger = { ...EMPTY_LEDGER, facts: [], nextId: 1 }
    appendFact(l, 1, { kind: 'death', actors: ['m1'], refs: {}, cause })
    appendFact(l, 1, { kind: 'relic-bind', actors: [], refs: { itemUid: 'it_1' } })
    appendFact(l, 1, { kind: 'scar', actors: ['m1'], refs: {} })
    appendFact(l, 1, { kind: 'event-choice', actors: [], refs: { eventId: 'e' } })
    appendFact(l, 100, { kind: 'bond-star', actors: ['m1', 'm2'], refs: {} })
    pruneFacts(l, 100)
    const kinds = l.facts.map((f) => f.kind)
    expect(kinds).toContain('death')
    expect(kinds).toContain('relic-bind')
    expect(kinds).toContain('bond-star')
    expect(kinds).not.toContain('scar')
    expect(kinds).not.toContain('event-choice')
    expect(FACT_KEEP_DAYS).toBeGreaterThan(0)
  })

  test('查询:按遗物/按成员;normalize 兜底坏档', () => {
    const l: FactLedger = { ...EMPTY_LEDGER, facts: [], nextId: 1 }
    appendFact(l, 1, { kind: 'relic-bind', actors: ['m1'], refs: { itemUid: 'it_9' } })
    appendFact(l, 2, { kind: 'relic-redeem', actors: [], refs: { itemUid: 'it_9' } })
    appendFact(l, 3, { kind: 'wish-done', actors: ['m1'], refs: {} })
    expect(factsByItem(l, 'it_9')).toHaveLength(2)
    expect(factsByMember(l, 'm1')).toHaveLength(2)
    expect(normalizeLedger(undefined).facts).toEqual([])
    expect(normalizeLedger({ nextId: NaN }).facts).toEqual([])
  })
})

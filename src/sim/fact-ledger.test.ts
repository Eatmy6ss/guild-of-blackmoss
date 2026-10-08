import { describe, expect, test, vi } from 'vitest'
import { appendFact, EMPTY_LEDGER, factById, factsByItem, factsByMember, latestEventChoice, markExpeditionStart, markTold, normalizeLedger, pruneFacts, setStrictAssertions, FACT_KEEP_DAYS, type FactLedger } from './fact-ledger'
import { tellExpedition } from './storyteller'
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
    const choice = appendFact(l, 5, { kind: 'event-choice', actors: ['m1'], refs: { eventId: 'ev-toll' } })!
    const link = latestEventChoice(l, 'ev-toll')
    const due = appendFact(l, 12, { kind: 'consequence-due', actors: [], refs: { eventId: 'ev-toll' }, links: link ? [link.id] : undefined })!
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

describe('第 2 组:B4 水位入账本 / S9 normalize', () => {
  test('B4:讲一条 → 序列化 → normalize → 再讲 → null(水位持久)', () => {
    const l = { ...EMPTY_LEDGER, facts: [], nextId: 1 }
    appendFact(l, 3, { kind: 'first-kill', actors: ['m1'], names: { m1: '甲' }, refs: { bossId: 'grush', dungeonId: 'blackmoss' } })
    markExpeditionStart(l)
    appendFact(l, 4, { kind: 'scar', actors: ['m1'], refs: {} })
    markTold(l)
    const restored = normalizeLedger(JSON.parse(JSON.stringify(l)))
    expect(restored.toldThrough).toBe(l.nextId)
    const after = tellExpedition(restored, () => 0.5, { fromId: restored.toldThrough ?? 0, startId: restored.expeditionStart ?? 0 })
    expect(after).toBeNull()
  })

  test('S9:坏账本(nextId 落后、缺 refs/actors)normalize 后能继续追加', () => {
    const bad = normalizeLedger({ nextId: 1, facts: [{ id: 7, day: 2, kind: 'scar' }] })
    expect(bad.nextId).toBe(8)
    expect(bad.facts[0].refs).toEqual({})
    expect(bad.facts[0].actors).toEqual([])
    const f = appendFact(bad, 9, { kind: 'wish-done', actors: ['m1'], refs: {} })
    expect(f?.id).toBe(8)
  })

  test('S9:正式模式(strict=false)重复 relic-bind 不抛,跳过写入', () => {
    const l = { ...EMPTY_LEDGER, facts: [], nextId: 1 }
    appendFact(l, 1, { kind: 'relic-bind', actors: ['m1'], refs: { itemUid: 'it_1' } })
    setStrictAssertions(false)
    const before = l.facts.length
    expect(() => appendFact(l, 2, { kind: 'relic-bind', actors: ['m2'], refs: { itemUid: 'it_1' } })).not.toThrow()
    expect(l.facts.length).toBe(before)
    setStrictAssertions(true)
  })
})

describe('账本恢复边界', () => {
  test('合法账本 JSON 字节/缺省形态不漂移，正规化不改输入或共享可变容器', () => {
    const source: FactLedger = { nextId: 4, facts: [
      { id: 1, day: 2, kind: 'event-choice', actors: ['m1'], names: { m1: '甲' }, refs: { eventId: 'first-act' } },
      { id: 2, day: 4, kind: 'consequence-due', actors: [], refs: { eventId: 'cursed-coffin' }, links: [1] },
      { id: 3, day: 4, kind: 'death', actors: ['m1'], refs: { dungeonId: 'abyssaltar' }, cause },
    ], toldThrough: 4, expeditionStart: 2, recentTemplates: { 'consequence-due': [1, 4] } }
    const before = JSON.stringify(source)
    const restored = normalizeLedger(source)
    expect(JSON.stringify(restored)).toBe(before)
    restored.facts[0].actors.push('m2')
    restored.facts[0].names!.m1 = '已修改'
    restored.facts[0].refs.eventId = '另一幕'
    restored.facts[2].cause!.where.id = 'tower'
    restored.recentTemplates!['consequence-due']!.push(5)
    expect(JSON.stringify(source)).toBe(before)
    expect(JSON.stringify(normalizeLedger({ nextId: 1, facts: [] }))).toBe('{"nextId":1,"facts":[]}')
  })

  test('坏结构局部舍弃；保住合法记录且不复用被丢弃事实的编号', () => {
    const raw = { nextId: -4, facts: [
      { id: 2, day: 1, kind: 'scar', actors: ['m1', null, 3], names: { m1: '甲', broken: {} }, refs: { dungeonId: 7, floor: -2, encounter: 0, nearDeath: 'yes', scarNth: 2 } },
      { id: 3, day: 1, kind: 'death', actors: ['m1'], refs: {}, cause: {} },
      { id: 4, day: NaN, kind: 'wish-done', refs: {} },
      { id: 5.5, day: 1, kind: 'scar', refs: {} },
      { id: 11, day: 1, kind: 'invented-fact', refs: {} },
      { id: 6, day: 1, kind: 'death', actors: ['m2'], refs: {}, cause: { kind: 'mechanic', where: { source: 'tower', id: 'tower', floor: 3 }, mechanic: 'breath-charge', affixes: ['火焰', 7] } },
    ] }
    const before = structuredClone(raw)
    const normalized = normalizeLedger(raw)
    expect(normalized.facts.map((f) => f.id)).toEqual([2, 6])
    expect(normalized.facts[0]).toMatchObject({ actors: ['m1'], names: { m1: '甲' }, refs: { encounter: 0, scarNth: 2 } })
    expect(normalized.facts[0].refs).not.toHaveProperty('dungeonId')
    expect(normalized.facts[0].refs).not.toHaveProperty('nearDeath')
    expect(normalized.facts[1].cause).toEqual({ kind: 'mechanic', where: { source: 'tower', id: 'tower', floor: 3 }, mechanic: 'breath-charge', affixes: ['火焰'] })
    expect(appendFact(normalized, 3, { kind: 'wish-done', actors: ['m1'], refs: {} })?.id).toBe(12)
    expect(raw).toEqual(before)
  })

  test('重复来源编号全部移除，既有 links 与未来 id 查询均不会串到另一条选择', () => {
    const normalized = normalizeLedger({ nextId: 1, facts: [
      { id: 1, day: 1, kind: 'event-choice', actors: [], refs: { eventId: 'first-act' } },
      { id: 1, day: 2, kind: 'event-choice', actors: [], refs: { eventId: 'another-act' } },
      { id: 2, day: 4, kind: 'consequence-due', actors: [], refs: { eventId: 'cursed-coffin' }, links: [1] },
    ] })
    expect(normalized.facts.map((f) => f.id)).toEqual([2])
    expect(normalized.facts[0].links).toEqual([])
    expect(factById(normalized, 1)).toBeUndefined()
    expect(tellExpedition(normalized, () => 0)).toBeNull()
    expect(appendFact(normalized, 4, { kind: 'event-choice', actors: [], refs: { eventId: 'new-act' } })?.id).toBe(3)
  })

  test('链接只认存在且更早的事实，兑现源不能是死亡、未来选择或未来日期', () => {
    const normalized = normalizeLedger({ nextId: 6, facts: [
      { id: 1, day: 1, kind: 'death', actors: ['m1'], refs: {}, cause },
      { id: 2, day: 1, kind: 'event-choice', actors: [], refs: { eventId: 'first-act' } },
      { id: 3, day: 9, kind: 'event-choice', actors: [], refs: { eventId: 'future-act' } },
      { id: 4, day: 4, kind: 'consequence-due', actors: [], refs: { eventId: 'cursed-coffin' }, links: [1, 2, 2, 3, 4, 5, 999] },
      { id: 5, day: 1, kind: 'event-choice', actors: [], refs: { eventId: 'late-id' } },
    ] })
    expect(factById(normalized, 4)?.links).toEqual([2])
  })

  test('无效遗物绑定局部移除，赎回后的重新绑定仍合法', () => {
    const normalized = normalizeLedger({ nextId: 8, facts: [
      { id: 1, day: 1, kind: 'relic-bind', actors: ['m1'], refs: { itemUid: 'it_1' } },
      { id: 2, day: 2, kind: 'relic-bind', actors: ['m2'], refs: { itemUid: 'it_1' } },
      { id: 3, day: 3, kind: 'relic-redeem', actors: [], refs: { itemUid: 'it_1' } },
      { id: 4, day: 4, kind: 'relic-bind', actors: ['m3'], refs: { itemUid: 'it_1' } },
      { id: 7, day: 4, kind: 'relic-bind', actors: ['m4'], refs: {} },
    ] })
    expect(normalized.facts.map((f) => f.id)).toEqual([1, 3, 4])
    expect(normalized.nextId).toBe(8)
    expect(() => appendFact(normalized, 5, { kind: 'relic-bind', actors: ['m4'], refs: { itemUid: 'it_1' } })).toThrow()
  })

  test('修剪保留仍有效兑现的旧来源，水位/模板记忆坏值局部清理', () => {
    const normalized = normalizeLedger({ nextId: 3, toldThrough: Infinity, expeditionStart: -1,
      recentTemplates: { 'consequence-due': [0, NaN, 1, -2, 2, 3], broken: 'text' }, facts: [
        { id: 1, day: 1, kind: 'event-choice', actors: [], refs: { eventId: 'dragon-egg' } },
        { id: 2, day: 35, kind: 'consequence-due', actors: [], refs: { eventId: 'egg-hatch' }, links: [1] },
      ] })
    expect(normalized.toldThrough).toBeUndefined()
    expect(normalized.expeditionStart).toBeUndefined()
    expect(normalized.recentTemplates).toEqual({ 'consequence-due': [2, 3] })
    pruneFacts(normalized, 36)
    expect(normalized.facts.map((f) => f.id)).toEqual([1, 2])
    expect(tellExpedition(normalized, () => 0, { fromId: 2, startId: 3 })?.type).toBe('consequence-due')
  })

  test('安全整数耗尽的导入不回绕复用编号，也不中断后续资产调用者', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const normalized = normalizeLedger({ nextId: Number.MAX_SAFE_INTEGER, facts: [] })
      expect(appendFact(normalized, 1, { kind: 'wish-done', actors: ['m1'], refs: {} })).toBeUndefined()
      expect(normalized.nextId).toBe(Number.MAX_SAFE_INTEGER)
      expect(normalized.facts).toEqual([])
    } finally { warn.mockRestore() }
  })
})

import { describe, expect, test } from 'vitest'
import { tellExpedition } from './storyteller'
import { EMPTY_LEDGER, type FactLedger } from './fact-ledger'

const ledger = (): FactLedger => ({ nextId: 1, facts: [] })
const rng = (): number => 0.25
const causeOf = (dungeonId: string): DeathCause => ({ kind: 'battle', where: { source: 'dungeon', id: dungeonId } })
import type { DeathCause } from './types'
const deathFact = (id: number, member: string, name: string, dungeonId: string, day = 3) => ({
  id, day, kind: 'death' as const, actors: [member], names: { [member]: name },
  refs: {}, cause: causeOf(dungeonId),
})

describe('A9 说书人 A 步', () => {
  test('空账本不讲(没有事实就没有故事)', () => {
    expect(tellExpedition(EMPTY_LEDGER, rng)).toBeNull()
  })

  test('优先级:延迟兑现压过首杀陪葬;文本含事实槽位(事件 id/天数)', () => {
    const l = ledger()
    l.facts = [
      { ...deathFact(1, 'm1', '老盾卫', 'blackmoss'), day: 3 },
      { id: 2, day: 9, kind: 'consequence-due', actors: [], refs: { eventId: 'ev-toll' }, links: [1] },
      { id: 3, day: 3, kind: 'first-kill', actors: ['m2'], names: { m2: '游侠甲' }, refs: { bossId: 'grush', dungeonId: 'blackmoss' } },
    ] as typeof l.facts
    const story = tellExpedition(l, rng)!
    expect(story.type).toBe('consequence-due')
    expect(story.text).toContain('第 9 天')
    expect(story.factIds).toContain(1)
  })

  test('首杀+当场阵亡:同副本才成碰,模板含 boss 名与人名(账本 names)', () => {
    const l = ledger()
    l.facts = [
      { id: 1, day: 3, kind: 'first-kill', actors: ['m2'], names: { m2: '游侠甲' }, refs: { bossId: 'grush', dungeonId: 'blackmoss' } },
      deathFact(2, 'm1', '老盾卫', 'blackmoss'),
    ] as typeof l.facts
    const story = tellExpedition(l, rng)!
    expect(story.type).toBe('firstkill-death')
    expect(story.text).toContain('格鲁什')
    expect(story.text).toContain('老盾卫')
  })

  test('创伤生还:创伤者阵亡则不成立(归遗物/死亡类)', () => {
    const l = ledger()
    l.facts = [
      { id: 1, day: 3, kind: 'scar', actors: ['m1'], names: { m1: '老盾卫' }, refs: {} },
      deathFact(2, 'm1', '老盾卫', 'rustmine'),
      { id: 3, day: 3, kind: 'relic-bind', actors: ['m1'], names: { m1: '老盾卫' }, refs: { itemUid: 'it_3' } },
    ] as typeof l.facts
    const story = tellExpedition(l, rng)!
    expect(story?.type).toBe('relic-wait')
  })

  test('遗物待赎:绑捆+同人死亡;无死亡则不成立', () => {
    const l = ledger()
    l.facts = [{ id: 1, day: 3, kind: 'relic-bind', actors: ['m1'], names: { m1: '老盾卫' }, refs: { itemUid: 'it_3' } }]
    expect(tellExpedition(l, rng)).toBeNull()
    l.facts.push(deathFact(2, 'm1', '老盾卫', 'rustmine'))
    expect(tellExpedition(l, rng)?.type).toBe('relic-wait')
  })
})

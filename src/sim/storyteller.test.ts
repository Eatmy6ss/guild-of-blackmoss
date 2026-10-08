import { describe, expect, test } from 'vitest'
import { tellExpedition } from './storyteller'
import { EMPTY_LEDGER, type FactLedger } from './fact-ledger'
import { TEMPLATES } from '../data/story-templates'

const ledger = (): FactLedger => ({ nextId: 1, facts: [] })

const deathFact = (id: number, member: string, name: string, dungeonId: string, encounter: number | undefined, day = 3) => ({
  id, day, kind: 'death' as const, actors: [member], names: { [member]: name },
  refs: { encounter, dungeonId },
  cause: { kind: 'battle' as const, where: { source: 'dungeon' as const, id: dungeonId } },
})
const killFact = (id: number, boss: string, dungeonId: string, encounter: number | undefined, day = 3) => ({
  id, day, kind: 'first-kill' as const, actors: ['m9'], names: { m9: '记名者' },
  refs: { bossId: boss, dungeonId, encounter },
})

describe('A9 基础', () => {
  test('空账本不讲(没有事实就没有故事)', () => {
    expect(tellExpedition(EMPTY_LEDGER, () => 0.5)).toBeNull()
  })

  test('前趟未成故事的阵亡，不与本趟首杀拼成同场陪葬', () => {
    const l = ledger()
    l.facts = [deathFact(1, 'old', '前趟亡者', 'blackmoss', 2), killFact(2, 'grush', 'blackmoss', 2)]
    expect(tellExpedition(l, () => 0, { fromId: 0, startId: 2 })).toBeNull()
  })

  test('出发前兑现的延迟后果可引用旧选择，讲过后不因保留旧因果重讲', () => {
    const l = ledger()
    l.facts = [
      { id: 1, day: 1, kind: 'event-choice', actors: [], refs: { eventId: 'cursed-coffin' } },
      { id: 2, day: 7, kind: 'consequence-due', actors: [], refs: { eventId: 'cursed-coffin' }, links: [1] },
    ]
    expect(tellExpedition(l, () => 0, { fromId: 2, startId: 3 })?.factIds).toEqual([2, 1])
    expect(tellExpedition(l, () => 0, { fromId: 3, startId: 2 })).toBeNull()
  })
})

describe('第 5 组 Q5:首杀陪葬分两组(encounter 记录死在哪一场)', () => {
  test('同副本同 encounter 阵亡 → firstkill-death', () => {
    const l = ledger()
    l.facts = [killFact(1, 'grush', 'blackmoss', 6), deathFact(2, 'm1', '老盾卫', 'blackmoss', 6)] as typeof l.facts
    expect(tellExpedition(l, () => 0.5)?.type).toBe('firstkill-death')
  })
  test('同副本但阵亡 encounter 更小 → firstkill-fallen(没走到 Boss 面前)', () => {
    const l = ledger()
    l.facts = [killFact(1, 'grush', 'blackmoss', 6), deathFact(2, 'm1', '老盾卫', 'blackmoss', 2)] as typeof l.facts
    expect(tellExpedition(l, () => 0.5)?.type).toBe('firstkill-fallen')
  })
  test('首杀在前(encounter 1)、阵亡在后(encounter 3)→ 两组都不出', () => {
    const l = ledger()
    l.facts = [killFact(1, 'grush', 'blackmoss', 1), deathFact(2, 'm1', '老盾卫', 'blackmoss', 3)] as typeof l.facts
    expect(tellExpedition(l, () => 0.5)).toBeNull()
  })
  test('旧事实缺 encounter:只允许配 firstkill-fallen,不冒充同场', () => {
    const l = ledger()
    l.facts = [killFact(1, 'grush', 'blackmoss', undefined), deathFact(2, 'm1', '老盾卫', 'blackmoss', undefined)] as typeof l.facts
    expect(tellExpedition(l, () => 0.5)?.type).toBe('firstkill-fallen')
  })
})

describe('第 5 组 Q4-C 默契门槛', () => {
  test('2★ 不讲;1★ 和 3★ 能讲且文本带 ★', () => {
    const l2 = ledger()
    l2.facts = [{ id: 1, day: 3, kind: 'bond-star', actors: ['m1', 'm2'], names: { m1: '甲', m2: '乙' }, refs: { stars: 2 } }] as typeof l2.facts
    expect(tellExpedition(l2, () => 0.5)).toBeNull()
    for (const stars of [1, 3]) {
      const l = ledger()
      l.facts = [{ id: 1, day: 3, kind: 'bond-star', actors: ['m1', 'm2'], names: { m1: '甲', m2: '乙' }, refs: { stars } }] as typeof l.facts
      const story = tellExpedition(l, () => 0.5)!
      expect(story.type).toBe('bond-star')
      expect(story.text).toContain('★')
    }
  })
})

describe('第 5 组 Q4-C 创伤门槛', () => {
  test('第 1 条且非濒死 → 不讲;濒死的第 1 条、非濒死的第 2 条 → 讲', () => {
    const first = (nearDeath: boolean) => {
      const l = ledger()
      l.facts = [{ id: 1, day: 3, kind: 'scar', actors: ['m1'], names: { m1: '老盾卫' }, refs: { dungeonId: 'rustmine', nearDeath, scarNth: 1 } }] as typeof l.facts
      return tellExpedition(l, () => 0.5)
    }
    expect(first(false)).toBeNull()
    expect(first(true)?.type).toBe('scar-survive')
    const l2 = ledger()
    l2.facts = [{ id: 1, day: 3, kind: 'scar', actors: ['m1'], names: { m1: '老盾卫' }, refs: { dungeonId: 'rustmine', nearDeath: false, scarNth: 2 } }] as typeof l2.facts
    expect(tellExpedition(l2, () => 0.5)?.type).toBe('scar-survive')
  })
})

describe('第 5 组 Q4-B 模板去重(记在账本)', () => {
  test('同类连讲 3 次下标两两不同;序列化 → normalize 后仍生效', () => {
    const l = ledger()
    l.facts = [
      { id: 1, day: 9, kind: 'consequence-due', actors: [], refs: { eventId: 'cursed-coffin' }, links: [0] },
      { id: 0, day: 2, kind: 'event-choice', actors: [], refs: { eventId: 'cursed-coffin' } },
    ] as typeof l.facts
    const seen: number[] = []
    for (let i = 0; i < 3; i++) {
      const story = tellExpedition(l, () => i / 3, { fromId: 0, startId: 0 })!
      expect(story.type).toBe('consequence-due')
      expect(seen).not.toContain(story.templateIdx)
      seen.push(story.templateIdx)
      const recent = { ...(l.recentTemplates ?? {}) }
      recent[story.type] = [...(recent[story.type] ?? []), story.templateIdx].slice(-2)
      l.recentTemplates = recent
    }
    const restored = JSON.parse(JSON.stringify(l)) as FactLedger
    const story = tellExpedition(restored, () => 0.5, { fromId: 0, startId: 0 })
    expect(story?.templateIdx).not.toBeUndefined()
    expect(seen).not.toContain(story!.templateIdx)
  })
})

describe('模板质量(U26①②):填满槽位渲染,无 undefined/NaN/机制 id/代词;每类恰好 6 条', () => {
  test('全部类型 × 全部模板', () => {
    const slots = {
      eventTitle: '受诅咒的报酬', choiceDay: 2, dueDay: 9,
      boss: '格鲁什', place: '黑苔沼泽', hero: '老盾卫', killer: '游侠甲',
      a: '甲', b: '乙', stars: 3, nth: 2,
    }
    for (const [type, templates] of Object.entries(TEMPLATES)) {
      expect(templates.length, type).toBe(6)
      for (const tpl of templates) {
        const text = tpl(slots as never)
        expect(text).not.toContain('undefined')
        expect(text).not.toContain('NaN')
        expect(text).not.toMatch(/[a-z]+-[a-z]+/)
        expect(text).not.toContain('他')
        expect(text).not.toContain('她')
      }
    }
  })
})

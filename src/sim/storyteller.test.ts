import { describe, expect, test } from 'vitest'
import { tellExpedition } from './storyteller'
import { EMPTY_LEDGER, markTold, normalizeLedger, type Fact, type FactLedger } from './fact-ledger'
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
      { id: 1, day: 2, kind: 'event-choice', actors: [], refs: { eventId: 'dragon-egg' } },
      { id: 2, day: 9, kind: 'consequence-due', actors: [], refs: { eventId: 'egg-hatch' }, links: [1] },
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
    const restored = normalizeLedger(JSON.parse(JSON.stringify(l)))
    const story = tellExpedition(restored, () => 0.5, { fromId: 0, startId: 0 })
    expect(story?.templateIdx).not.toBeUndefined()
    expect(seen).not.toContain(story!.templateIdx)
  })
})

describe('说书水位与延迟因果恢复', () => {
  const choice = (id = 1, day = 2): Fact => ({ id, day, kind: 'event-choice', actors: [], refs: { eventId: 'dragon-egg' } })
  const due = (id = 3, day = 5, origin = 1): Fact => ({ id, day, kind: 'consequence-due', actors: [], refs: { eventId: 'egg-hatch' }, links: [origin] })
  const scar = (id: number): Fact => ({ id, day: 5, kind: 'scar', actors: ['m1'], names: { m1: '生还者' }, refs: { dungeonId: 'blackmoss', scarNth: 2 } })

  test('普通碰撞必须同时越过已讲水位和本趟起点，不能拼上趟的死亡与本趟首杀', () => {
    expect(tellExpedition({ facts: [scar(2)] }, () => 0, { fromId: 0, startId: 3 })).toBeNull()
    expect(tellExpedition({ facts: [scar(2)] }, () => 0, { fromId: 3, startId: 0 })).toBeNull()
    expect(tellExpedition({ facts: [scar(3)] }, () => 0, { fromId: 2, startId: 3 })?.type).toBe('scar-survive')
    const facts = [deathFact(1, 'old', '上一趟亡者', 'blackmoss', 0), killFact(4, 'grush', 'blackmoss', 6)]
    expect(tellExpedition({ facts }, () => 0, { fromId: 0, startId: 3 })).toBeNull()
  })

  test('出发前的兑现可讲，已讲水位之前的真实第一幕仍是来源；保存后不会重讲', () => {
    const l: FactLedger = { nextId: 4, facts: [choice(), due()], toldThrough: 2, expeditionStart: 4 }
    const story = tellExpedition(l, () => 0, { fromId: 2, startId: 4 })!
    expect(story.type).toBe('consequence-due')
    expect(story.factIds).toEqual([3, 1])
    expect(story.text).toContain('第 2 天')
    expect(story.text).toContain('第 5 天')
    markTold(l, story.type, story.templateIdx)
    const restored = normalizeLedger(JSON.parse(JSON.stringify(l)))
    expect(tellExpedition(restored, () => 0, { fromId: restored.toldThrough!, startId: restored.expeditionStart! })).toBeNull()
  })

  test('缺来源、错误种类、未来编号/日期、旧伪第二幕选择均不得补造因果', () => {
    const invalid: Fact[][] = [
      [due()],
      [deathFact(1, 'm1', '亡者', 'blackmoss', 0, 2), due()],
      [choice(4), due(3, 5, 4)],
      [choice(1, 6), due()],
      [choice(1, NaN), due()],
      [choice(), due(3, NaN)],
      [{ ...choice(), refs: { eventId: 'egg-hatch' } }, due()],
      [{ ...choice(), refs: { eventId: 'cursed-coffin' } }, due()],
      [choice(), { ...due(), refs: { eventId: 'unknown-second-act' } }],
    ]
    for (const facts of invalid) expect(tellExpedition({ facts }, () => 0), JSON.stringify(facts)).toBeNull()
    expect(tellExpedition({ facts: [choice(1, 5), due()] }, () => 0)?.text).toContain('第 5 天')
  })

  test('跳过无证据的旧兑现后仍能讲后续合法兑现，不能被坏记录堵住', () => {
    const facts = [choice(), { ...due(2), links: [999] }, due(3)]
    expect(tellExpedition({ facts }, () => 0)?.factIds).toEqual([3, 1])
  })

  test('缺少伤疤序数的残缺旧事实保留但不渲染 undefined', () => {
    const damaged = scar(1)
    damaged.refs = { nearDeath: true, dungeonId: 'blackmoss' }
    expect(tellExpedition({ facts: [damaged] }, () => 0)).toBeNull()
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

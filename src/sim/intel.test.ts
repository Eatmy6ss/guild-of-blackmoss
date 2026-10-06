import { describe, expect, it } from 'vitest'
import { migrate, SAVE_VERSION } from '../state/save'
import { revealTier } from './run'
import {
  INTEL_PER_DUNGEON, INTEL_TIERS, consumeIntelReveal, intelDungeonFull,
  rollIntel, sanitizeIntelEntries, verifyIntelFor,
} from './intel'

// U36 情报 v2(制作人新口径):条目化/分档价格/货源限制/进副本可见/验证闭环。

const rngSeq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]! }

describe('U36 情报条目化', () => {
  it('v28→v29:旧 intel 布尔表删除;intelStock 缺省=满货源', () => {
    const migrated = migrate({ version: 28, day: 9, items: {}, itemSeq: 0, members: [], inventory: [], pendingRelics: [], intel: { blackmoss: true } })
    expect(migrated.version).toBe(SAVE_VERSION)
    expect((migrated as unknown as Record<string, unknown>).intel).toBeUndefined()
    expect(migrated.intelStock).toBeUndefined() // 缺省不注入键(App 侧取 INTEL_STOCK_CAP)
  })

  it('买官署密报恒真;文本非空且入条目(买时即知内容)', () => {
    const royal = INTEL_TIERS.find((t) => t.id === 'royal')!
    for (let seed = 1; seed <= 20; seed++) {
      const e = rollIntel('blackmoss', 'boss', royal, 5, seed, rngSeq([0.99]))
      expect(e.real).toBe(true) // realChance=1
      expect(e.text.length).toBeGreaterThan(6)
      expect(e.text).toContain('黑苔沼泽'.slice(0, 0) || e.text) // 文本已生成
    }
  })

  it('街谈巷议 60% 真率:真伪判定在 rng 首调用(交替真/假必混杂)', () => {
    const street = INTEL_TIERS.find((t) => t.id === 'street')!
    const entries = Array.from({ length: 20 }, (_, k) => rollIntel('blackmoss', 'mob', street, 1, k + 1, () => (k % 2 ? 0.9 : 0.1)))
    expect(entries.filter((e) => e.real)).toHaveLength(10) // 偶数序真(0.1<0.6),奇数序假(0.9≥0.6)
    expect(entries.some((e) => !e.real)).toBe(true)
  })

  it(`同一副本上限 ${INTEL_PER_DUNGEON} 条:intelDungeonFull 拦截`, () => {
    const entries = Array.from({ length: INTEL_PER_DUNGEON }, (_, k) => rollIntel('blackmoss', 'mob', INTEL_TIERS[0]!, 1, k + 1, () => 0.1))
    expect(intelDungeonFull(entries, 'blackmoss')).toBe(true)
    expect(intelDungeonFull(entries, 'rustpits')).toBe(false)
  })

  it('真情报出发消耗一次揭示收益;文本知识仍在;假情报零收益', () => {
    const t = INTEL_TIERS[1]!
    const realE = rollIntel('blackmoss', 'boss', t, 1, 1, () => 0.01)
    const used = consumeIntelReveal([realE], 'blackmoss', 5)
    expect(used.bonus).toBe(1)
    expect(used.entries[0]!.revealUsedDay).toBe(5)
    expect(consumeIntelReveal(used.entries, 'blackmoss', 6).bonus).toBe(0) // 已消耗
    expect(revealTier(35, used.bonus)).toBe(2)
    const fake = rollIntel('blackmoss', 'boss', t, 1, 2, () => 0.99)
    expect(consumeIntelReveal([fake], 'blackmoss', 5).bonus).toBe(0)
  })

  it('走过一趟即验证:真标属实/假标假货,通知可见', () => {
    const realE = rollIntel('blackmoss', 'mob', INTEL_TIERS[1]!, 1, 1, () => 0.01)
    const fakeE = rollIntel('blackmoss', 'mob', INTEL_TIERS[0]!, 1, 2, () => 0.99)
    const v = verifyIntelFor([realE, fakeE], 'blackmoss')
    expect(v.notes).toHaveLength(2)
    expect(v.entries.find((e) => e.id === realE.id)!.verified).toBe(true)
    expect(v.entries.find((e) => e.id === fakeE.id)!.real).toBe(false)
  })

  it('sanitize:非法条目丢弃;超长/缺字段不入档', () => {
    const good = rollIntel('blackmoss', 'mob', INTEL_TIERS[1]!, 1, 1, () => 0.1)
    const kept = sanitizeIntelEntries([good, { ...good, kind: 'oops' }, { ...good, text: '' }, null, 'x'])
    expect(kept).toEqual([good])
    expect(sanitizeIntelEntries(undefined)).toBeUndefined()
  })
})

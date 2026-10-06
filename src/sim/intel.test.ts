import { describe, expect, it } from 'vitest'
import { migrate, SAVE_VERSION } from '../state/save'
import { revealTier } from './run'

// R4.3(U30)酒馆情报:intel 存档字段 + 揭示档消费。

describe('R4.3 酒馆情报', () => {
  it('v27→v28:intel 保留且消毒(非布尔值丢弃);老档缺省=undefined', () => {
    const base = { version: 27, day: 9, kingdom: { active: [], completed: [] }, items: {}, itemSeq: 0, members: [], inventory: [], pendingRelics: [] }
    const migrated = migrate({ ...base, intel: { blackmoss: true, rustpits: false, bad: 'yes', '': true } })
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(migrated.intel).toEqual({ blackmoss: true, rustpits: false })
    const bare = migrate({ ...base })
    expect(bare.version).toBe(SAVE_VERSION)
    expect(bare.intel).toBeUndefined()
  })

  it('真情报使揭示档 +1(revealBonus 通路,U30 接 R1.3)', () => {
    // 熟练度 35=档 1;情报 +1 → 档 2;封顶 3,负数不加
    expect(revealTier(35)).toBe(1)
    expect(revealTier(35, 1)).toBe(2)
    expect(revealTier(80, 1)).toBe(3)
    expect(revealTier(0, 1)).toBe(1)
  })
})

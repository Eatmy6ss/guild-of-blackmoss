import { describe, it, expect } from 'vitest'
import { revealTier, MASTERY } from './run'
import { conditionChanceMod } from './conditions'

// R1.3 熟练度四档·验收(redesign §3 R1.3):
// 0-34 相邻一层名与地形 / 35-59 相邻层类型+前两层地形 / 60-79 前两层类型+内容+路况(触发率×0.75) / 80+ 全图类型+暗道(触发率×0.5)
// 「直捣 boss」已删(R1.1),其职能由暗道接替。

describe('R1.3 熟练度揭示四档', () => {
  it('四档阈值:0-34 档0,35-59 档1,60-79 档2,80+ 档3', () => {
    expect(revealTier(0)).toBe(0)
    expect(revealTier(34)).toBe(0)
    expect(revealTier(35)).toBe(1)
    expect(revealTier(59)).toBe(1)
    expect(revealTier(60)).toBe(2)
    expect(revealTier(79)).toBe(2)
    expect(revealTier(80)).toBe(3)
    expect(revealTier(120)).toBe(3)
    expect(MASTERY.KIND).toBe(35)
    expect(MASTERY.FULL).toBe(60)
    expect(MASTERY.MASTER).toBe(80)
  })

  it('revealBonus 临时提档(每点 +1 档,封顶 3);R4 酒馆情报预留', () => {
    expect(revealTier(0, 1)).toBe(1)
    expect(revealTier(35, 1)).toBe(2)
    expect(revealTier(60, 1)).toBe(3)
    expect(revealTier(80, 1)).toBe(3)
    expect(revealTier(35, 2)).toBe(3)
  })

  it('迷途(revealPenalty)临时降档,不与提档同时为负', () => {
    expect(revealTier(60, 0, 1)).toBe(1)
    expect(revealTier(35, 1, 1)).toBe(1)
    expect(revealTier(0, 0, 2)).toBe(0)
  })

  it('路况触发率按档位修正:60-79 ×0.75,80+ ×0.5,其余 ×1', () => {
    expect(conditionChanceMod(0)).toBe(1)
    expect(conditionChanceMod(59)).toBe(1)
    expect(conditionChanceMod(60)).toBe(0.75)
    expect(conditionChanceMod(79)).toBe(0.75)
    expect(conditionChanceMod(80)).toBe(0.5)
  })
})

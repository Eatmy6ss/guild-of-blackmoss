// I4/I5 断言(独立文件,常驻 vitest)
import { describe, it, expect } from 'vitest'
import { describeItem } from './loot'
import { AFFIXES } from '../data/affixes'
import { affixValue } from './loot'
import type { ItemInstance } from './types'

// I4:紫装追加词条与普通词条共用同一取值规则(B04 修复验证;#2.1 后按 tier 查区间)
describe('I4 词条取值统一(#0.3)', () => {
  const aff = AFFIXES['aff-atk']!
  it('追加词条值落在 tier 区间内(tier 化,不再乘算缩放)', () => {
    for (const tier of [1, 2, 3, 4] as const) {
      const hi = [...aff.tiers].filter((t) => t.tier <= tier).pop()!.range[1]!
      const lo = [...aff.tiers].filter((t) => t.tier <= tier).pop()!.range[0]!
      for (let i = 0; i < 40; i++) {
        const v = affixValue(aff, tier, () => 0.99)
        expect(v).toBeLessThanOrEqual(hi + 0.01)
        expect(v).toBeGreaterThanOrEqual(lo - 0.01)
      }
    }
  })
  it('同一 rng 序列下取值确定(同函数两调用一致)', () => {
    const a1 = affixValue(aff, 2, () => 0.3)
    const a2 = affixValue(aff, 2, () => 0.3)
    expect(a1).toBe(a2)
  })
})

// I5(B05):受疗等百分比属性不再显示裸小数
describe('I5 格式化(B05 前置断言)', () => {
  it('healReceived 主属性装备的描述使用百分比', () => {
    const item: ItemInstance = { id: 'i', baseId: 'wpn-t2-staff', quality: 'white', rolls: [] }
    const d = rollDropText(item)
    expect(d).toContain('%')
    expect(d).not.toMatch(/受疗[+＋]0\.0?\d/)
  })
})


function rollDropText(item: ItemInstance): string {
  // describeItem 接受实例;直接复用
  return describeItem(item)
}

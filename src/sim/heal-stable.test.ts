import { describe, expect, it } from 'vitest'
import { attemptHeal, scarPenalty, ageFaints, FAINT_DAYS, healingTerms } from './scars'
import type { Member } from './types'

// R4.2(U32① 疗养所稳定制):治疗=稳定而非治愈——重度→轻度→虚痕,虚痕静养自愈。

function memberWithScar(value: 1 | 2): Member {
  return {
    id: 'm1', name: '测试者', job: 'guard', level: 5, nature: 'brave' as never,
    personality: {} as never, attrs: { str: 5, agi: 5, int: 5, vit: 5, spr: 5, lck: 5 },
    hp: 40, equipment: {}, alive: true, exp: 0, bonds: {},
    scars: [{ stat: 'str', value, text: '旧伤未愈' }],
  } as unknown as Member
}

describe('U32 疗养所稳定制', () => {
  it('成功降一档:重度→轻度→虚痕(不减属性),虚痕不可再治', () => {
    const heavy = memberWithScar(2)
    const r1 = attemptHeal(heavy, 0, 0, () => 0, 10)! // rng=0 恒成功
    expect(r1.result).toBe('success')
    expect(heavy.scars![0].value).toBe(1)
    expect(heavy.scars![0].faint).toBeFalsy() // 只降档,未到虚痕
    const r2 = attemptHeal(heavy, 0, 0, () => 0, 12)!
    expect(r2.result).toBe('success')
    expect(heavy.scars![0]).toMatchObject({ value: 1, faint: true, faintSince: 12 })
    expect(scarPenalty(heavy).str).toBeUndefined() // 虚痕不减属性
    expect(attemptHeal(heavy, 0, 0, () => 0, 13)).toBeNull() // 虚痕不在疗养范围
  })

  it('轻度失败照旧 15% 恶化;重度失败只是无效', () => {
    const light = memberWithScar(1)
    // rng 序列:第一次 ≥rate(失败),第二次 <0.15(恶化)
    const rate = healingTerms(light.scars![0], 0).rate
    const r = attemptHeal(light, 0, 0, () => (rate + 1e-9 < 0.85 ? rate + 0.01 : 0.86), 5)
    // 直接构造:恒失败+必恶化
    const light2 = memberWithScar(1)
    const r2 = attemptHeal(light2, 0, 0, ((() => { let n = 0; return () => [0.99, 0.01, 0.99][n++] ?? 0.99 })()) as () => number, 5)!
    expect(r2.result).toBe('worsen')
    expect(light2.scars![0].value).toBe(2)
    expect(r2.masteryGain).toBe(2)
    const heavy = memberWithScar(2)
    const r3 = attemptHeal(heavy, 0, 0, () => 0.99, 5)! // 恒失败
    expect(r3.result).toBe('fail')
    expect(heavy.scars![0].value).toBe(2) // 重度不恶化
    void r
  })

  it(`虚痕静养 ${FAINT_DAYS} 天到期消退(出发日推进);未到期保留`, () => {
    const m = memberWithScar(1)
    attemptHeal(m, 0, 0, () => 0, 10)! // 转虚痕,faintSince=10
    expect(ageFaints([m], 10 + FAINT_DAYS - 1)).toHaveLength(0) // 未到期
    expect(m.scars).toHaveLength(1)
    const faded = ageFaints([m], 10 + FAINT_DAYS)
    expect(faded).toHaveLength(1)
    expect(faded[0].stat).toBe('str')
    expect(m.scars).toHaveLength(0)
  })
})

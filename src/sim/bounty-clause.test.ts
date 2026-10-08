import { describe, expect, it } from 'vitest'
import { BOUNTY_CLAUSES, CLAUSE_BY_ID, clauseRewardMult, activeClauses, greenhornId, hasteBudget, GREENHORN_GAP } from './bounty-clause'
import { generateMember } from './gen'
import { beginBattle, createRun } from '../../scripts/run-test-compat'
import { settleEncounter, type EncounterGuild } from './settlement'
import type { DungeonRun } from './run'
import { BLACKMOSS } from '../data/dungeons'
import { EMPTY_LEDGER } from './fact-ledger'
import { newKingdomState } from './kingdom'

// #5.1 悬赏加码条款:自选可叠加、奖励乘算;带新人倒下剔除;急行军预算随层数。

describe('#5.1 悬赏加码条款', () => {
  it('五条条款注册齐全,乘算可叠加且顺序无关', () => {
    expect(BOUNTY_CLAUSES).toHaveLength(5)
    for (const c of BOUNTY_CLAUSES) expect(CLAUSE_BY_ID[c.id]!.rewardMult).toBe(c.rewardMult)
    expect(clauseRewardMult([])).toBe(1)
    expect(clauseRewardMult(['haste', 'lightload'])).toBeCloseTo(1.3 * 1.4)
    expect(clauseRewardMult(['lightload', 'haste'])).toBeCloseTo(clauseRewardMult(['haste', 'lightload']))
    expect(clauseRewardMult(['noquarter'])).toBe(2.0)
  })

  it('带新人:新人倒下即剔除该条款,其余条款照乘', () => {
    expect(activeClauses(['greenhorn', 'haste'], false)).toEqual(['greenhorn', 'haste'])
    expect(activeClauses(['greenhorn', 'haste'], true)).toEqual(['haste'])
    expect(clauseRewardMult(['greenhorn', 'haste'], true)).toBeCloseTo(1.3)
    expect(clauseRewardMult(['greenhorn'], true)).toBe(1)
  })

  it('greenhornId:低于均级 5 级的在编者才合格', () => {
    const v = generateMember('guard', 1, 41); v.level = 12
    const junior = generateMember('ranger', 1, 42); junior.level = 4
    const mid = generateMember('priest', 1, 43); mid.level = 11
    // 均级 (12+4+11)/3=9,4 级者 ≤9-5 ✓
    expect(greenhornId([v, junior, mid], [v.id, junior.id, mid.id])).toBe(junior.id)
    // 全老兵队(12/11/10,均 11,最低 10>6)不合格
    const a = generateMember('guard', 1, 44), b = generateMember('ranger', 1, 45), c = generateMember('priest', 1, 46)
    a.level = 12; b.level = 11; c.level = 10
    expect(greenhornId([a, b, c], [a.id, b.id, c.id])).toBeNull()
    // 新人在公会不在编=不合格
    expect(greenhornId([v, junior, mid], [v.id, mid.id])).toBeNull()
    expect(GREENHORN_GAP).toBe(5)
  })

  it('急行军预算=层数×每层 tick', () => {
    expect(hasteBudget(6)).toBe(6 * 800)
    expect(hasteBudget(0)).toBe(0)
  })
})

describe('#5.2 快速通道(满熟练走暗道)', () => {
  it('低熟练误入暗道不罚;满熟练主动直捣沿途减半', () => {
    // moveTo 的标记条件在 run.ts(secret && mastery>=80);此处锁定结算侧消费口径
    const members = [generateMember('guard', 1, 51), generateMember('ranger', 1, 52), generateMember('priest', 1, 53)]
    for (const m of members) m.level = 13, m.hp = 9999
    const g: EncounterGuild = { members, manual: [], kingdom: newKingdomState(), dungeonMastery: {}, towerBest: 0, recruitCooldown: 2, day: 7, buildings: {}, factLedger: { ...EMPTY_LEDGER }, chronicle: [] }
    const mk = () => {
      const r = beginBattle(createRun(members, BLACKMOSS, 49, 0, true, { heal: 3, fury: 3 }, false, [], { mult: 2, rewardMult: 2 }), 49)
      r.battle!.status = 'guild-win'
      return r
    }
    const goldOf = (run: ReturnType<typeof beginBattle>) =>
      settleEncounter({ source: 'dungeon', run: run as unknown as DungeonRun, guild: g }, () => 0.5)!.loot.gold
    // 同一条路线(踏过暗道):低熟练=rareHunt 全额 60;满熟练=快速通道 60×0.5=30
    expect(goldOf(mk())).toBe(60)
    const senior = mk()
    senior.fastLaneUsed = true // 满熟练走暗道的标记由 moveTo 置位;此处直接锁定标记,验证结算消费
    expect(goldOf(senior)).toBe(30)
  })
})

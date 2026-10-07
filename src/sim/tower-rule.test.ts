import { describe, expect, it } from 'vitest'
import { TOWER_RULES, rollSegmentRules, towerSegment, hasRule, describeRules, type TowerRuleId } from './tower-rule'
import { startTower, startTowerFloor, towerRest } from './tower'
import { generateMember } from './gen'
import { stepBattle } from './combat'

// B3-2 塔规则词缀:每 3 层一段,进段 roll 1–2 条;只改规则不给敌人挂机制(U22 红线)。

describe('B3-2 塔规则词缀', () => {
  it('rollSegmentRules:1–2 条、无重复、全在表内;段位越高第二条越常见(统计)', () => {
    for (let segment = 0; segment < 12; segment++) {
      for (let seed = 1; seed <= 20; seed++) {
        const rules = rollSegmentRules(segment, () => ((seed * 37 + segment) % 97) / 97)
        expect(rules.length).toBeGreaterThanOrEqual(1)
        expect(rules.length).toBeLessThanOrEqual(2)
        expect(new Set(rules).size).toBe(rules.length)
        for (const r of rules) expect(TOWER_RULES[r]).toBeDefined()
      }
    }
    let earlySecond = 0
    let lateSecond = 0
    for (let seed = 1; seed <= 200; seed++) {
      if (rollSegmentRules(0, () => (seed % 10) / 10).length > 1) earlySecond++
      if (rollSegmentRules(5, () => (seed % 10) / 10).length > 1) lateSecond++
    }
    expect(lateSecond).toBeGreaterThan(earlySecond) // 层数越高越多
  })

  it('towerSegment:每 3 层一段', () => {
    expect(towerSegment(1)).toBe(0)
    expect(towerSegment(3)).toBe(0)
    expect(towerSegment(4)).toBe(1)
    expect(towerSegment(9)).toBe(2)
  })

  it('接线:禁药段药水支取归零;残血开局 60%;治疗减半走 healTakenMod;无营地休整不回血', () => {
    const squad = ['guard', 'priest', 'ranger'] as const
    const make = () => {
      const members = squad.map((job, j) => {
        const m = generateMember(job, 6, 520000 + j)
        m.spec = undefined
        return m
      })
      const run = startTower(members, 77, { heal: 4, fury: 4 })
      return { run, members }
    }
    // 预置规则(段索引对齐避免重 roll)
    const force = (rules: TowerRuleId[]) => {
      const { run, members } = make()
      run.segmentIndex = towerSegment(run.floor)
      run.segmentRules = rules
      startTowerFloor(run, 77, members) // 必须传原花名册(runMembers 按 id 绑定)
      return run
    }
    const noPotion = force(['no-potion'])
    const potionsBefore = { ...noPotion.potions }
    expect(noPotion.potions).toEqual(potionsBefore) // 携带不消耗
    expect(noPotion.battle!.commands.healStock).toBe(0)

    const lowStart = force(['low-start'])
    for (const c of lowStart.battle!.combatants.filter((c) => c.team === 'guild')) {
      expect(c.hp).toBe(Math.round(c.maxHp * 0.6))
    }

    const halfHeal = force(['half-heal'])
    for (const c of halfHeal.battle!.combatants.filter((c) => c.team === 'guild')) {
      expect(c.healTakenMod).toBe(0.5)
    }

    // 无营地:成员必须用 run 的原花名册(id 绑定)
    const { run: noCampRun, members: campMembers } = (() => {
      const members = squad.map((job, j) => { const m = generateMember(job, 6, 526000 + j); m.spec = undefined; return m })
      const run = startTower(members, 78, { heal: 4, fury: 4 })
      run.segmentIndex = towerSegment(run.floor)
      run.segmentRules = ['no-camp']
      return { run, members }
    })()
    startTowerFloor(noCampRun, 78, campMembers)
    let guard = 0
    while (noCampRun.battle!.status === 'running' && guard++ < 20000) stepBattle(noCampRun.battle!)
    noCampRun.battle!.status = 'guild-win'
    const hpBefore = campMembers[0].hp
    towerRest(noCampRun, 0.2, campMembers)
    expect(campMembers[0].hp).toBe(hpBefore) // 无营地:不回复
  })

  it('进段自动 roll 并记历史;describeRules 可读', () => {
    const members = (['guard', 'priest', 'ranger'] as const).map((job, j) => { const m = generateMember(job, 6, 530000 + j); m.spec = undefined; return m })
    const run = startTower(members, 99, { heal: 4, fury: 4 })
    expect(run.segmentIndex).toBe(0)
    expect(run.segmentRules!.length).toBeGreaterThanOrEqual(1)
    expect(run.ruleHistory![0]).toEqual(run.segmentRules)
    expect(describeRules(run.segmentRules)).not.toBe('')
    expect(hasRule(run.segmentRules, 'no-potion')).toBe(run.segmentRules!.includes('no-potion'))
  })
})

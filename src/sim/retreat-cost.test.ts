import { describe, expect, it } from 'vitest'
import { advanceRun, retreatRun, applyRetreatCost, startStep } from './run'
import { settleEncounter, type EncounterGuild } from './settlement'
import { beginBattle, createRun } from '../../scripts/run-test-compat'
import { BLACKMOSS } from '../data/dungeons'
import { generateMember } from './gen'
import { newKingdomState } from './kingdom'
import { EMPTY_LEDGER } from './fact-ledger'

// R5.1e 验收(U33④):主动撤退=本趟金币/熟练度各留一半(向下取整),装备照拿;团灭不受影响。

function guild(): EncounterGuild {
  const members = (['guard', 'priest', 'ranger'] as const).map((j, i) => {
    const m = generateMember(j, 5, 3100 + i)
    m.morale = 60
    return m
  })
  return { members, manual: [], kingdom: newKingdomState(), dungeonMastery: { blackmoss: 7 }, towerBest: 0,
    recruitCooldown: 2, day: 7, buildings: {}, factLedger: { ...EMPTY_LEDGER }, chronicle: [] }
}

describe('R5.1e 撤退代价', () => {
  it('战斗中撤离:本趟已赚的金币/熟练度各扣一半(向下取整)', () => {
    const g = guild()
    const run = beginBattle(createRun(g.members, BLACKMOSS, 71), 71)
    run.battle!.status = 'guild-win'
    const o = settleEncounter({ source: 'dungeon', run, guild: g }, () => 0.99)!
    expect(o.win).toBe(true)
    expect(o.run.earnedGold).toBe(30)
    expect(o.run.earnedMastery).toBe(1)
    // 下一场战斗中撤离:advanceRun 走 retreated 分支,代价 = floor(30/2)=15 金、floor(1/2)=0 熟练
    o.run.battle!.status = 'retreated'
    advanceRun(o.run, o.guild.members)
    expect(o.run.phase).toBe('retreated')
    expect(o.run.retreatCost).toEqual({ gold: 15, mastery: 0, dungeonId: 'blackmoss' })
  })

  it('休整中撤退(retreatRun)同样收代价;向下取整', () => {
    const g = guild()
    const run = createRun(g.members, BLACKMOSS, 72)
    run.earnedGold = 101
    run.earnedMastery = 5
    retreatRun(run, g.members)
    expect(run.phase).toBe('retreated')
    expect(run.retreatCost).toEqual({ gold: 50, mastery: 2, dungeonId: 'blackmoss' })
    expect(applyRetreatCost(run)).toEqual({ gold: 50, mastery: 2, dungeonId: 'blackmoss' })
  })

  it('团灭不产生撤退代价(defeat 走原逻辑)', () => {
    const g = guild()
    const run = createRun(g.members, BLACKMOSS, 73)
    run.earnedGold = 100
    run.earnedMastery = 4
    run.phase = 'rest'
    const node = run.map.layers[0].find((n) => n.kind === 'battle')!
    run.nodeId = node.id
    run.path = [node.id]
    startStep(run, 73, 0, g.members)
    run.battle!.status = 'guild-wipe'
    advanceRun(run, g.members)
    expect(run.phase).toBe('defeat')
    expect(run.retreatCost).toBeUndefined()
  })

  it('宝箱金币计入撤退代价基数(App 侧累计字段的单测语义)', () => {
    const g = guild()
    const run = createRun(g.members, BLACKMOSS, 74)
    run.earnedGold = 90 // 含宝箱 60+30 战斗金
    run.earnedMastery = 1
    retreatRun(run, g.members)
    expect(run.retreatCost!.gold).toBe(45)
  })
})

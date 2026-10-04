import { describe, expect, test } from 'vitest'
import { checkpointRunState, initialRunState, validateRunState } from './run-state'
import { createRun, moveTo } from './run'
import { startStep } from '../../scripts/run-test-compat'
import { generateMember } from './gen'
import { BLACKMOSS } from '../data/dungeons'

// A13 后续:战斗事件入档裁剪(存档瘦身)——渲染走游标增量,败因走增量台账
describe('R1 地图远征断点校验(制作人自测回归:存档写入失败)', () => {
  test('没打过任何一场战斗的合法断点必须通过校验:首层待选/走过非战斗节点/未战撤退', () => {
    const members = [generateMember('guard', 5, 1)]
    // ① 首层待选:battle=null, path=[]
    const fresh = createRun(members, BLACKMOSS, 53)
    const s1 = initialRunState()
    s1.activeRun = fresh
    expect(validateRunState(checkpointRunState(s1, members), members)).toBe(true)
    // ② 走过非战斗节点(休整/宝箱):battle=null, path 非空——R1.1 曾误判为非法导致每次存档失败
    const walked = createRun(members, BLACKMOSS, 53)
    const restNode = walked.map.layers.flat().find((n) => n.kind === 'rest' || n.kind === 'treasure')
    expect(restNode).toBeTruthy()
    walked.nodeId = restNode!.id
    walked.path = [restNode!.id]
    const s2 = initialRunState()
    s2.activeRun = walked
    expect(validateRunState(checkpointRunState(s2, members), members)).toBe(true)
    // ③ 没打就撤退:battle=null, phase='retreated'
    walked.phase = 'retreated'
    const s3 = initialRunState()
    s3.activeRun = walked
    expect(validateRunState(checkpointRunState(s3, members), members)).toBe(true)
    // ④ 矛盾态仍要挡:battle=null 却 phase='battle'
    const s4 = initialRunState()
    s4.activeRun = { ...walked, phase: 'battle' }
    expect(validateRunState(checkpointRunState(s4, members), members)).toBe(false)
    // ⑤ lastNodeResult 字段可选字符串
    const s5 = initialRunState()
    s5.activeRun = walked
    s5.lastNodeResult = '⛺ 矿车休息站:原地休整,回复 30% 生命'
    expect(validateRunState(checkpointRunState(s5, members), members)).toBe(true)
  })
})

describe('checkpoint 事件裁剪', () => {
  test('超过 120 条的事件只保留末尾 120 条入档;校验仍通过;台账字段保留', () => {
    const members = [generateMember('guard', 5, 1)]
    const run = createRun(members, BLACKMOSS, 53)
    const node = run.map.layers[0].find(n => n.kind === 'battle') ?? run.map.layers[0][0]!
    moveTo(run, node.id)
    startStep(run, 53, 0, members)
    run.battle!.events = Array.from({ length: 150 }, (_, i) => ({ tick: i, type: 'damage' as const, targetId: 'x', amount: 1 }))
    run.battle!.guildDmgTaken = { c2: 77 }
    const s = initialRunState()
    s.activeRun = run
    const cp = checkpointRunState(s, members)
    expect(cp.activeRun!.battle!.events.length).toBe(120)
    expect(cp.activeRun!.battle!.events[0].tick).toBe(30)
    expect(cp.activeRun!.battle!.guildDmgTaken).toEqual({ c2: 77 })
    expect(validateRunState(cp, members)).toBe(true)
  })
})

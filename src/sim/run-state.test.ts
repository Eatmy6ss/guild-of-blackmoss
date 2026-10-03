import { describe, expect, test } from 'vitest'
import { checkpointRunState, initialRunState, validateRunState } from './run-state'
import { createRun } from './run'
import { generateMember } from './gen'
import { BLACKMOSS } from '../data/dungeons'

// A13 后续:战斗事件入档裁剪(存档瘦身)——渲染走游标增量,败因走增量台账
describe('checkpoint 事件裁剪', () => {
  test('超过 120 条的事件只保留末尾 120 条入档;校验仍通过;台账字段保留', () => {
    const members = [generateMember('guard', 5, 1)]
    const run = createRun(members, BLACKMOSS, BLACKMOSS.branches[0].id, 53)
    run.phase = 'battle'
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

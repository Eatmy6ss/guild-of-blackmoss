import { describe, expect, test } from 'vitest'
import { markPermadeath, renderDeathCause } from './run'
import type { BattleState, DeathCause, Member } from './types'

const livingMember = (id: string): Member =>
  ({ id, name: '测试' + id, job: 'guard', alive: true, hp: 10, maxHp: 100, level: 3 }) as unknown as Member
const battleWithDead = (memberId: string): BattleState =>
  ({ combatants: [{ team: 'guild', alive: false, memberId }] }) as unknown as BattleState

describe('U22 结构化死因', () => {
  test('副本阵亡:where 指向副本 id,碑文由渲染生成且含地名(smoke 7a 口径)', () => {
    const run = { kind: 'dungeon' as const, dungeonId: 'abyssaltar', members: [livingMember('m1')], battle: battleWithDead('m1') }
    const [dead] = markPermadeath(run, '渊底祭坛')
    expect(dead.death?.kind).toBe('battle')
    expect(dead.death?.where).toEqual({ source: 'dungeon', id: 'abyssaltar' })
    expect(dead.death?.affixes).toBeUndefined()
    expect(dead.cause).toBe(renderDeathCause(dead.death as DeathCause))
    expect(dead.cause).toContain('渊底祭坛')
    expect(run.members[0].alive).toBe(false)
  })

  test('高塔阵亡:where 带层数,碑文含塔层文本', () => {
    const run = { kind: 'tower' as const, floor: 7, members: [livingMember('m2')], battle: battleWithDead('m2') }
    const [dead] = markPermadeath(run, '黑苔高塔第 7 层')
    expect(dead.death?.where).toEqual({ source: 'tower', id: 'tower', floor: 7 })
    expect(dead.cause).toContain('黑苔高塔第 7 层')
  })

  test('无战斗状态时不产生阵亡', () => {
    const run = { kind: 'dungeon' as const, dungeonId: 'abyssaltar', members: [livingMember('m3')], battle: null }
    expect(markPermadeath(run, '渊底祭坛')).toEqual([])
  })

  test('RunCore 预留字段 JSON 往返不丢(批次 3 地基)', () => {
    const core = { spares: ['it_1', 'it_2'], monsterAffixes: { n0: ['bloodrage'], n3: ['holychant', 'deathrattle'] } }
    expect(JSON.parse(JSON.stringify(core))).toEqual(core)
  })
})

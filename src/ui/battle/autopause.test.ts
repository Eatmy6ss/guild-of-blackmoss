import { describe, expect, it } from 'vitest'
import { createBattle } from '../../sim/combat'
import { generateMember } from '../../sim/gen'
import { BLACKMOSS } from '../../data/dungeons'
import { detectAutoPause, defaultAutoPause, parseAutoPause } from './autopause'
import type { BattleEvent } from '../../sim/types'

// U42 #9.4 自动暂停判定纯函数:事件 → 是否暂停+原因文本。

function fixture() {
  const members = [generateMember('guard', 10, 71), generateMember('ranger', 10, 72), generateMember('priest', 10, 73)]
  return createBattle(members, BLACKMOSS, 'enc-grush', 4242, 0, 0, false)
}

describe('U42 #9.4 自动暂停判定', () => {
  it('首领读条:casting 事件+施法者是首领 → 暂停并写明「X 开始咏唱 机制名」', () => {
    const b = fixture()
    const boss = b.combatants.find((c) => c.boss)!
    boss.bossMechanics = [{ id: 'm1', kind: 'telegraph-aoe', name: '震地', params: {} }]
    boss.mech = { 'telegraph-aoe': { until: b.tick + 30 } }
    const events: BattleEvent[] = [{ tick: b.tick, type: 'casting', targetId: boss.id, amount: 30 }]
    const hit = detectAutoPause(events, b, defaultAutoPause(true))
    expect(hit?.kind).toBe('bossCast')
    expect(hit?.text).toContain(boss.name)
    expect(hit?.text).toContain('震地')
    expect(detectAutoPause(events, b, defaultAutoPause(false))).toBeNull() // 杂兵默认关
  })

  it('杂兵读条不算首领读条;预警(telegraph)同样触发', () => {
    const members = [generateMember('guard', 10, 71), generateMember('ranger', 10, 72), generateMember('priest', 10, 73)]
    const b = createBattle(members, BLACKMOSS, 'enc-frogs', 4242, 0, 0, false)
    const foe = b.combatants.find((c) => c.team === 'enemy' && !c.boss)!
    foe.bossMechanics = [{ id: 'm2', kind: 'telegraph-aoe', name: '渊底低语', params: {} }]
    foe.mech = { 'telegraph-aoe': { until: b.tick + 30 } }
    const events: BattleEvent[] = [{ tick: b.tick, type: 'telegraph', targetId: foe.id }]
    expect(detectAutoPause(events, b, defaultAutoPause(true))).toBeNull() // 非首领/精英
    foe.boss = true
    expect(detectAutoPause(events, b, defaultAutoPause(true))?.text).toContain('渊底低语')
  })

  it('队员低血:受到伤害后生命 <30% → 暂停;倒下:death 事件 → 暂停', () => {
    const b = fixture()
    const guard = b.combatants.find((c) => c.memberId === members0(b))!
    guard.hp = Math.round(guard.maxHp * 0.25)
    const dmg: BattleEvent[] = [{ tick: b.tick, type: 'damage', targetId: guard.id, amount: 10 }]
    const hit = detectAutoPause(dmg, b, defaultAutoPause(true))
    expect(hit?.kind).toBe('lowHp')
    expect(hit?.text).toContain(guard.name)
    const death: BattleEvent[] = [{ tick: b.tick, type: 'death', targetId: guard.id }]
    expect(detectAutoPause(death, b, defaultAutoPause(true))?.kind).toBe('allyDown')
  })

  it('偏好解析:完整布尔对象还原;缺项/垃圾输入 → null', () => {
    expect(parseAutoPause(JSON.stringify({ bossCast: true, lowHp: false, allyDown: true, battleStart: false }))).toEqual({ bossCast: true, lowHp: false, allyDown: true, battleStart: false })
    expect(parseAutoPause(JSON.stringify({ bossCast: true }))).toBeNull()
    expect(parseAutoPause('垃圾')).toBeNull()
    expect(parseAutoPause(null)).toBeNull()
  })
})

function members0(b: ReturnType<typeof createBattle>): string {
  return b.combatants.find((c) => c.team === 'guild')!.memberId!
}

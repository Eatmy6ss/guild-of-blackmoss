import { describe, expect, it } from 'vitest'
import { createBattle, setMoveTarget, stepBattle } from './combat'
import { generateMember } from './gen'
import { BLACKMOSS } from '../data/dungeons'
import { migrate, SAVE_VERSION } from '../state/save'

// U42 #9.2 自动施法开关+接管:主动技默认自动(关单跳过)、手动指令开 3 秒接管窗口(挂机 AI 不改写)。

function squad() {
  return [generateMember('guard', 10, 71), generateMember('ranger', 10, 72), generateMember('priest', 10, 73)]
}

describe('U42 #9.2 自动施法与接管', () => {
  it('默认开关下牧师会自己治疗(手动模式无指令,队友受伤→圣光自动落下)', () => {
    const members = squad()
    const b = createBattle(members, BLACKMOSS, 'enc-frogs', 4242, 0, 0, false)
    const priest = b.combatants.find((c) => c.memberId === members[2]!.id)!
    const guard = b.combatants.find((c) => c.memberId === members[0]!.id)!
    expect(priest.skills.some((s) => s.def.effect === 'heal-lowest')).toBe(true)
    guard.hp = Math.floor(guard.maxHp * 0.3) // 低于 75% 满足治疗时机
    const before = guard.hp
    let healed = false
    for (let t = 0; t < 120 && b.status === 'running'; t++) {
      stepBattle(b)
      if (guard.hp > before || b.events.some((e) => e.type === 'heal' && e.targetId === guard.id)) { healed = true; break }
    }
    expect(healed).toBe(true)
  })

  it('关掉圣光术(autoCastOff)后不再自动治疗,其余技能不受影响', () => {
    const members = squad()
    const b = createBattle(members, BLACKMOSS, 'enc-frogs', 4242, 0, 0, false)
    const priest = b.combatants.find((c) => c.memberId === members[2]!.id)!
    const guard = b.combatants.find((c) => c.memberId === members[0]!.id)!
    const heal = priest.skills.find((s) => s.def.effect === 'heal-lowest')!
    priest.autoCastOff = [heal.def.id]
    guard.hp = Math.floor(guard.maxHp * 0.3)
    for (let t = 0; t < 150 && b.status === 'running'; t++) {
      stepBattle(b)
      expect(b.events.some((e) => e.type === 'heal' && e.attackerId === priest.id)).toBe(false)
    }
  })

  it('挂机中被下令移动的单位 3 秒(30 tick)内不被 AI 拉回,窗口后交还 AI', () => {
    const members = squad()
    const b = createBattle(members, BLACKMOSS, 'enc-frogs', 8282)
    b.commands.autoMode = true // 挂机中
    const u = b.combatants.find((c) => c.memberId === members[1]!.id)!
    const spot = { x: 80, y: 300 }
    setMoveTarget(b, u.memberId!, spot.x, spot.y)
    // 窗口内:AI 不改写移动目标(单位持续朝玩家点走)
    for (let t = 0; t < 25 && b.status === 'running'; t++) {
      stepBattle(b)
      if (!u.alive) break
      if (u.moveTarget) {
        const toward = Math.hypot(u.pos!.x - spot.x, u.pos!.y - spot.y)
        expect(toward).toBeLessThanOrEqual(340) // 还在向玩家点推进,未被 AI 拉回右翼
      }
    }
    expect(u.alive).toBe(true)
    // 窗口后(tick>30):AI 重新接管(接管标记到期)
    let ticks = 0
    while ((u.takeoverUntilTick ?? 0) > b.tick && ticks++ < 100 && b.status === 'running') stepBattle(b)
    expect((u.takeoverUntilTick ?? 0) <= b.tick).toBe(true)
  })

  it('v31→v32 迁移:autoCastOff 非法形态重置为空,缺省不动', () => {
    const base = { version: 31, items: {}, members: [{ id: 'm1', autoCastOff: 'bogus' }, { id: 'm2', autoCastOff: ['ok-id'] }, { id: 'm3' }] }
    const out = migrate(base as never)
    expect(out.version).toBe(SAVE_VERSION)
    const members = out.members as { id: string; autoCastOff?: string[] }[]
    expect(members[0]!.autoCastOff).toEqual([])
    expect(members[1]!.autoCastOff).toEqual(['ok-id'])
    expect(members[2]!.autoCastOff).toBeUndefined()
  })
})

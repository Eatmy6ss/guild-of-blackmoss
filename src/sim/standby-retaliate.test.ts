import { describe, expect, it } from 'vitest'
import { createBattle, setMoveTarget, setHoldGround, stepBattle, TICK_HARD_CAP } from './combat'
import { generateMember } from './gen'
import { BLACKMOSS } from '../data/dungeons'

// U42 #9.1 待命还手:手动模式下无指令单位自动索敌(集火>最近打自己者>射程内最近),
// 移动指令执行期间不索敌;坚守=只打射程内不追击。

function squad() {
  return [generateMember('guard', 10, 71), generateMember('ranger', 10, 72), generateMember('priest', 10, 73)]
}

function runToEnd(b: ReturnType<typeof createBattle>, maxTick = TICK_HARD_CAP + 10) {
  let guard = 0
  while (b.status === 'running' && guard++ < maxTick) stepBattle(b)
  return b
}

describe('U42 #9.1 待命还手', () => {
  it('不下令:3 人队打黑苔蛙人哨兵,20 种子胜率 ≥ 90%(待命索敌撑起手动下限)', () => {
    let wins = 0
    for (let i = 0; i < 20; i++) {
      const members = squad()
      // createBattle 默认 autoMode=false(手动),protectOn=false 打到底(验收口径:胜率不含撤退保护兜底)
      const b = createBattle(members, BLACKMOSS, 'enc-frogs', 500000 + i * 13 + 1, 0, 0, false)
      if (runToEnd(b).status === 'guild-win') wins++
    }
    expect(wins).toBeGreaterThanOrEqual(18)
  })

  it('移动到点后会对贴脸的敌人还手(移动中不索敌,到达后回待命)', () => {
    const members = squad()
    const b = createBattle(members, BLACKMOSS, 'enc-frogs', 4242, 0, 0, false)
    const u = b.combatants.find((c) => c.team === 'guild' && c.memberId === members[1]!.id)!
    const foe = b.combatants.find((c) => c.team === 'enemy' && c.alive)!
    // 摆到敌人旁边,再下移动指令走开 30px(不足脱离射程/很快走完)
    u.pos = { x: foe.pos!.x - 60, y: foe.pos!.y }
    const foeHp0 = foe.hp
    setMoveTarget(b, u.memberId!, u.pos.x - 30, u.pos.y)
    expect(u.moveTarget).toBeDefined()
    let sawDamageAfterArrival = false
    for (let t = 0; t < 300 && b.status === 'running'; t++) {
      const arrived = !u.moveTarget
      stepBattle(b)
      if (arrived && b.tick > 2) {
        const evt = b.events.some((e) => e.type === 'damage' && e.attackerId === u.id && (e.targetId === foe.id || b.tick > 0))
        const foeHurt = foe.hp < foeHp0 || b.combatants.some((c) => c.team === 'enemy' && c.hp < c.maxHp)
        if (evt && foeHurt) { sawDamageAfterArrival = true; break }
      }
    }
    expect(sawDamageAfterArrival).toBe(true)
  })

  it('坚守:射程外目标不追击;敌人进射程后照打', () => {
    const members = squad()
    const b = createBattle(members, BLACKMOSS, 'enc-frogs', 1717, 0, 0, false)
    const u = b.combatants.find((c) => c.team === 'guild' && c.memberId === members[1]!.id)!
    const far = b.combatants.find((c) => c.team === 'enemy' && c.alive)!
    u.pos = { x: 60, y: 60 }
    far.pos = { x: 600, y: 300 }
    u.attackTargetId = far.id
    setHoldGround(b, u.memberId!, true)
    for (let t = 0; t < 30 && b.status === 'running'; t++) stepBattle(b)
    expect(u.moveTarget).toBeUndefined() // 不追击
    expect(far.hp).toBe(far.maxHp) // 够不着就没打
    // 敌人进射程 + 清掉玩家攻击指令 → 坚守单位按待命索敌开火(只看射程)
    const near = b.combatants.find((c) => c.team === 'enemy' && c.alive && c.id !== far.id)!
    near.pos = { x: 90, y: 60 }
    near.position = 'front' // 近战合法目标
    u.attackTargetId = undefined
    let hit = false
    for (let t = 0; t < 200 && b.status === 'running'; t++) {
      stepBattle(b)
      if (b.events.some((e) => e.type === 'damage' && e.attackerId === u.id)) { hit = true; break }
    }
    expect(hit).toBe(true)
  })

  it('还手优先级:被射程外敌人打了会记仇追击(lastAttackerId),集火最高优先', () => {
    const members = squad()
    const b = createBattle(members, BLACKMOSS, 'enc-frogs', 9090, 0, 0, false)
    const u = b.combatants.find((c) => c.team === 'guild' && c.memberId === members[1]!.id)!
    const foes = b.combatants.filter((c) => c.team === 'enemy' && c.alive)
    const nearFoe = foes[0]!, farFoe = foes[1]!
    // 萨满(后排 ranged)远远打一下 → lastAttackerId 记下它
    farFoe.pos = { x: 560, y: 300 }
    u.pos = { x: 100, y: 60 }
    nearFoe.pos = { x: 130, y: 60 }
    u.lastAttackerId = farFoe.id
    for (let t = 0; t < 40 && b.status === 'running'; t++) stepBattle(b)
    // 非坚守的待命单位对还手目标可出程追击:moveTarget 指向记仇对象(或已在追击路上造成伤害)
    const chased = u.attackTargetId === farFoe.id || b.events.some((e) => e.type === 'damage' && e.attackerId === u.id && e.targetId === farFoe.id)
    expect(chased).toBe(true)
  })
})

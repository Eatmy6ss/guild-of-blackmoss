import { describe, expect, it } from 'vitest'
import { createBattle, setAttackMove, stopUnit, stepBattle } from './combat'
import { generateMember } from './gen'
import { BLACKMOSS } from '../data/dungeons'

// U42 #9.3 RTS 基础操作引擎面:攻击移动(途中交战,清完继续走)/停止(清指令回待命)。
// S/H/A/Tab/编队键的 UI 接线在 e2e(RTS1)验证;坚守引擎语义在 standby-retaliate.test。

function squad() {
  return [generateMember('guard', 10, 71), generateMember('ranger', 10, 72), generateMember('priest', 10, 73)]
}

describe('U42 #9.3 RTS 基础操作', () => {
  it('攻击移动:途中遇射程内敌人即交战,清完继续走到目标点', () => {
    const members = squad()
    const b = createBattle(members, BLACKMOSS, 'enc-frogs', 2424, 0, 0, false)
    // 隔离:全队关自动施法(技能无射程判定,会远程干扰"途中交战"的空间断言)
    for (const c of b.combatants) if (c.team === 'guild') c.autoCastOff = c.skills.map((s) => s.def.id)
    const u = b.combatants.find((c) => c.memberId === members[0]!.id)! // 守卫(近战,射程 70)
    const marker = b.combatants.find((c) => c.team === 'enemy' && c.alive)!
    marker.pos = { x: 260, y: 110 } // 行军路径上,初始距离 110 > 射程 70
    marker.hp = 1 // 一击即倒,交战后立刻继续行军
    u.pos = { x: 150, y: 110 }
    setAttackMove(b, u.memberId!, 400, 110)
    let engaged = false
    let guard = 0
    while (guard++ < 600 && b.status === 'running') {
      stepBattle(b)
      if (!marker.alive) engaged = true
      if (engaged && u.alive) break
    }
    expect(engaged).toBe(true) // 途中交战(标记敌人被击杀)
    // 继续行军到目标点
    guard = 0
    while (guard++ < 400 && b.status === 'running' && u.alive && u.attackMove) stepBattle(b)
    expect(u.attackMove).toBeUndefined() // 到达后清除
    expect(Math.abs(u.pos!.x - 400)).toBeLessThanOrEqual(6)
  })

  it('停止(S):清移动与攻击目标,回到待命(射程内敌人照打)', () => {
    const members = squad()
    const b = createBattle(members, BLACKMOSS, 'enc-frogs', 3535, 0, 0, false)
    for (const c of b.combatants) if (c.team === 'guild') c.autoCastOff = c.skills.map((s) => s.def.id)
    const u = b.combatants.find((c) => c.memberId === members[1]!.id)!
    const far = b.combatants.find((c) => c.team === 'enemy' && c.alive)!
    u.pos = { x: 80, y: 60 }
    far.pos = { x: 560, y: 300 }
    u.attackTargetId = far.id
    u.moveTarget = { x: 500, y: 300 }
    stopUnit(b, u.memberId!)
    expect(u.moveTarget).toBeUndefined()
    expect(u.attackTargetId).toBeUndefined()
    // 射程内出现敌人 → 待命还手开火
    const near = b.combatants.find((c) => c.team === 'enemy' && c.alive && c.id !== far.id)!
    near.pos = { x: 120, y: 60 }
    near.position = 'front'
    let hit = false
    for (let t = 0; t < 200 && b.status === 'running'; t++) {
      stepBattle(b)
      if (b.events.some((e) => e.type === 'damage' && e.attackerId === u.id)) { hit = true; break }
    }
    expect(hit).toBe(true)
  })
})

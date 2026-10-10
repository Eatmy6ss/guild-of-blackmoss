import { describe, expect, it } from 'vitest'
import { createBattle, stepBattle, RANGED_RANGE } from './combat'
import { generateMember } from './gen'
import { BLACKMOSS } from '../data/dungeons'

// U42 #9.6③:弓手(挂机 AI)不再绕过射程判定——射程外=追击(本 tick 不出手),进射程才打。

describe('U42 #9.6 弓手射程接缝', () => {
  it('挂机弓手对射程外目标追击而非站桩全场输出', () => {
    const members = [generateMember('guard', 10, 71), generateMember('ranger', 10, 72), generateMember('priest', 10, 73)]
    const b = createBattle(members, BLACKMOSS, 'enc-frogs', 6262)
    b.commands.autoMode = true
    const u = b.combatants.find((c) => c.memberId === members[1]!.id)!
    u.weaponFamily = 'bow' // 测试钉人:确保走弓分支
    u.range = 'ranged'
    u.pos = { x: 80, y: 60 }
    const far = b.combatants.find((c) => c.team === 'enemy' && c.alive)!
    far.pos = { x: 560, y: 300 } // 距离 ≈ 523 > RANGED_RANGE 230
    const d0 = Math.hypot(u.pos!.x - far.pos!.x, u.pos!.y - far.pos!.y)
    // 注:AI 分支「边追边打」是 M-d 全局语义(后撤不封锁普攻);本断言的接缝是弓分支
    // 此前连移动都不参与(纯站桩)——修复后弓手同样追击/保距。
    let closed = false
    for (let t = 0; t < 20 && b.status === 'running'; t++) {
      stepBattle(b)
      if (!u.alive) break
      const d = Math.hypot(u.pos!.x - far.pos!.x, u.pos!.y - far.pos!.y)
      if ((u.moveTarget !== undefined && d < d0) || d <= RANGED_RANGE) { closed = true; break }
    }
    expect(closed).toBe(true) // 弓手在逼近目标(旧实现:原地不动干打全场)
  })
})

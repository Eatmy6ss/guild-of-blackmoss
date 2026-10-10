import { describe, expect, it } from 'vitest'
import { createBattle, setMoveTarget, stepBattle, MOVE_SPEED } from './combat'
import { MECHANIC_REGISTRY } from './mechanic-registry'
import { generateMember } from './gen'
import { BLACKMOSS, DUNGEONS } from '../data/dungeons'
import type { DungeonDef } from './types'

// U42 #9.5 预警躲得开:所有 telegraph-aoe 满足「半径 ÷ 移速 × 1.3 ≤ 预警 tick」;
// 圆心单位 1 倍速下令后能走出圈(爆心=仇恨最高者,读条期间不跟随)。

const RADIUS_DEFAULT = MECHANIC_REGISTRY['telegraph-aoe']!.defaults.radius as number
const TELE_DEFAULT = MECHANIC_REGISTRY['telegraph-aoe']!.defaults.telegraphTicks as number

function effectiveAoe(d: DungeonDef): { name: string; tele: number; radius: number }[] {
  const out: { name: string; tele: number; radius: number }[] = []
  const scan = (mechanics: { kind: string; params: Record<string, number | string> }[] | undefined, name: string) => {
    for (const m of mechanics ?? []) {
      if (m.kind !== 'telegraph-aoe') continue
      out.push({
        name,
        tele: typeof m.params.telegraphTicks === 'number' ? m.params.telegraphTicks : TELE_DEFAULT,
        radius: typeof m.params.radius === 'number' ? m.params.radius : RADIUS_DEFAULT,
      })
    }
  }
  for (const boss of Object.values(d.bosses)) scan(boss.mechanics, boss.name)
  for (const group of Object.values(d.enemyGroups)) for (const e of group) scan(e.mechanics, e.name)
  return out
}

describe('U42 #9.5 预警躲得开', () => {
  it('注册表默认值满足可躲公式(75÷2.2×1.3≈44.3 ≤ 50)', () => {
    expect((RADIUS_DEFAULT / MOVE_SPEED) * 1.3).toBeLessThanOrEqual(TELE_DEFAULT)
  })

  it('全部 12 副本的每一处 telegraph-aoe 覆写都满足可躲公式', () => {
    const violations: string[] = []
    let checked = 0
    for (const d of DUNGEONS) {
      for (const aoe of effectiveAoe(d)) {
        checked++
        if ((aoe.radius / MOVE_SPEED) * 1.3 > aoe.tele) violations.push(`${d.id}/${aoe.name}: ${aoe.radius}px/${aoe.tele}tick`)
      }
    }
    expect(checked).toBeGreaterThanOrEqual(6) // 至少覆盖已知的六处覆写+默认
    expect(violations).toEqual([])
  })

  it('圆心单位 1 倍速下令后能走出圈(格鲁什震地,爆心=坦克)', () => {
    const members = [generateMember('guard', 10, 71), generateMember('ranger', 10, 72), generateMember('priest', 10, 73)]
    const b = createBattle(members, BLACKMOSS, 'enc-grush', 5150, 0, 0, false)
    const tank = b.combatants.find((c) => c.memberId === members[0]!.id)!
    const boss = b.combatants.find((c) => c.boss)!
    boss.pos = { x: 500, y: 110 }
    tank.pos = { x: 160, y: 110 } // 坦克=威胁最高=爆心
    let ordered = false
    let escaped: boolean | null = null
    let guard = 0
    while (guard++ < 400 && b.status === 'running') {
      stepBattle(b)
      const rt = boss.mech?.['telegraph-aoe']
      if (rt?.until !== undefined && !ordered) {
        ordered = true
        setMoveTarget(b, tank.memberId!, Math.max(20, tank.pos!.x - 160), tank.pos!.y) // 一倍速下令跑路
      }
      if (rt?.resolvedAt !== undefined) {
        const center = rt.slamCenter as { x: number; y: number }
        escaped = Math.hypot(tank.pos!.x - center.x, tank.pos!.y - center.y) > (MECHANIC_REGISTRY['telegraph-aoe']!.defaults.radius as number)
        break
      }
    }
    expect(ordered).toBe(true) // 震地确实发生了
    expect(escaped).toBe(true) // 站在圆心的单位走出了圈
  })
})

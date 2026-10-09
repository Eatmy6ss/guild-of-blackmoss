import { describe, expect, it } from 'vitest'
import { createRun, startStep, moveTo } from './run'
import { BLACKMOSS } from '../data/dungeons'
import { generateMember } from './gen'

// #7.3b 副本词缀 roll:wave 遭遇按 rating 概率出词缀怪(第一图也有但低密度);名字带 · 后缀;确定性。

describe('#7.3b 副本词缀链路', () => {
  it('多 seed 采样:黑苔会出现词缀怪(·后缀),概率落在低密度带', () => {
    let withAffix = 0, total = 0
    const members = [generateMember('guard', 1, 81), generateMember('ranger', 1, 82), generateMember('priest', 1, 83)]
    for (const m of members) m.level = 10, m.hp = 9999
    for (let seed = 1; seed <= 60; seed++) {
      const run = createRun(members, BLACKMOSS, seed * 977)
      const node = run.map.layers[0].find((n) => n.kind === 'battle') ?? run.map.layers[0][0]!
      moveTo(run, node.id)
      startStep(run, seed * 977, 0, members)
      total++
      const enemies = run.battle!.combatants.filter((c) => c.team === 'enemy')
      if (enemies.some((e) => /·(血怒|圣咏|亡语|猎首)/.test(e.name))) withAffix++
      if (run.battle!.status !== 'running') break
    }
    console.log(`探针:${withAffix}/${total} 场带词缀`)
    expect(withAffix).toBeGreaterThan(0)   // 第一图也有词条怪(U40 拍板)
    expect(withAffix / total).toBeLessThan(0.7) // 低密度(不设防才 100%)
  })

  it('不设防条款:词缀必带(100%)', () => {
    let withAffix = 0
    const members = [generateMember('guard', 1, 91), generateMember('ranger', 1, 92), generateMember('priest', 1, 93)]
    for (const m of members) m.level = 10, m.hp = 9999
    for (let seed = 1; seed <= 20; seed++) {
      const run = createRun(members, BLACKMOSS, seed * 977)
      run.bountyClauses = ['noquarter']
      const node = run.map.layers[0].find((n) => n.kind === 'battle') ?? run.map.layers[0][0]!
      moveTo(run, node.id)
      startStep(run, seed * 977, 0, members)
      const enemies = run.battle!.combatants.filter((c) => c.team === 'enemy')
      if (enemies.some((e) => /·(血怒|圣咏|亡语|猎首)/.test(e.name))) withAffix++
    }
    expect(withAffix).toBe(20)
  })
})

// I3 不变量断言(#0.2):同一 EnemyDef 经初始生成与经 summon 生成,属性完全相同
import { describe, it, expect } from 'vitest'
import { createBattle, stepBattle, enemyToCombatant } from './combat'
import { applyEnemyScaling } from './difficulty'
import { BLACKMOSS } from '../data/dungeons'
import { generateMember } from './gen'

describe('I3 敌人缩放唯一入口(#0.2)', () => {
  it('召唤增援与初始怪共用同一份缩放因子(格鲁什召唤蛙人)', () => {
    // 格鲁什有 summon 机制(pool: frogs-frail);三成员打 boss 战触发召唤
    const squad = ['guard', 'priest', 'ranger'].map((j, i) => generateMember(j as any, 9, 41300 + i))
    const b = createBattle(squad, BLACKMOSS, 'enc-grush', 424242, 0, 0, false)
    const boss = b.combatants.find((c) => c.team === 'enemy' && c.boss)!
    expect(boss.scaleFactors).toBeDefined()
    // 模拟血量线触发召唤
    boss.hp = Math.round(boss.maxHp * 0.3)
    let summoned = 0
    let guard = 0
    while (summoned === 0 && guard++ < 400) {
      stepBattle(b)
      summoned = b.combatants.filter((c) => c.team === 'enemy').length - 1
    }
    expect(summoned).toBeGreaterThan(0)
    // 不变量:每个召唤怪属性 = enemyToCombatant(原始定义) × boss.scaleFactors
    for (const c of b.combatants.filter((x) => x.team === 'enemy' && !x.boss)) {
      const raw = enemyToCombatant(c.enemyDef!)
      const f = boss.scaleFactors!
      void f
      const manual = enemyToCombatant(c.enemyDef!)
      applyEnemyScaling(manual, f)
      void raw
      expect(c.maxHp).toBe(manual.maxHp)
      expect(c.attack).toBe(manual.attack)
    }
  })
})

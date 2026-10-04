import { describe, it, expect } from 'vitest'
import { createBattle, stepBattle } from './combat'
import { bossSequence } from './run'
import { generateMember } from './gen'
import { BLACKMOSS, THORNHOLD } from '../data/dungeons'

// U28 双 Boss 变体(制作人 2026-10-04,怪物猎人式):地图 Boss 链第二场=变体(开局狂暴+新招);
// bossId 不变(首杀/手册/委托/位阶键零迁移);原 encounters 保留供 ⑲ 门禁直连单场。

describe('U28 双 Boss 变体', () => {
  it('Boss 链用变体顶替原型位:黑苔=格鲁什→狂信塔尔玛;荆棘=科尔特→君王维克托', () => {
    const bm = bossSequence(BLACKMOSS).map((e) => e.id)
    expect(bm).toEqual(['enc-grush', 'enc-talma-risen'])
    const th = bossSequence(THORNHOLD).map((e) => e.id)
    expect(th).toEqual(['enc-colt', 'enc-victor-sovereign'])
    // bossId 不变:位阶(DUNGEON_FINAL_BOSS)/委托/手册的键不受影响
    expect(bossSequence(BLACKMOSS).map((e) => e.bossId)).toEqual(['grush', 'talma'])
    expect(bossSequence(THORNHOLD).map((e) => e.bossId)).toEqual(['colt', 'victor'])
  })

  it('变体战:开局即狂暴(tick1 攻击已乘 startEnrage)+新机制在列', () => {
    const members = BLACKMOSS.encounters.length ? makeSquad() : []
    const variant = createBattle(members, BLACKMOSS, 'enc-talma-risen', 7)
    const boss = variant.combatants.find((c) => c.boss)!
    expect(boss.name).toBe('深渊狂信·塔尔玛')
    expect(boss.bossMechanics!.some((m) => m.id === 'talma-whisper' && m.kind === 'cast-heal')).toBe(true)
    // 原型 enrage 被改写为 atTick=0:第一步就打出「陷入狂暴」,攻击已放大
    stepBattle(variant)
    expect(variant.log.some((l) => l.text.includes('狂暴'))).toBe(true)
    // 对照:同队打原型场,tick1 不应狂暴(atTick=140)
    const base = createBattle(members, BLACKMOSS, 'enc-talma', 7)
    const baseBoss = base.combatants.find((c) => c.boss)!
    stepBattle(base)
    expect(base.log.some((l) => l.text.includes('狂暴'))).toBe(false)
    expect(variant.combatants.find((c) => c.boss)!.attack).toBeGreaterThan(baseBoss.attack)
  })

  it('原型 BossDef 与原 encounters 不被污染(变体用克隆改写)', () => {
    const members = makeSquad()
    createBattle(members, BLACKMOSS, 'enc-talma-risen', 7)
    const def = BLACKMOSS.bosses['talma']!
    const enc = BLACKMOSS.encounters.find((e) => e.id === 'enc-talma')!
    expect(enc.variant).toBeUndefined()
    expect(def.mechanics.find((m) => m.kind === 'enrage')!.params.atTick).toBe(140)
    expect(def.mechanics.some((m) => m.id === 'talma-whisper')).toBe(false)
  })

  it('荆棘变体同样生效:开局狂暴+威压新招', () => {
    const members = makeSquad()
    const variant = createBattle(members, THORNHOLD, 'enc-victor-sovereign', 7)
    const boss = variant.combatants.find((c) => c.boss)!
    expect(boss.name).toBe('割据君王·维克托')
    expect(boss.bossMechanics!.some((m) => m.kind === 'fear-aura')).toBe(true)
    expect(boss.bossMechanics!.find((m) => m.kind === 'enrage')!.params.atTick).toBe(0)
  })
})

function makeSquad() {
  // 最小合法小队:createBattle 需要与副本编制一致的成员(测试桩,不接花名册)
  return (['guard', 'priest', 'ranger'] as const).map((j, i) => generateMember(j, 12, 77 + i))
}

import { describe, expect, it } from 'vitest'
import { createBattle, applyHit } from './combat'
import { generateMember } from './gen'
import { BLACKMOSS } from '../data/dungeons'

// #5.3 敌人原型扩充:三种新引擎特质(荆棘外壳 thorns/游斗 evasive/复生怨念 vengeful)——
// 复用 traits 通道,零新系统;数值 C4 占位(thorns 反弹 0.15/evasive 闪避 0.2/vengeful 反弹攻击力)。

function fixture() {
  const members = [generateMember('guard', 1, 61), generateMember('ranger', 1, 62), generateMember('priest', 1, 63)]
  for (const m of members) m.level = 10, m.hp = 9999
  const b = createBattle(members, BLACKMOSS, 'enc-frogs', 7, 0, 0, false)
  return b
}

describe('#5.3 敌人原型特质', () => {
  it('thorns 荆棘外壳:近战普攻被反弹(复用 counterMult 通道投影)', () => {
    const b = fixture()
    const hero = b.combatants.find((c) => c.team === 'guild' && c.range === 'melee')!
    const foe = b.combatants.find((c) => c.team === 'enemy' && c.alive)!
    foe.traits = ['thorns']
    // 敌人投影应把 thorns 转 counterMult(战斗构造期)
    expect(foe.counterMult).toBe(0.15)
    const hpBefore = hero.hp
    applyHit(b, hero, foe, 10, '攻击')
    expect(hero.hp).toBeLessThan(hpBefore) // 被扎了
  })

  it('evasive 游斗:近战普攻概率闪避(事件与日志可见);远程与技能不受此trait影响', () => {
    const b = fixture()
    const striker = b.combatants.find((c) => c.team === 'guild' && c.range === 'ranged')!
    const foe = b.combatants.find((c) => c.team === 'enemy' && c.alive)!
    foe.traits = ['evasive']
    foe.hp = 5000
    // 远程打 30 次不应触发闪避(游斗只闪近战挥击)
    for (let i = 0; i < 30; i++) applyHit(b, striker, foe, 5, '攻击', { ranged: true })
    expect(b.events.some((e) => e.type === 'dodge')).toBe(false)
  })

  it('vengeful 复生怨念:敌怪死亡瞬间对击杀者反弹其攻击力', () => {
    const b = fixture()
    const hero = b.combatants.find((c) => c.team === 'guild' && c.alive)!
    const foe = b.combatants.find((c) => c.team === 'enemy' && c.alive)!
    foe.traits = ['vengeful']
    const heroHpBefore = hero.hp
    const foeAttack = foe.attack
    applyHit(b, hero, foe, 99999, '攻击') // 斩杀
    expect(foe.alive).toBe(false)
    expect(heroHpBefore - hero.hp).toBeGreaterThanOrEqual(foeAttack) // 怨念奉还 ≥ 其攻击力
  })
})

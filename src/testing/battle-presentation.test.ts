import { describe, expect, it } from 'vitest'
import { BLACKMOSS, DUNGEONS } from '../data/dungeons'
import { createBattle } from '../sim/combat'
import { generateMember } from '../sim/gen'
import { signaturePresentation } from '../ui/battle/signaturePresentation'
import { combatantBadges, mechanicWindows } from '../ui/battle/mechanicPresentation'
import { BOSS_ART, ENEMY_ART } from '../ui/art/enemyArt'
import { SPRITE_PATHS } from '../ui/art/catalog'

function fixture() {
  const battle = createBattle([generateMember('guard', 5, 1), generateMember('priest', 5, 2)], BLACKMOSS, 'enc-frogs', 4242)
  const member = battle.combatants.find(c => c.team === 'guild')!
  const foes = battle.combatants.filter(c => c.team === 'enemy')
  member.specId = 'mage-fire'
  return { battle, member, foes }
}

describe('战斗表现沿真实目标与模拟时钟', () => {
  it('死亡集火目标不会被技能栏继续选中，打断只选实际读条者', () => {
    const { battle, member, foes } = fixture()
    foes[0].alive = false; foes[0].hp = 0
    foes[1].hp = Math.floor(foes[1].maxHp * 0.1)
    expect(signaturePresentation(battle, member, undefined, foes[0].id)?.target).toBe(foes[1])
    member.specId = 'guard-ironwall'
    expect(signaturePresentation(battle, member, foes[2].id, foes[1].id)?.target).toBe(foes[2])
    expect(signaturePresentation(battle, member, undefined, foes[1].id)?.state).toBe('等待敌方读条')
    expect(signaturePresentation(battle, member, undefined, foes[1].id)?.unavailable).toBe(true)
  })
  it('引爆按当前目标显示层数，暂停中的单条指令不可被另一个按钮覆盖', () => {
    const { battle, member, foes } = fixture()
    expect(signaturePresentation(battle, member, undefined, foes[0].id)?.unavailable).toBe(true)
    foes[0].burnStacks = 3
    expect(signaturePresentation(battle, member, undefined, foes[0].id)?.targetText).toContain('灼烧3层')
    expect(signaturePresentation(battle, member, undefined, foes[0].id)?.unavailable).toBe(false)
    battle.commands.signature = { memberId: member.memberId!, skillId: 'sig-fire-detonate', targetId: foes[0].id }
    const ally = battle.combatants.find(c => c.team === 'guild' && c !== member)!
    ally.specId = 'priest-holy'
    const before = structuredClone(battle)
    expect(signaturePresentation(battle, member)?.state).toBe('已下令 · 推进后释放')
    expect(signaturePresentation(battle, ally)?.unavailable).toBe(true)
    expect(signaturePresentation(battle, ally)?.state).toBe('等待已下达的招牌技释放')
    expect(battle).toEqual(before)
  })
  it('圣疗排队目标按成员ID解析，冷却按tick更新而不依赖墙钟', () => {
    const { battle, member } = fixture()
    member.specId = 'priest-holy'
    battle.commands.signature = { memberId: member.memberId!, skillId: 'sig-holy-mend', targetId: member.memberId }
    expect(signaturePresentation(battle, member)?.targetText).toBe(member.name)
    delete battle.commands.signature
    battle.signatureCd = { [member.memberId!]: battle.tick + 30 }
    expect(signaturePresentation(battle, member)?.state).toBe('冷却 3.0秒')
    expect(signaturePresentation(structuredClone(battle), member)?.state).toBe('冷却 3.0秒')
    battle.tick += 20
    expect(signaturePresentation(battle, member)?.state).toBe('冷却 1.0秒')
  })
  it('中途恢复咏唱有相同进度，暂停不消耗窗口，倍速只改变tick推进频率', () => {
    const { battle, foes } = fixture(), enemy = foes[0]
    enemy.bossMechanics = [{ id: 'cast', kind: 'cast-heal', name: '血光', params: {} }]
    battle.tick = 20; enemy.mech = { 'cast-heal': { until: 35, taken: 100 } }
    const before = structuredClone(battle), view = mechanicWindows(battle, enemy)[0]
    expect(view).toMatchObject({ remaining: 15, total: 30, progress: 0.5, interruptible: true, taken: 100, breakDamage: 450 })
    const restored = JSON.parse(JSON.stringify(battle))
    expect(mechanicWindows(restored, restored.combatants.find((c: { id: string }) => c.id === enemy.id)!)[0]).toEqual(view)
    expect(mechanicWindows(battle, enemy)[0]).toEqual(view)
    expect(battle).toEqual(before)
    battle.tick += 10
    expect(mechanicWindows(battle, enemy)[0].remaining).toBe(5)
    battle.tick = 35
    expect(mechanicWindows(battle, enemy)).toEqual([])
  })
  it('龙息用前排应对提示，范围蓄力用分散，不能复用错误的打断提示', () => {
    const { battle, foes } = fixture(), enemy = foes[0]
    enemy.bossMechanics = [{ id: 'breath', kind: 'breath-charge', name: '龙息', params: {} }]
    enemy.mech = { 'breath-charge': { until: 30 } }
    const view = mechanicWindows(battle, enemy)[0]
    expect(view.interruptible).toBe(false)
    expect(view.counter).toContain('只烧前排')
    expect(view.counter).not.toContain('分散')
    expect(view.dangerCircle).toBe(true)
    enemy.bossMechanics = [{ id: 'slam', kind: 'telegraph-aoe', name: '震地', params: {} }]
    enemy.mech = { 'telegraph-aoe': { until: 30 } }
    expect(mechanicWindows(battle, enemy)[0].counter).toContain('分散')
    enemy.alive = false
    expect(mechanicWindows(battle, enemy)).toEqual([])
  })
  it('护盾/灼烧/控制只读实际状态，过期控制与亡者不保留假标签', () => {
    const { member } = fixture()
    Object.assign(member, { absorbShield: 25, burnStacks: 3, burnUntilTick: 5, boundUntilTick: 20, vulnUntilTick: 20, vulnMult: 1.25 })
    expect(combatantBadges(member, 10)).toEqual(['护盾 25', '灼烧 3层', '束缚', '易伤 +25%'])
    expect(combatantBadges(member, 20)).toEqual(['护盾 25', '灼烧 3层'])
    member.alive = false
    expect(combatantBadges(member, 10)).toEqual([])
  })
  it('14首领均有独立图，战场与图鉴同源，不与关键杂兵重复', () => {
    const bosses = DUNGEONS.flatMap(d => Object.values(d.bosses))
    expect(bosses).toHaveLength(14)
    expect(new Set(bosses.map(b => BOSS_ART[b.id])).size).toBe(14)
    const ordinary = DUNGEONS.flatMap(d => Object.values(d.enemyGroups).flat()).map(e => ENEMY_ART[e.id])
    for (const boss of bosses) {
      expect(ENEMY_ART[boss.id]).toBe(BOSS_ART[boss.id])
      expect(SPRITE_PATHS).toContain(BOSS_ART[boss.id])
      expect(ordinary).not.toContain(BOSS_ART[boss.id])
    }
  })
})

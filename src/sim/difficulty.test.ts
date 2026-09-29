import { expect, test } from 'vitest'
import { BLACKMOSS, DUNGEONS, RUSTMINE } from '../data/dungeons'
import { createBattle, enemyToCombatant } from './combat'
import { scaleEnemy, type DifficultyModifiers } from './difficulty'
import { processBossMechanics } from './mechanics'
import { createRun, startStep } from './run'
import { startTower, startTowerFloor, towerEnemyScale } from './tower'
import type { BattleState, Combatant, DungeonDef } from './types'

const summonCases = DUNGEONS.flatMap(dungeon => Object.entries(dungeon.bosses)
  .filter(([, boss]) => boss.mechanics.some(m => m.kind === 'summon'))
  .map(([bossId]) => ({ dungeon, bossId })))

function spawnAdds(battle: BattleState) {
  const boss = battle.combatants.find(c => c.boss)!
  // Isolate the real summon mechanism from unrelated boss damage and enrage.
  boss.bossMechanics = boss.bossMechanics!.filter(m => m.kind === 'summon')
  boss.hp = 1
  const before = battle.combatants.length
  processBossMechanics(battle)
  return battle.combatants.slice(before)
}
function attributes(unit: Combatant) {
  return { name: unit.name, hp: unit.hp, maxHp: unit.maxHp, attack: unit.attack, defense: unit.defense,
    interval: unit.attackInterval, traits: unit.traits, skills: unit.skills.map(s => s.def),
    position: unit.position, range: unit.range, elite: !!unit.elite }
}
function comparisonDungeon(dungeon: DungeonDef, bossId: string): DungeonDef {
  const summon = dungeon.bosses[bossId].mechanics.find(m => m.kind === 'summon')!
  return { ...dungeon, encounters: [{ id: 'comparison', name: '同定义初始与增援对照', kind: 'boss',
    enemyGroupIds: [String(summon.params.groupId)], bossId }] }
}

test('I3：所有副本的实际召唤增援与同定义初始怪属性一致', () => {
  const dataBefore = structuredClone(DUNGEONS)
  expect(summonCases.length).toBeGreaterThan(0)
  for (const { dungeon, bossId } of summonCases) {
    for (const modifiers of [{}, { elite: true }, { rareHunt: 1.4 }, { elite: true, rareHunt: 1.4 }]) {
      const testDungeon = comparisonDungeon(dungeon, bossId)
      const battle = createBattle([], testDungeon, 'comparison', 29, 0, 0, true, undefined, modifiers)
      const initial = battle.combatants.filter(c => !c.boss).map(attributes)
      const adds = spawnAdds(battle)
      expect(adds.length).toBeGreaterThan(0)
      expect(adds.map(attributes), `${dungeon.id}/${bossId}/${JSON.stringify(modifiers)}`)
        .toEqual(initial.slice(0, adds.length))
    }
  }
  expect(DUNGEONS).toEqual(dataBefore)
})

test('首场猎杀与精英叠加传到真实增援，下一场恢复普通强度和标记', () => {
  const { dungeon, bossId } = summonCases.find(({ dungeon }) => dungeon.id === 'emberpass')!
  const fixture = comparisonDungeon(dungeon, bossId)
  const baseline = createBattle([], fixture, 'comparison', 29)
  const run = createRun([], fixture, '', 29, 0, true, undefined, false, [], { mult: 1.4, rewardMult: 2 })
  run.steps = ['comparison', 'comparison']
  run.eliteAt = []
  run.eliteNow = true
  startStep(run, 29)
  const initial = run.battle!.combatants.filter(c => !c.boss)
  expect(initial[0].maxHp).toBeGreaterThan(baseline.combatants[0].maxHp)
  expect(initial[0].attack).toBeGreaterThan(baseline.combatants[0].attack)
  expect(initial.every(c => c.elite)).toBe(true)
  const firstAdds = spawnAdds(run.battle!)
  expect(firstAdds.map(attributes)).toEqual(initial.slice(0, firstAdds.length).map(attributes))
  run.stepIdx = 1
  startStep(run, 29)
  expect(run.battle!.combatants.map(attributes)).toEqual(baseline.combatants.map(attributes))
  expect(spawnAdds(run.battle!).map(attributes)).toEqual(spawnAdds(baseline).map(attributes))
})

test('增援使用开战时的难度快照，外部修饰或地图配置修改不改变本场', () => {
  const { dungeon, bossId } = summonCases[0]
  const fixture = structuredClone(comparisonDungeon(dungeon, bossId))
  fixture.difficultyMods = { enemyAttack: 1.1, enemyHp: 1.2 }
  const modifiers: DifficultyModifiers = { elite: true, rareHunt: 1.4 }
  const battle = createBattle([], fixture, 'comparison', 29, 0, 0, true, undefined, modifiers)
  const initial = battle.combatants.filter(c => !c.boss).map(attributes)
  modifiers.elite = false
  modifiers.rareHunt = 8
  fixture.enemyPower = 9
  fixture.difficultyMods!.enemyAttack = 9
  const adds = spawnAdds(battle)
  expect(adds.map(attributes)).toEqual(initial.slice(0, adds.length))
})

test('高塔预缩放的首领和增援只应用一次楼层成长，不混入来源副本倍率', () => {
  let summons = 0
  const definitions = DUNGEONS.flatMap(d => [...Object.values(d.bosses), ...Object.values(d.enemyGroups).flat()])
  const towerCases = [
    { floor: 1, raw: BLACKMOSS.enemyGroups.frogs },
    { floor: 2, raw: BLACKMOSS.enemyGroups.wolves },
    { floor: 3, raw: [BLACKMOSS.bosses.grush] },
    { floor: 4, raw: BLACKMOSS.enemyGroups.leeches },
    { floor: 6, raw: [BLACKMOSS.bosses.talma] },
    { floor: 9, raw: [RUSTMINE.bosses.delveanchor] },
    { floor: 12, raw: [BLACKMOSS.bosses.grush] },
    { floor: 18, raw: [RUSTMINE.bosses.delveanchor] },
    { floor: 30, raw: [BLACKMOSS.bosses.grush] },
  ]
  for (const { floor, raw: initial } of towerCases) {
    const run = startTower([], 29)
    run.floor = floor
    startTowerFloor(run, 29)
    const battle = run.battle!
    expect(battle.combatants).toHaveLength(initial.length)
    for (const [index, enemy] of battle.combatants.entries()) {
      const raw = initial[index]
      expect(enemy.name).toBe(raw.name)
      expect(enemy.maxHp).toBe(Math.round(raw.maxHp * towerEnemyScale(floor)))
      expect(enemy.attack, `${floor}/${enemy.name}/${raw.id}`).toBe(Math.round(raw.attack * towerEnemyScale(floor)))
    }
    const boss = battle.combatants.find(c => c.boss)
    if (!boss?.summonPool) continue
    const pool = boss.summonPool
    expect(pool.every(e => e.difficultyScaled)).toBe(true)
    const adds = spawnAdds(battle)
    expect(adds.length).toBeGreaterThan(0)
    for (const [index, add] of adds.entries()) {
      const raw = definitions.find(e => e.id === pool[index].id)!
      expect(add.maxHp).toBe(Math.round(raw.maxHp * towerEnemyScale(floor)))
      expect(add.attack).toBe(Math.round(raw.attack * towerEnemyScale(floor)))
      expect(attributes(add)).toEqual(attributes(enemyToCombatant(pool[index], boss.summonDifficulty)))
      summons++
    }
  }
  expect(summons).toBeGreaterThan(0)
})

test('缩放返回新定义，标记不会污染数据表，预缩放定义再次经过入口保持属性', () => {
  const { dungeon, bossId } = summonCases[0]
  const raw = dungeon.bosses[bossId]
  const before = structuredClone(raw)
  const input = { dungeon, role: 'boss' as const, modifiers: { elite: true, rareHunt: 1.4 } }
  const once = scaleEnemy(raw, input)
  expect(once).not.toBe(raw)
  expect(raw).toEqual(before)
  expect(raw.difficultyScaled).toBeUndefined()
  expect(scaleEnemy(once, input)).toEqual(once)
  expect(JSON.parse(JSON.stringify(once))).toEqual(once)
})

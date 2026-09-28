import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DUNGEONS } from '../src/data/dungeons'
import { generateMember } from '../src/sim/gen'
import { applyHit, createBattle } from '../src/sim/combat'
import { processBossMechanics, bossIntents } from '../src/sim/mechanics'
import { runAutoAI } from '../src/sim/ai'
import { MECHANIC_REGISTRY, interruptThreshold, mechanicBrief, mechanicIntents } from '../src/sim/mechanic-registry'
import type { BossMechanicDef, MechanicKind, Member } from '../src/sim/types'

const castKinds = ['cast-buff', 'cast-heal', 'ground-zone', 'fear-aura'] as const
function fixture(kind: MechanicKind, boss = true, params?: BossMechanicDef['params']) {
  const dungeon = DUNGEONS.find(d => Object.values(d.bosses).some(b => b.mechanics.some(m => m.kind === kind)))!
  const encounter = dungeon.encounters.find(e => e.bossId && dungeon.bosses[e.bossId].mechanics.some(m => m.kind === kind))!
  const squad = ['guard', 'priest', 'ranger'].map((j, i) => generateMember(j as Member['job'], 5, 410 + i))
  const battle = createBattle(squad, dungeon, encounter.id, 171)
  const target = battle.combatants.find(c => c.boss)!
  const def = structuredClone(target.bossMechanics!.find(m => m.kind === kind)!)
  if (params) def.params = params
  for (const c of battle.combatants) { c.bossMechanics = []; c.mech = {} }
  target.bossMechanics = [def]
  target.boss = boss
  target.traits = []
  target.maxHp = 100000
  target.hp = 90000
  battle.commands.protectRetreat = true
  return { battle, target, def, attacker: battle.combatants.find(c => c.team === 'guild')! }
}

for (const kind of castKinds) {
  test(`#0.1 ${kind}: boss and regular enemy share start, interrupt and deadline semantics`, () => {
    for (const boss of [true, false]) {
      for (const mode of ['during', 'last-tick', 'deadline', 'below', 'dead'] as const) {
        const { battle: b, target, def, attacker } = fixture(kind, boss)
        const threshold = interruptThreshold(def)!
        b.tick = 500
        // Damage before a cast must not count toward the next window.
        applyHit(b, attacker, target, threshold, 'before cast')
        processBossMechanics(b)
        processBossMechanics(b)
        const rt = target.mech![kind]
        const end = rt.until!
        assert.equal(rt.taken, 0)
        assert.equal(b.events.filter(e => e.type === 'casting' && e.targetId === target.id).length, 1)
        assert.equal(bossIntents(b).casterId, target.id)
        b.tick = mode === 'deadline' ? end : mode === 'during' ? 501 : end - 1
        applyHit(b, attacker, target, mode === 'dead' ? target.hp + 1 : threshold - 1, 'first hit')
        if (mode !== 'below' && mode !== 'dead') applyHit(b, attacker, target, 1, 'second hit')
        if (mode === 'deadline') assert.equal(rt.taken, 0, 'deadline damage is excluded')
        const shouldInterrupt = mode === 'during' || mode === 'last-tick'
        if (mode === 'during') processBossMechanics(b)
        b.tick = end
        processBossMechanics(b)
        processBossMechanics(b)
        assert.equal(b.events.filter(e => e.type === 'interrupted' && e.targetId === target.id).length, shouldInterrupt ? 1 : 0)
        assert.equal(bossIntents(b).casting, false)
        const completed = !shouldInterrupt && mode !== 'dead'
        if (kind === 'cast-buff') assert.equal(target.buffAttack !== undefined, completed)
        if (kind === 'cast-heal') assert.equal(b.events.some(e => e.type === 'heal'), completed)
        if (kind === 'ground-zone') assert.equal(b.events.some(e => e.type === 'zoned'), completed)
        if (kind === 'fear-aura') assert.equal(attacker.fearUntilTick !== undefined, completed)
        if (mode !== 'dead') {
          b.tick = rt.next!
          processBossMechanics(b)
          assert.equal(rt.taken, 0, 'the next cast starts with a clean threshold')
          assert.equal(b.events.filter(e => e.type === 'casting' && e.targetId === target.id).length, 2)
        }
      }
    }
  })
}

test('#0.1 missing and malformed thresholds preserve existing engine defaults and descriptions', () => {
  const expected = { 'cast-buff': 450, 'cast-heal': 450, 'ground-zone': 200, 'fear-aura': 110 }
  for (const kind of castKinds) {
    for (const params of [{}, { breakDamage: 'invalid' }, { breakDamage: NaN }]) {
      const { battle: b, target, def, attacker } = fixture(kind, true, params)
      assert.equal(interruptThreshold(def), expected[kind])
      assert(mechanicBrief(def).includes(`${expected[kind]} 伤`))
      b.tick = 500; processBossMechanics(b)
      b.tick = target.mech![kind].until! - 1
      applyHit(b, attacker, target, expected[kind], 'threshold')
      processBossMechanics(b)
      assert(b.events.some(e => e.type === 'interrupted'))
    }
  }
  assert.equal(interruptThreshold({ kind: 'cast-heal', name: 'string value', params: { breakDamage: '123' } }), 123)
  assert.equal(interruptThreshold({ kind: 'breath-charge', name: 'uninterruptible', params: {} }), undefined)
  for (const kind of castKinds) {
    const { battle: b, target } = fixture(kind, true, { firstTick: 1 })
    b.tick = 1; processBossMechanics(b)
    assert.equal(target.mech![kind].until !== undefined, kind === 'cast-buff' || kind === 'cast-heal',
      'only mechanisms that already supported firstTick may override the initial delay')
  }
})

test('#0.1 UI and cautious AI recognize ground/fear casts, including ordinary enemies', () => {
  for (const kind of ['ground-zone', 'fear-aura'] as const) {
    for (const boss of [true, false]) {
      const { battle: b, target, attacker } = fixture(kind, boss)
      attacker.personality = { bravery: 50, greed: 30, loyalty: 60, caution: 80 }
      b.commands.autoMode = true
      b.tick = 500; processBossMechanics(b)
      assert.equal(bossIntents(b).casterId, target.id)
      runAutoAI(b)
      assert.equal(b.commands.focusId, target.id)
    }
  }
})

test('#0.1 intent queries are read-only, expire on time and do not recommend spread for breath', () => {
  for (const kind of ['phase-invuln', 'breath-charge', 'telegraph-aoe'] as const) {
    const { battle: b, target } = fixture(kind)
    target.mech = undefined
    const before = JSON.stringify(target)
    mechanicIntents(b, target)
    assert.equal(JSON.stringify(target), before)
    b.tick = 500; processBossMechanics(b)
    const end = target.mech![kind].until!
    assert.notEqual(mechanicIntents(b, target)[0].type, 'none')
    assert.equal(bossIntents(b).telegraphing, kind === 'telegraph-aoe')
    assert.equal(bossIntents(b).casting, false)
    b.tick = end
    assert.equal(mechanicIntents(b, target)[0].type, 'none')
    target.alive = false
    assert.deepEqual(mechanicIntents(b, target), [])
  }
})

test('#0.1 completing ground-zone still permits spread avoidance', () => {
  for (const stance of ['spread', 'standard'] as const) {
    const { battle: b, target, attacker } = fixture('ground-zone')
    b.commands.stance = stance
    b.tick = 500; processBossMechanics(b)
    b.tick = target.mech!['ground-zone'].until!
    processBossMechanics(b)
    assert.equal(attacker.zonedUntilTick !== undefined, stance !== 'spread')
    assert.equal(b.events.find(e => e.type === 'zoned')!.amount, stance === 'spread' ? 0 : 1)
  }
})

test('#0.1 actual mechanism data has unique kinds and complete parameterized registry descriptions', () => {
  const seen = new Set<MechanicKind>()
  for (const dungeon of DUNGEONS) {
    for (const enemy of [...Object.values(dungeon.bosses), ...Object.values(dungeon.enemyGroups).flat()]) {
      const defs = enemy.mechanics ?? []
      assert.equal(new Set(defs.map(d => d.kind)).size, defs.length, `${dungeon.id}: ${enemy.name}`)
      for (const def of defs) {
        seen.add(def.kind)
        const spec = MECHANIC_REGISTRY[def.kind]
        assert.equal(spec.kind, def.kind)
        assert(spec.label && spec.counter)
        assert(spec.describe(def).includes('——'))
      }
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(MECHANIC_REGISTRY).sort())
  const buff = mechanicBrief({ kind: 'cast-buff', name: 'defaults', params: {} })
  assert(buff.includes('2.5 秒') && buff.includes('+8') && buff.includes('450 伤'))
  const slam = mechanicBrief({ kind: 'telegraph-aoe', name: 'defaults', params: {} })
  assert(slam.includes('15 秒') && slam.includes('40 伤'))
})

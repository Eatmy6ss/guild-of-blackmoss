import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COMMISSIONS, KINGDOM_RANKS } from '../src/data/kingdom'
import { DUNGEONS, BLACKMOSS } from '../src/data/dungeons'
import { DUNGEON_FINAL_BOSS } from '../src/data/regions'
import { ITEM_BASES } from '../src/data/items'
import { AFFIXES } from '../src/data/affixes'
import { BUILDINGS } from '../src/data/base'
import { ECONOMY } from '../src/data/economy'
import { generateMember } from '../src/sim/gen'
import { createRun, advanceRun } from '../src/sim/run'
import { itemStats } from '../src/sim/loot'
import { acceptCommission, abandonCommission, advanceCommissions, settleKingdomBattle, claimCommission, commissionLock, commissionReward, kingdomRank, kingdomTrust, newKingdomState, normalizeKingdom, royalPotionCost, type KingdomState } from '../src/sim/kingdom'
import { migrate, exportSave, importSave, saveGuild, loadGuildSave, SAVE_VERSION } from '../src/state/save'

const context = { manual: [], buildings: {}, day: 1 }
const late = { ...context, manual: Object.values(DUNGEON_FINAL_BOSS), buildings: { training: 1 } }
const q = (id: string) => COMMISSIONS.find((entry) => entry.id === id)!
const prepared = (id: string): KingdomState => ({ active: [{ id, progress: q(id).objective.target, acceptedDay: 1 }], completed: [] })

test('content: every commission has reachable prerequisites and valid objectives/items', () => {
  const seen = new Set<string>()
  for (const quest of COMMISSIONS) {
    assert(!seen.has(quest.id)); assert(quest.requires.every((id) => seen.has(id)), quest.id)
    seen.add(quest.id)
    const obj = quest.objective
    assert(obj.target > 0 && Number.isInteger(obj.target))
    if (obj.kind === 'building') assert(BUILDINGS.some((b) => b.id === obj.buildingId && b.maxLevel >= obj.target))
    else {
      const dungeon = DUNGEONS.find((d) => d.id === obj.dungeonId)
      assert(dungeon, quest.id)
      if (obj.kind === 'boss') assert(dungeon.encounters.some((e) => e.bossId === obj.bossId), quest.id)
    }
    assert(quest.gold >= 40 && quest.gold <= 300)
    if (quest.item) {
      assert(ITEM_BASES[quest.item.baseId])
      assert(quest.item.rolls.every((r) => AFFIXES[r.affixId] && Number.isFinite(r.value)))
      assert(Object.values(itemStats({ ...quest.item, id: 'test' })).every(Number.isFinite))
    }
  }
})

test('accept: locked/unknown/duplicate commissions fail; at most two slots', () => {
  let state = newKingdomState()
  assert.equal(acceptCommission(state, 'unknown', context), state)
  assert.equal(acceptCommission(state, 'crown-grush', context), state)
  state = acceptCommission(state, 'crown-road', context)
  assert.equal(acceptCommission(state, 'crown-road', context), state)
  state = acceptCommission(state, 'crown-training', context)
  assert.equal(state.active.length, 2)
  state.completed.push({ id: 'crown-mine', day: 1, choice: 'coin' })
  assert.equal(acceptCommission(state, 'crown-ash', late), state)
  assert(commissionLock(q('crown-ash'), state, context)?.includes('目的地尚未开放'))
})

test('combat progress starts at acceptance, scopes dungeon/boss, caps, and resets after abandonment', () => {
  let state = newKingdomState()
  assert.equal(advanceCommissions(state, { kind: 'battle', dungeonId: 'blackmoss' }), state)
  state = acceptCommission(state, 'crown-road', late)
  assert.equal(state.active[0].progress, 0) // Old kills do not backfill.
  assert.equal(advanceCommissions(state, { kind: 'battle', dungeonId: 'rustmine' }), state)
  for (let i = 0; i < 5; i++) state = advanceCommissions(state, { kind: 'battle', dungeonId: 'blackmoss' })
  assert.equal(state.active[0].progress, 3)
  assert.equal(kingdomTrust(state), 0)
  state = acceptCommission(abandonCommission(state, 'crown-road'), 'crown-road', late)
  assert.equal(state.active[0].progress, 0)
  const boss = { active: [{ id: 'crown-grush', progress: 0, acceptedDay: 1 }], completed: [] }
  assert.equal(advanceCommissions(boss, { kind: 'battle', dungeonId: 'rustmine', bossId: 'grush' }), boss)
  assert.equal(advanceCommissions(boss, { kind: 'battle', dungeonId: 'blackmoss', bossId: 'talma' }), boss)
  assert.equal(advanceCommissions(boss, { kind: 'battle', dungeonId: 'blackmoss', bossId: 'grush' }).active[0].progress, 1)
})

test('settlement integration: running, defeat, retreat, and settled battles never add progress', () => {
  const run = createRun([generateMember('guard', 1, 11)], BLACKMOSS, BLACKMOSS.branches[0].id, 7)
  const initial = acceptCommission(newKingdomState(), 'crown-road', context)
  assert.equal(settleKingdomBattle(initial, run), initial)
  run.battle!.status = 'guild-wipe'
  assert.equal(settleKingdomBattle(initial, run), initial)
  run.battle!.status = 'retreated'
  assert.equal(settleKingdomBattle(initial, run), initial)
  run.battle!.status = 'guild-win'
  run.phase = 'retreated'
  assert.equal(settleKingdomBattle(initial, run), initial)
  run.phase = 'battle'
  const progressed = settleKingdomBattle(initial, run)
  assert.equal(progressed.active[0].progress, 1)
  advanceRun(run)
  assert.equal(settleKingdomBattle(progressed, run), progressed)
})

test('full-clear commission completes only on last victorious encounter', () => {
  const run = createRun([generateMember('guard', 1, 12)], BLACKMOSS, BLACKMOSS.branches[0].id, 8)
  const state = { active: [{ id: 'crown-talma', progress: 0, acceptedDay: 1 }], completed: [] }
  run.battle!.status = 'guild-win'
  assert.equal(settleKingdomBattle(state, run), state)
  run.stepIdx = run.steps.length - 1
  run.battle!.status = 'guild-wipe'
  assert.equal(settleKingdomBattle(state, run), state)
  run.battle!.status = 'guild-win'
  const finished = settleKingdomBattle(state, run)
  assert.equal(finished.active[0].progress, 1)
  advanceRun(run)
  assert.equal(run.phase, 'victory')
  assert.equal(settleKingdomBattle(finished, run), finished)
})

test('construction: existing levels and later upgrades count; other buildings do not', () => {
  const old = acceptCommission(newKingdomState(), 'crown-training', late)
  assert.equal(old.active[0].progress, 1)
  const fresh = acceptCommission(newKingdomState(), 'crown-training', context)
  assert.equal(fresh.active[0].progress, 0)
  assert.equal(advanceCommissions(fresh, { kind: 'building', buildingId: 'smithy', level: 1 }), fresh)
  const built = advanceCommissions(fresh, { kind: 'building', buildingId: 'training', level: 1 })
  assert.equal(built.active[0].progress, 1)
})

test('claim: exactly one reward choice, no early claims or replay; item payloads independent', () => {
  assert.equal(claimCommission(acceptCommission(newKingdomState(), 'crown-road', context), 'crown-road', 'coin', 1), null)
  for (const choice of ['coin', 'supplies'] as const) {
    const claimed = claimCommission(prepared('crown-talma'), 'crown-talma', choice, 8)!
    assert(claimed)
    assert.equal(claimed.reward.gold, choice === 'coin' ? 140 : 100)
    assert.equal(claimed.reward.heal, choice === 'supplies' ? 2 : 0)
    assert.equal(claimed.reward.blessing, choice === 'supplies' ? 1 : 0)
    assert.equal(claimed.reward.fury, choice === 'coin' ? 1 : 0)
    assert.equal(kingdomTrust(claimed.state), 15)
    assert.equal(claimCommission(claimed.state, 'crown-talma', 'coin', 8), null)
    assert.equal(claimCommission(claimed.state, 'crown-talma', 'supplies', 8), null)
    assert.equal(acceptCommission(claimed.state, 'crown-talma', late), claimed.state)
    claimed.reward.item!.rolls[0].value = -999
    assert(commissionReward(q('crown-talma'), choice).item!.rolls[0].value > 0)
  }
})

test('relationship: complete chain is reachable, one-time budget bounded, discount tiers correct', () => {
  let state = newKingdomState()
  let gold = 0
  const tiers = new Set([kingdomRank(state).threshold])
  for (const quest of COMMISSIONS) {
    assert.equal(commissionLock(quest, state, late), null)
    state = acceptCommission(state, quest.id, late)
    const obj = quest.objective
    if (obj.kind !== 'building') for (let i = 0; i < obj.target; i++) {
      state = advanceCommissions(state, obj.kind === 'clear' ? { kind: 'clear', dungeonId: obj.dungeonId } : { kind: 'battle', dungeonId: obj.dungeonId, bossId: obj.kind === 'boss' ? obj.bossId : undefined })
    }
    const result = claimCommission(state, quest.id, 'coin', 1)!
    assert(result, quest.id)
    state = result.state; gold += result.reward.gold
    tiers.add(kingdomRank(state).threshold)
    assert.equal(royalPotionCost('heal', state), Math.ceil(ECONOMY.potionCost.heal * (1 - kingdomRank(state).discount)))
  }
  assert.equal(state.completed.length, 10)
  assert.equal(gold, 1680)
  assert.equal(kingdomTrust(state), 150)
  assert.deepEqual([...tiers], KINGDOM_RANKS.map((r) => r.threshold))
  assert.equal(royalPotionCost('heal', state), 41)
  assert.equal(royalPotionCost('fury', state), 63)
})

test('save migration/import/reload preserve assets and claimed receipts without new rewards', () => {
  const legacy = { version: 11, members: [generateMember('guard', 1, 19)], inventory: [], memorial: [], manual: [], protectOn: true,
    gold: 240, blessing: 2, recruitCooldown: 0, towerBest: 0, lastSeen: 1, chronicle: [], day: 3, buildings: { training: 1 },
    potions: { heal: 3, fury: 3 }, unlockedHybrids: [], dungeonMastery: {}, pendingConsequences: [], eventsSeen: [], guildBuffs: [] }
  const migrated = migrate(legacy)
  assert.equal(migrated.version, SAVE_VERSION)
  assert.deepEqual(migrated.kingdom, newKingdomState())
  assert.equal(migrated.gold, legacy.gold)
  assert.deepEqual(migrated.members, legacy.members)
  const claimed = claimCommission(prepared('crown-training'), 'crown-training', 'supplies', 3)!
  const awarded = { ...migrated, kingdom: claimed.state, gold: migrated.gold + claimed.reward.gold,
    blessing: migrated.blessing + claimed.reward.blessing, potions: { heal: 5, fury: 3 } }
  const imported = importSave(exportSave(awarded))!
  assert(imported)
  assert.deepEqual(imported.kingdom, claimed.state)
  assert.equal(imported.gold, 260)
  assert.equal(imported.blessing, 3)
  assert.deepEqual(imported.potions, { heal: 5, fury: 3 })
  assert.equal(claimCommission(imported.kingdom, 'crown-training', 'coin', 3), null)
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } })
  saveGuild(imported)
  assert.deepEqual(loadGuildSave()!.kingdom, imported.kingdom)
  assert.equal(loadGuildSave()!.gold, 260)
  const active = acceptCommission(newKingdomState(), 'crown-road', context)
  active.active[0].progress = 2
  assert.equal(importSave(exportSave({ ...migrated, kingdom: active }))!.kingdom.active[0].progress, 2)
  assert.deepEqual(migrate({ ...legacy, version: 1 }).kingdom, newKingdomState())
  assert.equal(importSave('broken'), null)
})

test('damaged commission fields recover safely: unique receipts, clamped progress, no unknown IDs', () => {
  assert.deepEqual(normalizeKingdom(null), newKingdomState())
  const repaired = normalizeKingdom({ completed: [null, { id: 'crown-road', choice: 'coin', day: 2 }, { id: 'crown-road', choice: 'supplies' }, { id: 'fake', choice: 'coin' }],
    active: [{ id: 'crown-road', progress: 3 }, { id: 'crown-training', progress: 999 }, { id: 'crown-grush', progress: -2 }, { id: 'crown-talma' }] })
  assert.equal(repaired.completed.length, 1)
  assert.equal(kingdomTrust(repaired), 10)
  assert.deepEqual(repaired.active.map((r) => r.progress), [1, 0])
  assert.equal(claimCommission(repaired, 'crown-road', 'coin', 3), null)
})

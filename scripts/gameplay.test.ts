import { runMembers as resolveRunMembers, runDungeon as resolveRunDungeon, runRng as dataRunRng } from '../src/sim/run-core'
import { initialRunState, checkpointRunState, runReducer } from '../src/sim/run-state'
import { appendFact, latestEventChoice, markExpeditionStart, markTold, normalizeLedger, pruneFacts, factsByItem, factsByMember, factById, EMPTY_LEDGER } from '../src/sim/fact-ledger'
import { tellExpedition } from '../src/sim/storyteller'
import { appendBio } from '../src/sim/bio'
import { MONSTER_AFFIXES } from '../src/sim/monster-affix'
import { memberGenerationState, restoreMemberGeneration } from '../src/sim/gen'
import { createRun, startStep, advanceRun, retreatRun, startTower, startTowerFloor, towerNext, settleTowerFloor, beginBattle, towerEncounterRaw } from './run-test-compat'
import assert from 'node:assert/strict'
import './mechanics.test'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import ts from 'typescript'
import { generateMember, grantExp, maxHpOf, levelTo } from '../src/sim/gen'
import { createBattle, stepBattle, toCombatant, applyHit, ENEMY_HP_MULT } from '../src/sim/combat'
import { processBossMechanics, bossIntents } from '../src/sim/mechanics'
import { runAutoAI } from '../src/sim/ai'
import { settleGrowth, moveTo, mapOptions, currentNode, nextBossEncounter, REST_HEAL_PCT } from '../src/sim/run'
import { consequenceFiresIn, rollGuildEvent } from '../src/sim/guild-events'
import { CONDITION_BY_ID } from '../src/data/conditions'
import { baseEffects } from '../src/data/base'
import { restStamina, spendRetreatStamina } from '../src/sim/stamina'
import { COMMISSIONS } from '../src/data/kingdom'
import { terrainEntryReward } from '../src/sim/conditions'
import { runRng, int } from '../src/sim/run-core'
import { towerEnemyScale, insureNextTowerFloor } from '../src/sim/tower'
import { redeemCost, sellValue } from '../src/sim/tavern'
import { rollDrop, rollWaveDrop, rollBossDrops, dungeonItemTier, describeItem } from '../src/sim/loot'
import { wishDone } from '../src/sim/wish'
import { assignTrait, waveDropBonus } from '../src/sim/member-traits'
import { attemptHeal, healingTerms, settleScars, rollScarChance, RETREAT_SCAR_CHANCE, canGainScar, rollScar, ageFaints, scarStatName } from '../src/sim/scars'
import { consumeIntelReveal, verifyIntelFor, INTEL_STOCK_CAP } from '../src/sim/intel'
import { applyDeathShock, applyMoraleDelta } from '../src/sim/morale'
import { settleEncounter, type EncounterGuild } from '../src/sim/settlement'
import { createRng, createStatefulRng, newRngSeed, int } from '../src/sim/rng'
import { sweepExpiredCommissions, newKingdomState } from '../src/sim/kingdom'
import { seedChronicle, chronicleRaw, chronicleRefusal } from '../src/sim/chronicle'
import { ITEM_BASES } from '../src/data/items'
import { AFFIXES } from '../src/data/affixes'
import { BLACKMOSS, RUSTMINE, ASHFIELD, FROSTGRAVE, ABYSSALTAR, THORNHOLD, DUNGEONS } from '../src/data/dungeons'
import { EMBERPASS, SCALEHAVEN, FIRERIDGE, PILGRIMPATH, FORGEWORKS, DRAGONMAW } from '../src/data/dungeons-r2'
import { ECONOMY } from '../src/data/economy'
import { playtestAllows } from '../src/data/regions'
import { migrate, saveGuild, loadGuildSave, exportSave, importSave, sanitizeMembers, SAVE_VERSION, combatSaveDue } from '../src/state/save'
import { createGuildItems, itemStateFromSave, resolveMembers, serializeGuildItems, inventoryItems, relicItems,
  addInventoryItems, applyEncounterItems, equipRegisteredItem, removeInventoryItem, redeemRegisteredRelic, registerMemberItems,
  assertItemOwnership } from '../src/state/item-registry'
import { newStatistics, recordStatistics, expeditionStatistics, normalizeStatistics, exportStatistics, totalGoldEarned, winRate } from '../src/sim/statistics'
import { GUILD_EVENTS, EVENT_CHANCE } from '../src/data/guild-events'
import { rollGuildEvent, eventPool, consequenceFiresIn, consequenceOf, SECOND_ACT_IDS, eventCount, pickOutcome } from '../src/sim/guild-events'
import type { Member, Slot } from '../src/sim/types'

const squad = () => ['guard', 'priest', 'ranger'].map((j, i) => generateMember(j as Member['job'], 5, 901 + i))
const item = (id: string) => rollDrop(id, () => 0.4)

test('dragon-scale and heavy-plate mitigate HP, shields, threat and displayed damage consistently', () => {
  for (const traits of [['dragon-scale'], ['heavy-plate'], ['dragon-scale', 'heavy-plate']]) {
    const b = createBattle(squad(), EMBERPASS, 'enc-dragonkin', 123)
    const attacker = b.combatants.find(c => c.team === 'guild')!
    const target = b.combatants.find(c => c.team === 'enemy')!
    target.traits = traits
    target.threat[attacker.id] = 0
    const reduced = traits.length === 2 ? 30 : traits[0] === 'dragon-scale' ? 50 : 60
    const hp = target.hp
    applyHit(b, attacker, target, 100, 'test', { crit: true })
    assert.equal(hp - target.hp, reduced)
    assert.equal(target.threat[attacker.id], reduced)
    assert.equal(b.events.filter(e => e.type === 'damage').at(-1)!.amount, reduced)
    const nextHp = target.hp
    applyHit(b, attacker, target, 100, 'test', { crit: false })
    assert.equal(nextHp - target.hp, 100, 'plate is one-use; scales only mitigate crits')
  }
  const b = createBattle(squad(), EMBERPASS, 'enc-dragonkin', 123)
  const target = b.combatants.find(c => c.team === 'enemy')!
  target.absorbShield = 40
  const hp = target.hp
  applyHit(b, b.combatants[0], target, 100, 'test', { crit: true })
  assert.equal(hp - target.hp, 10)
  assert.equal(target.absorbShield, 0)
})

test('emberpass wave telegraphs respect spread and fire resistance without boss-only effects', () => {
  const damage = (spread: boolean, resist: number) => {
    const b = createBattle(squad(), EMBERPASS, 'enc-dragonkin', 321)
    const breather = b.combatants.find(c => c.name === '龙裔吐息手')!
    assert(!breather.boss)
    const guild = b.combatants.filter(c => c.team === 'guild')
    for (const c of guild) { c.hp = c.maxHp = 1000; c.fireResist = resist; c.legacyBulwark = true }
    b.commands.stance = spread ? 'spread' : 'standard'
    b.tick = 45
    processBossMechanics(b)
    assert(bossIntents(b).telegraphing)
    assert.equal(breather.mech!['telegraph-aoe'].until, 75)
    b.tick = 75
    processBossMechanics(b)
    assert(!bossIntents(b).telegraphing)
    assert(guild.every(c => !c.scarMechanicHits))
    assert(b.log.some(l => l.text.includes('灼风吐息')))
    return guild.reduce((n, c) => n + 1000 - c.hp, 0)
  }
  assert.equal(damage(false, 0), 234, 'small enemies do not trigger boss-only bulwark')
  assert.equal(damage(false, 0.5), 117)
  assert(damage(true, 0) < damage(false, 0) / 2)
})

test('emberpass chanter has a real interruptible cast, not an instant heal skill', () => {
  for (const interrupt of [true, false]) {
    const b = createBattle(squad(), EMBERPASS, 'enc-pilgrims', 555)
    b.combatants[0].weaponFamily = 'axe' // R5.3c:1.0 打断累积(0.25 规则的单测在 weapon-uniques)
    const chanter = b.combatants.find(c => c.name === '唱诗朝圣者')!
    assert(!chanter.boss)
    assert.equal(chanter.skills.length, 0)
    for (const c of b.combatants.filter(c => c.team === 'enemy')) c.hp -= 300
    const ally = b.combatants.find(c => c.name === '朝圣狂徒')!
    const hp = ally.hp
    b.tick = 75; processBossMechanics(b)
    assert.equal(bossIntents(b).casterId, chanter.id)
    assert.equal(chanter.mech!['cast-heal'].until, 115)
    if (interrupt) {
      applyHit(b, b.combatants[0], chanter, 110, 'test')
      b.tick = 76; processBossMechanics(b)
      assert(b.events.some(e => e.type === 'interrupted' && e.targetId === chanter.id))
    }
    b.tick = 115; processBossMechanics(b)
    assert.equal(ally.hp - hp, interrupt ? 0 : 180)
  }
})

test('chanter last-tick interrupt and death cancel healing; damage at deadline does not interrupt', () => {
  for (const mode of ['last-tick', 'deadline', 'dead'] as const) {
    const b = createBattle(squad(), EMBERPASS, 'enc-pilgrims', 557)
    b.combatants[0].weaponFamily = 'axe' // R5.3c:1.0 打断累积
    const chanter = b.combatants.find(c => c.name === '唱诗朝圣者')!
    const ally = b.combatants.find(c => c.name === '朝圣狂徒')!
    ally.hp -= 300
    const hp = ally.hp
    b.tick = 75; processBossMechanics(b)
    b.tick = mode === 'deadline' ? 115 : 114
    applyHit(b, b.combatants[0], chanter, mode === 'dead' ? chanter.hp : 110, 'test')
    b.tick = 115; processBossMechanics(b)
    assert.equal(ally.hp - hp, mode === 'deadline' ? 180 : 0)
    assert.equal(b.events.filter(e => e.type === 'interrupted').length, mode === 'last-tick' ? 1 : 0)
  }
})

test('emberpass boss summons exactly fanatic and chanter once between slam windows', () => {
  const b = createBattle(squad(), EMBERPASS, 'enc-kazraxes', 111)
  const boss = b.combatants.find(c => c.boss)!
  boss.hp = boss.maxHp * 0.59
  b.tick = 100; processBossMechanics(b)
  assert.equal(boss.mech!['telegraph-aoe'].until, 130)
  assert(!boss.mech!['summon'].fired)
  b.tick = 130; processBossMechanics(b)
  b.tick = 189; processBossMechanics(b)
  assert(!boss.mech!['summon'].fired)
  b.tick = 190; processBossMechanics(b)
  const adds = b.combatants.filter(c => c.team === 'enemy' && !c.boss)
  assert.deepEqual(adds.map(c => c.name), ['朝圣狂徒', '唱诗朝圣者'])
  assert.equal(boss.mech!['telegraph-aoe'].next, 250)
  assert.equal(adds[1].bossMechanics![0].kind, 'cast-heal')
  b.tick = 249; processBossMechanics(b)
  assert.equal(b.combatants.filter(c => c.team === 'enemy' && !c.boss).length, 2)
  assert.equal(boss.mech!['telegraph-aoe'].until, undefined)
  const other = createBattle(squad(), EMBERPASS, 'enc-pilgrims', 111)
  assert.deepEqual(other.combatants.find(c => c.name === '唱诗朝圣者')!.mech, {})
})

test('cautious auto captain can respond to regular-enemy telegraphs and heal casts', () => {
  const b = createBattle(squad(), EMBERPASS, 'enc-mix', 222)
  b.commands.autoMode = true
  b.combatants[0].personality = { bravery: 40, caution: 70, greed: 40, loyalty: 40 }
  b.tick = 45; processBossMechanics(b); runAutoAI(b)
  assert.equal(b.commands.stance, 'spread')
  b.tick = 75; processBossMechanics(b); runAutoAI(b)
  assert.equal(b.commands.focusId, b.combatants.find(c => c.name === '唱诗朝圣者')!.id)
})

test('free visitor signing is synchronous and idempotent before React renders again', () => {
  const initial = squad().slice(0, 2)
  const visitor = { member: squad()[0], story: 'test visitor' }
  let roster = [...initial], logs = 0, wishes = 0, bioCount = 0
  const membersRef = { current: roster }
  const scope: Record<string, any> = {
    visitor, membersRef, runRef: { current: null }, towerRunRef: { current: null },
    aliveCount: () => membersRef.current.filter(m => m.alive).length,
    ROSTER_CAP: 6,
    rollWishFor: () => { wishes++ }, rollTraitFor: () => {},
    setMembers: (next: Member[] | ((old: Member[]) => Member[])) => {
      roster = typeof next === 'function' ? next(roster) : next
    },
    day: 1, chronicleRecruit: () => 'recruited',
    logChronicle: () => { logs++ }, setVisitor: () => {},
    appendBio: (_m: Member, _e: unknown) => { bioCount++ }, // U34:signVisitor 写当事人生平
  }
  scope.itemOwnershipRef = {current:createGuildItems(initial)}
  scope.setItemOwnership = () => {}
  scope.updateItemOwnership = handler('updateItemOwnership', scope)
  const sign = handler('signVisitor', scope)
  sign()
  sign()
  assert.equal(roster.filter(m => m.id === visitor.member.id).length, 1)
  assert.equal(roster.length, 3)
  assert.equal(membersRef.current.length, 3)
  assert.equal(logs, 1)
  assert.equal(wishes, 1)
  assert.equal(bioCount, 1) // U34:入职写当事人生平,只写一次(幂等)
})

test('free visitor cannot bypass roster capacity or recruit during a run or tower', () => {
  for (const mode of ['full', 'expedition', 'tower'] as const) {
    const roster = [...squad(), ...squad()]
    const ref = { current: mode === 'full' ? roster : roster.slice(0, 2) }
    const unexpected = () => assert.fail(`visitor recruited during ${mode}`)
    handler('signVisitor', {
      visitor: { member: squad()[0] }, membersRef: ref, ROSTER_CAP: 6,
      runRef: { current: mode === 'expedition' ? {} : null },
      towerRunRef: { current: mode === 'tower' ? {} : null },
      aliveCount: () => ref.current.length,
      rollWishFor: unexpected, rollTraitFor: unexpected, setMembers: unexpected,
      logChronicle: unexpected, setVisitor: unexpected,
    })()
  }
})

test('equipment sale and new relic prices use registered tier regardless of base ID spelling', () => {
  for (const base of Object.values(ITEM_BASES)) {
    for (const quality of ['white', 'green', 'purple'] as const) {
      const equipment = { ...item(base.id), quality }
      const qualityMult = quality === 'purple' ? 1.4 : quality === 'green' ? 1.15 : 1
      const expected = (base.tier * ECONOMY.sell.perTier + equipment.rolls.length * ECONOMY.sell.perRoll) * qualityMult
      assert.equal(sellValue(equipment), Math.round(expected), `${base.id}/${quality}`)
      assert.equal(sellValue(equipment, 1.2), Math.round(expected * 1.2))
      const redeemMult = quality === 'purple' ? 1.5 : quality === 'green' ? 1.2 : 1
      assert.equal(redeemCost(equipment), Math.ceil(Math.round(expected) * redeemMult * 1.5))
      assert.equal(redeemCost(equipment, 6), Math.ceil(Math.round(expected) * redeemMult * 1.5 * 2))
    }
  }
})

test('normal dungeon enemies stay fixed when the same roster levels up', () => {
  const low = squad()
  const high = structuredClone(low)
  high.forEach(m => levelTo(m, 15))
  const project = (b: ReturnType<typeof createBattle>) => b.combatants
    .filter(c => c.team === 'enemy').map(c => [c.name, c.maxHp, c.attack, c.defense, c.speed])
  for (const dungeon of [BLACKMOSS, RUSTMINE, ASHFIELD, FROSTGRAVE, ABYSSALTAR, THORNHOLD,
    EMBERPASS, SCALEHAVEN, FIRERIDGE, PILGRIMPATH, FORGEWORKS, DRAGONMAW]) {
    for (const enc of dungeon.encounters) {
      for (const modifiers of [{}, { elite: true }, { rareHunt: 1.5 }]) {
        assert.deepEqual(
          project(createBattle(low, dungeon, enc.id, 123, 0, 0, true, undefined, modifiers)),
          project(createBattle(high, dungeon, enc.id, 123, 0, 0, true, undefined, modifiers)),
          `${dungeon.id}/${enc.id}/${JSON.stringify(modifiers)}`,
        )
      }
    }
  }
})

test('leveling the same equipped roster improves old-map combat across paired seeds', () => {
  let lowWins = 0, highWins = 0, lowTicks = 0, highTicks = 0
  for (let seed = 1; seed <= 50; seed++) {
    const low = ['guard', 'priest', 'ranger'].map((job, i) => {
      const m = generateMember(job as Member['job'], 5, 620000 + seed * 10 + i, { race: 'human' })
      m.equipment = { weapon: item('wpn-t1-sword'), armor: item('arm-t1-mail'), trinket: item('trk-t1-band') }
      m.hp = maxHpOf(m)
      return m
    })
    const high = structuredClone(low)
    high.forEach(m => levelTo(m, 11))
    const results = [low, high].map(members => {
      const b = createBattle(members, BLACKMOSS, 'enc-grush', seed, 0, 0, false)
      b.commands.autoMode = true
      while (b.status === 'running' && b.tick < 6000) stepBattle(b)
      assert.notEqual(b.status, 'running', `timeout seed ${seed}`)
      return b
    })
    lowWins += Number(results[0].status === 'guild-win')
    highWins += Number(results[1].status === 'guild-win')
    // Compare duration only on paired victories; an early defeat is not a faster clear.
    if (results.every(b => b.status === 'guild-win')) {
      lowTicks += results[0].tick
      highTicks += results[1].tick
    }
  }
  assert(highWins >= lowWins)
  assert(lowTicks > 0)
  assert(highTicks < lowTicks)
})

test('legacy preview full-health sentinel is resolved on import and load without healing injuries', () => {
  const text = readFileSync('docs/dev-save.txt', 'utf8').trim()
  const loaded = importSave(text)!
  assert(loaded)
  const itemState = itemStateFromSave(loaded), resolved = resolveMembers(loaded.members, itemState)
  assert(resolved.every(m => m.hp === maxHpOf(m)))
  const wounded = { ...resolved[0], hp: 7 }
  const fallen = { ...resolved[1], alive: false, hp: 0, equipment: {} }
  const sentinel = { ...resolved[2], hp: -1 }
  const input = [wounded, fallen, sentinel]
  const partialItems = createGuildItems(input)
  const normalized = sanitizeMembers(input)
  assert.equal(normalized[0].hp, 7)
  assert.equal(normalized[1].hp, 0)
  assert.equal(normalized[1].alive, false)
  assert.equal(normalized[2].hp, maxHpOf(sentinel))
  assert.equal(sentinel.hp, -1)
  assert.deepEqual(sanitizeMembers(normalized), normalized)
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => JSON.stringify({ ...loaded, ...serializeGuildItems(partialItems, input) }) },
    })
    const reloaded = loadGuildSave()!
    assert.deepEqual(resolveMembers(reloaded.members, itemStateFromSave(reloaded)), sanitizeMembers(resolveMembers(input, partialItems)))
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})

test('tower rotations follow towerEncounterRaw(单一来源):早期固定池,9 层起全版图', () => {
  const run = startTower(squad(), 301, { heal: 0, fury: 0 })
  for (let floor = 1; floor <= 18; floor++) {
    if (floor > 1) towerNext(run, 301)
    const raw = towerEncounterRaw(floor)
    const expected = raw.kind === 'boss' ? [raw.entry.boss] : raw.group
    const enemies = run.battle!.combatants.filter(c => c.team === 'enemy')
    const stripAffix = (n: string) => n.replace(new RegExp(`(·(?:${Object.values(MONSTER_AFFIXES).map((d) => d.name).join('|')}))+$`), '')
    assert.deepEqual(enemies.map(c => stripAffix(c.name)), expected.map(c => c.name), `floor ${floor}`)
    enemies.forEach((c, i) => {
      assert.equal(c.maxHp, Math.round(expected[i].maxHp * towerEnemyScale(floor)))
      assert.equal(c.attack, Math.round(expected[i].attack * towerEnemyScale(floor)))
    })
  }
  // #3.1:9 层起内容池扩到全版图(杂兵组/boss 池都多于早期)
  const deepWaves = new Set([...Object.values(BLACKMOSS.enemyGroups).flat().map(e => e.name),
    ...DUNGEONS.filter(d => !['blackmoss', 'rustmine'].includes(d.id)).flatMap(d => Object.values(d.enemyGroups).flat().map(e => e.name))])
  const floor10 = towerEncounterRaw(10)
  assert.equal(floor10.kind, 'wave')
  if (floor10.kind === 'wave') assert(floor10.group.every(e => deepWaves.has(e.name)), '深层杂兵应来自全版图池')
})

test('tower summons real scaled adds once without mutating source dungeon definitions', () => {
  const before = JSON.stringify([BLACKMOSS, RUSTMINE])
  // #3.1:轮换走 towerEncounterRaw 单一来源(12 层起轮到版图二 boss,召唤组随 boss 走)
  const entries = [3, 6, 9, 12].map((floor) => {
    const raw = towerEncounterRaw(floor)
    assert.equal(raw.kind, 'boss')
    if (raw.kind !== 'boss') throw new Error('boss floor')
    const summon = raw.entry.boss.mechanics.find((m) => m.kind === 'summon')!
    return { floor, group: raw.entry.groups[String(summon.params.groupId)] }
  })
  for (const { floor, group } of entries) {
    const run = startTower(squad(), 302, { heal: 0, fury: 0 })
    run.floor = floor
    startTowerFloor(run, 302)
    const battle = run.battle!
    const boss = battle.combatants.find(c => c.boss)!
    const summon = boss.bossMechanics!.find(m => m.kind === 'summon')!
    assert.equal(boss.summonPool!.length, group.length)
    boss.hp = Math.floor(boss.maxHp * Number(summon.params.atHpPct))
    processBossMechanics(battle)
    const adds = battle.combatants.filter(c => c.team === 'enemy' && !c.boss)
    assert.equal(adds.length, Number(summon.params.count))
    adds.forEach((c, i) => {
      assert.equal(c.name, group[i].name)
      assert.equal(c.maxHp, Math.round(group[i].maxHp * towerEnemyScale(floor)))
      assert.equal(c.attack, Math.round(group[i].attack * towerEnemyScale(floor)))
    })
    processBossMechanics(battle)
    assert.equal(battle.combatants.filter(c => c.team === 'enemy' && !c.boss).length, adds.length)
  }
  assert.equal(JSON.stringify([BLACKMOSS, RUSTMINE]), before)
})

test('third tower boss pulls a backliner, who returns after the duration expires', () => {
  const run = startTower(squad(), 303, { heal: 0, fury: 0 })
  run.floor = 9
  startTowerFloor(run, 303)
  const battle = run.battle!
  battle.tick = 120
  processBossMechanics(battle)
  const pulled = battle.events.find(e => e.type === 'pulled')!
  assert(pulled)
  const victim = battle.combatants.find(c => c.id === pulled.targetId)!
  assert.equal(victim.originalPosition, 'back')
  assert.equal(victim.position, 'front')
  assert.equal(victim.pulledUntilTick, 720)
  // 隔离归位计时,防止期间的普攻/再次拉拽干扰边界断言。
  const boss = battle.combatants.find(c => c.boss)!
  boss.bossMechanics = []
  for (const c of battle.combatants) c.cooldownLeft = 1000
  battle.tick = 719
  stepBattle(battle)
  assert.equal(victim.position, 'back')
})

// R2 界面拆分(U29):处理器/回调随界面搬进 src/ui/screens/*——抽取机制跨全部 UI 源文件搜索。
const UI_SOURCES = ['src/App.tsx', 'src/ui/controllers.ts', ...readdirSync('src/ui/screens').filter((f) => f.endsWith('.tsx') || f.endsWith('.ts')).map((f) => `src/ui/screens/${f}`)]
const UI_ASTS = UI_SOURCES.map((path) => ({
  path,
  ast: ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
}))
function findDeclaration(name: string): { text: string } | undefined {
  for (const { ast } of UI_ASTS) {
    let found: ts.Expression | undefined
    function visit(n: ts.Node) {
      if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) found = n.initializer
      ts.forEachChild(n, visit)
    }
    visit(ast)
    if (found) return { text: found.getText(ast) }
  }
  return undefined
}
function findArrow(snippet: string): { text: string } | undefined {
  let best: { ast: ts.SourceFile; node: ts.ArrowFunction } | undefined
  for (const { ast } of UI_ASTS) {
    function visit(n: ts.Node) {
      if (ts.isArrowFunction(n) && n.getText(ast).includes(snippet) && (!best || n.getWidth(ast) < best.node.getWidth(best.ast))) best = { ast, node: n }
      ts.forEachChild(n, visit)
    }
    visit(ast)
  }
  return best ? { text: best.node.getText(best.ast) } : undefined
}
function handler(name: string, scope: Record<string, unknown>) {
  scope = rngScope(scope)
  const decl = findDeclaration(name)
  assert(decl, name)
  const js = ts.transpileModule(`const fn = ${decl.text}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(scope), js + ';return fn;')(...Object.values(scope))
}

function callback(snippet: string, scope: Record<string, unknown>) {
  scope = rngScope(scope)
  const arrow = findArrow(snippet)
  assert(arrow, snippet)
  const js = ts.transpileModule(`const fn = ${arrow.text}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(scope), js + ';return fn;')(...Object.values(scope))
}

/** 旧界面测试改为显式注入新随机依赖，保留原来的脚本抽样与数值断言。 */
function rngScope(scope: Record<string, unknown>) {
  const random = (scope.Math as { random?: () => number } | undefined)?.random ?? (() => Math.random())
  const defaultProgress = initialRunState()
  return { initialRunState, checkpointRunState, memberGenerationState, restoreMemberGeneration,
    progress: defaultProgress, progressRef: { current: defaultProgress }, screen: 'game', visitor: null, publishProgress: () => {}, changeProgress: () => {}, setResumeNotice: () => {}, pendingEvent: null,
    combatSaveDue, lastCombatSaveRef: { current: 0 }, setSaveFailed: () => {}, day: 1, playtestAllows, logChronicle: () => {}, chronicleRaw: () => ({ text: '' }),
    appendBio: () => {}, // U4.1 生平(U34):App/controllers 个人叙事写入点,默认空实现(垫片第 10 次扩容)
    ageFaints: () => [], scarStatName: (s: string) => s, FAINT_DAYS: 4, setScarNotices: () => {}, // R4.2(U32):出发虚痕消退
    intelEntries: [], setIntelEntries: () => {}, setIntelStock: () => {}, intelStock: 3, // U36:情报条目化(出发补货源/消耗真情报)
    restStamina: () => {}, setMembers: (() => {}) as never, // #4.1 精力天数恢复(垫片第 11 次扩容)
    rationCost: () => 0, maintenanceCost: () => 0, plannedLayers: () => 6, // #4.2 补给成本(垫片第 12 次扩容;0 值=零影响)
    rosterCap: 6, staminaRestMult: 1, baseEffects, // #4.4 宿舍派生值(垫片第 13 次扩容;App 常量改 baseEffects 派生)
    advanceGuildDay: () => {}, // #4.6 天收口(垫片第 14 次扩容;公会日推进单一入口)
    gold: 999999, setGold: () => {}, buildings: {}, // startExpedition 口粮守卫读 deps.gold/setGold——默认恒走「足额」分支且不记账,不扰动旧断言;settleBattleEnd 读 buildings.smithy(默认 0 级)
    consumeIntelReveal: (entries: unknown[]) => ({ entries, bonus: 0 }), verifyIntelFor: (entries: unknown[]) => ({ entries, notes: [] }), INTEL_STOCK_CAP: 3,
    scarNotices: [] as string[], setConfirmAsk: () => {}, battleSpeed: 1, setBattleSpeed: () => {}, volume: 0.5, setVolumeState: () => {},
    lastRetreatRunRef: { current: null }, goBack: () => {},
    __PLAYTEST__: false, playMeta: { startedAt: 0, expeditions: 0, retreats: 0, signatureUses: 0 }, setPlayMeta: () => {}, setPlaytestEnding: () => {},
    appendFact, latestEventChoice, markExpeditionStart, markTold, normalizeLedger, pruneFacts, factsByItem, factsByMember, factById, EMPTY_LEDGER, tellExpedition, createRng,
    factLedger: { nextId: 1, facts: [] }, factLedgerRef: { current: { nextId: 1, facts: [] } }, setFactLedger: () => {},
    storyCursorRef: { current: 0 }, expeditionStartFactRef: { current: 0 },
    weaponTraining: [] as string[], weaponTrainingRef: { current: [] as string[] }, setWeaponTraining: () => {},
    applyRetreatDeduction: () => {}, finishExpedition: () => {}, setDungeonMastery: () => {},
    go: () => {}, back: () => {}, continueScreen: () => 'hall' as const, setScreen: () => {},
    hintsSeen: [] as string[], hintsSeenRef: { current: [] as string[] }, dismissHint: () => {},
    membersRef: { current: (scope.expedition ?? scope.members ?? []) as Member[] },
    runMembers: (r: any, ms: Member[]) => r.memberIds ? resolveRunMembers(r, ms?.length ? ms : r.members ?? []) : r.members,
    runDungeon: (r: any) => r.dungeonId ? resolveRunDungeon(r) : r.dungeon,
    runRng: (r: any) => r.rng ?? dataRunRng(r), int, createStatefulRng, newRngSeed, createGuildItems, itemStateFromSave, resolveMembers, serializeGuildItems,
    addInventoryItems, applyEncounterItems, equipRegisteredItem, removeInventoryItem, redeemRegisteredRelic, registerMemberItems, guildRng: random,
    guildRngRef: { current: createStatefulRng(7777) }, chronicleRef: { current: [] }, ...scope }
}

/** 运行真实 App 的 applyOutcome 和结算回调；不再为每种玩法造一份假结算。 */
function settlementUi(members: Member[], intelEntries: any[] = []) {
  const state: any = {
    members, intelEntries, manual: [], kingdom: newKingdomState(), dungeonMastery: {}, towerBest: 0,
    recruitCooldown: 2, day: 1, buildings: {}, chronicle: [], inventory: [], lastDrops: [],
    pendingRelics: [], memorial: [], gold: 0, starMarrow: 0, blessing: 0, statistics: newStatistics(), scarNotices: [],
  }
  const scope: any = {
    runRef: { current: null }, towerRunRef: { current: null }, membersRef: { current: members },
    intelEntries, verifyIntelFor,
    itemOwnershipRef: { current: createGuildItems(members) },
    chronicleRef: { current: [] }, recordStatistics, seedChronicle, settleEncounter,
    setRun: () => {}, setTowerRun: () => {}, setTowerRunning: () => {}, drainAndSync: () => {},
    sfxVictory: () => {}, sfxDefeat: () => {}, int, baseEffects: () => ({ towerRestHealPct: 0.2 }),
    playtestAllows, hintsSeen: [] as string[], factLedger: { nextId: 1, facts: [] }, factLedgerRef: { current: { nextId: 1, facts: [] } },
    markExpeditionStart, markTold, setPlaytestEnding: () => {},
    playMeta: { startedAt: 0, expeditions: 0, retreats: 0, signatureUses: 0 }, setPlayMeta: () => {},
    lastRetreatRunRef: { current: null }, goBack: () => {}, dismissHint: () => {},
    spendRetreatStamina, canGainScar, rollScar, RETREAT_SCAR_CHANCE, scarStatName,
    appendBio, // U34:applyOutcome 说书人块写当事人生平(真函数,bio 落在成员克隆上)
  }
  for (const key of ['Members', 'Manual', 'DungeonMastery', 'TowerBest', 'RecruitCooldown', 'Inventory', 'LastDrops', 'PendingRelics', 'Memorial', 'Gold', 'StarMarrow', 'Blessing', 'Statistics', 'Chronicle', 'ScarNotices', 'FactLedger', 'IntelEntries']) {
    scope['set' + key] = (v: any) => {
      const field = key[0].toLowerCase() + key.slice(1)
      state[field] = typeof v === 'function' ? v(state[field]) : v
    }
  }
  scope.updateKingdom = (v: unknown) => { state.kingdom = v }
  scope.playtestAllows = playtestAllows
  scope.setItemOwnership = (v: any) => { state.itemOwnership = v; state.inventory = inventoryItems(v); state.pendingRelics = relicItems(v) }
  scope.updateItemOwnership = handler('updateItemOwnership', scope)
  scope.updateItemOwnership(scope.itemOwnershipRef.current)
  scope.chronicleRaw = chronicleRaw
  scope.logChronicle = (entry: unknown) => {
    scope.chronicleRef.current = [...scope.chronicleRef.current, entry]
    scope.setChronicle(scope.chronicleRef.current)
  }
  scope.encounterGuild = (): EncounterGuild => ({ ...state, factLedger: scope.factLedgerRef.current, members: scope.membersRef.current, chronicle: scope.chronicleRef.current })
  scope.finishExpedition = handler('finishExpedition', scope)
  scope.applyOutcome = handler('applyOutcome', scope)
  return {
    state, scope,
    dungeon: handler('settleBattleEnd', scope),
    tower: callback("source: 'tower', run: current", scope),
  }
}

test('map retreat tells the current expedition story once without repeating encounter rewards, including restored rest checkpoints', () => {
  const ui = settlementUi(squad()), { scope, state } = ui
  const run = beginBattle(createRun(scope.membersRef.current, BLACKMOSS, 49), 49)
  markExpeditionStart(scope.factLedgerRef.current)
  run.battle!.status = 'guild-win'; scope.runRef.current = run
  ui.dungeon(run)
  assert.equal(scope.runRef.current.phase, 'rest')
  assert.equal(state.scarNotices.filter((x: string) => x.startsWith('📖')).length, 0)
  const [a, b] = scope.membersRef.current
  appendFact(scope.factLedgerRef.current, 1, { kind: 'bond-star', actors: [a.id, b.id],
    names: { [a.id]: a.name, [b.id]: b.name }, refs: { stars: 3 } })
  // 模拟地图断点读回账本，随后通过真实撤退入口结案。
  scope.factLedgerRef.current = normalizeLedger(JSON.parse(JSON.stringify(scope.factLedgerRef.current)))
  Object.assign(scope, { autoLoopRef: { current: false }, retreatRun, expeditionStatistics,
    setRunning: () => {}, syncAll: () => {}, noteStatistics: () => {} })
  scope.applyRetreatDeduction = handler('applyRetreatDeduction', scope)
  const beforeGold = state.gold, beforeItems = state.inventory.length
  const retreat = handler('retreat', scope)
  retreat()
  assert.equal(scope.runRef.current.phase, 'retreated')
  const after = JSON.stringify(state)
  retreat()
  assert.equal(JSON.stringify(state), after, '重复点击不能再扣钱或讲故事')
  assert.equal(state.gold, beforeGold - scope.runRef.current.retreatCost.gold)
  assert.equal(state.inventory.length, beforeItems)
  assert.equal(state.scarNotices.filter((x: string) => x.startsWith('📖')).length, 1)
  assert.equal(state.chronicle.filter((x: any) => x.text.startsWith('📖')).length, 1)
  assert.equal(state.factLedger.toldThrough, state.factLedger.nextId)
  assert(scope.membersRef.current.some((m: Member) => m.bio?.some(x => x.kind === 'story')))
})

test('battle terminal story is persisted once and stale/loaded terminal callbacks cannot repeat rewards or stories', () => {
  for (const status of ['retreated', 'guild-wipe'] as const) {
    const roster = squad(); roster[0].equipment.weapon = item('wpn-t1-sword')
    const ui = settlementUi(roster), { scope, state } = ui
    const run = beginBattle(createRun(roster, BLACKMOSS, 49), 49)
    markExpeditionStart(scope.factLedgerRef.current)
    run.battle!.status = status
    const victim = run.battle!.combatants.find(c => c.memberId === roster[0].id)!
    victim.alive = false; victim.hp = 0
    scope.runRef.current = run
    ui.dungeon(run)
    assert.equal(state.scarNotices.filter((x: string) => x.startsWith('📖')).length, 1)
    assert.equal(state.factLedger.toldThrough, state.factLedger.nextId)
    const before = JSON.stringify(state)
    ui.dungeon(run)
    scope.factLedgerRef.current = normalizeLedger(JSON.parse(JSON.stringify(state.factLedger)))
    ui.dungeon(scope.runRef.current)
    assert.equal(JSON.stringify(state), before)
  }
})

test('D1 intel verifies only after a battle and a dungeon terminal; intermediate wins, zero-battle retreat and tower do not verify', () => {
  const intel = () => [
    { id: 1, dungeonId: 'blackmoss', kind: 'boss', text: '沼泽首领情报', real: true, day: 1 },
    { id: 2, dungeonId: 'blackmoss', kind: 'mob', text: '贩子的假消息', real: false, day: 1 },
    { id: 3, dungeonId: 'rustmine', kind: 'mob', text: '矿道见闻', real: true, day: 1 },
  ]
  for (const outcome of ['map-retreat', 'retreated', 'guild-wipe', 'victory', 'zero', 'tower']) {
    const ui = settlementUi(squad(), intel()), { scope, state } = ui
    if (outcome === 'tower') {
      const r = startTower(scope.membersRef.current, 53)
      r.battle!.status = 'guild-win'; scope.towerRunRef.current = r
      ui.tower(r)
    } else {
      const r = createRun(scope.membersRef.current, BLACKMOSS, 49)
      scope.runRef.current = r
      if (outcome !== 'zero') {
        beginBattle(r, 49)
        if (outcome === 'victory') {
          const boss = r.map.layers.at(-1)![0]
          r.nodeId = boss.id; r.path = [boss.id]
          r.battle!.encounterId = BLACKMOSS.encounters.filter(e => e.kind === 'boss').at(-1)!.id
        }
        r.battle!.status = outcome === 'retreated' ? 'retreated' : outcome === 'guild-wipe' ? 'guild-wipe' : 'guild-win'
        ui.dungeon(r)
      }
      if (outcome === 'map-retreat' || outcome === 'zero') {
        assert(state.intelEntries.every((e: any) => e.verified === undefined), '中途胜场不验真')
        Object.assign(scope, { autoLoopRef: { current: false }, retreatRun, expeditionStatistics,
          setRunning: () => {}, syncAll: () => {}, noteStatistics: () => {} })
        const retreat = handler('retreat', scope)
        retreat(); const after = JSON.stringify(state); retreat()
        assert.equal(JSON.stringify(state), after)
      }
      if (outcome === 'victory') assert.equal(scope.runRef.current.phase, 'victory')
    }
    const verified = !['zero', 'tower'].includes(outcome)
    assert.equal(state.intelEntries[0].verified, verified ? true : undefined, outcome)
    assert.equal(state.intelEntries[1].verified, verified ? true : undefined, outcome)
    assert.equal(state.intelEntries[2].verified, undefined, '其他副本不验真')
    assert.equal(state.scarNotices.filter((n: string) => n.startsWith('情报验证')).length, verified ? 2 : 0)
  }
})

test('actual item callbacks: atomic equip, sell and dismantle keep one owner and ignore repeated stale selections', () => {
  const members = squad(); members[0].equipment.weapon = item('wpn-t1-sword')
  const ui = settlementUi(members), {state,scope} = ui
  let wishes = 0
  Object.assign(scope,{day:1,fx:{sellMult:1.2},sellValue,ITEM_BASES,describeItem,sfxCoin:()=>{},logChronicle:()=>{},chronicleRaw:()=>({}),checkWishes:()=>{wishes++},
    setConfirmAsk:(ask:any)=>ask.onOk(), // A16:变卖走确认弹窗,测试桩模拟玩家点确定
    gainGold:(n:number,source:string)=>{assert.equal(source,'sales');state.gold+=n}})
  const receive = handler('receiveItems',scope)
  receive([item('wpn-t3-dawn'),item('arm-t3-bulwark')],true)
  const oldUid = members[0].equipment.weapon!.id, weaponUid = state.inventory[0].id, armorUid = state.inventory[1].id
  const equip = handler('equip',scope)
  equip(members[0],'weapon','missing'); assert.equal(members[0].equipment.weapon!.id,oldUid)
  equip(members[0],'weapon',weaponUid); equip(members[0],'weapon',weaponUid)
  assert.equal(wishes,1); assert.equal(members[0].equipment.weapon!.id,weaponUid)
  assert.equal(state.inventory.filter((i:any)=>i.id===oldUid).length,1)
  equip(members[1],'weapon',weaponUid); assert.equal(members[1].equipment.weapon,undefined)
  const oldPrice = sellValue(scope.itemOwnershipRef.current.items[oldUid],1.2)
  const sell = handler('sellItem',scope)
  sell(oldUid); sell(oldUid)
  assert.equal(state.gold,oldPrice)
  const dismantle = handler('dismantleT3',scope)
  dismantle(armorUid); dismantle(armorUid)
  assert.equal(state.starMarrow,2)
  assert.equal(scope.itemOwnershipRef.current.items[oldUid],undefined)
  assert.equal(scope.itemOwnershipRef.current.items[armorUid],undefined)
  assert.equal(scope.itemOwnershipRef.current.items[weaponUid],members[0].equipment.weapon)
  assertItemOwnership(scope.itemOwnershipRef.current)
  scope.runRef.current={}
  equip(members[0],'weapon',''); sell(weaponUid)
  assert.equal(members[0].equipment.weapon!.id,weaponUid)
})

test('actual item updates preserve expedition member references and serialize only UID ownership', () => {
  const members = squad(); members[0].equipment.weapon = item('wpn-t1-sword')
  const ui = settlementUi(members), {scope,state} = ui
  const run = beginBattle(createRun(members,BLACKMOSS,49),49)
  scope.runRef.current=run
  const before = run.members[0]
  handler('receiveItems',scope)([item('wpn-t3-dawn')],true)
  assert.equal(scope.membersRef.current[0],before)
  assert.equal(run.members[0],scope.membersRef.current[0])
  scope.membersRef.current[0].hp=7
  assert.equal(run.members[0].hp,7)
  const stored=serializeGuildItems(scope.itemOwnershipRef.current,state.members)
  assert.equal(typeof stored.members[0].equipment.weapon,'string')
  assert.equal(typeof stored.inventory[0],'string')
  assert.equal(Object.keys(stored.items).length,2)
  assert.equal(stored.itemSeq,3)
  assertItemOwnership(itemStateFromSave(stored))
})

test('actual tower entry starts a new loot display while retaining previously exchanged inventory', () => {
  const ui=settlementUi(squad()),{scope,state}=ui
  handler('receiveItems',scope)([item('wpn-t3-dawn')],true)
  const uid=state.inventory[0].id
  Object.assign(scope,{expedition:scope.membersRef.current,pendingEvent:null,startTower,potions:{heal:3,fury:3},
    setBattle:()=>{},lastBattleRef:{current:null}})
  handler('enterTower',scope)()
  assert.deepEqual(state.lastDrops,[])
  assert.equal(state.inventory.length,1)
  assert.equal(state.inventory[0].id,uid)
  assert.equal(scope.itemOwnershipRef.current.items[uid],state.inventory[0])
  assertItemOwnership(scope.itemOwnershipRef.current)
})

test('actual relic redemption is keyed by UID, preserves price and identity, and cannot redeem twice', () => {
  const members=squad();members[0].equipment.weapon=item('wpn-t3-dawn')
  const ui=settlementUi(members),{state,scope}=ui
  const t=startTower(members,12)
  const victim=t.battle!.combatants.find(c=>c.memberId===members[0].id)!
  victim.alive=false;victim.hp=0;t.battle!.status='retreated';scope.towerRunRef.current=t
  ui.tower()
  const relic=state.pendingRelics[0],uid=relic.uid
  scope.towerRunRef.current=null
  Object.assign(scope,{gold:relic.redeem-1,day:1,logChronicle:()=>{},chronicleRaw:()=>({})})
  handler('redeemRelic',scope)(uid);assert.equal(state.pendingRelics.length,1)
  scope.gold=state.gold=900
  const redeem=handler('redeemRelic',scope)
  redeem(uid);redeem(uid)
  assert.equal(state.gold,900-relic.redeem)
  assert.equal(state.inventory.filter((i:any)=>i.id===uid).length,1)
  assert.equal(state.pendingRelics.length,0)
  assert.equal(state.inventory[0],scope.itemOwnershipRef.current.items[uid])
  assertItemOwnership(scope.itemOwnershipRef.current)
})

test('actual training purchase/start callbacks: one charge, insufficient funds guarded, run consumes once', () => {
  let gold = 300, ready = false
  const trainingReadyRef = {current:false}, runRef = {current:null as any}, towerRunRef = {current:null}
  const buy = (balance: number) => callback('setTrainingReady(true)', {
    trainingReadyRef, gold:balance, runRef, towerRunRef,
    setTrainingReady:(v:boolean)=>{ready=v},setGold:(f:any)=>{gold=f(gold)},logChronicle:()=>{},chronicleRaw:()=>({}),day:1,sfxCoin:()=>{},
  })()
  buy(149); assert.equal(gold,300); assert.equal(ready,false)
  buy(gold); buy(gold); assert.equal(gold,150); assert.equal(ready,true)
  const expedition = squad()
  const start = handler('startExpedition', {
    pendingEvent:null,pendingConsequences:[],pendingDepartureRef:{current:null},
    runRef,towerRunRef,trainingReadyRef,expedition,activeDungeon:BLACKMOSS,refusesToMarch:()=>false,
    setDay:()=>{},setPendingConsequences:(f:any)=>f([]),setGuildBuffs:(f:any)=>f([]),growthSnapshotRef:{current:new Map()},
    powerScore:()=>1,bondStars:()=>0,createRun,seedRef:{current:1},SEED_BASE:31,memorialAura:()=>0,memorial:[],protectOn:true,potions:{heal:3,fury:3},
    setTrainingReady:(v:boolean)=>{ready=v},logChronicle:()=>{},chronicleRaw:()=>({}),day:1,autoLoopRef:{current:false},guildBuffs:[],rareHuntNext:null,
    setScarNotices:()=>{},setLastDrops:()=>{},rendererRef:{current:null},THEME_BY_DUNGEON:{},setRunning:()=>{},syncAll:()=>{},
    playtestAllows:()=>true,markExpeditionStart:()=>{},markTold:()=>{},setPlayMeta:()=>{},setPlaytestEnding:()=>{},
    factLedgerRef:{current:{nextId:1,facts:[]}},playMeta:{startedAt:0,expeditions:0,retreats:0,signatureUses:0},lastRetreatRunRef:{current:null},
  })
  start()
  assert.equal(runRef.current.trainingExpMultiplier,1.25); assert.equal(ready,false)
  runRef.current = null; start()
  assert.equal(runRef.current.trainingExpMultiplier,undefined)
})

test('actual tower death settlement: insured equipment returned once; uninsured charged, heroes stay dead', () => {
  for (const insured of [true,false]) {
    const members = squad(); members[0].equipment.weapon = item('wpn-t3-dawn')
    const t = startTower(members,1); t.battle!.status='guild-win'; settleTowerFloor(t)
    if (insured) insureNextTowerFloor(t,1000)
    towerNext(t,2)
    const victim = t.battle!.combatants.find(c=>c.memberId===members[0].id)!
    victim.alive=false; victim.hp=0; t.battle!.status='retreated'
    const ui = settlementUi(members)
    const equipment = members[0].equipment.weapon
    ui.scope.towerRunRef.current = t
    const { state } = ui
    ui.tower(); ui.tower()
    assert.equal(state.members[0].alive,false); assert.equal(state.members[0].equipment.weapon,undefined)
    assert.equal(state.memorial.length,1)
    assert.equal(state.statistics.towerFloors.retreats,1)
    assert.equal(state.statistics.towerFloors.deaths,1)
    assert.equal(state.inventory.length,insured?1:0)
    assert.equal(state.pendingRelics.length,insured?0:1)
    if(insured) assert.equal(state.inventory[0].id,equipment!.id)
    else assert.equal(state.pendingRelics[0].redeem,redeemCost(equipment!,2))
    assert(state.chronicle.some((e:any)=>e.text.includes('酒馆里那晚没有人说话')))
    assert(state.scarNotices.some((s:string)=>s.includes('已记入编年史')))
  }
})

test('insurance: charge once for next floor, activate through settlement, expire after it', () => {
  const t = startTower(squad(), 81)
  assert.equal(insureNextTowerFloor(t, 1000), 0)
  t.battle!.status = 'guild-win'; settleTowerFloor(t)
  assert.equal(insureNextTowerFloor(t, 79), 0)
  assert.equal(insureNextTowerFloor(t, 80), 80)
  assert.equal(insureNextTowerFloor(t, 1000), 0)
  assert.equal(t.insuredFloor, undefined)
  towerNext(t, 82)
  assert.equal(t.floor, 2); assert.equal(t.insuredFloor, true)
  t.battle!.status = 'guild-win'; settleTowerFloor(t)
  assert.equal(t.insuredFloor, true, 'death settlement must still see coverage')
  towerNext(t, 83)
  assert.equal(t.insuredFloor, false)
})

test('set bonuses: legal three slots reach the final threshold and actual damage changes', () => {
  for (const setName of ['gray-crown', 'wind-hunt']) {
    const m = squad()[2]
    for (const slot of ['weapon','armor','trinket'] as Slot[]) {
      const b = Object.values(ITEM_BASES).find(b => b.setName === setName && b.slot === slot)!
      assert(b); m.equipment[slot] = item(b.id)
    }
    const full = toCombatant(m)
    assert.equal(setName === 'gray-crown' ? full.setCrown : full.setHunt, 3)
    if (setName === 'wind-hunt') {
      const base = ITEM_BASES[m.equipment.trinket!.baseId]
      const previous = base.setName
      try { base.setName = undefined; assert.equal(Math.round((full.critChance - toCombatant(m).critChance) * 100), 3) }
      finally { base.setName = previous }
    }
  }
  assert(hit(false, false, 3) > hit(false, false, 2))
})

function hit(legacy: boolean, elite: boolean, crown = 0, boss = false) {
  const b = createBattle([squad()[0]], BLACKMOSS, BLACKMOSS.encounters.find(e => e.kind === 'wave')!.id, 49)
  const g = b.combatants.find(c => c.team === 'guild')!
  const e = b.combatants.find(c => c.team === 'enemy')!
  b.combatants = [g, e]
  g.skills = []; g.critChance = 0; g.attack = 100; g.cooldownLeft = 0; g.legacyElitewarden = legacy; g.setCrown = crown
  e.skills = []; e.traits = []; e.defense = 0; e.hp = e.maxHp = 10000; e.cooldownLeft = 100; e.elite = elite; e.boss = boss
  stepBattle(b)
  return 10000 - e.hp
}

test('elite legacy: normal target unchanged, elite and boss each receive +8%', () => {
  const normal = hit(false, false)
  assert.equal(hit(true, false), normal)
  assert.equal(hit(true, true), Math.round(normal * 1.08))
  assert.equal(hit(true, false, 0, true), Math.round(normal * 1.08))
  const r = createRun(squad(), BLACKMOSS, 49)
  const eliteNode = r.map.layers.flat().find(n => n.kind === 'elite')!
  const plainNode = r.map.layers.flat().find(n => n.kind === 'battle')!
  eliteNode.kind = 'battle' // 先取普通场基准
  r.nodeId = plainNode.id; r.path = [plainNode.id]
  startStep(r, 50)
  assert(r.battle!.combatants.filter(c => c.team === 'enemy').every(c => !c.elite))
  eliteNode.kind = 'elite'
  r.nodeId = eliteNode.id; r.path.push(eliteNode.id)
  startStep(r, 50)
  assert(r.battle!.combatants.filter(c => c.team === 'enemy').every(c => c.elite))
})

test('gear wishes: every T2/T3 weapon qualifies, T1 does not', () => {
  const m = squad()[0]
  for (const b of Object.values(ITEM_BASES).filter(b => b.slot === 'weapon')) {
    m.equipment.weapon = item(b.id)
    assert.equal(wishDone(m, { kind: 'gear', target: 'weapon', text: '' }, { dungeonCleared: () => false, towerBest: 0 }), b.tier >= 2, b.id)
  }
})

test('traits: existing identity remains stable; missing identity can be assigned once', () => {
  const m = squad()[0]; m.trait = 'cool'
  assert.equal(assignTrait(m, () => 0.1), false); assert.equal(m.trait, 'cool')
  m.trait = undefined; assert.equal(assignTrait(m, () => 0.1), true)
  assert.equal(m.trait, 'drinker'); assert.equal(assignTrait(m, () => 0.9), false)
})

test('cool: halve morale loss while preserving witness bonds', () => {
  const ordinary = squad()[0]; ordinary.race = 'human'; ordinary.personality.bravery = 0; ordinary.morale = 80
  const cool = structuredClone(ordinary); cool.trait = 'cool'
  applyDeathShock('fallen', [ordinary]); applyDeathShock('fallen', [cool])
  assert.equal(ordinary.morale, 60); assert.equal(cool.morale, 70)
  assert.equal(cool.bonds.fallen, ordinary.bonds.fallen)
})

test('drops: lucky +2%, scavenger +4%, distinct sources stack, dead members excluded', () => {
  const m = squad()[0]; m.trait = 'lucky'
  assert.equal(waveDropBonus([m]), 0.02)
  assert(rollWaveDrop('blackmoss', () => 0.13, false, waveDropBonus([m])))
  assert.equal(rollWaveDrop('blackmoss', () => 0.15, false, waveDropBonus([m])), null)
  const b = ITEM_BASES['wpn-t1-sword']; const old = b.legacy
  try {
    b.legacy = 'scavenger'; m.equipment.weapon = item(b.id)
    assert.equal(waveDropBonus([m]), 0.06)
    m.trait = undefined; assert.equal(waveDropBonus([m]), 0.04)
    m.alive = false; assert.equal(waveDropBonus([m]), 0)
  } finally { b.legacy = old }
})

test('training: bonus survives multiple battles, other runs remain unboosted', () => {
  const boosted = beginBattle(createRun(squad(), BLACKMOSS, 19), 19)
  const plain = beginBattle(createRun(squad(), BLACKMOSS, 19), 19)
  boosted.trainingExpMultiplier = 1.25
  for (let i = 0; i < 2; i++) {
    const a = boosted.members[0].exp; const b = plain.members[0].exp
    boosted.battle!.status = plain.battle!.status = 'guild-win'
    settleGrowth(boosted); settleGrowth(plain)
    const raceMult = boosted.members[0].race === 'human' ? 1.05 : 1
    assert.equal(boosted.members[0].exp - a, Math.round(9 * 1.25 * raceMult))
    boosted.battle = null; plain.battle = null; boosted.phase = plain.phase = 'rest'
    startStep(boosted, 20+i); startStep(plain, 20+i)
  }
})

test('v14 -> v16 preserves relics, assets and receipts; training round-trip persists', () => {
  const data = migrate({version:14, members:squad(), inventory:[], memorial:[], manual:[], gold:900, blessing:8, recruitCooldown:0, towerBest:5, lastSeen:Date.now(), chronicle:[], day:8, buildings:{training:2}, potions:{heal:3,fury:3}, unlockedHybrids:[], dungeonMastery:{}, starMarrow:4, pendingRelics:[{item:item('wpn-t3-dawn'),hero:'旧英雄',redeem:90}], kingdom:{active:[],completed:[]}})
  assert.equal(data.trainingReady, false); assert.equal(data.starMarrow, 4); assert.equal(data.pendingRelics.length, 1)
  data.trainingReady = true
  assert.deepEqual(importSave(exportSave(data)), data)
})

test('actual restart handler resets persistent fields before saving a new guild', () => {
  const state: Record<string, any> = {healingMastery:{str:5},starMarrow:6,pendingRelics:[{hero:'old'}],buildings:{training:3},day:99,towerBest:30,chronicle:[{}],pendingConsequences:[{}],eventsSeen:['old'],guildBuffs:[{}],trainingReady:true}
  const ref = () => ({current:null})
  const scope: Record<string, any> = {healingBusyRef:{current:true},clearGuildSave:()=>{},runRef:ref(),lastBattleRef:ref(),rendererRef:ref(),towerRunRef:ref(),trainingReadyRef:{current:true},autoLoopRef:{current:true},growthSnapshotRef:{current:new Map()},eventCursorRef:{current:3},membersRef:ref(),ECONOMY:{startingPotions:{heal:3,fury:3}},newKingdomState:()=>({active:[],completed:[]}),newRoster:squad,seedChronicle:()=>{}}
  scope.pendingDepartureRef = {current:'old-branch'}
  scope.pendingConsequenceRef = {current:{eventId:'old-event',dueDay:1}}
  scope.eventResolvingRef = {current:true}
  scope.guildRngRef = {current:createStatefulRng(900)}
  scope.guildRng = () => scope.guildRngRef.current()
  scope.newRngSeed = () => 54321
  scope.newStatistics = newStatistics
  scope.setStatistics = (v:unknown) => {state.statistics=v}
  for (const key of ['Running','Run','Battle','Inventory','LastDrops','Memorial','Manual','Candidates','Visitor','Gold','Blessing','RecruitCooldown','Potions','RoyalNotice','HubScreen','UnlockedHybrids','DungeonMastery','Members','StarMarrow','PendingRelics','Buildings','Day','TowerBest','Chronicle','PendingConsequences','GuildBuffs','EventsSeen','RareHuntNext','PendingEvent','EventResult','EventImpacts','OfflineNote','ProtectOn','DungeonId','ExpeditionIds','DetailOpen','SaveTransfer','TowerRun','TowerRunning','TrainingReady','HealingMastery','HealingNotice','ScarNotices']) {
    scope['set'+key] = (v: unknown) => {state[key[0].toLowerCase()+key.slice(1)] = v}
  }
  scope.updateKingdom = (v: unknown) => {state.kingdom = v}
  scope.itemOwnershipRef = {current:createGuildItems([])}
  scope.setItemOwnership = (v:any) => Object.assign(state, serializeGuildItems(v, scope.membersRef.current ?? []))
  scope.updateItemOwnership = handler('updateItemOwnership', scope)
  handler('restartGuild', scope)()
  assert.equal(scope.pendingDepartureRef.current,null)
  assert.equal(scope.pendingConsequenceRef.current,null)
  assert.equal(scope.eventResolvingRef.current,false)
  assert.equal(scope.guildRngRef.current.state(),54321)
  const store = new Map<string,string>(); (globalThis as any).localStorage = {getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)}
  state.rngState = scope.guildRngRef.current.state()
  state.runState = initialRunState(); state.visitor = null; state.generationState = memberGenerationState()
  saveGuild(state as any)
  const saved = loadGuildSave()!
  assert(saved); assert.equal(saved.starMarrow,0); assert.deepEqual(saved.pendingRelics,[]); assert.equal(saved.trainingReady,false)
  assert.equal(saved.day,1); assert.equal(saved.towerBest,0); assert.equal(saved.gold,150)
  for (const key of ['chronicle','pendingConsequences','eventsSeen','guildBuffs','inventory','memorial','manual','unlockedHybrids']) assert.deepEqual(saved[key as keyof typeof saved], [], key)
  assert.deepEqual(saved.healingMastery,{}); assert.deepEqual(saved.buildings,{}); assert.deepEqual(saved.dungeonMastery,{})
  assert.deepEqual(saved.statistics,newStatistics())
})

test('loot identities remain distinct across isolated module lifetimes', () => {
  const source = readFileSync('src/sim/loot.ts','utf8')
  const js = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
  const load = () => {
    const exports: any = {}
    new Function('exports','require',js)(exports,()=>({ITEM_BASES,AFFIXES}))
    return exports
  }
  const first = load().rollDrop('wpn-t3-dawn',()=>0.4)
  const second = load().rollDrop('wpn-t3-dawn',()=>0.4)
  assert.notEqual(first.id,second.id)
  assert.equal(first.baseId,second.baseId)
})

test('growth uses the completed wave after route index advances to a boss', () => {
  const r = beginBattle(createRun(squad(),BLACKMOSS,49),49)
  r.members[0].race='elf'
  const before = r.members[0].exp
  r.battle!.status='guild-win'
  advanceRun(r)
  assert.equal(r.phase,'rest')
  settleGrowth(r)
  assert.equal(r.members[0].exp-before,9)
  // 送到 Boss 节点连战
  const bossNode = r.map.layers[r.map.layers.length-1]![0]!
  r.nodeId = bossNode.id; r.path.push(bossNode.id)
  startStep(r,50)
  r.battle!.status='guild-win'
  const bossBefore = r.members[0].exp
  advanceRun(r); settleGrowth(r)
  assert.equal(r.members[0].exp-bossBefore,50)
})

test('first encounter receives guild buffs, rare hunt and automatic commands', () => {
  const members = squad()
  const plain = beginBattle(createRun(structuredClone(members),BLACKMOSS,49),49)
  const boosted = beginBattle(createRun(structuredClone(members),BLACKMOSS,49,0,true,{heal:2,fury:1},true,
    [{id:'test',name:'test',desc:'test',mods:{atk:2}}],{mult:2,rewardMult:2}),49)
  const guild = (r:typeof plain) => r.battle!.combatants.find(c=>c.team==='guild')!
  const enemy = (r:typeof plain) => r.battle!.combatants.find(c=>c.team==='enemy')!
  assert.equal(guild(boosted).attack,guild(plain).attack*2)
  assert.equal(enemy(boosted).maxHp,enemy(plain).maxHp*2)
  assert.equal(boosted.battle!.commands.autoMode,true)
  assert.equal(boosted.battle!.commands.healStock,2)
})

test('tower manual stepping updates the authoritative battle, not the UI snapshot', () => {
  const t = startTower(squad(),81)
  const snapshot = {...t.battle!}
  let synced: unknown, running = true
  // R5.2c:×10 步进处理器迁 TowerScreens.tsx,自由标识符经 props(锚与作用域随新文本)
  callback('const current = props.towerRunRef.current?.battle', {
    props:{ towerRunRef:{current:t}, setTowerRunning:(v:boolean)=>{running=v}, drainAndSync:(b:unknown)=>{synced=b} },
    stepBattle,
  })()
  assert.equal(t.battle!.tick,10)
  assert.equal(snapshot.tick,0)
  assert.equal(synced,t.battle)
  assert.equal(running,false)
})

test('tower-only timer starts, pauses and restarts without an expedition', () => {
  const t = startTower(squad(),81)
  let tick: (()=>void) | undefined
  const effect = (towerRunning:boolean) => callback('const timer = setInterval', {
    running:false,towerRunning,towerRunRef:{current:t},runRef:{current:null},
    rendererRef:{current:{lastTickAt:100}},performance:{now:()=>100},
    stepBattle,drainAndSync:()=>{},setTowerRunning:()=>{},TICK_MS:100,speedIntervalMs:(sp:number,ms:number)=>ms/sp,
    setInterval:(fn:()=>void)=>{tick=fn;return 1},
    clearInterval:()=>{tick=undefined},
  })()
  const cleanup = effect(true)
  assert(tick); tick(); assert.equal(t.battle!.tick,1)
  cleanup()
  assert.equal(effect(false),undefined); assert.equal(tick,undefined)
  effect(true); tick!(); assert.equal(t.battle!.tick,2)
  let dependencyFound = false
  // R2:useEffect 随界面迁移,跨全部 UI 源文件找该 effect 的依赖数组
  for (const { ast: src } of UI_ASTS) {
    function visit(n:ts.Node) {
      if (ts.isCallExpression(n) && n.expression.getText(src)==='useEffect' && n.arguments[0]?.getText(src).includes('const timer = setInterval')) {
        assert.match(n.arguments[1].getText(src),/towerRunning/)
        dependencyFound=true
      }
      ts.forEachChild(n,visit)
    }
    visit(src)
  }
  assert(dependencyFound)
})

test('due consequences defer departure without consuming a day or creating a battle', () => {
  const due = {eventId:'followup',dueDay:2}
  const def = {id:'followup'}
  const pendingDepartureRef = {current:null}
  const pendingConsequenceRef = {current:null}
  let queue = [due], event: unknown, days = 0, created = 0
  handler('startExpedition',{
    runRef:{current:null},towerRunRef:{current:null},pendingEvent:null,
    expedition:squad(),activeDungeon:BLACKMOSS,lastBranchRef:{current:''},
    refusesToMarch:()=>false,pendingConsequences:queue,day:1,GUILD_EVENTS:[def],consequenceOf,
    setPendingConsequences:(f:any)=>{queue=f(queue)},pendingDepartureRef,pendingConsequenceRef,
    setPendingEvent:(v:unknown)=>{event=v},setEventResult:()=>{},
    setDay:()=>{days++},createRun:()=>{created++},
  })()
  assert.equal(event,def); assert.deepEqual(queue,[due])
  assert.equal(pendingConsequenceRef.current,due)
  assert.equal(pendingDepartureRef.current,'go')
  assert.equal(days,0); assert.equal(created,0)
})

test('valid departure advances one day with stock/expiry together and preserves new notices; rejected/repeated departure changes nothing', () => {
  const members = squad()
  members[0].scars = [{ stat: 'str', value: 1, text: '旧伤', faint: true, faintSince: 1 }]
  let day = 4, stock = 2, notices = ['上一趟通知']
  let buffs: any[] = [{ endDay: 5, buff: { attackMult: 1.1 } }]
  let entries: any[] = [{ id: 1, dungeonId: 'blackmoss', kind: 'mob', text: '沼泽情报', real: true, day: 1 }]
  const runRef: any = { current: null }
  const scope: any = {
    pendingEvent: null, pendingConsequences: [], runRef, towerRunRef: { current: null },
    expedition: members, membersRef: { current: members }, activeDungeon: BLACKMOSS, refusesToMarch: () => false,
    day, setDay: (v: any) => { day = typeof v === 'function' ? v(day) : v }, setIntelStock: (f: any) => { stock = f(stock) },
    setGuildBuffs: (f: any) => { buffs = f(buffs) }, guildBuffs: buffs,
    setScarNotices: (v: any) => { notices = typeof v === 'function' ? v(notices) : v },
    ageFaints, scarStatName, appendBio, chronicleRefusal, setMembers: () => {},
    consumeIntelReveal, intelEntries: entries, setIntelEntries: (f: any) => { entries = f(entries) }, INTEL_STOCK_CAP,
    growthSnapshotRef: { current: new Map() }, powerScore: () => 1, bondStars: () => 0,
    createRun, SEED_BASE: 31, memorialAura: () => 0, memorial: [], protectOn: true, potions: { heal: 3, fury: 3 },
    autoLoopRef: { current: false }, rareHuntNext: null, trainingReadyRef: { current: false },
    setLastDrops: () => {}, rendererRef: { current: null }, setRunning: () => {}, syncAll: () => {},
  }
  members.forEach(m => { m.stamina = 50 })
  Object.assign(scope, { restStamina, baseEffects, buildings: {}, sweepExpiredCommissions, COMMISSIONS,
    kingdomRef: { current: newKingdomState() }, updateKingdom: () => {} })
  scope.advanceGuildDay = handler('advanceGuildDay', scope)
  const before = JSON.stringify({ day, stock, members, buffs, entries, notices })
  for (const rejected of [{ expedition: members.slice(0, 2) }, { refusesToMarch: () => true }, { pendingEvent: {} }]) {
    handler('startExpedition', { ...scope, ...rejected })()
    assert.equal(JSON.stringify({ day, stock, members, buffs, entries, notices }), before)
    assert.equal(runRef.current, null)
  }
  const start = handler('startExpedition', scope)
  start()
  assert.equal(day, 5); assert.equal(stock, 3)
  assert(members.every(m => m.stamina === 70), "主线精力恢复仍由公会日执行一次")
  assert.deepEqual(buffs, []); assert.deepEqual(members[0].scars, [])
  assert(members[0].bio?.some(b => b.kind === 'heal' && b.day === 5))
  assert.equal(entries[0].revealUsedDay, 5); assert.equal(runRef.current.intelBonus, 1)
  assert(notices.some(n => n.includes('虚痕消退')))
  assert(notices.some(n => n.includes('情报派上了用场')))
  assert(!notices.includes('上一趟通知'))
  const after = JSON.stringify({ day, stock, members, buffs, entries, notices, run: runRef.current })
  start()
  assert.equal(JSON.stringify({ day, stock, members, buffs, entries, notices, run: runRef.current }), after)
})

test('event pools split town/dungeon/terrain without leakage (U27④)', () => {
  const townPool = GUILD_EVENTS.filter(e => e.scope.kind === 'town' && !SECOND_ACT_IDS.has(e.id))
  assert(townPool.length >= 45, 'town first-encounter pool = 52 town − 7 chain targets')
  const drawn = new Set<string>()
  const seqRng = createStatefulRng(424242)
  // 前置件(草案 §4.2)之后:visited 全开才等价于完整 town 池
  const allVisited = Object.fromEntries(DUNGEONS.map(d => [d.id, 100]))
  for (let i = 0; i < 2000; i++) {
    const ev = rollGuildEvent(seqRng, { where: 'town', visited: allVisited })
    if (ev) drawn.add(ev.id)
  }
  for (const e of townPool) assert(drawn.has(e.id), 'town roll missed ' + e.id)
  assert.equal(rollGuildEvent(() => EVENT_CHANCE, { where: 'town' }), null)
  assert.equal(eventCount(), GUILD_EVENTS.length, 'scoped draws must not truncate the encyclopedia')
  for (const d of [BLACKMOSS, EMBERPASS, DRAGONMAW]) {
    const pool = eventPool({ where: 'node', dungeonId: d.id })
    assert(pool.every(e => e.scope.kind !== 'town'), d.id + ' node pool must exclude town events')
    const drawn = rollGuildEvent(() => 0, { where: 'node', dungeonId: d.id })
    assert(drawn === null || drawn.scope.kind !== 'town')
  }
  // 地形池:regions 二层过滤 + 7 条通用地形事件两版图共用(草案 §5,events-draft 定稿)
  assert(eventPool({ where: 'node', dungeonId: 'emberpass', terrain: 'lava' }).some(e => e.id === 'fire-rain'))
  assert(!eventPool({ where: 'node', dungeonId: 'emberpass', terrain: 'wild' }).some(e => e.id === 'wolf-cub'), 'wolf-cub is R1 terrain')
  assert(eventPool({ where: 'node', dungeonId: 'blackmoss', terrain: 'wild' }).some(e => e.id === 'wolf-cub'))
  assert(eventPool({ where: 'node', dungeonId: 'emberpass', terrain: 'camp' }).some(e => e.id === 'ghost-banquet'))
  assert(eventPool({ where: 'node', dungeonId: 'blackmoss', terrain: 'camp' }).some(e => e.id === 'ghost-banquet'))
  assert(!eventPool({ where: 'node', dungeonId: 'emberpass' }).some(e => e.id === 'cursed-coffin'), 'no terrain → no terrain pool')
})

test('delayed chains: targets exist, never self, second acts isolated, at semantics honored (events-draft §2.2)', () => {
  for (const source of GUILD_EVENTS) {
    for (const choice of source.choices) for (const outcome of choice.outcomes) {
      const delayed = outcome.effects?.delayed
      if (!delayed) continue
      const target = GUILD_EVENTS.find(e => e.id === delayed.eventId)!
      assert(target, delayed.eventId)
      assert.notEqual(target.id, source.id, 'self-loop at ' + source.id)
      assert(SECOND_ACT_IDS.has(target.id))
      if (delayed.at === 'town') {
        assert.equal(consequenceFiresIn(target.id, 'blackmoss'), false, 'town chains never fire in dungeons')
      } else if (delayed.dungeonId) {
        assert.equal(consequenceFiresIn(target.id, delayed.dungeonId), true, target.id)
        const other = delayed.dungeonId === 'blackmoss' ? 'emberpass' : 'blackmoss'
        assert.equal(consequenceFiresIn(target.id, other), false, target.id)
      } else {
        assert.equal(consequenceFiresIn(target.id, 'blackmoss'), true, target.id)
        assert.equal(consequenceFiresIn(target.id, 'emberpass'), true, target.id)
      }
    }
  }
})

test('new Dragonridge choices have weighted outcomes with real costs and supported effects', () => {
  for (const id of ['forge-sluice', 'ash-waymarkers']) {
    const event = GUILD_EVENTS.find(e => e.id === id)!
    assert.equal(event.choices.length, 2)
    event.choices.forEach((choice, i) => {
      assert(choice.outcomes.every(o => o.weight > 0 && o.text && o.effects))
      assert.equal(pickOutcome(event, i, 0), choice.outcomes[0])
      assert.equal(pickOutcome(event, i, 0.999999), choice.outcomes.at(-1))
      assert(choice.outcomes.some(o => o.effects!.injure || (o.effects!.gold ?? 0) < 0 ||
        (o.effects!.moraleAll ?? 0) < 0 || (o.effects!.moraleRandom ?? 0) < 0))
    })
  }
})

test('new regional outcomes use the actual expedition handler, with visible buffs and carried potions', () => {
  for (const id of ['forge-sluice', 'ash-waymarkers']) {
    const ev = GUILD_EVENTS.find(e => e.id === id)!
    for (const choice of ev.choices) for (const outcome of choice.outcomes) {
      const members = squad()
      members.forEach(m => {m.hp = toCombatant(m).maxHp})
      const run = createRun(members, EMBERPASS, 41, 0, true, {heal:3,fury:3})
      run.phase = 'rest'
      let gold = 1000, result = '', seen: string[] = [], impacts: {t:string}[] = []
      handler('resolveEvent', {
        pendingEvent:ev, eventResult:null, pickOutcome:()=>outcome,
        eventResolvingRef:{current:false},pendingConsequenceRef:{current:null},
        runRef:{current:run}, membersRef:{current:members}, day:20,
        gainGold:(n:number)=>{gold+=n}, setGold:(f:(n:number)=>number)=>{gold=f(gold)},
        setBlessing:()=>{}, applyMoraleDelta, grantExp, setMembers:()=>{},
        setPotions:()=>assert.fail('route rewards must go to carried potions'),
        setEventsSeen:(f:(s:string[])=>string[])=>{seen=f(seen)},
        logChronicle:()=>{}, chronicleRaw:()=>({}),
        setEventResult:(s:string)=>{result=s}, setEventImpacts:(s:{t:string}[])=>{impacts=s},
      })(0)
      assert.equal(result, outcome.text)
      assert.deepEqual(seen, [ev.id])
      assert.equal(gold, 1000 + (outcome.effects?.gold ?? 0))
      assert.equal(run.potions.heal, 3 + (outcome.effects?.potionHeal ?? 0))
      const buff = outcome.effects?.runBuff
      if (buff) {
        assert(run.buffs?.includes(buff))
        assert(impacts.some(i => i.t.includes(buff.name)))
      }
      if (outcome.effects?.potionHeal) assert(impacts.some(i => i.t.includes('治疗药水 +1')))
      if (outcome.effects?.injure) assert(impacts.some(i => i.t.includes('生命减半')))
    }
  }
})

test('delayed decisions survive reload until chosen, settle once and retain duplicate future consequences', () => {
  const event = GUILD_EVENTS.find(e => e.id === 'egg-hatch')!
  const due = {eventId:event.id,dueDay:21}
  const later = {...due}
  let queue = [due,later], gold=100, buffs: any[]=[]
  const pendingConsequenceRef = {current:due as typeof due | null}
  const eventResolvingRef = {current:false}
  const resolve = handler('resolveEvent', {
    pendingEvent:event,eventResult:null,pickOutcome:()=>event.choices[0].outcomes[0],
    pendingConsequenceRef,eventResolvingRef,runRef:{current:null},membersRef:{current:squad()},day:20,
    setPendingConsequences:(f:any)=>{queue=f(queue)},
    setGold:(f:any)=>{gold=f(gold)},applyMoraleDelta,setGuildBuffs:(f:any)=>{buffs=f(buffs)},
    setEventsSeen:()=>{},logChronicle:()=>{},chronicleRaw:()=>({}),
    setEventResult:()=>{},setEventImpacts:()=>{},setMembers:()=>{},
  })
  assert.equal(JSON.parse(JSON.stringify(queue)).length,2)
  resolve(0); resolve(0)
  assert.deepEqual(queue,[later])
  assert.equal(gold,70)
  assert.equal(buffs.length,1)
  assert.equal(pendingConsequenceRef.current,null)
})

test('pre-departure run buffs persist and apply to exactly the next expedition, with visible feedback', () => {
  const event = GUILD_EVENTS.find(e=>e.id==='egg-hatch')!
  let buffs: any[] = [], impacts: {t:string}[] = []
  handler('resolveEvent', {
    pendingEvent:event,eventResult:null,eventResolvingRef:{current:false},
    pendingConsequenceRef:{current:null},pickOutcome:()=>event.choices[0].outcomes[0],
    runRef:{current:null},membersRef:{current:squad()},day:20,
    setGold:()=>{},applyMoraleDelta,setGuildBuffs:(f:any)=>{buffs=f(buffs)},
    setEventsSeen:()=>{},logChronicle:()=>{},chronicleRaw:()=>({}),
    setEventResult:()=>{},setEventImpacts:(v:any)=>{impacts=v},setMembers:()=>{},
  })(0)
  assert(impacts.some(i=>i.t.includes('下次远征状态:小龙崽')))
  const stored = JSON.parse(JSON.stringify(buffs))
  assert.equal(stored[0].endDay,22)
  const expedition = squad()
  const baseline = beginBattle(createRun(structuredClone(expedition),BLACKMOSS,99),99)
  const runRef:any = {current:null}
  const scope:any = {
    pendingEvent:null,pendingConsequences:[],runRef,towerRunRef:{current:null},
    expedition,activeDungeon:BLACKMOSS,refusesToMarch:()=>false,
    setDay:()=>{},setGuildBuffs:(f:any)=>{buffs=f(buffs)},growthSnapshotRef:{current:new Map()},
    powerScore:()=>1,bondStars:()=>0,createRun,seedRef:{current:0},SEED_BASE:99,
    memorialAura:()=>0,memorial:[],protectOn:true,potions:{heal:3,fury:3},
    autoLoopRef:{current:false},rareHuntNext:null,trainingReadyRef:{current:false},
    setLastDrops:()=>{},setScarNotices:()=>{},rendererRef:{current:null},THEME_BY_DUNGEON:{},
    setRunning:()=>{},syncAll:()=>{},
  }
  const firstFight = (dayNum: number) => {
    runRef.current = null
    // #4.6:buff 过期消退搬进 advanceGuildDay(公会日推进单一入口)——测试自带同义 stub
    handler('startExpedition',{...scope,day:dayNum,guildBuffs:JSON.parse(JSON.stringify(stored)),advanceGuildDay:()=>{buffs=buffs.filter((g:any)=>g.endDay>dayNum+1)}})()
    const active = runRef.current
    beginBattle(active, 7, 0, expedition)
    return active.battle!.combatants[0].attack
  }
  const baseAttack = baseline.battle!.combatants[0].attack
  assert.equal(firstFight(20),Math.round(baseAttack*1.1))
  assert.equal(firstFight(21),baseAttack)
  assert.deepEqual(buffs,[])
})

test('automatic toggle persists beyond the current battle into run and repeat state', () => {
  const b = beginBattle(createRun(squad(),BLACKMOSS,49),49).battle!
  const runRef = {current:{autoMode:false}}, autoLoopRef={current:false}
  // R5.2c:挂机开关箭头迁 BattleScreen.tsx(autoLoop/run 写入经 props.autoLoopSet/runAutoOff)
  const toggle = callback('props.autoLoopSet(b.commands.autoMode)',{
    props:{ autoLoopSet:(v:boolean)=>{autoLoopRef.current=v}, runAutoSet:(v:boolean)=>{ if (runRef.current) runRef.current.autoMode = v } },
  })
  toggle(b)
  assert.equal(b.commands.autoMode,true); assert.equal(runRef.current.autoMode,true); assert.equal(autoLoopRef.current,true)
  toggle(b)
  assert.equal(b.commands.autoMode,false); assert.equal(runRef.current.autoMode,false); assert.equal(autoLoopRef.current,false)
})

test('retreat from rest cancels automatic repeat before returning to the guild', () => {
  const r = beginBattle(createRun(squad(),BLACKMOSS,49),49)
  r.phase='rest'; r.autoMode=true
  const autoLoopRef={current:true}
  let stats = newStatistics()
  handler('retreat',{runRef:{current:r},membersRef:{current:r.members},autoLoopRef,retreatRun,expeditionStatistics,noteStatistics:(action:any)=>{if(action)stats=recordStatistics(stats,action)},setRunning:()=>{},syncAll:()=>{}})()
  assert.equal(r.phase,'retreated'); assert.equal(r.autoMode,false); assert.equal(autoLoopRef.current,false)
  assert.equal(stats.expeditions.retreats,1); assert.equal(stats.expeditionBattles.retreats,0)
})

test('active and terminal saves preserve carried potions; stale uncommitted renders cannot save assets', () => {
  let saved:any
  const rng = createStatefulRng(17)
  for(let i=0;i<23;i++) rng()
  const scope:Record<string,unknown> = {saveGuild:(v:unknown)=>{saved=v},statistics:newStatistics(),guildRngRef:{current:rng}}
  for (const key of ['trainingReady','rareHuntNext','starMarrow','pendingRelics','healingMastery','kingdom','members','inventory','memorial','manual','protectOn','gold','blessing','recruitCooldown','towerBest','chronicle','day','buildings','unlockedHybrids','weaponTraining','dungeonMastery','pendingConsequences','eventsSeen','guildBuffs']) scope[key]=undefined
  scope.members = []; scope.itemOwnershipRef = {current:createGuildItems([])}
  const save = (run:unknown,towerRun:unknown) => callback('saveGuild({ trainingReady',{
    ...scope,run,towerRun,potions:{heal:9,fury:9},
  })()
  save({phase:'victory',potions:{heal:2,fury:1}},null)
  assert.deepEqual(saved.potions,{heal:2,fury:1})
  assert.equal(saved.rngState,rng.state())
  save(null,{phase:'ended',potions:{heal:0,fury:3}})
  assert.deepEqual(saved.potions,{heal:0,fury:3})
  saved=null
  save({phase:'battle',potions:{heal:1,fury:0}},null)
  assert.deepEqual(saved.potions,{heal:1,fury:0})
  saved=null
  callback('saveGuild({ trainingReady', {...scope,progress:initialRunState(),progressRef:{current:initialRunState()}})()
  assert.equal(saved,null)
})

test('published v15 scars and healing mastery survive v16 migration, export and reload', () => {
  const members = squad()
  members[0].scars = [{stat:'str',value:2,text:'旧伤'}]
  const old = migrate({version:15,members,inventory:[],memorial:[],manual:[],gold:700,blessing:9,recruitCooldown:0,towerBest:5,lastSeen:Date.now(),chronicle:[],day:8,buildings:{},potions:{heal:3,fury:3},unlockedHybrids:[],dungeonMastery:{},healingMastery:{str:4},starMarrow:7,pendingRelics:[],kingdom:{active:[],completed:[]}})
  assert.equal(old.version,SAVE_VERSION); assert.equal(old.trainingReady,false)
  old.trainingReady=true
  const loaded=importSave(exportSave(old))!
  assert.equal(loaded.gold,700); assert.equal(loaded.blessing,9); assert.equal(loaded.starMarrow,7)
  assert.deepEqual(loaded.healingMastery,{str:4}); assert.deepEqual(loaded.members[0].scars,members[0].scars)
  assert.equal(loaded.trainingReady,true)
  // 本地未发布的 v15 训练档也可升级，不丢已购买资格。
  const local=migrate({...old,version:15,healingMastery:undefined})
  assert.equal(local.trainingReady,true); assert.deepEqual(local.healingMastery,{})
})

test('healing: severity pricing, success/failure/worsening and mastery caps', () => {
  const m=squad()[0]
  m.level=15
  const light={stat:'str',value:1,text:'旧伤'} as const
  const heavy={stat:'str',value:2,text:'重伤'} as const
  assert.deepEqual(healingTerms(light),{gold:60,blessing:1,rate:0.85})
  assert.deepEqual(healingTerms(heavy),{gold:120,blessing:3,rate:0.65})
  assert.equal(healingTerms(light,999).rate,1); assert.equal(healingTerms(heavy,999).rate,0.9)
  m.scars=[{...light}]; const before=toCombatant(m).attack
  let values=[0.9,0.1]
  const worsened=attemptHeal(m,0,0,()=>values.shift()!)!
  assert.equal(worsened.result,'worsen'); assert.equal(worsened.masteryGain,2); assert.equal(m.scars[0].value,2)
  assert(toCombatant(m).attack < before)
  const failed=attemptHeal(m,0,0,()=>0.7)!
  assert.equal(failed.result,'fail'); assert.equal(failed.masteryGain,1); assert.equal(m.scars.length,1)
  const healed=attemptHeal(m,0,0,()=>0.6,20)!
  assert.equal(healed.result,'success'); assert.equal(m.scars.length,1); assert.equal(m.scars[0].value,1) // U32:重度降为轻度
  const faint=attemptHeal(m,0,0,()=>0,21)!
  assert.equal(faint.result,'success'); assert.equal(m.scars[0].faint,true) // U32:轻度转为虚痕
  assert(toCombatant(m).attack>before) // 虚痕不减属性
  assert.equal(attemptHeal(m,0,0,()=>0,22),null) // 虚痕不在疗养范围
})

test('actual healing callback: guarded spending, feedback, no duplicate or stale-index treatment', () => {
  const m=squad()[0]; m.scars=[{stat:'str',value:2,text:'重伤'},{stat:'agi',value:1,text:'轻伤'}]
  const sc=m.scars[0]
  const state:any={gold:300,blessing:5,healingMastery:{str:5},notice:''}
  const healingBusyRef={current:false}
  const scope:any={healingBusyRef,runRef:{current:null},towerRunRef:{current:null},membersRef:{current:[m]},m,sc,si:0,healingTerms,attemptHeal,
    Math:{random:()=>0.5},setMembers:()=>{},setHealingNotice:(x:string)=>state.notice=x,logChronicle:()=>{},chronicleRaw:()=>({}),scarStatName:()=> '力量',day:1}
  let stats=newStatistics()
  scope.noteStatistics=(action:any)=>{stats=recordStatistics(stats,action)}
  for(const key of ['Gold','Blessing','HealingMastery']) scope['set'+key]=(f:any)=>{const k=key[0].toLowerCase()+key.slice(1);state[k]=f(state[k])}
  // R2-5:疗养回调签名改 (memberId, si),从 membersRef 里按 id 找人
  const heal=(overrides:any={})=>callback('const cost = healingTerms(cur, mastery)',{...scope,...state,...overrides})(m.id,0,sc)
  heal({gold:119}); heal({blessing:2}); assert.equal(state.gold,300); assert.equal(m.scars.length,2)
  heal({runRef:{current:{}}}); assert.equal(state.gold,300)
  heal(); heal()
  assert.equal(state.gold,180); assert.equal(state.blessing,2); assert.equal(state.healingMastery.str,6)
  // U32 稳定制:重度治疗成功=降为轻度(不再移除);busy 守卫挡住第二次
  assert.equal(m.scars.length,2); assert.equal(m.scars[0].stat,'str'); assert.equal(m.scars[0].value,1)
  assert.match(state.notice,/创伤减轻/)
  // U32 稳定制:降档后同一伤疤可以继续疗养(轻度→虚痕是合法重治,非陈旧索引)
  healingBusyRef.current=false; heal()
  assert.equal(state.gold,120); assert.equal(state.blessing,1); assert.equal(state.healingMastery.str,7)
  assert.equal(m.scars[0].faint,true)
  healingBusyRef.current=false; heal(); assert.equal(state.gold,120) // 虚痕不在疗养范围(!r 早退,不扣费)
  assert.deepEqual(stats.healing,{attempts:2,gold:180,blessing:4})
})

test('v16 -> v17 starts fresh statistics without inventing old activity; export/reload preserves totals', () => {
  const old = migrate({version:16,members:squad(),inventory:[],memorial:[],manual:['grush'],protectOn:true,gold:900,blessing:8,recruitCooldown:0,towerBest:9,lastSeen:Date.now(),chronicle:[],day:42,buildings:{training:2},potions:{heal:3,fury:3},unlockedHybrids:[],dungeonMastery:{blackmoss:100},starMarrow:4,pendingRelics:[],kingdom:{active:[],completed:[]},healingMastery:{str:5},trainingReady:true})
  assert.equal(old.version,SAVE_VERSION); assert.deepEqual(old.statistics,newStatistics(42))
  old.statistics=recordStatistics(old.statistics,{type:'battle',mode:'towerFloors',status:'guild-wipe',deaths:3})
  old.statistics=recordStatistics(old.statistics,{type:'gold',source:'tower',amount:68})
  const loaded=importSave(exportSave(old))!
  assert.deepEqual(loaded.statistics,old.statistics)
  assert.equal(loaded.gold,900); assert.equal(loaded.trainingReady,true)
  assert.deepEqual(loaded.healingMastery,{str:5})
  saveGuild(loaded)
  assert.deepEqual(loadGuildSave()!.statistics,old.statistics)
})

test('v17 to v18 preserves assets and statistics; unused rare hunts survive export, save and reload', () => {
  const base = importSave(readFileSync('docs/dev-save.txt','utf8'))!, registry = itemStateFromSave(base)
  const previous: any = { ...base, version:17, members:resolveMembers(base.members,registry), inventory:inventoryItems(registry),
    pendingRelics:relicItems(registry).map(({item,hero,redeem})=>({item,hero,redeem})) }
  delete previous.items; delete previous.itemSeq
  previous.statistics = recordStatistics(newStatistics(20),{type:'gold',source:'event',amount:77})
  const current = migrate(previous as any)
  assert.equal(current.version,SAVE_VERSION)
  assert.equal(current.rareHuntNext,null)
  for (const key of ['gold','manual','statistics','potions','kingdom'] as const) {
    assert.deepEqual(current[key],previous[key],key)
  }
  assert.deepEqual(resolveMembers(current.members,itemStateFromSave(current)),previous.members)
  assert.deepEqual(inventoryItems(itemStateFromSave(current)),previous.inventory)
  current.rareHuntNext={mult:1.25,rewardMult:2}
  const imported=importSave(exportSave(current))!
  assert.deepEqual(imported.rareHuntNext,current.rareHuntNext)
  saveGuild(imported)
  assert.deepEqual(loadGuildSave()!.rareHuntNext,current.rareHuntNext)
  for (const invalid of [{mult:NaN,rewardMult:2},{mult:1.25,rewardMult:Infinity},{mult:-1,rewardMult:2},'invalid']) {
    assert.equal(migrate({...current,rareHuntNext:invalid} as any).rareHuntNext,null)
  }
})

test('rare hunt is passed from the actual save effect to departure once, not repeated after settlement', () => {
  const old = importSave(readFileSync('docs/dev-save.txt','utf8'))!
  const hunt = {mult:1.25,rewardMult:2}
  callback('saveGuild({ trainingReady', {
    ...old,itemOwnershipRef:{current:itemStateFromSave(old)},pendingConsequences:[],eventsSeen:[],guildBuffs:[],rareHuntNext:hunt,run:null,towerRun:null,saveGuild,
  })()
  assert.deepEqual(loadGuildSave()!.rareHuntNext,hunt)
  const runRef:any = {current:null}
  let ready = loadGuildSave()!.rareHuntNext
  const scope:any = {
    pendingEvent:null,pendingConsequences:[],runRef,towerRunRef:{current:null},
    expedition:squad(),activeDungeon:BLACKMOSS,refusesToMarch:()=>false,
    setDay:()=>{},setGuildBuffs:()=>{},growthSnapshotRef:{current:new Map()},
    powerScore:()=>1,bondStars:()=>0,createRun,seedRef:{current:0},SEED_BASE:99,
    memorialAura:()=>0,memorial:[],protectOn:true,potions:{heal:3,fury:3},day:20,guildBuffs:[],
    autoLoopRef:{current:false},trainingReadyRef:{current:false},setRareHuntNext:(v:any)=>{ready=v},
    setLastDrops:()=>{},setScarNotices:()=>{},rendererRef:{current:null},THEME_BY_DUNGEON:{},
    setRunning:()=>{},syncAll:()=>{},
  }
  handler('startExpedition',{...scope,rareHuntNext:ready})()
  assert.deepEqual(runRef.current.rareHunt,hunt)
  assert.equal(ready,null)
  runRef.current=null
  handler('startExpedition',{...scope,rareHuntNext:ready})()
  assert.equal(runRef.current.rareHunt,undefined)
})

test('statistics normalization rejects malformed counts without discarding valid assets', () => {
  const stats=normalizeStatistics({sinceDay:-1,expeditionBattles:{wins:4,losses:-1,retreats:NaN,deaths:Infinity},towerFloors:[],healing:{gold:1.5,attempts:'9'},goldEarned:{sales:80,offline:Number.MAX_SAFE_INTEGER+1}},9)
  assert.equal(stats.sinceDay,9)
  assert.deepEqual(stats.expeditionBattles,{wins:4,losses:0,retreats:0,deaths:0})
  assert.deepEqual(stats.healing,{attempts:0,gold:0,blessing:0})
  assert.equal(totalGoldEarned(stats),80)
})

test('statistics keep retreat separate, count losses as wipes, and describe text denominator', () => {
  const empty=newStatistics(3)
  assert.equal(recordStatistics(empty,{type:'battle',mode:'towerFloors',status:'running',deaths:0}),empty)
  let stats=recordStatistics(empty,{type:'battle',mode:'expeditionBattles',status:'guild-win',deaths:1})
  stats=recordStatistics(stats,{type:'battle',mode:'expeditionBattles',status:'retreated',deaths:0})
  stats=recordStatistics(stats,{type:'battle',mode:'towerFloors',status:'guild-wipe',deaths:3})
  stats=recordStatistics(stats,{type:'healing',gold:120,blessing:3})
  stats=recordStatistics(stats,{type:'gold',source:'sales',amount:90})
  assert.equal(winRate(stats.expeditionBattles),'50.0%')
  assert.equal(empty.expeditionBattles.wins,0)
  const text=exportStatistics(stats,7)
  for(const fragment of ['场次 2，胜 1，负 0，撤退 1','死亡人数：4','团灭次数：1','金币收入合计：90','支出 120 金 / 3 祝福','胜率分母含撤退']) assert(text.includes(fragment),fragment)
})

test('expedition end statistics settle once, including victory before the return button', () => {
  for(const [phase,result] of [['victory','wins'],['defeat','losses'],['retreated','retreats']] as const) {
    const run={phase:'battle',statisticsRecorded:false}
    assert.equal(expeditionStatistics(run),null)
    run.phase=phase
    assert.deepEqual(expeditionStatistics(run),{type:'expedition',result})
    assert.equal(expeditionStatistics(run),null)
  }
})

test('offline grant is counted once even if mount effects are replayed', () => {
  let stats=newStatistics(), gold=0
  const apply=callback('offlineAppliedRef.current = true',{
    offlineAppliedRef:{current:false},saved:{members:[],memorial:[],chronicle:[],lastSeen:0,runState:initialRunState(),generationState:null,visitor:null},
    initialGuild:{members:[]},
    seedMemberSeq:()=>{},reserveNames:()=>{},seedChronicle:()=>{},
    offlineGain:()=>({hours:2,gold:50}),setOfflineNote:()=>{},
    gainGold:(amount:number,source:any)=>{gold+=amount;stats=recordStatistics(stats,{type:'gold',source,amount})},
  })
  apply(); apply()
  assert.equal(gold,50); assert.equal(stats.goldEarned.offline,50)
})

test('actual expedition settlement counts once, pays rare gold only on first battle and clear bonus separately', () => {
  const r=beginBattle(createRun(squad(),BLACKMOSS,49,0,true,{heal:3,fury:3},false,[],{mult:2,rewardMult:2}),49)
  const ui = settlementUi(r.members)
  ui.scope.runRef.current = r
  r.battle!.status='guild-win'; ui.dungeon(r); ui.dungeon(r)
  assert.equal(ui.state.statistics.expeditionBattles.wins,1)
  assert.equal(ui.state.statistics.expeditions.wins,0)
  assert.equal(ui.state.gold,ECONOMY.battleGold.wave*2)
  // Complete a short fixture route through the same production settlement.
  const next = ui.scope.runRef.current
  const bossNode = next.map.layers[next.map.layers.length-1]![0]!
  next.nodeId = bossNode.id; next.path.push(bossNode.id)
  const bosses = BLACKMOSS.encounters.filter(e => e.kind === 'boss')
  next.battlesFought = 2 // 伪造首 boss 已胜 → 本场为末位 boss
  next.battle = { encounterId: bosses[0]!.id, status: 'guild-win', combatants: [], log: [], events: [], tick: 0, rngState: 1,
    commands: { stance: 'standard', healStock: 0, furyStock: 0, healCd: 0, furyCd: 0, furyUntil: 0, protectRetreat: true, autoMode: false } } as never
  startStep(next,50,0,ui.state.members)
  next.battle.status='guild-win'; ui.dungeon(next); ui.dungeon(next)
  const stats = ui.state.statistics
  assert.equal(stats.expeditionBattles.wins,2)
  assert.equal(stats.expeditions.wins,1)
  assert.equal(stats.goldEarned.expedition,ECONOMY.battleGold.wave*2 + ECONOMY.battleGold.boss)
  assert.equal(stats.goldEarned.clear,ECONOMY.clearBonus)
  assert.equal(ui.state.gold,totalGoldEarned(stats))
})

test('scar settlement: reserves/dead excluded, ordinary boss combat safe, near-death and deep tower work once', () => {
  const members=squad(); const reserve=generateMember('guard',5,1981)
  const run={members:[...members,reserve],battle:createBattle(members,BLACKMOSS,'enc-frogs',24,0,0,false)}
  run.battle.status='guild-win'
  run.battle.combatants.find(c=>c.team==='enemy')!.boss=true
  assert.deepEqual(settleScars(run,false,0,()=>0),[])
  run.battle=createBattle(members,BLACKMOSS,'enc-frogs',25,0,0,false); run.battle.status='guild-win'
  const near=run.battle.combatants.find(c=>c.memberId===members[0].id)!
  near.hp=near.maxHp*0.14
  const dead=run.battle.combatants.find(c=>c.memberId===members[1].id)!; dead.alive=false; dead.hp=0
  const scars=settleScars(run,false,6,()=>0)
  assert.equal(scars.length,1); assert.equal(scars[0].member.id,members[0].id)
  assert.equal(reserve.scars,undefined); assert.equal(members[1].scars,undefined)
  assert.deepEqual(settleScars(run,false,6,()=>0),[])
  members[0].scars=[{stat:'str',value:1,text:'a'},{stat:'str',value:1,text:'b'},{stat:'str',value:1,text:'c'}]
  run.battle=createBattle(members,BLACKMOSS,'enc-frogs',26,0,0,false); run.battle.status='guild-win'
  settleScars(run,false,6,()=>0)
  assert.equal(members[0].scars.length,3); assert.equal(reserve.scars,undefined)
})

test('witness scars: at most one per expedition, new expedition eligible again', () => {
  const members=squad()
  const run={members,battle:createBattle(members,BLACKMOSS,'enc-frogs',11,0,0,false)}
  run.battle.status='guild-win'
  assert.equal(settleScars(run,true,0,()=>0).length,3)
  run.battle=createBattle(members,BLACKMOSS,'enc-frogs',12,0,0,false); run.battle.status='guild-win'
  assert.equal(settleScars(run,true,0,()=>0).length,0)
  const next={members,battle:createBattle(members,BLACKMOSS,'enc-frogs',13,0,0,false)}; next.battle.status='guild-win'
  assert.equal(settleScars(next,true,0,()=>0).length,3)
})

test('Boss scar risk records actual fear/bind/pull/burn, ignores ordinary hits and interrupted casts', () => {
  const make=()=>createBattle(squad(),BLACKMOSS,'enc-frogs',31,0,0,false)
  const b=make(), boss=b.combatants.find(c=>c.team==='enemy')!, hero=b.combatants.find(c=>c.team==='guild')!
  boss.boss=true
  applyHit(b,boss,hero,1,'普攻')
  assert.equal(hero.scarMechanicHits,undefined)
  boss.traits=['ember-breath']; applyHit(b,boss,hero,1,'灼息'); assert.equal(hero.scarMechanicHits,1)
  boss.boss=false; applyHit(b,boss,hero,1,'杂兵灼息'); assert.equal(hero.scarMechanicHits,1)
  for(const kind of ['fear-aura','bind','pull'] as const) {
    const battle=make(), source=battle.combatants.find(c=>c.team==='enemy')!
    source.boss=true; source.bossMechanics=[{kind,name:'测试机制',params:{}}]; battle.tick=400
    if(kind==='fear-aura') source.mech={'fear-aura':{until:400}}
    processBossMechanics(battle)
    assert(battle.combatants.some(c=>c.team==='guild' && (c.scarMechanicHits??0)>0),kind)
  }
  const interrupted=make(), caster=interrupted.combatants.find(c=>c.team==='enemy')!
  caster.boss=true; caster.bossMechanics=[{kind:'fear-aura',name:'恐惧',params:{breakDamage:1}}]
  interrupted.tick=200; caster.mech={'fear-aura':{until:210,taken:2}}
  processBossMechanics(interrupted)
  assert(interrupted.combatants.filter(c=>c.team==='guild').every(c=>!c.scarMechanicHits))
  assert.equal(rollScarChance({mechanicHits:0,nearDeath:false,witnessedDeath:false,towerFloor:0}),0)
  assert(Math.abs(rollScarChance({mechanicHits:2,nearDeath:false,witnessedDeath:false,towerFloor:0})-0.19)<1e-10)
  assert.equal(rollScarChance({mechanicHits:2,nearDeath:true,witnessedDeath:true,towerFloor:8}),0.25)
})

test('difficulty model: rating is the single knob (U20/#0.8 replaces V1 mods)', () => {
  const targets = [[ASHFIELD, 1.237], [FROSTGRAVE, 0.95], [ABYSSALTAR, 1.05], [BLACKMOSS, 1.0]] as const
  for (const [dungeon, rating] of targets) {
    assert.equal(dungeon.rating, rating)
    assert.equal(dungeon.difficultyMods, undefined)
    assert.equal(dungeon.enemyPower, undefined)
  }
  const members = squad()
  const base = createBattle(members, BLACKMOSS, 'enc-frogs', 71)
  const ash = createBattle(members, ASHFIELD, 'enc-skeletons', 71)
  const baseEnemy = base.combatants.find((c) => c.team === 'enemy')!
  const ashEnemy = ash.combatants.find((c) => c.team === 'enemy')!
  // rating 语义:maxHp = base × rating × ENEMY_HP_MULT(曲线);ash attack = base × rating(单舍入)
  assert.equal(ashEnemy.maxHp, Math.round(828 * 1.237 * 1.1))
  assert.equal(ashEnemy.attack, Math.round(10 * 1.237 * (1 + (5 - 7 > 0 ? (5 - 7) * 0.06 : 0))))
  assert.equal(baseEnemy.maxHp, Math.round(428 * 1.0 * 1.1))
})

test('region two difficulty reaches actual wave and boss combatants without buffing the guild', () => {
  const members = squad()
  for (const dungeon of [EMBERPASS, SCALEHAVEN, FIRERIDGE, FORGEWORKS]) {
    for (const enc of dungeon.encounters) {
      const battle = createBattle(members, dungeon, enc.id, 817)
      const definitions = enc.bossId
        ? [dungeon.bosses[enc.bossId]]
        : enc.enemyGroupIds.flatMap(id => dungeon.enemyGroups[id])
      const enemies = battle.combatants.filter(c => c.team === 'enemy')
      assert.equal(enemies.length, definitions.length)
      enemies.forEach((enemy, i) => {
        const raw = definitions[i]
        // #0.8 rating 语义:maxHp = raw × rating × HP_MULT;attack = raw × rating(单舍入)
        assert.equal(enemy.maxHp, Math.round(raw.maxHp * dungeon.rating! * ENEMY_HP_MULT))
        assert.equal(enemy.attack, Math.round(raw.attack * dungeon.rating!))
      })
    }
  }
  // I7b:隘口(版图二首图)强于版图一团本毕业(荆棘)——跨版图边界
  assert.ok(EMBERPASS.rating! > THORNHOLD.rating!)
})


test('T3 equipment gate: second-region drops are T3 and Thornhold first-clear pity is green+', () => {
  for (const id of ['emberpass', 'scalehaven', 'fireridge', 'pilgrim-path', 'forge-works', 'dragonmaw']) {
    assert.equal(dungeonItemTier(id), 3)
    const drop = rollWaveDrop(id, () => 0.01)
    assert(drop)
    assert.equal(ITEM_BASES[drop.baseId].tier, 3)
  }
  const pity = rollBossDrops(THORNHOLD.bosses.victor.dropTable, 17, {
    pity: true,
    qualityBias: 0.12,
    minQuality: 'green',
  })
  assert(pity.length > 0)
  assert(pity.every((item) => ITEM_BASES[item.baseId].tier === 3))
  assert(pity.every((item) => item.quality === 'green' || item.quality === 'purple'))
})

test('actual route treasure handler draws only the map tier and exposes rewards once', () => {
  const dungeons = [BLACKMOSS, RUSTMINE, ASHFIELD, FROSTGRAVE, ABYSSALTAR, THORNHOLD,
    EMBERPASS, SCALEHAVEN, FIRERIDGE, PILGRIMPATH, FORGEWORKS, DRAGONMAW]
  for (const dungeon of dungeons) {
    assert(dungeon.terrains, dungeon.id)
    const pool = Object.values(ITEM_BASES).filter(b => b.tier === dungeonItemTier(dungeon.id))
    // Exercise every candidate through the actual callback, not a mirrored loot helper.
    for (let index = 0; index < pool.length; index++) {
      const run = createRun(squad(), dungeon, 404)
      run.phase = 'rest'
      // 改造 run 自己的地图:找/造一个宝箱节点(R1.1 后选路读本 run 的 map)
      const node = run.map.layers[0].find(n => n.kind === 'treasure' || n.kind === 'secret')
        ?? (() => { const n = run.map.layers[0][0]!; n.kind = 'treasure'; n.encounterId = undefined; return n })()
      assert(node, dungeon.id)
      let inventory: unknown[] = [], visible: unknown[] = []
      let gold = 0, chronicleCount = 0, updates = 0, nodeResult: string | undefined
      const values = [0, (index + 0.5) / pool.length]
      run.rng = () => values.shift() ?? 0.4
      const open = handler('chooseNode', {
        runRef: { current: run }, dungeonMastery: {}, moveTo, mapOptions, currentNode, nextBossEncounter, dungeonItemTier,
        CONDITION_BY_ID, REST_HEAL_PCT, describeItem, terrainEntryReward,
        GUILD_EVENTS, pendingConsequences: [], consequenceFiresIn, rollGuildEvent,
        ITEM_BASES, rollDrop, Math: { random: () => values.shift() ?? 0.4, floor: Math.floor },
        gainGold: (n: number, source: string) => { assert.equal(source, 'event'); gold += n },
        setInventory: (f: (v: unknown[]) => unknown[]) => { inventory = f(inventory) },
        setLastDrops: (f: (v: unknown[]) => unknown[]) => { visible = f(visible) },
        receiveItems: (items: unknown[], showDrops: boolean) => { inventory.push(...items); if(showDrops) visible.push(...items) },
        day: 1, chronicleRaw: (_day: number, text: string) => text,
        logChronicle: () => { chronicleCount++ }, setRun: () => { updates++ },
        changeProgress: (p: { lastNodeResult?: string | null }) => { if (p.lastNodeResult !== undefined) nodeResult = p.lastNodeResult },
        applyRestMorale: () => {}, manual: [], startStep: () => {},
        seedRef: { current: 1 }, SEED_BASE: 7, setRunning: () => {}, syncAll: () => {},
      })
      open(node.id)
      assert.equal((inventory[0] as { baseId: string }).baseId, pool[index].id)
      assert.equal(gold, 60)
      assert.deepEqual(visible, inventory)
      // U34(Q1 拍板):宝箱流水不进大事记,收获走结果条(lastNodeResult)当场可见
      assert.equal(chronicleCount, 0, '宝箱流水不进大事记(U34)')
      assert(nodeResult && nodeResult.includes('获得'), '宝箱结果条可见')
      assert.equal(updates, 1)
      open(node.id)
      assert.equal(inventory.length, 1)
      assert.equal(gold, 60)
    }
  }
})


test('recovery: authoritative progress publishes changes made by run and pending refs atomically', () => {
  const original = initialRunState(), progressRef = {current:original}, dispatched: any[] = []
  const changeProgress = handler('changeProgress', {progressRef,runReducer,dispatchProgress:(a:any)=>dispatched.push(a)})
  changeProgress({playing:true}); changeProgress({pendingDeparture:'shortcut'}); changeProgress({autoLoop:true})
  assert.equal(original.playing,false)
  assert.deepEqual(progressRef.current,{...original,playing:true,pendingDeparture:'shortcut',autoLoop:true})
  assert.equal(dispatched.at(-1).state,progressRef.current)
})

test('recovery: title does not simulate, entering the game restores once without replaying old visual events', () => {
  const r = beginBattle(createRun(squad(),BLACKMOSS,53),53)
  r.battle!.events.push({tick:0,type:'damage',targetId:r.battle!.combatants[0].id,amount:1})
  const resumeHandledRef={current:false}, eventCursorRef={current:0}, lastBattleRef={current:null}
  let themes=0, frames=0, notices=0, scheduled=0, timers=0
  const scope:any = {saved:{runState:{activeRun:r}},progressRef:{current:{...initialRunState(),activeRun:r}},
    resumeHandledRef,eventCursorRef,lastBattleRef,THEME_BY_DUNGEON:{},
    membersRef:{current:r.members},rendererRef:{current:{setTheme:()=>themes++,setMembers:()=>{},setBattle:(b:any,events:any[])=>{assert.equal(b,r.battle);assert.deepEqual(events,[]);frames++}}},
    setResumeNotice:()=>notices++,window:{setTimeout:()=>scheduled++},
    running:true,towerRunning:false,setInterval:()=>timers++}
  callback('resumeHandledRef.current = true',{...scope,screen:'title'})()
  callback('const timer = setInterval',{...scope,screen:'title'})()
  assert.equal(resumeHandledRef.current,false);assert.equal(timers,0);assert.equal(frames,0)
  const resume = callback('resumeHandledRef.current = true',{...scope,screen:'game'})
  resume();resume()
  assert.equal(eventCursorRef.current,r.battle!.events.length);assert.equal(lastBattleRef.current,r.battle)
  assert.equal(themes,1);assert.equal(frames,1);assert.equal(notices,1);assert.equal(scheduled,0)
})

test('recovery: pending and paid automatic events wait on the title; restored results cannot pay again', () => {
  let scheduled=0, choices=0
  const scope:any={pendingEvent:GUILD_EVENTS[0],eventResult:null,runRef:{current:null},autoLoopRef:{current:true},
    resolveEventRef:{current:()=>choices++},setTimeout:()=>{scheduled++;return 1},clearTimeout:()=>{}}
  const snippet="if (screen === 'title' || !pendingEvent || eventResult) return"
  callback(snippet,{...scope,screen:'title'})()
  callback(snippet,{...scope,screen:'game',eventResult:'已经到账'})()
  assert.equal(scheduled,0);assert.equal(choices,0)
  const cleanup=callback(snippet,{...scope,screen:'game'})()
  assert.equal(scheduled,1);assert.equal(typeof cleanup,'function')
  callback("if (screen === 'title' || !eventResult) return",{...scope,screen:'title',eventResult:'已经到账'})()
  assert.equal(scheduled,1)
})

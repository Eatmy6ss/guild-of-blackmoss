import assert from 'node:assert/strict'
import './mechanics.test'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { generateMember, grantExp, maxHpOf, levelTo } from '../src/sim/gen'
import { createBattle, stepBattle, toCombatant, applyHit, ENEMY_HP_MULT } from '../src/sim/combat'
import { processBossMechanics, bossIntents } from '../src/sim/mechanics'
import { runAutoAI } from '../src/sim/ai'
import { createRun, startStep, settleGrowth, advanceRun, retreatRun, applyNodeChoice } from '../src/sim/run'
import { startTower, startTowerFloor, towerEnemyScale, insureNextTowerFloor, towerNext, settleTowerFloor, towerMarkPermadeath } from '../src/sim/tower'
import { redeemCost, sellValue } from '../src/sim/tavern'
import { rollDrop, rollWaveDrop, rollBossDrops, dungeonItemTier } from '../src/sim/loot'
import { wishDone } from '../src/sim/wish'
import { assignTrait, waveDropBonus } from '../src/sim/member-traits'
import { attemptHeal, healingTerms, settleScars, rollScarChance } from '../src/sim/scars'
import { applyDeathShock, applyMoraleDelta } from '../src/sim/morale'
import { ITEM_BASES } from '../src/data/items'
import { AFFIXES } from '../src/data/affixes'
import { BLACKMOSS, RUSTMINE, ASHFIELD, FROSTGRAVE, ABYSSALTAR, THORNHOLD } from '../src/data/dungeons'
import { EMBERPASS, SCALEHAVEN, FIRERIDGE, PILGRIMPATH, FORGEWORKS, DRAGONMAW } from '../src/data/dungeons-r2'
import { ECONOMY } from '../src/data/economy'
import { migrate, saveGuild, loadGuildSave, exportSave, importSave, sanitizeMembers, SAVE_VERSION } from '../src/state/save'
import { newStatistics, recordStatistics, expeditionStatistics, normalizeStatistics, exportStatistics, totalGoldEarned, winRate } from '../src/sim/statistics'
import { GUILD_EVENTS, EVENT_CHANCE } from '../src/data/guild-events'
import { rollGuildEvent, SECOND_ACT_IDS, eventCount, pickOutcome } from '../src/sim/guild-events'
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
  let roster = [...initial], logs = 0, wishes = 0
  const membersRef = { current: roster }
  const sign = handler('signVisitor', {
    visitor, membersRef, runRef: { current: null }, towerRunRef: { current: null },
    aliveCount: () => membersRef.current.filter(m => m.alive).length,
    ROSTER_CAP: 6,
    rollWishFor: () => { wishes++ }, rollTraitFor: () => {},
    setMembers: (next: Member[] | ((old: Member[]) => Member[])) => {
      roster = typeof next === 'function' ? next(roster) : next
    },
    day: 1, chronicleRecruit: () => 'recruited',
    logChronicle: () => { logs++ }, setVisitor: () => {},
  })
  sign()
  sign()
  assert.equal(roster.filter(m => m.id === visitor.member.id).length, 1)
  assert.equal(roster.length, 3)
  assert.equal(membersRef.current.length, 3)
  assert.equal(logs, 1)
  assert.equal(wishes, 1)
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
  assert(loaded.members.every(m => m.hp === maxHpOf(m)))
  const wounded = { ...loaded.members[0], hp: 7 }
  const fallen = { ...loaded.members[1], alive: false, hp: 0 }
  const sentinel = { ...loaded.members[2], hp: -1 }
  const input = [wounded, fallen, sentinel]
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
      value: { getItem: () => JSON.stringify({ ...loaded, members: input }) },
    })
    assert.deepEqual(loadGuildSave()!.members, normalized)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})

test('tower rotates three wave groups independently of three bosses across two cycles', () => {
  const run = startTower(squad(), 301, { heal: 0, fury: 0 })
  const waves = ['frogs', 'wolves', 'leeches']
  const bosses = [BLACKMOSS.bosses.grush, BLACKMOSS.bosses.talma, RUSTMINE.bosses.delveanchor]
  let wave = 0
  for (let floor = 1; floor <= 18; floor++) {
    if (floor > 1) towerNext(run, 301)
    const enemies = run.battle!.combatants.filter(c => c.team === 'enemy')
    const expected = floor % 3 === 0
      ? [bosses[(floor / 3 - 1) % 3]]
      : BLACKMOSS.enemyGroups[waves[wave++ % 3]]
    assert.deepEqual(enemies.map(c => c.name), expected.map(c => c.name), `floor ${floor}`)
    enemies.forEach((c, i) => {
      assert.equal(c.maxHp, Math.round(expected[i].maxHp * towerEnemyScale(floor)))
      assert.equal(c.attack, Math.round(expected[i].attack * towerEnemyScale(floor)))
    })
  }
})

test('tower summons real scaled adds once without mutating source dungeon definitions', () => {
  const before = JSON.stringify([BLACKMOSS, RUSTMINE])
  const entries = [
    { floor: 3, group: BLACKMOSS.enemyGroups['frogs-frail'] },
    { floor: 6, group: BLACKMOSS.enemyGroups['wolves-frail'] },
    { floor: 9, group: RUSTMINE.enemyGroups['bats-frail'] },
    { floor: 12, group: BLACKMOSS.enemyGroups['frogs-frail'] },
  ]
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

const ast = ts.createSourceFile('App.tsx', readFileSync('src/App.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function handler(name: string, scope: Record<string, unknown>) {
  let expression: ts.Expression | undefined
  function visit(n: ts.Node) {
    if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) expression = n.initializer
    ts.forEachChild(n, visit)
  }
  visit(ast)
  assert(expression, name)
  const js = ts.transpileModule(`const fn = ${expression.getText(ast)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(scope), js + ';return fn;')(...Object.values(scope))
}

function callback(snippet: string, scope: Record<string, unknown>) {
  let expression: ts.ArrowFunction | undefined
  function visit(n: ts.Node) {
    if (ts.isArrowFunction(n) && n.getText(ast).includes(snippet) && (!expression || n.getWidth(ast) < expression.getWidth(ast))) expression = n
    ts.forEachChild(n, visit)
  }
  visit(ast); assert(expression, snippet)
  const js = ts.transpileModule(`const fn = ${expression.getText(ast)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(scope), js + ';return fn;')(...Object.values(scope))
}

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
    runRef,towerRunRef,trainingReadyRef,expedition,activeDungeon:BLACKMOSS,lastBranchRef:{current:''},refusesToMarch:()=>false,
    setDay:()=>{},setPendingConsequences:(f:any)=>f([]),setGuildBuffs:(f:any)=>f([]),growthSnapshotRef:{current:new Map()},
    powerScore:()=>1,bondStars:()=>0,createRun,seedRef:{current:1},SEED_BASE:31,memorialAura:()=>0,memorial:[],protectOn:true,potions:{heal:3,fury:3},
    setTrainingReady:(v:boolean)=>{ready=v},logChronicle:()=>{},chronicleRaw:()=>({}),day:1,autoLoopRef:{current:false},guildBuffs:[],rareHuntNext:null,
    setScarNotices:()=>{},setLastDrops:()=>{},rendererRef:{current:null},THEME_BY_DUNGEON:{},setRunning:()=>{},syncAll:()=>{},
  })
  start(BLACKMOSS.branches[0].id)
  assert.equal(runRef.current.trainingExpMultiplier,1.25); assert.equal(ready,false)
  runRef.current = null; start(BLACKMOSS.branches[0].id)
  assert.equal(runRef.current.trainingExpMultiplier,undefined)
})

test('actual tower death settlement: insured equipment returned once; uninsured charged, heroes stay dead', () => {
  for (const insured of [true,false]) {
    const members = squad(); members[0].equipment.weapon = item('wpn-t3-dawn')
    const equipment = members[0].equipment.weapon
    const t = startTower(members,1); t.battle!.status='guild-win'; settleTowerFloor(t)
    if (insured) insureNextTowerFloor(t,1000)
    towerNext(t,2)
    const victim = t.battle!.combatants.find(c=>c.memberId===members[0].id)!
    victim.alive=false; victim.hp=0; t.battle!.status='retreated'
    const state:any = {inventory:[],pendingRelics:[],memorial:[],blessing:0,lastDrops:[]}
    const scope:any = {towerRunRef:{current:t},membersRef:{current:members},settleScars,scarStatName:()=>'力量',setScarNotices:()=>{},towerMarkPermadeath,redeemCost,withLegacy:(x:any)=>x,fx:{blessingPerDeath:1},settleTowerFloor,setMembers:()=>{},setTowerRunning:()=>{},setTowerRun:()=>{},drainAndSync:()=>{},logChronicle:()=>{},chronicleRaw:()=>({}),day:1}
    let stats = newStatistics()
    scope.noteStatistics = (action:any) => {stats=recordStatistics(stats,action)}
    for(const key of ['Inventory','PendingRelics','Memorial','Blessing','LastDrops']) scope['set'+key]=(f:any)=>{const k=key[0].toLowerCase()+key.slice(1);state[k]=f(state[k])}
    const settle = callback("towerMarkPermadeath(t, '黑苔高塔')",scope)
    settle(); settle()
    assert.equal(members[0].alive,false); assert.equal(members[0].equipment.weapon,undefined)
    assert.equal(state.memorial.length,1)
    assert.equal(stats.towerFloors.retreats,1)
    assert.equal(stats.towerFloors.deaths,1)
    assert.equal(state.inventory.length,insured?1:0)
    assert.equal(state.pendingRelics.length,insured?0:1)
    if(insured) assert.equal(state.inventory[0].id,equipment!.id)
    else assert.equal(state.pendingRelics[0].redeem,redeemCost(equipment!,2))
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
  const r = createRun(squad(), BLACKMOSS, BLACKMOSS.branches[0].id, 49)
  r.eliteAt = []; r.eliteNow = true; startStep(r, 50)
  assert(r.battle!.combatants.filter(c => c.team === 'enemy').every(c => c.elite))
  startStep(r, 50)
  assert(r.battle!.combatants.filter(c => c.team === 'enemy').every(c => !c.elite))
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
  const boosted = createRun(squad(), BLACKMOSS, BLACKMOSS.branches[0].id, 19)
  const plain = createRun(squad(), BLACKMOSS, BLACKMOSS.branches[0].id, 19)
  boosted.trainingExpMultiplier = 1.25
  for (let i = 0; i < 2; i++) {
    const a = boosted.members[0].exp; const b = plain.members[0].exp
    boosted.battle!.status = plain.battle!.status = 'guild-win'
    settleGrowth(boosted); settleGrowth(plain)
    const raceMult = boosted.members[0].race === 'human' ? 1.05 : 1
    assert.equal(boosted.members[0].exp - a, Math.round(9 * 1.25 * raceMult))
    boosted.stepIdx++; plain.stepIdx++; startStep(boosted, 20+i); startStep(plain, 20+i)
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
  scope.newStatistics = newStatistics
  scope.setStatistics = (v:unknown) => {state.statistics=v}
  for (const key of ['Running','Run','Battle','Inventory','LastDrops','Memorial','Manual','Candidates','Visitor','Gold','Blessing','RecruitCooldown','Potions','RoyalNotice','HubScreen','UnlockedHybrids','DungeonMastery','Members','StarMarrow','PendingRelics','Buildings','Day','TowerBest','Chronicle','PendingConsequences','GuildBuffs','EventsSeen','RareHuntNext','PendingEvent','EventResult','EventImpacts','OfflineNote','ProtectOn','DungeonId','ExpeditionIds','DetailOpen','SaveTransfer','TowerRun','TowerRunning','TrainingReady','HealingMastery','HealingNotice','ScarNotices']) {
    scope['set'+key] = (v: unknown) => {state[key[0].toLowerCase()+key.slice(1)] = v}
  }
  scope.updateKingdom = (v: unknown) => {state.kingdom = v}
  handler('restartGuild', scope)()
  assert.equal(scope.pendingDepartureRef.current,null)
  assert.equal(scope.pendingConsequenceRef.current,null)
  assert.equal(scope.eventResolvingRef.current,false)
  const store = new Map<string,string>(); (globalThis as any).localStorage = {getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)}
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
  const r = createRun(squad(),BLACKMOSS,BLACKMOSS.branches[0].id,49)
  r.members[0].race='elf'
  r.steps = [BLACKMOSS.encounters.find(e=>e.kind==='wave')!.id,BLACKMOSS.encounters.find(e=>e.kind==='boss')!.id]
  startStep(r,49)
  const before = r.members[0].exp
  r.battle!.status='guild-win'
  advanceRun(r)
  assert.equal(r.stepIdx,1)
  settleGrowth(r)
  assert.equal(r.members[0].exp-before,9)
  startStep(r,50)
  r.battle!.status='guild-win'
  const bossBefore = r.members[0].exp
  advanceRun(r); settleGrowth(r)
  assert.equal(r.members[0].exp-bossBefore,50)
})

test('first encounter receives guild buffs, rare hunt and automatic commands', () => {
  const members = squad()
  const plain = createRun(structuredClone(members),BLACKMOSS,BLACKMOSS.branches[0].id,49)
  const boosted = createRun(structuredClone(members),BLACKMOSS,BLACKMOSS.branches[0].id,49,0,true,{heal:2,fury:1},true,
    [{id:'test',name:'test',desc:'test',mods:{atk:2}}],{mult:2,rewardMult:2})
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
  callback('const current = towerRunRef.current?.battle', {
    towerRunRef:{current:t}, battle:snapshot, stepBattle,
    setTowerRunning:(v:boolean)=>{running=v},
    drainAndSync:(b:unknown)=>{synced=b},
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
    stepBattle,drainAndSync:()=>{},setTowerRunning:()=>{},TICK_MS:100,
    setInterval:(fn:()=>void)=>{tick=fn;return 1},
    clearInterval:()=>{tick=undefined},
  })()
  const cleanup = effect(true)
  assert(tick); tick(); assert.equal(t.battle!.tick,1)
  cleanup()
  assert.equal(effect(false),undefined); assert.equal(tick,undefined)
  effect(true); tick!(); assert.equal(t.battle!.tick,2)
  let dependencyFound = false
  function visit(n:ts.Node) {
    if (ts.isCallExpression(n) && n.expression.getText(ast)==='useEffect' && n.arguments[0]?.getText(ast).includes('const timer = setInterval')) {
      assert.match(n.arguments[1].getText(ast),/towerRunning/)
      dependencyFound=true
    }
    ts.forEachChild(n,visit)
  }
  visit(ast); assert(dependencyFound)
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
    refusesToMarch:()=>false,pendingConsequences:queue,day:1,GUILD_EVENTS:[def],
    setPendingConsequences:(f:any)=>{queue=f(queue)},pendingDepartureRef,pendingConsequenceRef,
    setPendingEvent:(v:unknown)=>{event=v},setEventResult:()=>{},
    setDay:()=>{days++},createRun:()=>{created++},
  })(BLACKMOSS.branches[0].id)
  assert.equal(event,def); assert.deepEqual(queue,[due])
  assert.equal(pendingConsequenceRef.current,due)
  assert.equal(pendingDepartureRef.current,BLACKMOSS.branches[0].id)
  assert.equal(days,0); assert.equal(created,0)
})

test('event pools exhaustively cover local and common first acts without cross-region leakage', () => {
  const common = GUILD_EVENTS.filter(e => !e.region && !SECOND_ACT_IDS.has(e.id))
  assert(common.length > 0)
  assert(GUILD_EVENTS.filter(e => e.region?.includes('blackmoss-wild') && !SECOND_ACT_IDS.has(e.id)).length >= 30)
  for (const region of ['blackmoss-wild', 'dragonridge', undefined] as const) {
    const expected = GUILD_EVENTS.filter(e => !SECOND_ACT_IDS.has(e.id) && (!e.region || (region && e.region.includes(region))))
    const actual = expected.map((_, i) => rollGuildEvent(() => (i + 0.5) / expected.length, { force: true, context: { region } })!.id)
    assert.deepEqual(actual, expected.map(e => e.id))
    for (const e of common) assert(actual.includes(e.id))
    assert.equal(rollGuildEvent(() => EVENT_CHANCE, { context: { region } }), null)
    assert.equal(eventCount(), GUILD_EVENTS.length, 'regional draws must not truncate the encyclopedia')
  }
  for (const id of ['swamp-scent', 'frost-envoy', 'mining-strike', 'abyss-preacher', 'rare-hunt']) {
    assert.deepEqual(GUILD_EVENTS.find(e => e.id === id)!.region, ['blackmoss-wild'])
  }
  for (const id of ['dragon-cult', 'cult-purge', 'cult-recruiter', 'forge-sluice', 'ash-waymarkers']) {
    assert.deepEqual(GUILD_EVENTS.find(e => e.id === id)!.region, ['dragonridge'])
  }
  for (const id of ['deserter', 'night-knock', 'old-debt', 'bard-chronicle', 'orphan-apprentice']) {
    assert(common.some(e => e.id === id), id)
  }
})

test('regional delayed chains stay resolvable after travelling to the other region', () => {
  for (const source of GUILD_EVENTS) {
    for (const choice of source.choices) for (const outcome of choice.outcomes) {
      const delayed = outcome.effects?.delayed
      if (!delayed) continue
      const target = GUILD_EVENTS.find(e => e.id === delayed.eventId)!
      assert(target, delayed.eventId)
      assert.deepEqual(target.region, source.region, source.id)
      assert(SECOND_ACT_IDS.has(target.id))
      const dungeon = source.region?.includes('dragonridge') ? BLACKMOSS : EMBERPASS
      const due = { eventId: target.id, dueDay: 2 }
      let shown: unknown
      handler('startExpedition', {
        runRef: {current:null}, towerRunRef: {current:null}, pendingEvent:null,
        expedition:squad(), activeDungeon:dungeon, lastBranchRef:{current:''},
        refusesToMarch:()=>false, pendingConsequences:[due], day:1, GUILD_EVENTS,
        setPendingConsequences:()=>{}, pendingDepartureRef:{current:null},pendingConsequenceRef:{current:null},
        setPendingEvent:(e:unknown)=>{shown=e}, setEventResult:()=>{},
        setDay:()=>assert.fail('followup must precede departure'),
      })(dungeon.branches[0].id)
      assert.equal(shown, target)
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
      const run = createRun(members, EMBERPASS, EMBERPASS.branches[0].id, 41, 0, true, {heal:3,fury:3})
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
  const baseline = createRun(structuredClone(expedition),BLACKMOSS,BLACKMOSS.branches[0].id,99)
  const runRef:any = {current:null}
  const scope:any = {
    pendingEvent:null,pendingConsequences:[],runRef,towerRunRef:{current:null},
    expedition,activeDungeon:BLACKMOSS,lastBranchRef:{current:''},refusesToMarch:()=>false,
    setDay:()=>{},setGuildBuffs:(f:any)=>{buffs=f(buffs)},growthSnapshotRef:{current:new Map()},
    powerScore:()=>1,bondStars:()=>0,createRun,seedRef:{current:0},SEED_BASE:99,
    memorialAura:()=>0,memorial:[],protectOn:true,potions:{heal:3,fury:3},
    autoLoopRef:{current:false},rareHuntNext:null,trainingReadyRef:{current:false},
    setLastDrops:()=>{},setScarNotices:()=>{},rendererRef:{current:null},THEME_BY_DUNGEON:{},
    setRunning:()=>{},syncAll:()=>{},
  }
  handler('startExpedition',{...scope,day:20,guildBuffs:stored})(BLACKMOSS.branches[0].id)
  const baseAttack = baseline.battle!.combatants[0].attack
  assert.equal(runRef.current.battle.combatants[0].attack,Math.round(baseAttack*1.1))
  runRef.current=null
  handler('startExpedition',{...scope,day:21,guildBuffs:stored})(BLACKMOSS.branches[0].id)
  assert.equal(runRef.current.battle.combatants[0].attack,baseAttack)
  assert.deepEqual(buffs,[])
})

test('automatic toggle persists beyond the current battle into run and repeat state', () => {
  const b = createRun(squad(),BLACKMOSS,BLACKMOSS.branches[0].id,49).battle!
  const runRef = {current:{autoMode:false}}, autoLoopRef={current:false}
  const toggle = callback('autoLoopRef.current = b.commands.autoMode',{runRef,autoLoopRef})
  toggle(b)
  assert.equal(b.commands.autoMode,true); assert.equal(runRef.current.autoMode,true); assert.equal(autoLoopRef.current,true)
  toggle(b)
  assert.equal(b.commands.autoMode,false); assert.equal(runRef.current.autoMode,false); assert.equal(autoLoopRef.current,false)
})

test('retreat from rest cancels automatic repeat before returning to the guild', () => {
  const r = createRun(squad(),BLACKMOSS,BLACKMOSS.branches[0].id,49)
  r.phase='rest'; r.autoMode=true
  const autoLoopRef={current:true}
  let stats = newStatistics()
  handler('retreat',{runRef:{current:r},autoLoopRef,retreatRun,expeditionStatistics,noteStatistics:(action:any)=>{if(action)stats=recordStatistics(stats,action)},setRunning:()=>{},syncAll:()=>{}})()
  assert.equal(r.phase,'retreated'); assert.equal(r.autoMode,false); assert.equal(autoLoopRef.current,false)
  assert.equal(stats.expeditions.retreats,1); assert.equal(stats.expeditionBattles.retreats,0)
})

test('terminal saves use returned expedition or tower potions, never stale guild stock', () => {
  let saved:any
  const scope:Record<string,unknown> = {saveGuild:(v:unknown)=>{saved=v},statistics:newStatistics()}
  for (const key of ['trainingReady','rareHuntNext','starMarrow','pendingRelics','healingMastery','kingdom','members','inventory','memorial','manual','protectOn','gold','blessing','recruitCooldown','towerBest','chronicle','day','buildings','unlockedHybrids','dungeonMastery','pendingConsequences','eventsSeen','guildBuffs']) scope[key]=undefined
  const save = (run:unknown,towerRun:unknown) => callback('saveGuild({ trainingReady',{
    ...scope,run,towerRun,potions:{heal:9,fury:9},
  })()
  save({phase:'victory',potions:{heal:2,fury:1}},null)
  assert.deepEqual(saved.potions,{heal:2,fury:1})
  save(null,{phase:'ended',potions:{heal:0,fury:3}})
  assert.deepEqual(saved.potions,{heal:0,fury:3})
  saved=null
  save({phase:'battle'},null)
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
  const healed=attemptHeal(m,0,0,()=>0.6)!
  assert.equal(healed.result,'success'); assert.equal(m.scars.length,0); assert(toCombatant(m).attack>before)
  assert.equal(attemptHeal(m,0,0,()=>0),null)
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
  const heal=(overrides:any={})=>callback('const cost = healingTerms(sc, mastery)',{...scope,...state,...overrides})()
  heal({gold:119}); heal({blessing:2}); assert.equal(state.gold,300); assert.equal(m.scars.length,2)
  heal({runRef:{current:{}}}); assert.equal(state.gold,300)
  heal(); heal()
  assert.equal(state.gold,180); assert.equal(state.blessing,2); assert.equal(state.healingMastery.str,6)
  assert.equal(m.scars.length,1); assert.equal(m.scars[0].stat,'agi'); assert.match(state.notice,/已治愈/)
  healingBusyRef.current=false; heal(); assert.equal(state.gold,180)
  assert.deepEqual(stats.healing,{attempts:1,gold:120,blessing:3})
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
  const previous = {...importSave(readFileSync('docs/dev-save.txt','utf8'))!,version:17}
  previous.statistics = recordStatistics(newStatistics(20),{type:'gold',source:'event',amount:77})
  const current = migrate(previous as any)
  assert.equal(current.version,18)
  assert.equal(current.rareHuntNext,null)
  for (const key of ['gold','members','inventory','manual','statistics','potions','kingdom'] as const) {
    assert.deepEqual(current[key],previous[key],key)
  }
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
    ...old,pendingConsequences:[],eventsSeen:[],guildBuffs:[],rareHuntNext:hunt,run:null,towerRun:null,saveGuild,
  })()
  assert.deepEqual(loadGuildSave()!.rareHuntNext,hunt)
  const runRef:any = {current:null}
  let ready = loadGuildSave()!.rareHuntNext
  const scope:any = {
    pendingEvent:null,pendingConsequences:[],runRef,towerRunRef:{current:null},
    expedition:squad(),activeDungeon:BLACKMOSS,lastBranchRef:{current:''},refusesToMarch:()=>false,
    setDay:()=>{},setGuildBuffs:()=>{},growthSnapshotRef:{current:new Map()},
    powerScore:()=>1,bondStars:()=>0,createRun,seedRef:{current:0},SEED_BASE:99,
    memorialAura:()=>0,memorial:[],protectOn:true,potions:{heal:3,fury:3},day:20,guildBuffs:[],
    autoLoopRef:{current:false},trainingReadyRef:{current:false},setRareHuntNext:(v:any)=>{ready=v},
    setLastDrops:()=>{},setScarNotices:()=>{},rendererRef:{current:null},THEME_BY_DUNGEON:{},
    setRunning:()=>{},syncAll:()=>{},
  }
  handler('startExpedition',{...scope,rareHuntNext:ready})(BLACKMOSS.branches[0].id)
  assert.deepEqual(runRef.current.rareHunt,hunt)
  assert.equal(ready,null)
  runRef.current=null
  handler('startExpedition',{...scope,rareHuntNext:ready})(BLACKMOSS.branches[0].id)
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
    offlineAppliedRef:{current:false},saved:{members:[],memorial:[],chronicle:[],lastSeen:0},
    seedMemberSeq:()=>{},reserveNames:()=>{},seedChronicle:()=>{},
    offlineGain:()=>({hours:2,gold:50}),setOfflineNote:()=>{},
    gainGold:(amount:number,source:any)=>{gold+=amount;stats=recordStatistics(stats,{type:'gold',source,amount})},
  })
  apply(); apply()
  assert.equal(gold,50); assert.equal(stats.goldEarned.offline,50)
})

test('actual expedition settlement counts once, pays rare gold only on first battle and clear bonus separately', () => {
  const r=createRun(squad(),BLACKMOSS,BLACKMOSS.branches[0].id,49,0,true,{heal:3,fury:3},false,[],{mult:2,rewardMult:2})
  let stats=newStatistics(), gold=0
  const noteStatistics=(action:any)=>{if(action)stats=recordStatistics(stats,action)}
  const scope:any={
    manual:[],rollWaveDrop:()=>null,waveDropBonus:()=>0,
    updateKingdom:()=>{},settleKingdomBattle:()=>({}),kingdomRef:{current:{}},
    advanceRun,markPermadeath:()=>[],settleScars:()=>[],setScarNotices:()=>{},
    applyVictory:()=>{},logChronicle:()=>{},chronicleBattleVictory:()=>({}),day:1,
    ITEM_BASES,checkWishes:()=>{},settleGrowth,fx:{expMult:1},
    growthSnapshotRef:{current:new Map()},bondStars:()=>0,ECONOMY,
    setRecruitCooldown:()=>{},setDungeonMastery:()=>{},sfxVictory:()=>{},
    noteStatistics,expeditionStatistics,
    gainGold:(amount:number,source:any)=>{gold+=amount;noteStatistics({type:'gold',source,amount})},
  }
  const settle=handler('settleBattleEnd',scope)
  r.battle!.status='guild-win'; settle(r); settle(r)
  assert.equal(stats.expeditionBattles.wins,1)
  assert.equal(stats.expeditions.wins,0)
  assert.equal(gold,ECONOMY.battleGold.wave*2)
  // Complete a short fixture route through the same production settlement.
  r.steps=r.steps.slice(0,r.stepIdx+1)
  startStep(r,50)
  r.battle!.status='guild-win'; settle(r); settle(r)
  assert.equal(stats.expeditionBattles.wins,2)
  assert.equal(stats.expeditions.wins,1)
  assert.equal(stats.goldEarned.expedition,ECONOMY.battleGold.wave*3)
  assert.equal(stats.goldEarned.clear,ECONOMY.clearBonus)
  assert.equal(gold,totalGoldEarned(stats))
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

test('V1 difficulty mods are explicit, scoped, and preserve the base power line', () => {
  const targets = [ASHFIELD, FROSTGRAVE, ABYSSALTAR]
  for (const dungeon of targets) {
    assert.deepEqual(dungeon.difficultyMods, { enemyAttack: 1.15, enemyHp: 1.1 })
  }
  const regionTwo = [
    [EMBERPASS, 1.65, 1.55], [SCALEHAVEN, 2.25, 2], [FIRERIDGE, 2.15, 2],
    [PILGRIMPATH, 2.05, 1.9], [FORGEWORKS, 2.2, 2], [DRAGONMAW, 1.95, 1.9],
  ] as const
  for (const [dungeon, enemyAttack, enemyHp] of regionTwo) {
    assert.deepEqual(dungeon.difficultyMods, { enemyAttack, enemyHp })
  }
  assert.equal(BLACKMOSS.difficultyMods, undefined)
  const members = squad()
  const base = createBattle(members, BLACKMOSS, 'enc-frogs', 71)
  const ash = createBattle(members, ASHFIELD, 'enc-skeletons', 71)
  const baseEnemy = base.combatants.find((c) => c.team === 'enemy')!
  const ashEnemy = ash.combatants.find((c) => c.team === 'enemy')!
  assert.equal(ashEnemy.maxHp, Math.round(828 * 1.1 * 1.1 * 1.1))
  assert.equal(ashEnemy.attack, Math.round(10 * 1.1 * 1.15 * (1 + (5 - 7 > 0 ? (5 - 7) * 0.06 : 0))))
  assert.equal(baseEnemy.maxHp, Math.round(428 * 1.1))
  assert.equal(baseEnemy.attack, 8)
})

test('V1 growth awards exactly 9 wave experience and 50 boss experience', () => {
  const waveMembers = squad()
  const waveRun = createRun(waveMembers, BLACKMOSS, BLACKMOSS.branches[0].id, 81)
  waveRun.battle!.status = 'guild-win'
  settleGrowth(waveRun)
  assert.deepEqual(waveMembers.map((m) => m.exp), [9, 9, 9])

  const bossMembers = squad()
  const bossRun = createRun(bossMembers, BLACKMOSS, BLACKMOSS.branches[0].id, 82)
  bossRun.steps = ['enc-grush']
  bossRun.stepIdx = 0
  startStep(bossRun, 83)
  bossRun.battle!.status = 'guild-win'
  settleGrowth(bossRun)
  assert.deepEqual(
    bossMembers.map((m) => m.exp),
    bossMembers.map((m) => Math.round(50 * (m.race === 'human' ? 1.05 : 1))),
  )
})

test('region two difficulty reaches actual wave and boss combatants without buffing the guild', () => {
  const members = squad()
  for (const dungeon of [EMBERPASS, SCALEHAVEN, FIRERIDGE, PILGRIMPATH, FORGEWORKS, DRAGONMAW]) {
    for (const enc of dungeon.encounters) {
      const battle = createBattle(members, dungeon, enc.id, 817)
      const definitions = enc.bossId
        ? [dungeon.bosses[enc.bossId]]
        : enc.enemyGroupIds.flatMap(id => dungeon.enemyGroups[id])
      const enemies = battle.combatants.filter(c => c.team === 'enemy')
      assert.equal(enemies.length, definitions.length)
      enemies.forEach((enemy, i) => {
        const raw = definitions[i]
        const attack = raw.attack * dungeon.enemyPower!
        assert.equal(enemy.maxHp, Math.round(raw.maxHp * dungeon.enemyPower! * ENEMY_HP_MULT * dungeon.difficultyMods!.enemyHp!))
        assert.equal(enemy.attack, Math.round((enc.bossId ? Math.round(attack) : attack) * dungeon.difficultyMods!.enemyAttack!))
      })
      assert.deepEqual(
        battle.combatants.filter(c => c.team === 'guild').map(c => [c.attack, c.maxHp]),
        members.map(m => { const c = toCombatant(m); return [c.attack, c.maxHp] }),
      )
    }
  }
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
    const node = dungeon.routeNodes.find(n => n.kind === 'treasure')!
    assert(node, dungeon.id)
    const pool = Object.values(ITEM_BASES).filter(b => b.tier === dungeonItemTier(dungeon.id))
    // Exercise every candidate through the actual callback, not a mirrored loot helper.
    for (let index = 0; index < pool.length; index++) {
      const run = createRun(squad(), dungeon, dungeon.branches[0].id, 404)
      run.phase = 'rest'
      let inventory: unknown[] = [], visible: unknown[] = []
      let gold = 0, chronicleCount = 0, updates = 0
      const values = [0, (index + 0.5) / pool.length]
      const open = handler('continueDeep', {
        runRef: { current: run }, dungeonMastery: {}, applyNodeChoice, dungeonItemTier,
        ITEM_BASES, rollDrop, Math: { random: () => values.shift() ?? 0.4, floor: Math.floor },
        gainGold: (n: number, source: string) => { assert.equal(source, 'event'); gold += n },
        setInventory: (f: (v: unknown[]) => unknown[]) => { inventory = f(inventory) },
        setLastDrops: (f: (v: unknown[]) => unknown[]) => { visible = f(visible) },
        day: 1, chronicleRaw: (_day: number, text: string) => text,
        logChronicle: () => { chronicleCount++ }, setRun: () => { updates++ },
        applyRestMorale: () => {}, manual: [], startStep: () => {},
        seedRef: { current: 1 }, SEED_BASE: 7, setRunning: () => {}, syncAll: () => {},
      })
      open(node.id)
      assert.equal((inventory[0] as { baseId: string }).baseId, pool[index].id)
      assert.equal(gold, 60)
      assert.deepEqual(visible, inventory)
      assert.equal(chronicleCount, 1)
      assert.equal(updates, 1)
      open(node.id)
      assert.equal(inventory.length, 1)
      assert.equal(gold, 60)
    }
  }
})

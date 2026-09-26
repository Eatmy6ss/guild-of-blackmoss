import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { generateMember } from '../src/sim/gen'
import { createBattle, stepBattle, toCombatant, applyHit } from '../src/sim/combat'
import { processBossMechanics } from '../src/sim/mechanics'
import { createRun, startStep, settleGrowth } from '../src/sim/run'
import { startTower, insureNextTowerFloor, towerNext, settleTowerFloor, towerMarkPermadeath } from '../src/sim/tower'
import { redeemCost } from '../src/sim/tavern'
import { rollDrop, rollWaveDrop } from '../src/sim/loot'
import { wishDone } from '../src/sim/wish'
import { assignTrait, waveDropBonus } from '../src/sim/member-traits'
import { attemptHeal, healingTerms, settleScars, rollScarChance } from '../src/sim/scars'
import { applyDeathShock } from '../src/sim/morale'
import { ITEM_BASES } from '../src/data/items'
import { BLACKMOSS } from '../src/data/dungeons'
import { migrate, saveGuild, loadGuildSave, exportSave, importSave } from '../src/state/save'
import type { Member, Slot } from '../src/sim/types'

const squad = () => ['guard', 'priest', 'ranger'].map((j, i) => generateMember(j as Member['job'], 5, 901 + i))
const item = (id: string) => rollDrop(id, () => 0.4)
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
    for(const key of ['Inventory','PendingRelics','Memorial','Blessing','LastDrops']) scope['set'+key]=(f:any)=>{const k=key[0].toLowerCase()+key.slice(1);state[k]=f(state[k])}
    const settle = callback("towerMarkPermadeath(t, '黑苔高塔')",scope)
    settle(); settle()
    assert.equal(members[0].alive,false); assert.equal(members[0].equipment.weapon,undefined)
    assert.equal(state.memorial.length,1)
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
    assert.equal(boosted.members[0].exp - a, Math.round((plain.members[0].exp - b) * 1.25))
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
  for (const key of ['Running','Run','Battle','Inventory','LastDrops','Memorial','Manual','Candidates','Visitor','Gold','Blessing','RecruitCooldown','Potions','RoyalNotice','HubScreen','UnlockedHybrids','DungeonMastery','Members','StarMarrow','PendingRelics','Buildings','Day','TowerBest','Chronicle','PendingConsequences','GuildBuffs','EventsSeen','RareHuntNext','PendingEvent','EventResult','EventImpacts','OfflineNote','ProtectOn','DungeonId','ExpeditionIds','DetailOpen','SaveTransfer','TowerRun','TowerRunning','TrainingReady','HealingMastery','HealingNotice','ScarNotices']) {
    scope['set'+key] = (v: unknown) => {state[key[0].toLowerCase()+key.slice(1)] = v}
  }
  scope.updateKingdom = (v: unknown) => {state.kingdom = v}
  handler('restartGuild', scope)()
  const store = new Map<string,string>(); (globalThis as any).localStorage = {getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)}
  saveGuild(state as any)
  const saved = loadGuildSave()!
  assert(saved); assert.equal(saved.starMarrow,0); assert.deepEqual(saved.pendingRelics,[]); assert.equal(saved.trainingReady,false)
  assert.equal(saved.day,1); assert.equal(saved.towerBest,0); assert.equal(saved.gold,150)
  for (const key of ['chronicle','pendingConsequences','eventsSeen','guildBuffs','inventory','memorial','manual','unlockedHybrids']) assert.deepEqual(saved[key as keyof typeof saved], [], key)
  assert.deepEqual(saved.healingMastery,{}); assert.deepEqual(saved.buildings,{}); assert.deepEqual(saved.dungeonMastery,{})
})

test('published v15 scars and healing mastery survive v16 migration, export and reload', () => {
  const members = squad()
  members[0].scars = [{stat:'str',value:2,text:'旧伤'}]
  const old = migrate({version:15,members,inventory:[],memorial:[],manual:[],gold:700,blessing:9,recruitCooldown:0,towerBest:5,lastSeen:Date.now(),chronicle:[],day:8,buildings:{},potions:{heal:3,fury:3},unlockedHybrids:[],dungeonMastery:{},healingMastery:{str:4},starMarrow:7,pendingRelics:[],kingdom:{active:[],completed:[]}})
  assert.equal(old.version,16); assert.equal(old.trainingReady,false)
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
  for(const key of ['Gold','Blessing','HealingMastery']) scope['set'+key]=(f:any)=>{const k=key[0].toLowerCase()+key.slice(1);state[k]=f(state[k])}
  const heal=(overrides:any={})=>callback('const cost = healingTerms(sc, mastery)',{...scope,...state,...overrides})()
  heal({gold:119}); heal({blessing:2}); assert.equal(state.gold,300); assert.equal(m.scars.length,2)
  heal({runRef:{current:{}}}); assert.equal(state.gold,300)
  heal(); heal()
  assert.equal(state.gold,180); assert.equal(state.blessing,2); assert.equal(state.healingMastery.str,6)
  assert.equal(m.scars.length,1); assert.equal(m.scars[0].stat,'agi'); assert.match(state.notice,/已治愈/)
  healingBusyRef.current=false; heal(); assert.equal(state.gold,180)
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

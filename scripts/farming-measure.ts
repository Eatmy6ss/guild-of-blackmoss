// Budget-constrained repeat-farming fixtures, not a complete autonomous player.
import assert from 'node:assert/strict'
import { BLACKMOSS, RUSTMINE, ASHFIELD, FROSTGRAVE, ABYSSALTAR, THORNHOLD } from '../src/data/dungeons'
import { dungeonLock } from '../src/data/regions'
import { EMBERPASS } from '../src/data/dungeons-r2'
import { ITEM_BASES } from '../src/data/items'
import { ECONOMY } from '../src/data/economy'
import { generateMember, levelTo } from '../src/sim/gen'
import { createRng } from '../src/sim/rng'
import { toCombatant, stepBattle, setStance, setFocus, useHealPotion, useFuryPotion } from '../src/sim/combat'
import { bossIntents } from '../src/sim/mechanics'
import { createRun, advanceRun, markPermadeath, settleGrowth, startStep, resetAfterRun } from '../src/sim/run'
import { rollDrop, rollBossDrops, rollWaveDrop } from '../src/sim/loot'
import { sellValue, redeemCost, bountyCandidate, cooldownNeeded, rollVisitor } from '../src/sim/tavern'
import { settleScars, healingTerms, attemptHeal } from '../src/sim/scars'
import { applyVictory, applyDeathShock, applyRestMorale, applyFeast, refusesToMarch } from '../src/sim/morale'
import type { Member, ItemInstance, DungeonDef } from '../src/sim/types'

const offset = Number(process.env.FARM_SEED_OFFSET ?? 0)
const sampleCount = 20
const progression = process.env.FARM_PROGRESSION === '1'
const attempts = progression ? 100 : 20
const clearsToAdvance = Number(process.env.FARM_CLEARS ?? 3)
assert(Number.isSafeInteger(clearsToAdvance) && clearsToAdvance > 0)
const route = [BLACKMOSS, RUSTMINE, ASHFIELD, FROSTGRAVE, ABYSSALTAR, THORNHOLD, EMBERPASS]
const slots = ['weapon', 'armor', 'trinket'] as const
const jobs = ['guard', 'priest', 'ranger', 'guard', 'ranger'] as const
const legacyPrices = process.env.FARM_LEGACY_PRICES === '1'
const initialGold = Number(process.env.FARM_START_GOLD ?? 150)
const manualCommands = process.env.FARM_MANUAL === '1'
const recoveryPolicy = progression || process.env.FARM_RECOVERY === '1'
assert(!progression || !manualCommands, 'progression gear trials currently support auto commands only')
assert(Number.isSafeInteger(initialGold) && initialGold >= 0)
const price = (item: ItemInstance) => {
  if (!legacyPrices) return sellValue(item)
  const tier = item.baseId.includes('-t3-') || item.baseId.includes('-line-') ? 3 : item.baseId.includes('-t2-') ? 2 : 1
  const quality = item.quality === 'purple' ? 1.4 : item.quality === 'green' ? 1.15 : 1
  return Math.round((45 * tier + item.rolls.length * 12) * quality)
}
const redeem = (item: ItemInstance) => legacyPrices
  ? Math.ceil(price(item) * (item.quality === 'purple' ? 1.5 : item.quality === 'green' ? 1.2 : 1) * 1.5)
  : redeemCost(item)

// Explicit test policy: role-weighted panel score; not a claim of optimal gearing.
function score(member: Member, dungeon: DungeonDef) {
  const c = toCombatant(member)
  const offense = c.attack * (1 + c.critChance * 0.5) / c.attackInterval
  const survival = c.maxHp * (1 + c.defense / 20) * (1 + (c.healReceived ?? 0))
  const resistance = dungeon.env === 'heat' ? 1 + (c.fireResist ?? 0) : 1
  return c.role === 'tank' ? survival * resistance + offense * 5
    : offense * (c.role === 'healer' ? 120 : 150) + survival * 0.15 * resistance
}

// Shadow runs never grant rewards or mutate campaign members/RNG. Freeze growth
// and scars in both arms to isolate the equipment batch, not subsequent leveling.
function gearTrial(source: Member[], dungeon: DungeonDef, seed: number, potions: { heal: number; fury: number }) {
  const unchanged = JSON.stringify(source)
  const party = structuredClone(source)
  resetAfterRun(party)
  const branch = [...dungeon.branches].sort((a, b) => a.risk - b.risk)[0]
  const run = createRun(party, dungeon, branch.id, seed, 0, true, { ...potions }, true)
  let ticks = 0, battles = 0
  while (run.phase === 'battle') {
    const battle = run.battle!
    while (battle.status === 'running' && battle.tick < 6000) stepBattle(battle)
    assert.notEqual(battle.status, 'running', 'gear trial timeout')
    ticks += battle.tick
    advanceRun(run)
    markPermadeath(run)
    if (run.phase === 'rest') startStep(run, seed + ++battles * 131)
    assert(battles < 100)
  }
  assert.equal(JSON.stringify(source), unchanged, 'shadow trial mutated campaign members')
  return { won: run.phase === 'victory', ticks, deaths: party.filter(m => !m.alive).length }
}

function campaign(dungeon: DungeonDef, level: number, tier: number, seed: number) {
  const rng = createRng(710000 + seed)
  const members = jobs.slice(0, dungeon.size).map((job, i) => {
    const m = generateMember(job, 1, 510000 + seed * 10 + i, { race: 'human' })
    // IDs affect growth allocation: pin initial identities before leveling across policy runs.
    m.id = `farm-${seed}-${i}`
    levelTo(m, level)
    if (tier === 1) {
      const slot = job === 'guard' ? 'armor' : 'weapon'
      m.equipment[slot] = rollDrop(job === 'guard' ? 'arm-t1-mail' : job === 'priest' ? 'wpn-t1-sword' : 'wpn-t1-dagger', rng)
    } else {
      const weapon = job === 'guard' ? 'wpn-t2-greatsword' : job === 'priest' ? 'wpn-t2-staff' : 'wpn-t2-bow'
      const armor = job === 'priest' ? 'arm-t2-robe' : job === 'ranger' ? 'arm-t2-chain' : 'arm-t2-plate'
      for (const [i, id] of [weapon, armor, 'trk-t2-totem'].entries()) m.equipment[slots[i]] = rollDrop(id, rng)
    }
    return m
  })
  let gold = initialGold, blessing = 0, cooldown = 0
  const potions = { heal: 3, fury: 3 }
  const manual = new Set<string>()
  const inventory: ItemInstance[] = []
  const spares: ItemInstance[] = []
  const relics: { item: ItemInstance; cost: number }[] = []
  const mastery: Record<string, number> = {}
  let earned = 0, sold = 0, supply = 0, care = 0, recruitment = 0, recovery = 0
  let wins = 0, retreats = 0, wipes = 0, deaths = 0, dropped = 0, swaps = 0, ticks = 0, blocked = 0
  let lastUpgrade = 0, maxDry = 0, failureAt: number | null = null
  let recoveryLeft = 0, recoveryWins = 0, targetWins = 0, targetRuns = 0, rescueVisitors = 0, returnVisitors = 0
  const recoveryRuns: number[] = []
  let stage = 0, stageWins = 0, completed = false
  const stages: { map: string; entered: number; cleared: number | null; gold: number; levels: number[];
    tiers: number[]; qualities: string[]; jobs: string[]; runs: number; wins: number; deaths: number }[] = []
  const gearPairs = { batches: 0, trials: 0, beforeWins: 0, afterWins: 0, improved: 0, regressed: 0,
    bothWon: 0, beforeWinTicks: 0, afterWinTicks: 0, beforeDeaths: 0, afterDeaths: 0 }
  let transitionPair: { trials: number; thornholdWins: number; emberpassWins: number;
    thornholdDeaths: number; emberpassDeaths: number } | null = null
  const gain = (n: number) => { gold += n; earned += n }
  const collect = (items: ItemInstance[]) => { inventory.push(...items); dropped += items.length }
  const alive = () => members.filter(m => m.alive)
  const sell = (item: ItemInstance) => { const value = price(item); gold += value; sold += value }
  const reserveOrSell = (item: ItemInstance) => {
    if (!recoveryPolicy) { sell(item); return }
    const slot = ITEM_BASES[item.baseId].slot
    const previous = spares.findIndex(i => ITEM_BASES[i.baseId].slot === slot)
    if (previous < 0) spares.push(item)
    // Cheap reserve policy: keep one higher-value item per slot, not an optimal build.
    else if (price(item) > price(spares[previous])) { sell(spares[previous]); spares[previous] = item }
    else sell(item)
  }
  const partyFor = (size: number) => {
    const ready = alive().filter(m => !refusesToMarch(m))
    const selected: Member[] = []
    for (const role of ['tank', 'healer']) {
      const member = ready.find(m => toCombatant(m).role === role)
      if (member) selected.push(member)
    }
    for (const m of ready) if (!selected.includes(m) && selected.length < size) selected.push(m)
    return selected.slice(0, size)
  }
  function equipAndSell(round: number) {
    // One copy can go to one member only; compare the whole projected build per slot.
    while (inventory.length) {
      const item = inventory.shift()!
      const slot = ITEM_BASES[item.baseId].slot
      let target: Member | undefined, best = 1.01
      for (const m of alive()) {
        const before = score(m, dungeon), old = m.equipment[slot]
        m.equipment[slot] = item
        const ratio = score(m, dungeon) / before
        m.equipment[slot] = old
        if (ratio > best) { best = ratio; target = m }
      }
      if (target) {
        const old = target.equipment[slot]
        target.equipment[slot] = item
        if (old) reserveOrSell(old)
        swaps++
        maxDry = Math.max(maxDry, round - lastUpgrade)
        lastUpgrade = round
      } else {
        reserveOrSell(item)
      }
    }
  }
  for (let round = 1; round <= attempts; round++) {
    if (progression) dungeon = route[stage]
    if (recoveryPolicy) {
      // The tavern UI guarantees a visitor only while fewer than three members survive.
      while (alive().length < 3) {
        members.push(rollVisitor(rng, members).member)
        rescueVisitors++
      }
      inventory.push(...spares.splice(0))
      equipAndSell(round)
    }
    // No free money or free heroes: replacement uses the real bounty and cooldown policy.
    for (const job of jobs.slice(0, dungeon.size)) {
      const need = jobs.slice(0, dungeon.size).filter(j => j === job).length
      if (alive().filter(m => m.job === job).length >= need) continue
      if (alive().length >= 6) break
      if (gold < ECONOMY.bountyCost || (alive().length >= 3 && cooldown > 0)) continue
      gold -= ECONOMY.bountyCost; recruitment += ECONOMY.bountyCost
      members.push(bountyCandidate(rng, alive(), job))
      cooldown = cooldownNeeded(alive().length - 1)
    }
    // At most one treatment attempt per member and return. No fabricated blessings.
    for (const m of alive()) {
      const scar = m.scars?.[0]
      if (!scar) continue
      const terms = healingTerms(scar, mastery[scar.stat] ?? 0)
      if (gold < terms.gold || blessing < terms.blessing) continue
      gold -= terms.gold; care += terms.gold; blessing -= terms.blessing
      const result = attemptHeal(m, 0, mastery[scar.stat] ?? 0, rng)!
      mastery[scar.stat] = (mastery[scar.stat] ?? 0) + result.masteryGain
    }
    if (alive().some(refusesToMarch) && gold >= 60) {
      gold -= 60; recovery += 60; applyFeast(alive())
    }
    for (const key of ['heal', 'fury'] as const) {
      while (potions[key] < 3 && gold >= ECONOMY.potionCost[key]) {
        gold -= ECONOMY.potionCost[key]; supply += ECONOMY.potionCost[key]; potions[key]++
      }
    }
    for (let i = relics.length - 1; i >= 0; i--) {
      if (gold < relics[i].cost) continue
      const slot = ITEM_BASES[relics[i].item.baseId].slot
      if (!alive().some(m => !m.equipment[slot])) continue
      gold -= relics[i].cost; recovery += relics[i].cost
      inventory.push(relics[i].item); relics.splice(i, 1)
    }
    equipAndSell(round)
    const fallback = recoveryPolicy && dungeon.id !== BLACKMOSS.id &&
      (recoveryLeft > 0 || partyFor(dungeon.size).length < dungeon.size)
    const activeDungeon = fallback ? BLACKMOSS : dungeon
    const party = recoveryPolicy ? partyFor(activeDungeon.size) : alive()
    if (party.length < activeDungeon.size || party.some(refusesToMarch)) { blocked++; break }
    if (progression) {
      assert.equal(dungeonLock(activeDungeon.id, [...manual]), null, 'entered locked dungeon')
      if (!fallback && !stages.some(s => s.map === dungeon.id)) {
        stages.push({ map: dungeon.id, entered: round, cleared: null, gold,
          levels: party.map(m => m.level),
          jobs: party.map(m => m.spec ?? m.job), runs: 0, wins: 0, deaths: 0,
          qualities: party.flatMap(m => Object.values(m.equipment).filter((i): i is ItemInstance => !!i).map(i => i.quality)),
          tiers: party.flatMap(m => Object.values(m.equipment).filter((i): i is ItemInstance => !!i).map(i => ITEM_BASES[i.baseId].tier)) })
        // Compare both maps with the same earned guild assets at the boundary,
        // preserving their actual five/three-member party sizes.
        const raidParty = partyFor(THORNHOLD.size)
        if (dungeon.id === EMBERPASS.id && raidParty.length === THORNHOLD.size) {
          transitionPair = { trials: 10, thornholdWins: 0, emberpassWins: 0, thornholdDeaths: 0, emberpassDeaths: 0 }
          for (let trial = 0; trial < 10; trial++) {
            const trialSeed = 910000 + seed * 100 + trial
            const raid = gearTrial(raidParty, THORNHOLD, trialSeed, potions)
            const entry = gearTrial(party, EMBERPASS, trialSeed, potions)
            transitionPair.thornholdWins += Number(raid.won)
            transitionPair.emberpassWins += Number(entry.won)
            transitionPair.thornholdDeaths += raid.deaths
            transitionPair.emberpassDeaths += entry.deaths
          }
        }
      }
      if (!fallback) stages.find(s => s.map === dungeon.id)!.runs++
    }
    resetAfterRun(members)
    if (!fallback) targetRuns++
    const branch = [...activeDungeon.branches].sort((a, b) => a.risk - b.risk)[0]
    const run = createRun(party, activeDungeon, branch.id, seed * 100 + round, 0, true, { ...potions }, !manualCommands)
    let battles = 0
    while (run.phase === 'battle') {
      const b = run.battle!
      while (b.status === 'running' && b.tick < 6000) {
        if (manualCommands && b.tick % 5 === 0) {
          const intents = bossIntents(b)
          setStance(b, intents.telegraphing ? 'spread' : 'standard')
          const boss = b.combatants.find(c => c.alive && c.boss)
          if (boss) setFocus(b, boss.id)
          const guild = b.combatants.filter(c => c.team === 'guild' && c.alive)
          if (guild.some(c => c.hp / c.maxHp < 0.55)) useHealPotion(b)
          if (boss?.mech?.enrage?.fired === 1) useFuryPotion(b)
        }
        stepBattle(b)
      }
      assert.notEqual(b.status, 'running', 'battle timeout')
      ticks += b.tick
      const enc = activeDungeon.encounters.find(e => e.id === b.encounterId)!
      if (b.status === 'guild-win') {
        gain(enc.kind === 'boss' ? ECONOMY.battleGold.boss : ECONOMY.battleGold.wave)
        if (enc.bossId) {
          const pity = !manual.has(enc.bossId)
          collect(rollBossDrops(activeDungeon.bosses[enc.bossId].dropTable, Math.floor(rng() * 1e9),
            activeDungeon.id === 'thornhold' && pity && enc.bossId === 'victor'
              ? { pity, qualityBias: 0.12, minQuality: 'green' } : { pity }))
          manual.add(enc.bossId)
        } else {
          const item = rollWaveDrop(activeDungeon.id, rng, b.combatants.some(c => c.team === 'enemy' && c.elite))
          if (item) collect([item])
        }
      }
      advanceRun(run)
      const fallen = markPermadeath(run)
      settleScars(run, fallen.length > 0, 0, rng)
      deaths += fallen.length; blessing += fallen.length * ECONOMY.blessingPerDeath
      if (progression && !fallback) stages.find(s => s.map === dungeon.id)!.deaths += fallen.length
      for (const dead of fallen) {
        const m = run.members.find(m => m.id === dead.id)!
        for (const slot of slots) {
          const item = m.equipment[slot]
          if (item) relics.push({ item, cost: redeem(item) })
          m.equipment[slot] = undefined
        }
      }
      const survivors = run.members.filter(m => m.alive)
      if (fallen.length) applyDeathShock(fallen[0].id, survivors)
      if (b.status === 'guild-win') applyVictory(survivors)
      settleGrowth(run)
      cooldown = Math.max(0, cooldown - 1)
      if (run.phase === 'rest') {
        applyRestMorale(survivors); startStep(run, seed * 10000 + round * 100 + ++battles)
      }
      assert(battles < 100)
    }
    Object.assign(potions, run.potions)
    if (run.phase === 'victory') {
      wins++; gain(ECONOMY.clearBonus)
      if (fallback) { recoveryWins++; recoveryLeft = Math.max(0, recoveryLeft - 1) }
      else {
        targetWins++
        if (progression) { stageWins++; stages.find(s => s.map === dungeon.id)!.wins++ }
        if (failureAt !== null) { recoveryRuns.push(round - failureAt); failureAt = null }
      }
    } else {
      if (run.phase === 'defeat') wipes++
      else retreats++
      if (failureAt === null) failureAt = round
      if (recoveryPolicy) recoveryLeft = 2
    }
    const probeParty = progression ? partyFor(dungeon.size) : []
    const beforeGear = structuredClone(probeParty)
    const previousSwaps = swaps
    equipAndSell(round)
    const partyGearChanged = JSON.stringify(beforeGear.map(m => m.equipment)) !== JSON.stringify(probeParty.map(m => m.equipment))
    if (progression && swaps > previousSwaps && partyGearChanged && probeParty.length === dungeon.size &&
      (dungeon.id === THORNHOLD.id || dungeon.id === EMBERPASS.id)) {
      gearPairs.batches++
      const afterGear = structuredClone(probeParty)
      for (let trial = 0; trial < 3; trial++) {
        const trialSeed = 810000 + seed * 1000 + round * 3 + trial
        const before = gearTrial(beforeGear, dungeon, trialSeed, potions)
        const after = gearTrial(afterGear, dungeon, trialSeed, potions)
        gearPairs.trials++
        gearPairs.beforeWins += Number(before.won); gearPairs.afterWins += Number(after.won)
        gearPairs.beforeDeaths += before.deaths; gearPairs.afterDeaths += after.deaths
        gearPairs.improved += Number(!before.won && after.won)
        gearPairs.regressed += Number(before.won && !after.won)
        if (before.won && after.won) {
          gearPairs.bothWon++
          gearPairs.beforeWinTicks += before.ticks; gearPairs.afterWinTicks += after.ticks
        }
      }
    }
    if (recoveryPolicy && rng() < ECONOMY.visitorChance && alive().length < 6) {
      members.push(rollVisitor(rng, members).member)
      returnVisitors++
    }
    assert(alive().length <= 6)
    const owned = [...alive().flatMap(m => Object.values(m.equipment).filter((i): i is ItemInstance => !!i)), ...spares, ...inventory, ...relics.map(r => r.item)]
    assert.equal(new Set(owned.map(i => i.id)).size, owned.length, 'equipment duplicated across ownership locations')
    if (progression && stageWins >= clearsToAdvance) {
      stages.find(s => s.map === dungeon.id)!.cleared = round
      if (stage === route.length - 1) { completed = true; break }
      stage++; stageWins = 0
    }
  }
  maxDry = Math.max(maxDry, wins + retreats + wipes - lastUpgrade)
  assert.equal(gold, initialGold + earned + sold - supply - care - recruitment - recovery)
  assert(gold >= 0)
  return { wins, retreats, wipes, blocked, deaths, dropped, swaps, maxDry, gold, earned, sold, supply,
    targetWins, targetRuns, recoveryWins, rescueVisitors, returnVisitors, spareItems: spares.length,
    care, recruitment, recovery, pendingRelics: relics.length, untreatedScars: alive().reduce((n, m) => n + (m.scars?.length ?? 0), 0),
    unresolvedFailure: failureAt !== null, recoveryRuns, ticks, ...(progression ? { completed, stages, gearPairs, transitionPair } : {}) }
}

const scenarios = [
  { dungeon: BLACKMOSS, level: 5, tier: 1 },
  { dungeon: ASHFIELD, level: 7, tier: 1 },
  { dungeon: THORNHOLD, level: 11, tier: 2 },
  { dungeon: EMBERPASS, level: 11, tier: 2 },
]
const median = (xs: number[]) => {
  if (!xs.length) return null
  const sorted = [...xs].sort((a, b) => a - b), mid = Math.floor(xs.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
console.log(JSON.stringify({ policy: '20 campaigns x up to 20 runs per fixture; protect ON; no events, buildings, commissions, wishes, boss-firstkill combat bonus, route choices or offline income; greedy panel gear heuristic. Recovery mode enables actual tavern visitor rules, 3 spare slots and two successful Blackmoss runs before retrying a failed target. Fallback wins never count as target recovery. Manual mode is a deterministic command bot, not a human player. No claim of whole-game balance.', offset, legacyPrices, initialGold, manualCommands, recoveryPolicy }))
if (progression) console.log(JSON.stringify({ progression: true, attempts, clearsToAdvance,
  route: route.map(d => d.id), start: 'Lv5 human guard/priest/ranger, one T1 each, 150 gold unless overridden; continuous assets; not full UI new-game simulation',
  gearTrial: '3 paired full runs per changed active-party post-return gear batch in thornhold/emberpass; same roster, stats, scars, potions and seed, frozen growth; independent of campaign RNG/rewards',
  transitionTrial: '10 paired seeds at first emberpass entry; same earned guild assets, actual 5/3 party sizes, frozen growth; only guilds with five ready members; not new-game population win rates' }))
for (const scenario of progression ? [scenarios[0]] : scenarios) {
  const results = Array.from({ length: sampleCount }, (_, i) => campaign(scenario.dungeon, scenario.level, scenario.tier, offset + i + 1))
  const sum = (key: 'wins' | 'retreats' | 'wipes' | 'blocked' | 'deaths' | 'swaps' | 'targetWins' | 'targetRuns' | 'recoveryWins' | 'rescueVisitors' | 'returnVisitors') => results.reduce((n, r) => n + r[key], 0)
  console.log(JSON.stringify({
    map: progression ? 'continuous-route' : scenario.dungeon.id, level: scenario.level, initialTier: scenario.tier,
    wins: sum('wins'), retreats: sum('retreats'), wipes: sum('wipes'), blocked: sum('blocked'), deaths: sum('deaths'),
    targetWins: sum('targetWins'), targetRuns: sum('targetRuns'), recoveryWins: sum('recoveryWins'),
    rescueVisitors: sum('rescueVisitors'), returnVisitors: sum('returnVisitors'),
    swaps: sum('swaps'), medianMaxDryRuns: median(results.map(r => r.maxDry)),
    medianGold: median(results.map(r => r.gold)), medianEarned: median(results.map(r => r.earned)),
    medianSold: median(results.map(r => r.sold)), medianSupply: median(results.map(r => r.supply)),
    medianCare: median(results.map(r => r.care)), medianRecruitment: median(results.map(r => r.recruitment)),
    medianRecovery: median(results.map(r => r.recovery)), medianUntreatedScars: median(results.map(r => r.untreatedScars)),
    unresolvedFailures: results.filter(r => r.unresolvedFailure).length,
    medianRecoveryRuns: median(results.flatMap(r => r.recoveryRuns)), results,
  }))
}

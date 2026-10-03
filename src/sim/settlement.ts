import { ECONOMY } from '../data/economy'
import { DUNGEONS } from '../data/dungeons'
import { DUNGEON_FINAL_BOSS } from '../data/regions'
import { ITEM_BASES } from '../data/items'
import { JOBS } from '../data/jobs'
import { COMMISSIONS } from '../data/kingdom'
import { baseEffects } from '../data/base'
import type { DeadHero, ItemInstance, Member } from './types'
import { advanceRun, markPermadeath, settleGrowth, type DungeonRun, type GrowthResult } from './run'
import { buildBattleSummary, type BattleSummary } from './battle-summary'
import { rankPromotion } from './rank'
import { appendFact, pruneFacts, type FactLedger } from './fact-ledger'
import { settleTowerFloor, type TowerRun } from './tower'
import { rollBossDrops, rollWaveDrop } from './loot'
import { waveDropBonus } from './member-traits'
import { applyDeathShock, applyVictory, applyMoraleDelta } from './morale'
import { settleScars, scarStatName, type Scar } from './scars'
import { computeLegacy } from './memorial'
import { redeemCost } from './tavern'
import { settleWishes } from './wish'
import { bondStars } from './gen'
import { settleKingdomBattle, type KingdomState } from './kingdom'
import { expeditionStatistics, type StatisticsAction } from './statistics'
import {
  chronicleRaw, chronicleHeroFall, chronicleFirstKill, chronicleBattleVictory, chronicleWipeRebuild,
  chronicleLevelUp, chronicleBondStar, chronicleTowerRecord, type ChronicleEntry,
} from './chronicle'
import type { Rng } from './rng'
import { runMembers, runDungeon, runRng, syncRunParty } from './run-core'

export interface EncounterGuild {
  /** A2 事实账本:settlement 是唯一追加方之一(App 侧只经账本函数) */
  factLedger: FactLedger
  members: Member[]
  manual: string[]
  kingdom: KingdomState
  dungeonMastery: Record<string, number>
  towerBest: number
  recruitCooldown: number
  day: number
  buildings: Record<string, number>
  chronicle: ChronicleEntry[]
}

type DungeonInput = { source: 'dungeon'; run: DungeonRun; guild: EncounterGuild }
type TowerInput = { source: 'tower'; run: TowerRun; guild: EncounterGuild }
export type EncounterInput = DungeonInput | TowerInput

export interface EncounterConsequences {
  deathShock: { memberId: string; deadId: string; morale: number; bond: number }[]
  chronicle: ChronicleEntry[]
  scars: { memberId: string; scar: Scar }[]
  relics: { item: ItemInstance; hero: string; redeem: number }[]
  morale: { memberId: string; delta: number }[]
  wishes: { memberId: string; text: string }[]
  growth: GrowthResult
  kingdom: KingdomState | undefined
  mastery: { dungeonId: string; gain: number } | undefined
}

interface OutcomeBase {
  win: boolean
  deaths: DeadHero[]
  survivors: string[]
  loot: { items: ItemInstance[]; gold: number; clearGold: number; starMarrow: number }
  exp: number
  blessing: number
  guild: EncounterGuild
  consequences: EncounterConsequences
  statistics: StatisticsAction[]
  notices: string[]
  sound: 'victory' | 'defeat' | null
  /** A15 战后小结:败因/死因/关键时刻一屏(纯聚合) */
  summary: BattleSummary
}
export type DungeonOutcome = OutcomeBase & { source: 'dungeon'; run: DungeonRun }
export type TowerOutcome = OutcomeBase & { source: 'tower'; run: TowerRun }
export type EncounterOutcome = DungeonOutcome | TowerOutcome

export function settleEncounter(input: DungeonInput, rng?: Rng): DungeonOutcome | null
export function settleEncounter(input: TowerInput, rng?: Rng): TowerOutcome | null
export function settleEncounter(input: EncounterInput, rng?: Rng): EncounterOutcome | null
/** 输入/React/存档均不修改。随机数是显式依赖，物品身份和编年史序号由本趟上下文确定。 */
export function settleEncounter(input: EncounterInput, rng?: Rng): EncounterOutcome | null {
  const original = input.run
  if (original.phase !== 'battle' || !original.battle || original.battle.status === 'running') return null
  const guild: EncounterGuild = {
    ...input.guild,
    members: structuredClone(input.guild.members),
    manual: [...input.guild.manual],
    dungeonMastery: { ...input.guild.dungeonMastery },
    // A2:账本必须显式拷贝——appendFact 原地改写,浅拷贝会穿透到输入方(违反结算契约,run-recovery 抓过)
    factLedger: { nextId: input.guild.factLedger.nextId, facts: [...input.guild.factLedger.facts] },
  }
  const members = runMembers(original, guild.members)
  // 旧模拟助手只改成员/阶段/药水及 scarsSettled；隔离这些可写对象，战斗日志不复制。
  const common = { ...original, party: original.party.map(p => ({ ...p })), battle: { ...original.battle }, witnessScarredIds: [...(original.witnessScarredIds ?? [])] }
  rng ??= runRng(common)
  const outcome = {
    source: input.source,
    run: common,
    win: common.battle.status === 'guild-win',
    deaths: [], survivors: [],
    loot: { items: [], gold: 0, clearGold: 0, starMarrow: 0 },
    exp: 0, blessing: 0, guild,
    consequences: {
      deathShock: [], chronicle: [], scars: [], relics: [], morale: [], wishes: [],
      growth: { experience: [], bonds: [] }, kingdom: undefined, mastery: undefined,
    },
    statistics: [], notices: [], sound: null,
    summary: { status: common.battle.status, win: false, wiped: false, deaths: [], topDamage: [], moments: [] },
  } as EncounterOutcome
  const c = outcome.consequences
  const day = guild.day
  const moments: string[] = []
  let seq = guild.chronicle.reduce((max, e) => Math.max(max, e.seq), 0)
  let itemSeq = 0
  const encounterId = input.source === 'dungeon' ? input.run.stepIdx : input.run.floor
  const itemId = () => `i-${original.id}-${encounterId}-${++itemSeq}`
  const effects = baseEffects(guild.buildings)
  const place = input.source === 'dungeon' ? runDungeon(input.run).name : `黑苔高塔第 ${input.run.floor} 层`

  if (outcome.source === 'dungeon') {
    const r = outcome.run
    const enc = runDungeon(r).encounters.find(e => e.id === r.steps[r.stepIdx])
    if (outcome.win && enc?.kind === 'boss' && enc.bossId) {
      const boss = runDungeon(r).bosses[enc.bossId]
      const pity = !guild.manual.includes(enc.bossId)
      const entryGate = runDungeon(r).id === 'thornhold' && enc.bossId === 'victor' && pity
      outcome.loot.items.push(...rollBossDrops(boss.dropTable, rng,
        entryGate ? { pity, qualityBias: 0.12, minQuality: 'green', itemId } : { pity, itemId }))
      if (pity) {
        guild.manual.push(enc.bossId)
        c.chronicle.push(chronicleFirstKill(day, boss.name, members.find(m => m.alive) ?? members[0], ++seq))
        moments.push('公会首杀:' + boss.name)
        const killer = members.find(m => m.alive) ?? members[0]
        appendFact(guild.factLedger, day, { kind: 'first-kill', actors: [killer.id], names: { [killer.id]: killer.name }, refs: { bossId: enc.bossId, dungeonId: runDungeon(r).id, encounter: encounterId } })
      }
    } else if (outcome.win) {
      const drop = rollWaveDrop(runDungeon(r).id, rng, common.battle.combatants.some(x => x.team === 'enemy' && x.elite),
        waveDropBonus(members.filter(m => common.battle.combatants.some(x => x.memberId === m.id && x.alive))), itemId)
      if (drop) outcome.loot.items.push(drop)
    }
    guild.kingdom = settleKingdomBattle(guild.kingdom, r)
    c.kingdom = guild.kingdom
    outcome.loot.gold = outcome.win
      ? Math.round((enc?.kind === 'boss' ? ECONOMY.battleGold.boss : ECONOMY.battleGold.wave) * (r.rareHunt && r.stepIdx === 0 ? r.rareHunt.rewardMult : 1)) : 0
    // 必须在推进索引前捕获遭遇奖励/委托；先推进再登记死亡保持副本旧顺序。
    advanceRun(r, guild.members)
    outcome.deaths = markPermadeath({ ...r, members }, place)
    if (outcome.win) {
      const gain = enc?.kind === 'boss' ? 2 : 1
      guild.dungeonMastery[runDungeon(r).id] = (guild.dungeonMastery[runDungeon(r).id] ?? 0) + gain
      c.mastery = { dungeonId: runDungeon(r).id, gain }
    }
    guild.recruitCooldown = Math.max(0, guild.recruitCooldown - 1)
    if (r.phase === 'victory') { outcome.loot.clearGold = ECONOMY.clearBonus; outcome.sound = 'victory' }
    if (r.phase === 'defeat') outcome.sound = 'defeat'
    const action = expeditionStatistics(r)
    if (action) outcome.statistics.push(action)
  } else {
    // 死亡先于创伤和经验，沿用高塔保险/遗物顺序；阶段与药水仍由原塔层助手写回。
    outcome.deaths = markPermadeath({ ...outcome.run, members }, place)
  }

  const dead = outcome.deaths
  for (const d of dead) {
    if (d.death) appendFact(guild.factLedger, day, { kind: 'death', actors: [d.id], names: { [d.id]: d.name }, cause: d.death, refs: { dungeonId: d.death.where.id, floor: d.death.where.floor, encounter: encounterId } })
  }
  const scars = settleScars({ ...outcome.run, members }, dead.length > 0, input.source === 'tower' ? input.run.floor : 0, rng)
  c.scars = scars.map(({ member, scar }) => ({ memberId: member.id, scar }))
  for (const { member, nearDeath } of scars) {
    const scarNth = (member.scars?.length ?? 0)
    appendFact(guild.factLedger, day, { kind: 'scar', actors: [member.id], names: { [member.id]: member.name }, refs: { dungeonId: input.source === 'dungeon' ? input.run.dungeonId : 'tower', floor: input.source === 'tower' ? input.run.floor : undefined, nearDeath, scarNth } })
  }
  for (const { member, scar } of scars) {
    const text = member.name + ' 新增创伤：' + scarStatName(scar.stat) + ' -' + scar.value + '（' + scar.text + '），可回基地疗养。'
    outcome.notices.push(text)
    c.chronicle.push(chronicleRaw(day, text, ++seq))
  }
  let insuredRelics = 0
  for (const d of dead) {
    const m = members.find(x => x.id === d.id)!
    for (const slot of ['weapon', 'armor', 'trinket'] as const) {
      const item = m.equipment[slot]
      if (!item) continue
      if (outcome.source === 'tower' && outcome.run.insuredFloor) {
        outcome.loot.items.push(item)
        insuredRelics++
      } else {
        c.relics.push({ item, hero: d.name, redeem: redeemCost(item, outcome.source === 'tower' ? outcome.run.floor : undefined) })
        appendFact(guild.factLedger, day, { kind: 'relic-bind', actors: [d.id], names: { [d.id]: d.name }, refs: { itemUid: item.id } })
      }
      m.equipment[slot] = undefined
    }
  }
  if (insuredRelics) {
    const text = '高塔保险理赔：' + insuredRelics + ' 件遗物已免费归还仓库。'
    c.chronicle.push(chronicleRaw(day, text, ++seq))
    outcome.notices.push(text)
  }
  if (c.relics.length) outcome.notices.push(c.relics.length + ' 件遗物等待赎回，可在仓库查看。')
  const alive = members.filter(m => m.alive)
  // 同场多名阵亡仍只施加一次冲击，保持副本既有幅度；每位亡者分别留史。
  if (dead.length) {
    const before = alive.map(m => ({ morale: m.morale ?? 60, bond: m.bonds[dead[0].id] ?? 0 }))
    applyDeathShock(dead[0].id, alive)
    c.deathShock = alive.map((m, i) => ({ memberId: m.id, deadId: dead[0].id, morale: (m.morale ?? 60) - before[i].morale, bond: (m.bonds[dead[0].id] ?? 0) - before[i].bond }))
    for (const d of dead) {
      c.chronicle.push(chronicleHeroFall(day, d.name, JOBS[d.job].name, place, ++seq))
      outcome.notices.push(d.name + ' 陨落于' + place + '，已记入编年史与纪念堂。')
    }
  }
  // A13:团灭重建的故事进编年史(chronicleWipeRebuild 此前从未被调用,审计更正项)
  if (common.battle.status === 'guild-wipe') c.chronicle.push(chronicleWipeRebuild(day, ++seq))
  if (outcome.win) {
    applyVictory(alive)
    c.chronicle.push(chronicleBattleVictory(day, place, alive, ++seq))
    if (members.some(m => m.alive && Object.values(m.equipment).some(e => e && ITEM_BASES[e.baseId]?.legacy === 'triumph'))) applyMoraleDelta(alive, 2)
    // 保持原心愿检测时点：读取本次结算前已展示的首杀/塔纪录与探索池。
    const wishes = settleWishes(guild.members, {
      dungeons: Object.keys(input.guild.dungeonMastery).map(id => ({ id, name: DUNGEONS.find(d => d.id === id)?.name ?? id })),
      towerBest: input.guild.towerBest,
      dungeonCleared: id => input.guild.manual.includes(DUNGEON_FINAL_BOSS[id] ?? ''),
    }, rng)
    c.wishes = wishes.progress
    for (const w of wishes.progress) {
      const wm = guild.members.find(m => m.id === w.memberId)
      appendFact(guild.factLedger, day, { kind: 'wish-done', actors: [w.memberId], names: wm ? { [wm.id]: wm.name } : undefined, refs: {} })
    }
    for (const text of wishes.stories) c.chronicle.push(chronicleRaw(day, text, ++seq))
  }
  outcome.deaths = dead.map(d => ({ ...d, legacy: computeLegacy(d, {
    bossKills: input.guild.manual.length, towerBest: input.guild.towerBest,
    commissionsDone: input.guild.kingdom.completed.length, chronicleCount: input.guild.chronicle.length,
  }) }))
  outcome.blessing = dead.length * effects.blessingPerDeath

  if (outcome.source === 'tower') {
    const reward = settleTowerFloor(outcome.run, rng, itemId, guild.members)
    outcome.loot.gold = reward.gold
    outcome.loot.items.push(...reward.drops)
    c.growth = settleGrowth({ ...outcome.run, members }, 1, { exp: reward.exp, bonds: true })
    if (reward.cleared && !outcome.run.autoMode) {
      guild.towerBest = Math.max(guild.towerBest, outcome.run.floor)
      if (guild.towerBest > input.guild.towerBest) {
        c.chronicle.push(chronicleTowerRecord(day, guild.towerBest, ++seq))
        moments.push('高塔纪录刷新:第 ' + guild.towerBest + ' 层')
        appendFact(guild.factLedger, day, { kind: 'tower-record', actors: [], refs: { floor: guild.towerBest } })
      }
    }
  } else c.growth = settleGrowth({ ...outcome.run, members, dungeon: runDungeon(outcome.run) }, effects.expMult)

  // 用本场前后的变化记事，避免沿用整趟出征快照而重复登记同一次升级/升星。
  for (const m of members) {
    const before = input.guild.members.find(x => x.id === m.id)
    if (before && m.level > before.level) {
      c.chronicle.push(chronicleLevelUp(day, m, m.level, ++seq))
      moments.push(m.name + ' Lv' + before.level + '→' + m.level)
    }
  }
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j]
      const before = input.guild.members.find(x => x.id === a.id)?.bonds[b.id] ?? 0
      const stars = bondStars(a.bonds[b.id] ?? 0)
      if (stars > bondStars(before)) {
        c.chronicle.push(chronicleBondStar(day, a, b, stars, ++seq))
        moments.push(a.name + ' × ' + b.name + ' 默契 ' + stars + '★')
        appendFact(guild.factLedger, day, { kind: 'bond-star', actors: [a.id, b.id], names: { [a.id]: a.name, [b.id]: b.name }, refs: { stars } })
      }
    }
  }
  c.morale = guild.members.flatMap(m => {
    const before = input.guild.members.find(x => x.id === m.id)
    const delta = (m.morale ?? 60) - (before?.morale ?? 60)
    return delta ? [{ memberId: m.id, delta }] : []
  })
  outcome.exp = c.growth.experience.reduce((sum, x) => sum + x.amount, 0)
  outcome.survivors = alive.map(m => m.id)
  outcome.statistics.push({ type: 'battle', mode: outcome.source === 'tower' ? 'towerFloors' : 'expeditionBattles', status: common.battle.status, deaths: dead.length })
  if (outcome.loot.gold) outcome.statistics.push({ type: 'gold', source: outcome.source === 'tower' ? 'tower' : 'expedition', amount: outcome.loot.gold })
  if (outcome.loot.clearGold) outcome.statistics.push({ type: 'gold', source: 'clear', amount: outcome.loot.clearGold })
  if (outcome.loot.gold + outcome.loot.clearGold) outcome.notices.unshift('本场金币 +' + (outcome.loot.gold + outcome.loot.clearGold) + '，已入账。')
  if (outcome.blessing) outcome.notices.push('英灵祝福 +' + outcome.blessing + '。')
  if (c.morale.length) outcome.notices.push('士气：' + c.morale.map(({ memberId, delta }) => guild.members.find(m => m.id === memberId)!.name + ' ' + (delta > 0 ? '+' : '') + Math.round(delta * 10) / 10).join('、') + '。')
  if (c.growth.experience.length) outcome.notices.push('参战幸存者获得经验；' + c.growth.experience.map(x => members.find(m => m.id === x.memberId)!.name + ' +' + x.amount).join('、') + '。')
  if (c.growth.bonds.length) outcome.notices.push('共同经历：' + c.growth.bonds.length + ' 对幸存队友默契 +' + c.growth.bonds[0].amount + '。')
  if (outcome.loot.items.length) outcome.notices.push('装备已入仓库：' + outcome.loot.items.map(item => ITEM_BASES[item.baseId].name).join('、') + '。')
  for (const record of guild.kingdom.active) {
    const before = input.guild.kingdom.active.find(x => x.id === record.id)
    const def = COMMISSIONS.find(x => x.id === record.id)
    if (def && before && record.progress > before.progress) outcome.notices.push('王国委托「' + def.title + '」进度 ' + record.progress + '/' + def.objective.target + '。')
  }
  // A14 位阶演出:结算后升阶 → 编年史+通知(编年史即持久化,幂等)
  const promoted = rankPromotion(input.guild.manual, guild.manual)
  if (promoted) {
    c.chronicle.push(chronicleRaw(day, promoted, ++seq))
    outcome.notices.push(promoted)
  }
  outcome.summary = buildBattleSummary({
    status: common.battle.status,
    combatants: common.battle.combatants,
    events: common.battle.events ?? [],
    dmgTaken: common.battle.guildDmgTaken,
    deaths: outcome.deaths,
    moments,
  })
  pruneFacts(guild.factLedger, day)
  syncRunParty(outcome.run, guild.members)
  return outcome
}

import { ECONOMY } from '../data/economy'
import { DUNGEONS } from '../data/dungeons'
import { DUNGEON_FINAL_BOSS } from '../data/regions'
import { ITEM_BASES } from '../data/items'
import { JOBS } from '../data/jobs'
import { COMMISSIONS } from '../data/kingdom'
import { baseEffects } from '../data/base'
import type { DeadHero, ItemInstance, Member } from './types'
import { nodeById } from './dungeon-map'
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
import { bondStars, grantExp } from './gen'
import { settleKingdomBattle, type KingdomState } from './kingdom'
import { expeditionStatistics, type StatisticsAction } from './statistics'
import {
  chronicleRaw, chronicleHeroFall, chronicleFirstKill, chronicleWipeRebuild,
  chronicleTowerRecord, type ChronicleEntry,
} from './chronicle'
import { appendBio } from './bio'
import type { Rng } from './rng'
import { runMembers, runDungeon, runRng, syncRunParty } from './run-core'
import { terrainRewardOf } from '../data/terrain-rewards'
import { conditionDropMult, conditionExpMult } from './conditions'
import { CONDITION_BY_ID } from '../data/conditions'

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
  // R1.1:遭遇序列改由地图路径推出;流水号用「第几场战斗」,refs.encounter 记节点层号(R1.6 口径)
  const encounterSeq = input.source === 'dungeon' ? input.run.battlesFought : input.run.floor
  const itemId = () => `i-${original.id}-${encounterSeq}-${++itemSeq}`
  const effects = baseEffects(guild.buildings)
  let expMultCond = 1 // R5.1b:疲惫等经验倍率,须在 advanceRun 消退状态前捕获(dungeon 分支赋值)
  let dungeonElite = false // R5.1c:精英节点经验 ×2(settleGrowth 消费)
  const place = input.source === 'dungeon' ? runDungeon(input.run).name : `黑苔高塔第 ${input.run.floor} 层`

  if (outcome.source === 'dungeon') {
    const r = outcome.run
    const enc = runDungeon(r).encounters.find(e => e.id === r.battle?.encounterId)
    // R5/U33②:精英属性在节点 kind 上(遭遇本体是普通 wave);掉落翻倍判定同理改读节点
    const nodeKind = nodeById(r.map, r.nodeId)?.kind
    const isEliteNode = nodeKind === 'elite'
    dungeonElite = isEliteNode
    if (outcome.win && enc?.kind === 'boss' && enc.bossId) {
      const boss = runDungeon(r).bosses[enc.bossId]
      const pity = !guild.manual.includes(enc.bossId)
      const entryGate = runDungeon(r).id === 'thornhold' && enc.bossId === 'victor' && pity
      outcome.loot.items.push(...rollBossDrops(boss.dropTable, rng,
        entryGate ? { pity, qualityBias: 0.12, minQuality: 'green', itemId } : { pity, itemId }))
      if (pity) {
        guild.manual.push(enc.bossId)
        const killer = members.find(m => m.alive) ?? members[0]
        c.chronicle.push(chronicleFirstKill(day, boss.name, killer, ++seq))
        // R4.1 生平:首杀同时写进当事人生平(永久条目,U34)
        appendBio(killer, { day, kind: 'first-kill', text: `亲手斩下了${boss.name}的首级——公会的旗上多了一道疤。`, permanent: true })
        moments.push('公会首杀:' + boss.name)
        appendFact(guild.factLedger, day, { kind: 'first-kill', actors: [killer.id], names: { [killer.id]: killer.name }, refs: { bossId: enc.bossId, dungeonId: runDungeon(r).id, encounter: nodeById(r.map, r.nodeId)?.layer ?? encounterSeq } })
      }
    } else if (outcome.win) {
      // R5/U33①:水域节点掉落率 ×1.5(地形回报)× 暴露 upside ×2(R5.1b);精英品质下限绿(U33②)
      const node = nodeById(r.map, r.nodeId)
      const dropMult = (terrainRewardOf(node?.terrain ?? 'road')?.dropMult ?? 1) * conditionDropMult(r)
      const drop = rollWaveDrop(runDungeon(r).id, rng, isEliteNode,
        waveDropBonus(members.filter(m => common.battle.combatants.some(x => x.memberId === m.id && x.alive))), itemId, dropMult)
      if (drop) outcome.loot.items.push(drop)
    }
    guild.kingdom = settleKingdomBattle(guild.kingdom, r)
    c.kingdom = guild.kingdom
    outcome.loot.gold = outcome.win
      ? Math.round((enc?.kind === 'boss' ? ECONOMY.battleGold.boss : ECONOMY.battleGold.wave) *
          (isEliteNode ? 2 : 1) * // R5/U33②:精英金币 ×2
          (r.rareHunt && r.battlesFought === 1 ? r.rareHunt.rewardMult : 1)) : 0
    // R5.1e(U33④):本趟收益累计——撤退代价的基数
    r.earnedGold = (r.earnedGold ?? 0) + outcome.loot.gold
    // 必须在推进索引前捕获遭遇奖励/委托；先推进再登记死亡保持副本旧顺序。
    // R5.1b:经验/掉落倍率要在 advanceRun 消退状态前捕获;消退的状态写成可见提示。
    const condsBeforeSettle = [...(r.conditions ?? [])]
    expMultCond = conditionExpMult(r)
    advanceRun(r, guild.members)
    for (const name of (r.conditions ?? []).length < condsBeforeSettle.length
      ? condsBeforeSettle.filter((id) => !(r.conditions ?? []).includes(id)).map((id) => CONDITION_BY_ID[id]?.name ?? id)
      : []) {
      outcome.notices.push('路况消退:' + name + '。')
    }
    outcome.deaths = markPermadeath({ ...r, members }, place)
    if (outcome.win) {
      // R5/U33①②:林野节点熟练度 ×2(地形回报);精英节点 +2、Boss +2(U33②)
      const node = nodeById(r.map, r.nodeId)
      const masteryMult = terrainRewardOf(node?.terrain ?? 'road')?.masteryMult ?? 1
      const gain = Math.round((enc?.kind === 'boss' || isEliteNode ? 2 : 1) * masteryMult)
      guild.dungeonMastery[runDungeon(r).id] = (guild.dungeonMastery[runDungeon(r).id] ?? 0) + gain
      c.mastery = { dungeonId: runDungeon(r).id, gain }
      r.earnedMastery = (r.earnedMastery ?? 0) + gain
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
    if (d.death) appendFact(guild.factLedger, day, { kind: 'death', actors: [d.id], names: { [d.id]: d.name }, cause: d.death, refs: { dungeonId: d.death.where.id, floor: d.death.where.floor, encounter: encounterSeq } })
    // R4.1 生平:陨落写进当事人生平(永久条目;纪念堂快照取自 markPermadeath,碑文另示死因)
    const fallen = members.find(x => x.id === d.id)
    if (fallen) appendBio(fallen, { day, kind: 'fall', text: `陨落于${place}。酒馆里那晚没有人说话。`, permanent: true })
  }
  const scars = settleScars({ ...outcome.run, members }, dead.length > 0, input.source === 'tower' ? input.run.floor : 0, rng)
  c.scars = scars.map(({ member, scar }) => ({ memberId: member.id, scar }))
  for (const { member, nearDeath } of scars) {
    const scarNth = (member.scars?.length ?? 0)
    appendFact(guild.factLedger, day, { kind: 'scar', actors: [member.id], names: { [member.id]: member.name }, refs: { dungeonId: input.source === 'dungeon' ? input.run.dungeonId : 'tower', floor: input.source === 'tower' ? input.run.floor : undefined, nearDeath, scarNth } })
  }
  for (const { member, scar } of scars) {
    outcome.notices.push(member.name + ' 新增创伤：' + scarStatName(scar.stat) + ' -' + scar.value + '（' + scar.text + '），可回基地疗养。')
    // R4.1 生平(U34 Q2):创伤=个人事件,只进当事人生平(永久),公会大事记不再记
    appendBio(member, { day, kind: 'scar', text: `${scarStatName(scar.stat)} 留下创伤（-${scar.value}:${scar.text}）。`, permanent: true })
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
    // R4.1 生平(U34 Q2):每场胜利不再进大事记(一趟 5-15 条的刷屏源;趟级叙事由说书人与里程碑承载)
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
      if (wm) {
        appendFact(guild.factLedger, day, { kind: 'wish-done', actors: [w.memberId], names: wm ? { [wm.id]: wm.name } : undefined, refs: {} })
        appendBio(wm, { day, kind: 'wish', text: `了却心愿:「${w.text}」。士气昂扬。`, permanent: true })
      }
    }
    for (const t of wishes.traits) {
      const tm = guild.members.find(m => m.id === t.memberId)
      if (tm) appendBio(tm, { day, kind: 'trait', text: t.text, permanent: true })
    }
  }
  outcome.deaths = dead.map(d => ({ ...d, legacy: computeLegacy(d, {
    bossKills: input.guild.manual.length, towerBest: input.guild.towerBest,
    commissionsDone: input.guild.kingdom.completed.length, chronicleCount: input.guild.chronicle.length,
  }) }))
  outcome.blessing = dead.length * effects.blessingPerDeath

  if (outcome.source === 'tower') {
    // #3.1 下塔才结算:reward 只用于小结/通知,pendingLoot 由 leaveTower 兑现——这里不再入账
    // 写时克隆(R1 浅拷贝契约):settleTowerFloor 会累计 pendingLoot/pendingDrops,浅拷贝共享引用会打穿输入
    outcome.run.pendingLoot = { ...outcome.run.pendingLoot }
    outcome.run.pendingDrops = [...(outcome.run.pendingDrops ?? [])]
    const reward = settleTowerFloor(outcome.run, rng, itemId, guild.members)
    void reward
    c.growth = settleGrowth({ ...outcome.run, members }, 1, { exp: 0, bonds: true })
    if (reward.cleared) { // #3.1 塔禁挂机:纪录恒认手动(手动=唯一玩法)
      guild.towerBest = Math.max(guild.towerBest, outcome.run.floor)
      if (guild.towerBest > input.guild.towerBest) {
        c.chronicle.push(chronicleTowerRecord(day, guild.towerBest, ++seq))
        moments.push('高塔纪录刷新:第 ' + guild.towerBest + ' 层')
        appendFact(guild.factLedger, day, { kind: 'tower-record', actors: [], refs: { floor: guild.towerBest } })
      }
    }
  } else c.growth = settleGrowth({ ...outcome.run, members, dungeon: runDungeon(outcome.run), elite: dungeonElite }, effects.expMult * expMultCond)

  // R4.2b 训练场替补追赶(redesign §6 设施各管玩法):训练场 2 级起,未出征的存活成员
  // 按出征人均实发经验 ×0.5(C4 占位)跟着操练——替补也有成长线
  if (input.source === 'dungeon' && (guild.buildings.training ?? 0) >= 2 && c.growth.experience.length > 0) {
    const participantIds = new Set(outcome.run.memberIds)
    const per = c.growth.experience.reduce((s, x) => s + x.amount, 0) / c.growth.experience.length
    const share = Math.round(per * 0.5)
    if (share > 0) {
      const reserves = guild.members.filter(m => m.alive && !participantIds.has(m.id))
      if (reserves.length) {
        for (const m of reserves) {
          const fromLevel = m.level
          grantExp(m, share)
          c.growth.experience.push({ memberId: m.id, amount: share, fromLevel, toLevel: m.level })
        }
        outcome.notices.push(`替补 ${reserves.map(m => m.name).join('、')} 在训练场跟操了一轮(+${share} 经验)。`)
      }
    }
  }

  // 用本场前后的变化记事，避免沿用整趟出征快照而重复登记同一次升级/升星。
  for (const m of members) {
    const before = input.guild.members.find(x => x.id === m.id)
    if (before && m.level > before.level) {
      // R4.1 生平(U34 Q2):升级只进当事人生平,公会大事记不再记
      appendBio(m, { day, kind: 'level-up', text: `成长到了 Lv${m.level},在靶场上待到深夜。` })
      moments.push(m.name + ' Lv' + before.level + '→' + m.level)
    }
  }
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j]
      const before = input.guild.members.find(x => x.id === a.id)?.bonds[b.id] ?? 0
      const stars = bondStars(a.bonds[b.id] ?? 0)
      if (stars > bondStars(before)) {
        // R4.1 生平(U34 Q4):1★/3★ 时双方生平各记一条(2★ 不写),与说书人口径对齐;大事记不再记
        if (stars === 1 || stars === 3) {
          appendBio(a, { day, kind: 'bond', text: `与 ${b.name} 的默契升到了 ${'★'.repeat(stars)}——生死之交又深了一分。` })
          appendBio(b, { day, kind: 'bond', text: `与 ${a.name} 的默契升到了 ${'★'.repeat(stars)}——生死之交又深了一分。` })
        }
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
  if (c.growth.experience.length) outcome.notices.push('参战幸存者获得经验；' + c.growth.experience
    .filter(x => members.some(m => m.id === x.memberId)) // R4.2b:替补条目不在参战名册,由「替补跟操」通知单独示出
    .map(x => members.find(m => m.id === x.memberId)!.name + ' +' + x.amount).join('、') + '。')
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

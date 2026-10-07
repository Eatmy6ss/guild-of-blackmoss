import { newStatistics, recordStatistics, expeditionStatistics } from '../sim/statistics'
import { advanceCommissions, newKingdomState, kingdomTrust, royalPotionCost, royalGoodLock } from '../sim/kingdom'
import { dismantleBulk, upgradeRegisteredRoll, refineRegisteredQuality } from '../state/item-registry'
import type { RoyalGood } from '../data/kingdom'
import type { BattleState, Member, Slot } from '../sim/types'
import { maxHpOf, bondStars, grantExp } from '../sim/gen'
import { ITEM_BASES } from '../data/items'
import { ECONOMY } from '../data/economy'
import { applyRestMorale, refusesToMarch, applyMoraleDelta } from '../sim/morale'
import { chronicleRefusal, chronicleBuilding, seedChronicle } from '../sim/chronicle'
import { appendBio } from '../sim/bio'
import { ageFaints, scarStatName, canGainScar, rollScar, RETREAT_SCAR_CHANCE } from '../sim/scars'
import { restStamina, spendRetreatStamina } from '../sim/stamina'
import { rationCost, maintenanceCost } from '../sim/supply'
import { plannedLayers } from '../sim/dungeon-map'
import { INTEL_STOCK_CAP, consumeIntelReveal, verifyIntelFor } from '../sim/intel'
import { stepBattle, orderRetreat, toCombatant } from '../sim/combat'
import { appendFact, latestEventChoice, markExpeditionStart, markTold } from '../sim/fact-ledger'
import { tellExpedition } from '../sim/storyteller'
import { createRng } from '../sim/rng'
import { createRun, startStep, retreatRun, resetAfterRun, REST_HEAL_PCT, type DungeonRun } from '../sim/run'
import { powerScore } from '../sim/combat'
import { describeItem, dungeonItemTier } from '../sim/loot'
import { settleEncounter, type EncounterOutcome } from '../sim/settlement'
import { createStatefulRng, newRngSeed, int } from '../sim/rng'
import { clearGuildSave } from '../state/save'
import { createGuildItems, equipRegisteredItem, removeInventoryItem, redeemRegisteredRelic, applyEncounterItems } from '../state/item-registry'
import { runDungeon, runMembers, runRng } from '../sim/run-core'
import { initialRunState } from '../sim/run-state'
import { GUILD_EVENTS } from '../data/guild-events'
import { pickOutcome } from '../sim/guild-events'
import type { GuildEventDef } from '../data/guild-events'
import { sfxVisitor } from '../ui/audio'
import { startTower, towerRest, towerNext, claimPendingLoot } from '../sim/tower'
import { revealTier, moveTo, mapOptions, currentNode, nextBossEncounter } from '../sim/run'
import { autoPickNode } from '../sim/dungeon-map'
import { restHealMult, terrainEntryReward, revealPenaltyLayers } from '../sim/conditions'
import { CONDITION_BY_ID } from '../data/conditions'
import { BUILDINGS, baseEffects } from '../data/base'
import { rollVisitor, sellValue } from '../sim/tavern'
import { memorialAura } from '../sim/memorial'
import { rollGuildEvent, consequenceFiresIn, consequenceOf } from '../sim/guild-events'
import { rollDrop } from '../sim/loot'
import { chronicleRaw } from '../sim/chronicle'
import { playtestAllows } from '../data/regions'

// R5.2d(U33⑦):App 的远征/塔/经济控制器集群,正文自 App.tsx@7a672f9 逐字迁入;可变状态全部经 deps 注入(行为零变)。
import type { TowerRun } from '../sim/tower'
import type { ChronicleEntry } from '../sim/chronicle'
import type { ItemInstance, DeadHero } from '../sim/types'
type PlayMeta = NonNullable<import('../state/save').GuildSave['playMeta']>
type PendingConsequenceX = import('../state/save').PendingConsequence
type StoredGuildBuffX = import('../state/save').StoredGuildBuff
type AnyRef<T> = { current: T }
type Set<T> = (v: T | ((cur: T) => T)) => void
type SetFn<T> = (v: T | ((cur: T) => T)) => void

export interface ControllerDeps {
  resolveEventRef: AnyRef<((i: number) => void) | null>
  dismissEventRef: { current: (() => void) | null }
  eventResult: string | null
  runRef: AnyRef<DungeonRun | null>
  towerRunRef: AnyRef<TowerRun | null>
  membersRef: AnyRef<Member[]>
  itemOwnershipRef: AnyRef<import("../state/item-registry").GuildItems>
  chronicleRef: AnyRef<ChronicleEntry[]>
  trainingReadyRef: AnyRef<boolean>
  autoLoopRef: { get current(): boolean; set current(v: boolean) }
  lastBattleRef: AnyRef<unknown>
  lastRetreatRunRef: AnyRef<string | null>
  continueDeepRef: AnyRef<((id?: string) => void) | null>
  startExpeditionRef: AnyRef<(() => void) | null>
  rendererRef: AnyRef<{ reset: () => void; setTheme: (id: string) => void } | null>
  guildRngRef: AnyRef<{ state: () => number }>
  pendingDepartureRef: AnyRef<unknown>
  pendingConsequenceRef: AnyRef<import("../state/save").PendingConsequence | null>
  growthSnapshotRef: AnyRef<Map<string, unknown>>
  factLedgerRef: AnyRef<import("../sim/fact-ledger").FactLedger>
  setFactLedger: SetFn<import("../sim/fact-ledger").FactLedger>
  setTowerBest: SetFn<number>
  setHealingMastery: SetFn<Record<string, number>>
  setBuildings: SetFn<Record<string, number>>
  setProtectOn: SetFn<boolean>
  setEventsSeen: SetFn<string[]>
  setPendingConsequences: SetFn<import("../state/save").PendingConsequence[]>
  setGuildBuffs: SetFn<import("../state/save").StoredGuildBuff[]>
  setRareHuntNext: SetFn<{ mult: number; rewardMult: number } | null>
  setRun: (v: DungeonRun | null) => void
  setTowerRun: (v: TowerRun | null) => void
  setRunning: SetFn<boolean>
  setMembers: SetFn<Member[]>
  setGold: SetFn<number>
  setBlessing: SetFn<number>
  setPotions: SetFn<{ heal: number; fury: number }>
  setLastDrops: SetFn<ItemInstance[]>
  setScarNotices: (v: string[] | ((q: string[]) => string[])) => void
  /** U36:情报条目/货源(条目化记录) */
  intelEntries: import('../sim/intel').IntelEntry[]
  intelStock: number
  setIntelEntries: (f: (q: import('../sim/intel').IntelEntry[]) => import('../sim/intel').IntelEntry[]) => void
  setIntelStock: (f: (n: number) => number) => void
  setMemorial: SetFn<DeadHero[]>
  setManual: Set<string[]>
  setCandidates: Set<Member[]>
  setVisitor: (v: ReturnType<typeof import("../sim/tavern").rollVisitor> | null) => void
  setStatistics: SetFn<import("../sim/statistics").GameplayStatistics>
  setRoyalNotice: Set<string>
  setResumeNotice: Set<string>
  setPlayMeta: SetFn<PlayMeta>
  setDungeonMastery: SetFn<Record<string, number>>
  setTrainingReady: Set<boolean>
  setConfirmAsk: Set<{ text: string; okLabel?: string; onOk: () => void } | null>
  changeProgress: (patch: Partial<import("../sim/run-state").RunUIState>) => void
  updateItemOwnership: (next: import("../state/item-registry").GuildItems, roster?: Member[]) => void
  updateKingdom: (next: import("../sim/kingdom").KingdomState) => void
  noteStatistics: (a: import("../sim/statistics").StatisticsAction | null) => void
  logChronicle: (e: ChronicleEntry) => void
  day: number
  gold: number
  manual: string[]
  kingdom: import("../sim/kingdom").KingdomState
  buildings: Record<string, number>
  potions: { heal: number; fury: number }
  dungeonMastery: Record<string, number>
  guildRng: () => number
  go: (to: import("./screens").Screen) => void
  encounterGuild: () => import("../sim/settlement").EncounterGuild
  drainAndSync: (b: BattleState) => void
  checkWishes: () => boolean
  starMarrow: number
  pendingConsequences: import("../state/save").PendingConsequence[]
  guildBuffs: StoredGuildBuffX[]
  memorial: DeadHero[]
  protectOn: boolean
  hintsSeen: string[]
  rareHuntNext: { mult: number; rewardMult: number } | null
  pendingEvent: GuildEventDef | null
  setRecruitCooldown: SetFn<number>
  dismissHint: (id: string) => void
  setPlaytestEnding: (v: boolean) => void
  members: Member[]
  setExpeditionIds: SetFn<string[]>
  activeDungeon: import("../sim/types").DungeonDef
  sfxVictory: () => void
  sfxDefeat: () => void
  syncAll: () => void
  setPendingEvent: (v: Awaited<ReturnType<typeof import("../sim/guild-events").rollGuildEvent>>) => void
  setEventResult: (v: string | null) => void
  setDay: SetFn<number>
  SEED_BASE: number
  MANUAL_BONUS: number
  receiveItems: (incoming: ItemInstance[], showDrops?: boolean) => void
  gainGold: (amount: number, source: import("../sim/statistics").GoldSource) => void
  ROSTER_CAP: number
  setUnlockedHybrids: SetFn<string[]>
  newRoster: (rng: import("../sim/rng").Rng) => Member[]
  setStarMarrow: SetFn<number>
  setHealingNotice: (v: string) => void
  healingBusyRef: AnyRef<boolean>
  setChronicle: SetFn<ChronicleEntry[]>
  setEventImpacts: (v: import("../sim/run-state").RunUIState["eventImpacts"]) => void
  setOfflineNote: SetFn<string | null>
  setDungeonId: (v: string) => void
  setSaveTransfer: Set<{ mode: "import" | "export"; code: string } | null>
  setTowerRunning: SetFn<boolean>
  eventResolvingRef: AnyRef<boolean>
  eventCursorRef: AnyRef<number>
  sfxCoin: () => void
  blessing: number
  kingdomRef: AnyRef<import("../sim/kingdom").KingdomState>
  expeditionIds: string[]
}

export function createAppControllers(deps: ControllerDeps) {
  const {
    eventResult,
    runRef, towerRunRef, membersRef, itemOwnershipRef, chronicleRef, trainingReadyRef,
    autoLoopRef, lastBattleRef, lastRetreatRunRef, continueDeepRef, startExpeditionRef, rendererRef,
    guildRngRef, pendingDepartureRef, pendingConsequenceRef, growthSnapshotRef, factLedgerRef, setFactLedger,
    setTowerBest, setHealingMastery, setBuildings, setProtectOn, setEventsSeen, setPendingConsequences,
    setGuildBuffs, setRareHuntNext, setRun, setTowerRun, setRunning, setMembers,
    setGold, setBlessing, setPotions, setLastDrops, setScarNotices, setMemorial,
    setManual, setCandidates, setVisitor, setStatistics, setRoyalNotice, setResumeNotice,
    setPlayMeta, setDungeonMastery, setTrainingReady, setConfirmAsk, changeProgress, updateItemOwnership,
    updateKingdom, noteStatistics, logChronicle, day, gold, manual,
    kingdom, buildings, potions, dungeonMastery, guildRng, go,
    encounterGuild, drainAndSync, checkWishes, starMarrow, pendingConsequences, guildBuffs,
    memorial, protectOn, hintsSeen, rareHuntNext, pendingEvent, setRecruitCooldown,
    dismissHint, setPlaytestEnding, members, setExpeditionIds, activeDungeon, sfxVictory,
    sfxDefeat, syncAll, setPendingEvent, setEventResult, setDay, SEED_BASE,
    MANUAL_BONUS, receiveItems, gainGold, ROSTER_CAP, setUnlockedHybrids, newRoster,
    setStarMarrow, setHealingNotice, healingBusyRef, setChronicle, setEventImpacts, setOfflineNote,
    intelEntries, setIntelEntries, setIntelStock,
    setDungeonId, setSaveTransfer, setTowerRunning, eventResolvingRef, eventCursorRef, sfxCoin,
    blessing, kingdomRef, expeditionIds,
  } = deps

  const applyOutcome = (o: EncounterOutcome) => {
    changeProgress({ lastSummary: o.summary })
    factLedgerRef.current = o.guild.factLedger
    setFactLedger(o.guild.factLedger)
    const gear = applyEncounterItems(itemOwnershipRef.current, o.guild.members, o.loot.items, o.consequences.relics)
    updateItemOwnership(gear.state, o.guild.members)
    updateKingdom(o.guild.kingdom)
    setManual(o.guild.manual)
    setDungeonMastery(o.guild.dungeonMastery)
    setTowerBest(o.guild.towerBest)
    setRecruitCooldown(o.guild.recruitCooldown)
    setLastDrops(items => [...items, ...gear.items])
    setMemorial(heroes => [...heroes, ...o.deaths])
    setGold(amount => amount + o.loot.gold + o.loot.clearGold)
    setStarMarrow(amount => amount + o.loot.starMarrow)
    setBlessing(amount => amount + o.blessing)
    setStatistics((stats: import("../sim/statistics").GameplayStatistics) => o.statistics.reduce(recordStatistics, stats))
    chronicleRef.current = [...chronicleRef.current, ...o.consequences.chronicle]
    seedChronicle(chronicleRef.current)
    setChronicle(chronicleRef.current)
    // A9/B3:远征终局先算故事(说书人只读账本),再一次性写横幅——故事不冲掉结算通知
    let story: ReturnType<typeof tellExpedition> = null
    if (o.source === 'dungeon' && ['victory', 'defeat', 'retreated'].includes(o.run.phase)) {
      if (!hintsSeen.includes('first-return-done')) dismissHint('first-return-done')
      story = tellExpedition(factLedgerRef.current, createRng(o.run.seed + o.run.path.length * 77 + day), {
        fromId: factLedgerRef.current.toldThrough ?? 0,
        startId: factLedgerRef.current.expeditionStart ?? 0,
      })
      if (story) {
        markTold(factLedgerRef.current, story.type, story.templateIdx) // B4 水位+U26⑥ 模板下标入账本
      }
    }
    setScarNotices(story ? [...o.notices, '📖 ' + story.text] : o.notices)
    if (o.source === 'dungeon') {
      runRef.current = o.run
      setRun({ ...o.run })
      // U36:该副本走过一趟 → 未验证情报全部验证(真/假),可见通知
      const v = verifyIntelFor(intelEntries, o.run.dungeonId)
      if (v.notes.length) {
        setIntelEntries(() => v.entries)
        for (const note of v.notes) setScarNotices((q: string[]) => [...(q ?? []), note])
      }
      // A11:试玩版通关版图一 → 「试玩版到此结束」画面
      if (__PLAYTEST__ && o.run.phase === 'victory' && o.run.dungeonId === 'thornhold') setPlaytestEnding(true)
      if (story) {
        logChronicle(chronicleRaw(day, '📖 ' + story.text))
        // R4.1 生平(U34):说书人的故事同时写进当事人 bio——factIds 反查账本 actors(多人各记一条)
        const actorIds = new Set<string>()
        for (const fid of story.factIds) {
          const f = factLedgerRef.current.facts.find((x) => x.id === fid)
          for (const a of f?.actors ?? []) actorIds.add(a)
        }
        let bioTouched = false
        for (const aid of actorIds) {
          const m = membersRef.current.find((x) => x.id === aid)
          if (m) { appendBio(m, { day, kind: 'story', text: story.text }); bioTouched = true }
        }
        if (bioTouched) setMembers([...membersRef.current])
      }
    } else {
      towerRunRef.current = o.run
      setTowerRun({ ...o.run })
    }
  }

  // 塔层与副本经过同一结算入口；推进/自动循环仍留在 UI 层。


  // 在 React 同一批资产/阶段提交后保存；跳过 effect 中刚结算、资产尚未提交的旧渲染。
  // A13 节流:战斗进行中每 5 秒写一次断点(原每 tick ≈10 次/秒);战斗结束/节点边界立即写;写失败可见。


  // 战报钉底：新战报到达时跟随滚动；用户上滚阅读时暂不抢滚动条，滚回底部自动恢复




  // 战斗终态兜底（D13 修复软锁）：×10 步进/暂停步进跳过实时循环时，
  // 终局结算（血量写回/永久死亡/掉落）依然必须发生。幂等由 settleBattleEnd 的
  // phase 守卫保证，实时循环里的调用与此处只会生效一次。


  // 远征队 = 花名册前三名幸存者（D11：亡者由招募补位）
  // M1 P0:出征队编组——显式编入/替补,不再固定'花名册前三个'
  // 团本编制:上限随所选副本(activeDungeon.size),3 人本照旧,5 人团本可上 5 人
  const expedition = (() => {
    const byId = new Map(members.map((m) => [m.id, m]))
    return expeditionIds.map((id) => byId.get(id)).filter((m): m is Member => !!m && m.alive)
  })()


  // R5.1e(U33④):撤退代价入账——本趟金币/熟练度各扣一半(已入账的部分回吐公会)

  const applyRetreatDeduction = (r: DungeonRun) => {
    const cost = r.retreatCost
    if (!cost || (cost.gold <= 0 && cost.mastery <= 0)) return
    if (cost.gold > 0) setGold((g) => g - cost.gold)
    if (cost.mastery > 0) {
      setDungeonMastery((prev) => ({ ...prev, [cost.dungeonId]: Math.max(0, (prev[cost.dungeonId] ?? 0) - cost.mastery) }))
    }
    logChronicle(chronicleRaw(day, `撤退回城:本趟金币 −${cost.gold}、${runDungeon(r).name}熟练度 −${cost.mastery}(撤退代价,装备照拿)。`))
    // #4.3 撤退代价补齐:额外精力惩罚+创伤判定(收获减半=R5 既有口径,计划「全丢」的偏差已登记 HANDOFF)
    let retreatScarCount = 0
    for (const m of runMembers(r, membersRef.current)) {
      if (!m.alive) continue
      spendRetreatStamina(m)
      if (canGainScar(m) && guildRng() < RETREAT_SCAR_CHANCE) {
        const scar = rollScar(guildRng)
        m.scars = [...(m.scars ?? []), scar]
        appendBio(m, { day, kind: 'scar', text: `撤退路上添了${scarStatName(scar.stat)}创伤——走得太急,代价没躲开。` })
        setScarNotices((q: string[]) => [...(q ?? []), `${m.name} 在撤退途中添了${scarStatName(scar.stat)}创伤(−1 ${scarStatName(scar.stat)})。`])
        retreatScarCount++
      }
    }
    setMembers([...membersRef.current])
  }

  // 结算入口的阶段守卫确保指挥、快进和终局 effect 都不能重复发奖。
  const settleBattleEnd = (current: DungeonRun) => {
    if (runRef.current !== current) return // 忽略已应用结果替代掉的旧闭包。
    const o = settleEncounter({ source: 'dungeon', run: current, guild: encounterGuild() })
    if (!o) return
    // #4.2 装备维护:整趟场数×幸存者(团灭 0 幸存=无账可收),铁匠铺减免;回城时扣款
    o.run.maintenanceDue = maintenanceCost(
      o.run.battlesFought,
      runMembers(o.run, o.guild.members).filter((m) => m.alive).length,
      buildings.smithy ?? 0,
    )
    applyOutcome(o)
    const r = o.run
    const endPhase = r.phase
    // R5.2:结算后按阶段转场(rest→地图选路;victory/defeat/retreated→结算屏)
    if (endPhase === 'rest') go('map')
    else go('result')
    if (endPhase === 'retreated') applyRetreatDeduction(r) // R5.1e:战斗中撤离同样收撤退代价
    if (o.sound === 'victory') sfxVictory()
    if (o.sound === 'defeat') sfxDefeat()
    // 自动循环的按钮/状态机留给 #0.6，沿用原来的回城和推进边界。
    if (r.autoMode) {
      if (endPhase === 'rest') {
        window.setTimeout(() => continueDeepRef.current?.(), 750)
      } else if (endPhase === 'victory') {
        backToGuild()
        window.setTimeout(() => { if (autoLoopRef.current) startExpeditionRef.current?.() }, 150)
      } else if (endPhase === 'defeat') {
        autoLoopRef.current = false
        r.autoMode = false
        // R4.1(U34 Q1):挂机结束不再进大事记(结果屏/横幅已示)
      } else if (endPhase === 'retreated') {
        autoLoopRef.current = false
        r.autoMode = false
      }
    }
  }


  const equip = (m: Member, slot: Slot, itemId: string) => {
    // B3-4 营地换装(U22):远征 rest 相/塔段间允许换装——战斗进行中仍禁止
    const resting = runRef.current?.phase === 'rest' || towerRunRef.current?.phase === 'rest'
    if ((runRef.current || towerRunRef.current) && !resting) return
    if (!membersRef.current.find(x => x.id === m.id)?.alive) return
    const next = equipRegisteredItem(itemOwnershipRef.current, m.id, slot, itemId)
    if (next === itemOwnershipRef.current) return
    updateItemOwnership(next)
    checkWishes()
  }

  const redeemRelic = (uid: string) => {
    if (runRef.current || towerRunRef.current) return
    const result = redeemRegisteredRelic(itemOwnershipRef.current, uid, gold)
    if (!result) return
    updateItemOwnership(result.state)
    setGold(g => g - result.relic.redeem)
    appendFact(factLedgerRef.current, day, { kind: 'relic-redeem', actors: [], refs: { itemUid: uid } })
    setFactLedger({ ...factLedgerRef.current })
    logChronicle(chronicleRaw(day, '花 ' + result.relic.redeem + ' 金赎回了 ' + result.relic.hero + ' 的遗物。'))
  }

  const retreat = () => {
    const r = runRef.current
    if (!r) return
    if (lastRetreatRunRef.current !== r.id) {
      lastRetreatRunRef.current = r.id
      setPlayMeta((m: PlayMeta) => ({ ...m, retreats: (m.retreats ?? 0) + 1 })) // S11:同一场战斗只计一次
    }
    // 战斗中：下撤退令（Q32 撤离过程）；休整中：直接回城
    if (r.phase === 'battle' && r.battle && r.battle.status === 'running') {
      if (orderRetreat(r.battle)) {
        syncAll()
      }
      return
    }
    if (r.phase === 'rest') {
      autoLoopRef.current = false
      r.autoMode = false
      setRunning(false)
      retreatRun(r, membersRef.current)
      go('result') // R5.2:rest 相撤退也走结算屏(finished 的渲染已收进状态机)
      applyRetreatDeduction(r) // R5.1e:撤退代价(金币/熟练度减半)
      noteStatistics(expeditionStatistics(r))
      syncAll()
    }
  }


  const cmd = (fn: (b: BattleState) => void, force = false) => {
    const b = runRef.current?.battle
    if (!b) return
    // 终局态也同步一次：×10 步进跳过终态后，UI 可能停在过期快照（D13 软锁修复）
    if (b.status === 'running') {
      if (b.commands.autoMode && !force) return // 挂机中：队长代打
      fn(b)
    }
    drainAndSync(b)
  }


  const startExpedition = () => {
    if (runRef.current || towerRunRef.current || pendingEvent || expedition.length < activeDungeon.size) return
    if (!playtestAllows(activeDungeon.id)) return // B6:试玩版版图一守卫
    const refusers = expedition.filter((m) => refusesToMarch(m))
    if (refusers.length > 0) {
      logChronicle(chronicleRefusal(day, refusers))
      setMembers([...membersRef.current])
      return
    }
    // 先处理到期后果，再出征；不能让弹窗遮住正在推进的永久死亡战斗。
    // U27④:回城只触发 town 档;副本档后果在对应副本的 event 节点必出,不在这里弹。
    const due = pendingConsequences.find((c) => c.dueDay <= day + 1 && consequenceOf(c.eventId)?.at !== 'dungeon')
    if (due) {
      const def = GUILD_EVENTS.find((e) => e.id === due.eventId)
      if (def) {
        const link = latestEventChoice(factLedgerRef.current, due.eventId)
        appendFact(factLedgerRef.current, day, { kind: 'consequence-due', actors: [], refs: { eventId: due.eventId }, links: link ? [link.id] : undefined })
        setFactLedger({ ...factLedgerRef.current })
        pendingConsequenceRef.current = due
        pendingDepartureRef.current = 'go'
        setPendingEvent(def)
        setEventResult(null)
        return
      }
      setPendingConsequences((q: PendingConsequenceX[]) => { const at = q.findIndex((c: PendingConsequenceX) => c.eventId === due.eventId && c.dueDay === due.dueDay); return q.filter((_: PendingConsequenceX, i: number) => i !== at) })
    }
    setDay((d) => d + 1)
    // #4.1 精力:天数恢复(全体存活,唯一恢复途径);#4.4 宿舍每级 +15% 恢复量
    restStamina(membersRef.current, 1, baseEffects(buildings).staminaRestMult)
    setMembers([...membersRef.current])
    // U32 稳定制:出发日推进——虚痕到期消退(可见通知+当事人生平;早退分支前也要跑)
    const faded = ageFaints(membersRef.current, (day ?? 0) + 1)
    for (const f of faded) {
      setScarNotices((q: string[]) => [...(q ?? []), `${f.member.name} 的${scarStatName(f.stat)}虚痕消退了——身体记得教训,但不再疼。`])
      appendBio(f.member, { day: (day ?? 0) + 1, kind: 'heal', text: `${scarStatName(f.stat)}的虚痕消退了。` })
    }
    if (faded.length) setMembers([...membersRef.current])
    // 事件二期:过期的公会层状态自然消退
    setGuildBuffs((q: StoredGuildBuffX[]) => q.filter((g: StoredGuildBuffX) => g.endDay > (day ?? 0) + 1))
    if (expedition.length < activeDungeon.size) return
    // #4.2 出征补给:口粮(人数×预计行程层)。不足不拦出征(防软锁)——扣到 0+全员饿肚子士气 −8(C4)。
    const ration = rationCost(expedition.length, plannedLayers(activeDungeon))
    if (gold >= ration) {
      setGold((g) => g - ration)
      logChronicle(chronicleRaw(day, `出征补给：采买口粮花费 ${ration} 金（${expedition.length} 人 × ${plannedLayers(activeDungeon)} 层行程）。`))
    } else {
      setGold(() => 0)
      for (const m of membersRef.current) {
        if (m.alive) m.morale = Math.max(0, (m.morale ?? 60) - 8)
      }
      setMembers([...membersRef.current])
      logChronicle(chronicleRaw(day, `补给不足（口粮需 ${ration} 金）——队伍饿着肚子出征，全员士气 −8。`))
    }
    // M1 P0 成长快照:结算页要展示"这把你变强了什么"
    growthSnapshotRef.current = new Map(
      expedition.map((m: Member) => [m.id, { level: m.level, power: powerScore(m), bondTotal: Object.values(m.bonds).reduce((s: number, n: number) => s + bondStars(n), 0), bonds: { ...m.bonds } }]),
    )
    markExpeditionStart(factLedgerRef.current) // B4:水位入账本
    setPlayMeta((m: PlayMeta) => ({ ...m, expeditions: (m.expeditions ?? 0) + 1 }))
    runRef.current = createRun(
      expedition,
      activeDungeon,
      int(guildRng, 1, 100000) * SEED_BASE,
      memorialAura(memorial),
      protectOn,
      potions,
      autoLoopRef.current,
      guildBuffs.filter((g) => g.endDay > day + 1).map((g) => g.buff),
      rareHuntNext ?? undefined,
    )
    if (trainingReadyRef.current) {
      runRef.current.trainingExpMultiplier = 1.25
      trainingReadyRef.current = false
      setTrainingReady(false)
      logChronicle(chronicleRaw(day, '特权训练生效：本次远征所有胜场经验 +25%。'))
    }
    // U36 情报:出发日货源 +1(cap 3);该副本有未消耗真情报 → 本趟揭示档 +1(消耗一条)
    setIntelStock((n: number) => Math.min(INTEL_STOCK_CAP, n + 1))
    const intelUse = consumeIntelReveal(intelEntries, activeDungeon.id, (day ?? 0) + 1)
    if (intelUse.bonus > 0) {
      setIntelEntries(() => intelUse.entries)
      runRef.current.intelBonus = intelUse.bonus
      setScarNotices((q: string[]) => [...(q ?? []), `一份真情报派上了用场——${activeDungeon.name} 的面貌提前浮现了一层。`])
    }
    if (rareHuntNext) {
      setRareHuntNext(null)
    }
    setLastDrops([])
    setScarNotices([])
    setResumeNotice('')
    // 战斗背景主题(按副本):灼热/冰雪/沼泽/矿道…
    rendererRef.current?.setTheme(
      activeDungeon.id,
    )
    go('map') // R5.2:出发即进地图屏(旧行为:run.phase==='rest' 直接渲染地图)
    setRunning(true)
    syncAll()
  }
  startExpeditionRef.current = startExpedition


  const chooseNode = (targetId?: string) => {
    const r = runRef.current
    if (!r || r.kind !== 'dungeon' || r.phase !== 'rest' || pendingEvent) return
    // Boss 连战:当前就在 Boss 节点且还有下一场 → 直接连战(不走地图选边)
    if (targetId && targetId === r.nodeId) {
      const cur = currentNode(r)
      if (cur?.kind === 'boss' && nextBossEncounter(r)) {
        const enc = runDungeon(r).encounters.find((e) => e.id === nextBossEncounter(r))
        const manualBonus = enc?.bossId && manual.includes(enc.bossId) ? MANUAL_BONUS : 0
        startStep(r, int(runRng(r), 1, 100000) * SEED_BASE, manualBonus, membersRef.current)
        go('battle')
        setRunning(true)
        syncAll()
      }
      return
    }
    // Boss 连战纯挂机断链补口(R5.1f):autoMode 下站在 Boss 节点且还有下一场 → 直接连战
    if (r.autoMode && targetId === undefined && r.nodeId) {
      const curBoss = currentNode(r)
      if (curBoss?.kind === 'boss' && nextBossEncounter(r)) {
        const encB = runDungeon(r).encounters.find((e) => e.id === nextBossEncounter(r))
        const manualBonusB = encB?.bossId && manual.includes(encB.bossId) ? MANUAL_BONUS : 0
        startStep(r, int(runRng(r), 1, 100000) * SEED_BASE, manualBonusB, membersRef.current)
        go('battle')
        setRunning(true)
        syncAll()
        return
      }
    }
    // 挂机选路(U27①;R5.1f/U33⑧⑤):读完整揭示档位(吃迷途降档),不偷看暗道,认宝箱与解路况地形
    if (!targetId && r.autoMode) {
      const m = dungeonMastery[runDungeon(r).id] ?? 0
      const alive = runMembers(r, membersRef.current).filter((x) => x.alive)
      const avgHp = alive.length ? alive.reduce((sum, x) => sum + x.hp / toCombatant(x).maxHp, 0) / alive.length : 1
      const lostReveals = (r.conditions ?? []).some((id) => CONDITION_BY_ID[id]?.upside?.secretReveal)
      const picked = autoPickNode(mapOptions(r), {
        tier: revealTier(m, r.intelBonus ?? 0, revealPenaltyLayers(r)), avgHp, rng: runRng(r),
        conditions: r.conditions ?? [], lostReveals,
      })
      if (picked) targetId = picked.id
    }
    if (!targetId) return // 不选路不能前进:没有「继续深入」
    changeProgress({ lastNodeResult: null }) // 选下一条路即刷新上一站的后果条
    const condsBefore = [...(r.conditions ?? [])]
    const node = moveTo(r, targetId, dungeonMastery[runDungeon(r).id] ?? 0)
    if (!node) return
    // 结算可见性(红线):新挂的路况当场提示;状态条在地图常驻。R4.1(U34 Q1):路况流水不再进大事记
    const expiredNames = condsBefore.filter((c) => !(r.conditions ?? []).includes(c)).map((id) => CONDITION_BY_ID[id]?.name ?? id)
    // R5/U33①:地形回报(进入节点当场;与路况风险并列显示在悬停框,结果条写明)
    const entry = terrainEntryReward(r, node, membersRef.current)
    if (entry.blessing) setBlessing((b) => b + entry.blessing)
    if (entry.item) receiveItems([entry.item], true)
    const notes = [...expiredNames.map((n) => n + '消退了'), ...entry.notes]
    let entryText = notes.length ? `【地形】${node.name}:${notes.join(';')}` : ''
    if (node.kind === 'battle' || node.kind === 'elite' || node.kind === 'boss') {
      if (entryText) changeProgress({ lastNodeResult: entryText })
      applyRestMorale(runMembers(r, membersRef.current).filter((x) => x.alive))
      const encId = node.kind === 'boss' ? nextBossEncounter(r) : node.encounterId
      const enc = runDungeon(r).encounters.find((e) => e.id === encId)
      const manualBonus = enc?.bossId && manual.includes(enc.bossId) ? MANUAL_BONUS : 0
      startStep(r, int(runRng(r), 1, 100000) * SEED_BASE, manualBonus, membersRef.current)
      go('battle')
      setRunning(true)
      syncAll()
      return
    }
    if (node.kind === 'event') {
      // U30 补:节点绑定固定事件(desc 承诺固定兑现,如路边圣龛→鳞音教募捐)
      const bound = node.eventId ? GUILD_EVENTS.find((e) => e.id === node.eventId) : undefined
      if (bound) {
        setPendingEvent(bound)
        setEventResult(null)
        setRun({ ...r })
        return
      }
      // 副本档延迟后果(events-draft §2.2):到期且指向本副本/不限副本时,本副本的 event 节点必出
      const dueNode = pendingConsequences.find((c) => c.dueDay <= day && consequenceFiresIn(c.eventId, runDungeon(r).id))
      if (dueNode) {
        const def = GUILD_EVENTS.find((e) => e.id === dueNode.eventId)
        if (def) {
          pendingConsequenceRef.current = dueNode
          setPendingEvent(def)
          setEventResult(null)
          setRun({ ...r })
          return
        }
      }
      // 事件节点必触发:先本副本专属池,再本地形事件池(U27④,地形随节点携带)
      const ev = rollGuildEvent(runRng(r), { where: 'node', dungeonId: runDungeon(r).id, terrain: node.terrain })
      if (ev) {
        setPendingEvent(ev)
        setEventResult(null)
      } else {
        // 池空兜底(不应发生):也必须有可见后果,不能静默
        changeProgress({ lastNodeResult: entryText || `❓ ${node.name}:这里没什么动静——也许来早了。` })
      }
      setRun({ ...r })
      return
    }
    if (node.kind === 'rest') {
      const healMult = restHealMult(r) // 疲惫:休整回复减半(U27②)
      const healed: string[] = []
      for (const mem of runMembers(r, membersRef.current)) {
        if (!mem.alive) continue
        const max = maxHpOf(mem)
        const before = mem.hp
        mem.hp = Math.min(max, mem.hp + Math.round(max * REST_HEAL_PCT * healMult))
        if (mem.hp > before) healed.push(`${mem.name} +${mem.hp - before}`)
      }
      // 结算反馈红线:休整后果必须在同一界面可见
      changeProgress({ lastNodeResult: `${entryText ? entryText + '\n' : ''}⛺ ${node.name}:原地休整,回复 ${Math.round(REST_HEAL_PCT * healMult * 100)}% 生命${healMult < 1 ? '(疲惫:回复减半)' : ''}${healed.length ? ' —— ' + healed.join('、') : '(无人需要回复)'}` })
      setRun({ ...r })
      if (r.autoMode) window.setTimeout(() => continueDeepRef.current?.(), 700)
      return
    }
    if (node.kind === 'treasure' || node.kind === 'secret') {
      // 宝箱/暗道节点:不战斗,纯收获——金币+一件带品级的装备;暗道另已是跳层捷径
      const gold2 = 60 + Math.floor(runRng(r)() * 90)
      gainGold(gold2, 'event')
      r.earnedGold = (r.earnedGold ?? 0) + gold2 // R5.1e:宝箱金币也计入撤退代价基数
      const tier = dungeonItemTier(runDungeon(r).id)
      const bases = Object.keys(ITEM_BASES).filter((id) => ITEM_BASES[id].tier === tier)
      const baseId = bases[Math.floor(runRng(r)() * bases.length)]
      const item = rollDrop(baseId, runRng(r), { qualityBias: 0.3 })
      receiveItems([item], true)
      // 结算反馈红线:收获了什么必须当场可见(结果条);R4.1(U34 Q1):宝箱流水不再进大事记
      changeProgress({ lastNodeResult: `${entryText ? entryText + '\n' : ''}🎁 ${node.name}:获得 ${gold2} 金与 ${describeItem(item)}(已入仓库)` })
      setRun({ ...r })
      if (r.autoMode) window.setTimeout(() => continueDeepRef.current?.(), 700)
      return
    }
  }
  continueDeepRef.current = chooseNode


  const backToGuild = () => {
    go('hall')
    setResumeNotice('')
    const r = runRef.current
    if (r) noteStatistics(expeditionStatistics(r))
    // #4.2 装备维护扣款:远征终局算出的账单,回城一次一收
    if (r?.maintenanceDue) {
      const due = r.maintenanceDue
      setGold((g) => g - due)
      r.maintenanceDue = 0
      logChronicle(chronicleRaw(day, `回城维护装备：铁匠铺收 ${due} 金（场数×幸存者，铁匠铺减免）。`))
    }
    if (r) resetAfterRun(membersRef.current)
    // 药水经济:未用完的药水退回公会库存
    if (r) setPotions({ ...r.potions })
    runRef.current = null
    setRunning(false)
    setRun(null)
    lastBattleRef.current = null
    rendererRef.current?.reset()
    setMembers([...membersRef.current])
    // M1 P0:回城 roll 上门事件与大事事件(涌现叙事双井;缘分不排队,不受冷却)
    const roll = guildRng()
    if (roll < fx.visitorChance && membersRef.current.filter((m) => m.alive).length < ROSTER_CAP) {
      setVisitor(rollVisitor(guildRng, membersRef.current, buildings.tavern ?? 0, { hybrids: !__PLAYTEST__ }))
    } else if (roll < fx.visitorChance + 0.35 && !pendingEvent) {
      // U27④:回城只抽 town 池(修 bug:此前 town 文本带 region 的事件永远抽不到)
      const ev = rollGuildEvent(guildRng, { where: 'town', visited: dungeonMastery })
      if (ev) {
        setPendingEvent(ev); setEventResult(null); sfxVisitor()
      }
    }
  }

  const restartGuild = () => {
    // 破坏性操作加确认（D14：手滑清档太疼）;F13:确认弹窗内置化,入口处 setConfirmAsk
    clearGuildSave()
    runRef.current = null
    setRunning(false)
    setRun(null)
    lastBattleRef.current = null
    rendererRef.current?.reset()
    setLastDrops([])
    setScarNotices([])
    setMemorial([])
    setManual([])
    setCandidates([])
    setVisitor(null)
    setGold(150)
    setStatistics(newStatistics())
    setBlessing(0)
    setRecruitCooldown(0)
    setPotions({ ...ECONOMY.startingPotions })
    updateKingdom(newKingdomState())
    setRoyalNotice('')
    go('hall')
    setUnlockedHybrids([])
    setDungeonMastery({})
    guildRngRef.current = createStatefulRng(newRngSeed())
    const roster = newRoster(guildRng)
    updateItemOwnership(createGuildItems(roster), roster)
    setStarMarrow(0)
    setHealingMastery({})
    setHealingNotice('')
    healingBusyRef.current = false
    trainingReadyRef.current = false
    setTrainingReady(false)
    setBuildings({})
    setDay(1)
    setTowerBest(0)
    chronicleRef.current = []
    setChronicle([])
    seedChronicle([])
    setPendingConsequences([])
    setEventsSeen([])
    setGuildBuffs([])
    setRareHuntNext(null)
    setPendingEvent(null)
    setEventResult(null)
    setEventImpacts([])
    setOfflineNote(null)
    setProtectOn(true)
    setDungeonId('blackmoss')
    setExpeditionIds([])
    setSaveTransfer(null)
    towerRunRef.current = null
    setTowerRun(null)
    setTowerRunning(false)
    autoLoopRef.current = false
    pendingDepartureRef.current = null
    pendingConsequenceRef.current = null
    changeProgress(initialRunState())
    setResumeNotice('')
    eventResolvingRef.current = false
    growthSnapshotRef.current.clear()
    eventCursorRef.current = 0
  }


  const dismantleT3 = (id: string) => {
    if (runRef.current || towerRunRef.current) return
    const item = itemOwnershipRef.current.items[id]
    if (!item || ITEM_BASES[item.baseId].tier !== 3) return
    const removed = removeInventoryItem(itemOwnershipRef.current, id)
    if (!removed) return
    updateItemOwnership(removed.state)
    setStarMarrow((m) => m + 2)
    logChronicle(chronicleRaw(day, '拆解了 ' + describeItem(item) + ',取得 2 枚星髓。'))
    sfxCoin()
  }
  const EXCHANGE_LIST = ['wpn-t3-dawn', 'arm-t3-bulwark', 'trk-t3-seer']
  const exchangeT3 = (baseId: string) => {
    if (runRef.current || towerRunRef.current || !EXCHANGE_LIST.includes(baseId) || kingdomTrust(kingdom) < 100 || gold < 800 || blessing < 10 || starMarrow < 2) return
    setGold((g) => g - 800)
    setBlessing((b) => b - 10)
    setStarMarrow((m) => m - 2)
    const d = rollDrop(baseId, guildRng, { qualityBias: 0.3 })
    receiveItems([d], true)
    logChronicle(chronicleRaw(day, '凭灰冠信任兑换了 ' + describeItem(d) + '。'))
    sfxCoin()
  }
  const sellItem = (id: string) => {
    if (runRef.current || towerRunRef.current) return
    // A16:变卖二次确认(仓库物品不可恢复,一键变卖曾误伤)
    const removed0 = itemOwnershipRef.current.inventory.find((x) => x === id)
    const item0 = removed0 ? itemOwnershipRef.current.items[id] : undefined
    if (!item0) return
    setConfirmAsk({
      text: `变卖【${ITEM_BASES[item0.baseId].name}】?可获得 ${sellValue(item0, fx.sellMult)} 金,变卖后无法赎回。`,
      okLabel: '变卖',
      onOk: () => {
        const removed = removeInventoryItem(itemOwnershipRef.current, id)
        if (!removed) return
        updateItemOwnership(removed.state)
        gainGold(sellValue(removed.item, fx.sellMult), 'sales'); sfxCoin()
      },
    })
  }

  // ---- M1 P1 黑苔高塔 ----

  const enterTower = () => {
    if (runRef.current || towerRunRef.current || pendingEvent || expedition.length < 3) return
    setScarNotices([])
    setLastDrops([])
    setResumeNotice('')
    const t = startTower(expedition, int(guildRng, 1, 100000) * 9973, potions)
    towerRunRef.current = t
    setTowerRun({ ...t })
    go('tower')
    setTowerRunning(true)
    lastBattleRef.current = null
    drainAndSync(t.battle!)
  }

  const cmdTower = (fn: (b: BattleState) => void, force = false) => {
    const b = towerRunRef.current?.battle
    if (!b) return
    if (b.status === 'running') {
      if (b.commands.autoMode && !force) return
      fn(b)
    }
    drainAndSync(b)
  }

  const towerNextFloor = () => {
    const t = towerRunRef.current
    if (!t || t.phase !== 'rest') return
    towerRest(t, baseEffects(buildings).towerRestHealPct, membersRef.current)
    towerNext(t, int(runRng(t), 1, 100000) * 9973, membersRef.current)
    setTowerRun({ ...t })
    setTowerRunning(true)
    lastBattleRef.current = null
    drainAndSync(t.battle!)
  }

  const leaveTower = () => {
    setResumeNotice('')
    const t = towerRunRef.current
    // 药水经济:离开高塔,未用完的药水退回公会库存(settleTowerFloor 已逐层回写)
    if (t) setPotions({ ...t.potions })
    // #3.1 下塔才结算:主动离开/撤退=全额;团灭只保 20%(C4);B3-5 保险扩展:投保层团灭保 60%(对冲工具)
    if (t) {
      const wipeMult = t.insuredFloor ? 0.6 : 0.2
      const claim = claimPendingLoot(t, t.result === 'defeated' ? wipeMult : 1)
      if (claim.gold) gainGold(claim.gold, 'tower')
      if (claim.exp) {
        // 经验按塔结算口径发给出征队员(settleGrowth 的 exp 部分在爬塔时已延迟到这里)
        for (const m of runMembers(t, membersRef.current)) if (m.alive) grantExp(m, Math.round(claim.exp / Math.max(1, runMembers(t, membersRef.current).filter((x) => x.alive).length)))
      }
      if (claim.drops.length) receiveItems(claim.drops, true)
    }
    if (t) resetAfterRun(membersRef.current)
    towerRunRef.current = null
    setTowerRun(null)
    go('hall')
    setTowerRunning(false)
    lastBattleRef.current = null
    rendererRef.current?.reset()
    setMembers([...membersRef.current])
  }

  const stepTen = () => {
    const b = runRef.current?.battle
    if (!b || b.status !== 'running') return
    for (let i = 0; i < 10; i++) stepBattle(b)
    drainAndSync(b)
  }

  const finishBattle = () => {
    const r = runRef.current
    const b = r?.battle
    if (!r || !b) return
    setRunning(false)
    // 已终局（×10 步进越过后）：只补结算与同步，不再推 tick
    if (b.status !== 'running') {
      settleBattleEnd(r)
      syncAll()
      return
    }
    let guard = 0
    while (b.status === 'running' && guard++ < 20000) stepBattle(b)
    settleBattleEnd(r)
    syncAll()
  }

  // ---- 派生状态 ----
  const fx = baseEffects(buildings)

  const upgradeBuilding = (id: string) => {
    const def = BUILDINGS.find((b) => b.id === id)
    if (!def) return
    const lv = buildings[id] ?? 0
    if (lv >= def.maxLevel) return
    const cost = def.costs[lv]
    if (gold < cost.gold || blessing < (cost.blessing ?? 0)) return
    setGold((g) => g - cost.gold)
    if (cost.blessing) setBlessing((b) => b - cost.blessing!)
    setBuildings((bs) => ({ ...bs, [id]: lv + 1 }))
    updateKingdom(advanceCommissions(kingdomRef.current, { kind: 'building', buildingId: id, level: lv + 1 }))
    logChronicle(chronicleBuilding(day, def.name, lv + 1))
    sfxCoin()
  }

  // 药水经济:仓库金币补货(远征中不卖货)
  const buyPotion = (kind: 'heal' | 'fury') => {
    const cost = royalPotionCost(kind, kingdomRef.current)
    if (runRef.current || towerRunRef.current || gold < cost) return
    setGold((g) => g - cost)
    setPotions((p: { heal: number; fury: number }) => ({ ...p, [kind]: p[kind] + 1 }))
    sfxCoin()
  }

  // R4.4 王国货架:信任档位解锁商品;购买不消耗信任(只认档位);公会大事记一条(U34 兑换类)
  const buyRoyalGood = (good: RoyalGood) => {
    if (runRef.current || towerRunRef.current || gold < good.gold) return
    if (royalGoodLock(good, kingdomRef.current)) return
    setGold((g) => g - good.gold)
    if (good.heal || good.fury) setPotions((p: { heal: number; fury: number }) => ({ heal: p.heal + (good.heal ?? 0), fury: p.fury + (good.fury ?? 0) }))
    if (good.marrow) setStarMarrow((m: number) => m + good.marrow!)
    if (good.item) receiveItems([{ ...good.item, id: `shelf-${good.id}` }])
    logChronicle(chronicleRaw(day, `凭王国的信任从官署货架购得「${good.name}」。`))
    sfxCoin()
  }

  // B3-4 营地换装(U22 简化实现):rest 相解锁换装——equip 守卫放行 rest(见 equip)

  // #2.5 锁定保护(批量分解兜底;锁定状态随物品存档,可选字段零迁移)
  const toggleLock = (uid: string) => {
    if (runRef.current || towerRunRef.current) return
    const item = itemOwnershipRef.current.items[uid]
    if (!item) return
    const next = structuredClone(itemOwnershipRef.current)
    next.items[uid] = { ...item, locked: !item.locked }
    updateItemOwnership(next)
  }
  // #2.5 一键分解:UI 层已过滤,这里对锁定件再兜底跳过;T3 拆星髓,其余折金币
  const bulkDismantle = (uids: string[]) => {
    if (runRef.current || towerRunRef.current) return
    const r = dismantleBulk(itemOwnershipRef.current, uids, baseEffects(buildings).sellMult)
    if (!r) return
    updateItemOwnership(r.state)
    if (r.gold) gainGold(r.gold, 'sales')
    if (r.marrow) setStarMarrow((m: number) => m + r.marrow)
    logChronicle(chronicleRaw(day, `批量分解了 ${r.count} 件装备:${r.gold ? `${r.gold} 金` : ''}${r.marrow ? `${r.marrow} 星髓` : ''}。`))
    sfxCoin()
  }
  // #2.6 词条升级:词条按更高一档 tier 重掷;星髓 2/次
  const upgradeRoll = (uid: string, rollIndex: number) => {
    if (runRef.current || towerRunRef.current || starMarrow < 2) return
    const r = upgradeRegisteredRoll(itemOwnershipRef.current, uid, rollIndex, guildRng)
    if (!r) return
    updateItemOwnership(r.state)
    setStarMarrow((m: number) => m - 2)
    logChronicle(chronicleRaw(day, `在铁匠铺把一条词条锻升了一档。`))
    sfxCoin()
  }
  // #2.6 品质提升:white→green→purple;星髓 3/6
  const refineQuality = (uid: string) => {
    if (runRef.current || towerRunRef.current) return
    const cur = itemOwnershipRef.current.items[uid]
    if (!cur) return
    const cost = (cur.quality ?? 'white') === 'white' ? 3 : 6
    if (starMarrow < cost) return
    const r = refineRegisteredQuality(itemOwnershipRef.current, uid)
    if (!r) return
    updateItemOwnership(r.state)
    setStarMarrow((m: number) => m - cost)
    logChronicle(chronicleRaw(day, `在铁匠铺把装备品质提升到了${r.to === 'purple' ? '史诗' : '精良'}。`))
    sfxCoin()
  }

  const resolveEvent = (choiceIdx: number) => {
    const ev = pendingEvent
    if (!ev || eventResult || eventResolvingRef.current) return
    const rng = (runRef.current ? runRng(runRef.current) : guildRng)
    const outcome = pickOutcome(ev, choiceIdx, rng())
    eventResolvingRef.current = true
    // A2:事件选择入账(说书链头;consequence-due 兑现时经 latestEventChoice 建链)
    appendFact(factLedgerRef.current, day, { kind: 'event-choice', actors: runRef.current ? runRef.current.memberIds : [], refs: { eventId: ev.id } })
    setFactLedger({ ...factLedgerRef.current })
    // 决策与奖励同批落盘;仅展示时保留队列,刷新不能跳过未处理后果。
    const due = pendingConsequenceRef.current
    if (due) {
      setPendingConsequences((q) => { const at = q.findIndex(c => c.eventId === due.eventId && c.dueDay === due.dueDay); return q.filter((_, i) => i !== at) })
      pendingConsequenceRef.current = null
    }
    const fx = outcome.effects ?? {}
    // 影响明细:每项结算同步登记 chip,结果面板逐条可见(反馈:选完要看得见改变)
    const impacts: { t: string; tone?: 'pos' | 'neg' | 'hook' }[] = []
    const chip = (t: string, tone?: 'pos' | 'neg' | 'hook') => impacts.push({ t, tone })
    const sgn = (n: number) => (n > 0 ? `+${n}` : `${n}`)
    const gold2 = fx.gold
    if (gold2) {
      if (gold2 > 0) gainGold(gold2, 'event')
      else setGold((g) => Math.max(0, g + gold2))
      chip(`金币 ${sgn(gold2)}`, gold2 > 0 ? 'pos' : 'neg')
    }
    const blessing2 = fx.blessing
    if (blessing2) {
      setBlessing((b) => Math.max(0, b + blessing2))
      chip(`英灵祝福 ${sgn(blessing2)}`, blessing2 > 0 ? 'pos' : 'neg')
    }
    if (fx.moraleAll) {
      applyMoraleDelta(membersRef.current.filter((m) => m.alive), fx.moraleAll)
      chip(`全员士气 ${sgn(fx.moraleAll)}`, fx.moraleAll > 0 ? 'pos' : 'neg')
    }
    if (fx.moraleRandom) {
      const alive = membersRef.current.filter((m) => m.alive)
      if (alive.length > 0) applyMoraleDelta([alive[Math.floor(rng() * alive.length)]], fx.moraleRandom)
      chip(`一人士气 ${sgn(fx.moraleRandom)}`, fx.moraleRandom > 0 ? 'pos' : 'neg')
    }
    if (fx.expAll) {
      for (const m of membersRef.current) if (m.alive) grantExp(m, fx.expAll)
      chip(`全员经验 +${fx.expAll}`, 'pos')
    }
    if (fx.item) {
      const d = rollDrop(fx.item!, rng)
      receiveItems([d])
      chip(`获得装备:${describeItem(d)}`, 'pos')
    }
    if (fx.recruit) {
      setVisitor(rollVisitor(rng, membersRef.current, 0, { hybrids: !__PLAYTEST__ }))
      chip('有访客上门', 'pos')
    }
    if (fx.injure) {
      const alive = membersRef.current.filter((m) => m.alive)
      if (alive.length > 0) {
        const hurt = alive[Math.floor(rng() * alive.length)]
        hurt.hp = Math.max(1, Math.floor(hurt.hp / 2))
        setMembers([...membersRef.current])
      }
      chip('一人负伤(生命减半)', 'neg')
    }
    // 属性点(六维改革):全队每人 +N 随机维
    if (fx.attrPoint) {
      const DIMS = ['str', 'agi', 'int', 'vit', 'spr', 'lck'] as const
      for (const m of membersRef.current) {
        if (!m.alive) continue
        const dim = DIMS[Math.floor(rng() * DIMS.length)]
        m.attrs[dim] += fx.attrPoint
      }
      setMembers([...membersRef.current])
      chip(`全队属性点 +${fx.attrPoint}`, 'pos')
    }
    // 药水经济接入事件叙事(F07 残余修复 2026-09-25):远征中触发的事件药水进远征携带
    // (run.potions)——否则进公会库存后回城被 run.potions 退回覆盖,等于白给;公会层事件照旧进库存
    if (fx.potionHeal) {
      if (runRef.current) {
        runRef.current.potions = { ...runRef.current.potions, heal: Math.max(0, runRef.current.potions.heal + fx.potionHeal!) }
      } else {
        setPotions((p) => ({ ...p, heal: Math.max(0, p.heal + fx.potionHeal!) }))
      }
      chip(`治疗药水 ${sgn(fx.potionHeal)}`, fx.potionHeal > 0 ? 'pos' : 'neg')
    }
    if (fx.potionFury) {
      if (runRef.current) {
        runRef.current.potions = { ...runRef.current.potions, fury: Math.max(0, runRef.current.potions.fury + fx.potionFury!) }
      } else {
        setPotions((p) => ({ ...p, fury: Math.max(0, p.fury + fx.potionFury!) }))
      }
      chip(`爆发药水 ${sgn(fx.potionFury)}`, fx.potionFury > 0 ? 'pos' : 'neg')
    }
    // 途中即时生效;公会/出征前获得的状态借用公会状态保存,只覆盖下一出征日。
    const buffNeg = (mods: { atk?: number; def?: number; hp?: number; heal?: number }) =>
      [mods.atk, mods.def, mods.hp, mods.heal].some((v) => v !== undefined && v < 1)
    if (fx.runBuff) {
      const r = runRef.current
      if (r) {
        r.buffs = [...(r.buffs ?? []), fx.runBuff]
        chip(`获得状态:${fx.runBuff.name}(${fx.runBuff.desc})`, buffNeg(fx.runBuff.mods) ? 'neg' : 'pos')
      } else {
        setGuildBuffs((q) => [...q, { buff: fx.runBuff!, endDay: day + 2 }])
        chip(`下次远征状态:${fx.runBuff.name}(${fx.runBuff.desc})`, buffNeg(fx.runBuff.mods) ? 'neg' : 'pos')
      }
    }
    // 事件二期:公会层跨天状态(传奇事件的诅咒/祝福带回公会,days 天内出征生效)
    if (fx.guildBuff) {
      const { days, ...buff } = fx.guildBuff
      setGuildBuffs((q) => [...(q ?? []), { buff, endDay: day + days }])
      chip(`公会状态:${buff.name}(${buff.desc},持续 ${days} 天)`, buffNeg(buff.mods) ? 'neg' : 'pos')
    }
    // 稀有猎杀(WoW 式):下次出征首场遭遇强化、奖励翻倍
    if (fx.rareHuntNext) {
      setRareHuntNext(fx.rareHuntNext)
      chip('稀有猎杀立约:下次出征首战,敌更强、奖更厚', 'pos')
    }
    // 图鉴:见过的事件记名
    setEventsSeen((s) => (s.includes(ev.id) ? s : [...s, ev.id]))
    // 延迟第二幕:入队,dueDay 到期在出征日弹出;引子当场可见(反馈:后续事件要留钩子)
    if (fx.delayed) {
      const link = latestEventChoice(factLedgerRef.current, fx.delayed!.eventId)
      appendFact(factLedgerRef.current, day, { kind: 'event-choice', actors: runRef.current ? runRef.current.memberIds : [], refs: { eventId: fx.delayed!.eventId }, links: link ? [link.id] : undefined })
      setFactLedger({ ...factLedgerRef.current })
      setPendingConsequences((q) => [...(q ?? []), { eventId: fx.delayed!.eventId, dueDay: day + fx.delayed!.dueDays }])
      chip('这件事,还没有完……', 'hook')
    }
    // R4.1(U34 Q1):事件结果流水不再进大事记(弹层+影响明细 chips 已可视化)
    setEventResult(outcome.text)
    setEventImpacts(impacts)
    setMembers([...membersRef.current])
  }
  // F09 修复(2026-09-25):ref 改为渲染期赋值——旧写法在 resolveEvent 体内自赋值,
  // 首次自动事件(挂机)触发时 ref 尚为 null,自动选路静默失败、事件卡死

  const dismissEvent = () => {
    eventResolvingRef.current = false
    // R1 反馈:事件翻页后结果留在地图上(挂机代选不再是"直接关掉")
    if (eventResult) changeProgress({ lastNodeResult: `❯ ${pendingEvent?.title ?? '事件'}:${eventResult}` })
    setPendingEvent(null)
    setEventResult(null)
    setEventImpacts([])
    const departure = pendingDepartureRef.current
    pendingDepartureRef.current = null
    if (departure) window.setTimeout(() => startExpeditionRef.current?.(), 0)
    else if (runRef.current?.autoMode && runRef.current.phase === 'rest') {
      window.setTimeout(() => continueDeepRef.current?.(), 0)
    } else if (!runRef.current && autoLoopRef.current) {
      window.setTimeout(() => startExpeditionRef.current?.(), 0)
    }
  }

  // 挂机代打事件(试玩反馈二轮):远征途中触发的事件,队长随机择路;结果展示后自动翻页
  // F09(2026-09-25):守卫从 run.autoMode 改为 autoLoopRef——回城后 runRef 为 null,
  // 公会层事件的自动结算/翻页此前会失效,挂机连刷卡死在结果弹窗上




  // 装备 2.0:拆解 T3 得星髓;灰冠兑换(信任 100 解锁)用星髓+金币换指定 T3

  return { applyOutcome, applyRetreatDeduction, settleBattleEnd, equip, redeemRelic, retreat, cmd, resolveEvent, dismissEvent,
    startExpedition, chooseNode, backToGuild, restartGuild, dismantleT3, exchangeT3, sellItem,
    enterTower, cmdTower, towerNextFloor, leaveTower, stepTen, finishBattle, upgradeBuilding, buyPotion, buyRoyalGood, toggleLock, bulkDismantle, upgradeRoll, refineQuality }
}

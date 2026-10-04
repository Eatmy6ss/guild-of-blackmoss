import { HeroPortrait, ArtCanvas } from './ui/art/ArtCanvas'
import { itemIcon, DOCK_ART } from './ui/art/catalog'
import { BattleIntel } from './ui/art/BattleIntel'
import { CreditsDialog } from './ui/art/Credits'
import { KingdomPanel } from './ui/KingdomPanel'
import { SaveTransferPanel } from './ui/SaveTransferPanel'
import { StatisticsPanel } from './ui/StatisticsPanel'
import { newStatistics, recordStatistics, expeditionStatistics, type StatisticsAction, type GoldSource } from './sim/statistics'
import { COMMISSIONS, type CommissionDef } from './data/kingdom'
import { acceptCommission, abandonCommission, advanceCommissions, claimCommission, newKingdomState, kingdomRank, kingdomTrust, royalPotionCost, type RoyalRewardChoice } from './sim/kingdom'
import { useEffect, useRef, useState, useReducer, useMemo } from 'react'
import type { BattleState, DeadHero, ItemInstance, JobId, Member, Slot, Stance } from './sim/types'
import { generateMember, maxHpOf, bondStars, seedMemberSeq, reserveNames, rollSpec, memberGenerationState, restoreMemberGeneration } from './sim/gen'
import { statLayers } from './sim/combat'
import { ITEM_BASES } from './data/items'
import { describeEquipmentSet } from './sim/equipment-sets'
import { RACES } from './data/races'
import { guildGoals } from './sim/goals'
import { guildRankOf } from './sim/rank'
import { applyFeast, applyRestMorale, refusesToMarch } from './sim/morale'
import { chronicleFeast, chronicleRefusal, chronicleRecruit, chronicleBuilding, moraleReadout, seedChronicle, type ChronicleEntry } from './sim/chronicle'
import {
  TICK_MS,
  stepBattle,
  setStance,
  setFocus,
  useHealPotion,
  useFuryPotion,
  orderRetreat,
  useSignature,
  STANCE_NAME,
  toCombatant,
} from './sim/combat'
import { SignatureBar } from './ui/battle/SignatureBar'
import { BattleHints } from './ui/battle/BattleHints'
import { BATTLE_HINTS, DOCK_UNLOCK_DAY, DOCK_UNLOCK_MILESTONE, FIRST_RETURN_TIP } from './data/tutorial'
import { appendFact, latestEventChoice, markExpeditionStart, markTold, normalizeLedger, type FactLedger } from './sim/fact-ledger'
import { tellExpedition } from './sim/storyteller'
import { SIGNATURE_SKILLS } from './data/signature'
import { skillLine, SPEC_PASSIVE_DESC } from './data/effect-text'
import { MemberPanel } from './ui/MemberPanel'
import { renderWarReportCard, downloadWarReportCard } from './ui/war-report-card'
import { createRng } from './sim/rng'
import {
  createRun,
  startStep,
  retreatRun,
  resetAfterRun,
  REST_HEAL_PCT,
  type DungeonRun,
} from './sim/run'
import { powerScore } from './sim/combat'

import { describeItem, slotsOf, dungeonItemTier } from './sim/loot'
import { settleEncounter, type EncounterGuild, type EncounterOutcome } from './sim/settlement'
import { createStatefulRng, newRngSeed, int, type Rng } from './sim/rng'
import { loadGuildSave, saveGuild, clearGuildSave, exportSave, saveLoadNotice, saveFailNotice, combatSaveDue, type GuildSave, type PendingConsequence, type StoredGuildBuff } from './state/save'
import {
  createGuildItems, itemStateFromSave, resolveMembers, inventoryItems, relicItems, serializeGuildItems,
  addInventoryItems, equipRegisteredItem, removeInventoryItem, redeemRegisteredRelic,
  registerMemberItems, applyEncounterItems, type GuildItems,
} from './state/item-registry'
import { runDungeon, runMembers, runRng } from './sim/run-core'
import { runReducer, initialRunState, checkpointRunState, pendingRunEvent, type RunUIState } from './sim/run-state'
import { GUILD_EVENTS } from './data/guild-events'
import { BattleRenderer } from './ui/battle/BattleRenderer'
import { initAudio, setMusicMood, toggleMute, isMuted, setVolume, getVolume, sfxVictory, sfxDefeat, sfxCoin, sfxVisitor, sfxCmd } from './ui/audio'
import { bossIntents } from './sim/mechanics'
import { BLACKMOSS, DUNGEONS } from './data/dungeons'
import { startTower, insureNextTowerFloor, towerRest, towerNext, towerFloorIsBoss, type TowerRun } from './sim/tower'
import { revealTier, moveTo, mapOptions, currentNode, nextBossEncounter } from './sim/run'
import { autoPickNode } from './sim/dungeon-map'
import { restHealMult } from './sim/conditions'
import { CONDITION_BY_ID } from './data/conditions'
import { MapScreen } from './ui/screens/MapScreen'
import { ResultScreen } from './ui/screens/ResultScreen'
import { HUB_DOCK, backTargetOf, type HubScreen as UIScreen } from './ui/screens'
import { sortInventoryItems, INV_SORT_LABEL, type InvSort } from './ui/inventory-sort'
import { nextBattleSpeed, speedIntervalMs, parseBattleSpeed } from './ui/battle/speed'
import { ECONOMY } from './data/economy'
import { BUILDINGS, baseEffects } from './data/base'
import { rollVisitor, bountyCandidate, taleCandidates, sellValue, cooldownNeeded, offlineGain } from './sim/tavern'
import { memorialAura, legacyQuality, legacyCounts } from './sim/memorial'
import { rollWish, settleWishes, wishDone } from './sim/wish'
import { assignTrait, TRAIT_LABELS } from './sim/member-traits'
import { attemptHeal, healingTerms, scarStatName, type HealingMastery } from './sim/scars'
import { DUNGEON_FINAL_BOSS } from './data/regions'
import { rollGuildEvent, pickOutcome, consequenceFiresIn, consequenceOf } from './sim/guild-events'
import { applyMoraleDelta } from './sim/morale'
import { rollDrop } from './sim/loot'
import { chronicleRaw } from './sim/chronicle'
import { grantExp } from './sim/gen'
import { JOBS, specOf } from './data/jobs'
import { HYBRIDS, isHybrid } from './data/vocations'
import { REGIONS, dungeonLock, nextRegionLocked, playtestAllows } from './data/regions'
import { TRAIT_INFO } from './data/traits'
import { MECHANIC_REGISTRY, mechanicBrief } from './sim/mechanic-registry'

// M0 D11 开发架：公会层——永久死亡、纪念堂、撤退保护、招募三选一、战术手册。
// 花名册 = 全体成员（含亡者记录）；远征队 = 花名册前三名幸存者。

const START_JOBS = ['guard', 'priest', 'ranger'] as const


const ROLE_NAME: Record<string, string> = { tank: '坦克', healer: '治疗', dps: '输出' }
const SLOT_NAME: Record<Slot, string> = { weapon: '武器', armor: '护甲', trinket: '饰品' }
const SLOTS: Slot[] = ['weapon', 'armor', 'trinket']
const SEED_BASE = 7777
const ROSTER_CAP = 6
const MANUAL_BONUS = 0.05 // 已研习 boss 全队对其伤害 +5%

// UI 2.0 屏幕栈:公会大厅(hub) + 功能界面覆盖层。快捷键呼出,Esc/再按关闭。
function newRoster(rng: Rng): Member[] {
  // 新档反馈①修复:开局送三件传家 T1(实测裸装开局全操作档通关率 0%,装备是前期唯一杠杆)
  return START_JOBS.map((job) => {
    const m = generateMember(job, 5, int(rng, 0, 0xffffffff))
    const baseId = job === 'guard' ? 'arm-t1-mail' : job === 'priest' ? 'wpn-t1-sword' : 'wpn-t1-dagger'
    m.equipment[job === 'guard' ? 'armor' : 'weapon'] = rollDrop(baseId, rng)
    return m
  })
}

function attrsLine(m: Member): string {
  const a = m.attrs
  return `力${a.str} 敏${a.agi} 智${a.int} 体${a.vit} 精${a.spr} 运${a.lck}`
}

function personalityLine(m: Member): string {
  const p = m.personality
  return `勇猛${p.bravery} 谨慎${p.caution} 贪婪${p.greed} 忠诚${p.loyalty}`
}

function natureLine(m: Member): string {
  const n = m.nature
  const best = (['str', 'agi', 'int'] as const).reduce((a, b) => (n.caps[a] >= n.caps[b] ? a : b))
  return `天性上限：${best === 'str' ? '力' : best === 'agi' ? '敏' : '智'}${n.caps[best]}`
}

function encName(run: DungeonRun, stepId: string): string {
  return runDungeon(run).encounters.find((e) => e.id === stepId)?.name ?? stepId
}

export default function App() {
  // 资产与远征断点一起保存，恢复时仍使用同一模拟与结算入口。
  const [saved] = useState(loadGuildSave)
  const [initialGuildRng] = useState(() => createStatefulRng(saved?.rngState ?? newRngSeed()))
  const guildRngRef = useRef(initialGuildRng)
  const guildRng: Rng = () => guildRngRef.current()
  const [initialGuild] = useState(() => {
    if (saved) {
      const items = itemStateFromSave(saved)
      return { items, members: resolveMembers(saved.members, items) }
    }
    const roster = newRoster(guildRng), items = createGuildItems(roster)
    return { items, members: resolveMembers(roster, items) }
  })
  const [itemOwnership, setItemOwnership] = useState(initialGuild.items)
  const itemOwnershipRef = useRef(itemOwnership)
  const [members, setMembers] = useState<Member[]>(initialGuild.members)
  const membersRef = useRef(members)
  const [progress, dispatchProgress] = useReducer(runReducer, saved?.runState ?? initialRunState())
  const progressRef = useRef(progress)
  const lastCombatSaveRef = useRef(0)
  const [factLedger, setFactLedger] = useState<FactLedger>(() => normalizeLedger(saved?.factLedger))
  const factLedgerRef = useRef(factLedger)
  const [hintsSeen, setHintsSeen] = useState<string[]>(saved?.hintsSeen ?? [])
  type PlayMeta = NonNullable<GuildSave['playMeta']>
  const [playtestEnding, setPlaytestEnding] = useState(false)
  const [trainSelId, setTrainSelId] = useState<string | null>(null)
  const makeWarReportCard = () => {
    const rank = guildRankOf(manual)
    const url = renderWarReportCard({
      build: __BUILD_DATE__, day, rankName: rank.name, kills: manual.length, towerBest,
      fallen: memorial.map((d) => ({ name: d.name, cause: d.cause })),
      stories: chronicle.filter((c) => c.text.startsWith('📖')).map((c) => c.text.replace('📖 ', '')),
    })
    downloadWarReportCard(url, __BUILD_DATE__)
  }
  const exportPlaytestReport = () => {
    const report = {
      build: __BUILD_DATE__, exportedAt: Date.now(), day, gold, towerBest,
      manual, playMeta,
      memorial: memorial.map((d) => ({ name: d.name, job: d.job, level: d.level, cause: d.cause, death: d.death })),
      stories: chronicle.filter((c) => c.text.startsWith('📖')).map((c) => ({ day: c.day, text: c.text })),
      survey: [
        '你会在明天再打开它吗?(是/可能/否)',
        '你用过哪个招牌技能?在什么时候用的?为什么那时候用?',
        '有没有哪一刻让你觉得「这是我的决定改变了结果」?',
        '有没有哪一刻你完全不知道该干什么?',
        '有没有哪个佣兵让你记住了名字?为什么?',
        '如果只能改一个地方,你会改什么?',
      ],
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `playtest-report-${__BUILD_DATE__}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const [playMeta, setPlayMeta] = useState<PlayMeta>(() => saved?.playMeta ?? { startedAt: Date.now(), expeditions: 0, retreats: 0, signatureUses: 0 })
  const hintsSeenRef = useRef(hintsSeen)
  const dismissHint = (id: string) => {
    if (hintsSeenRef.current.includes(id)) return
    hintsSeenRef.current = [...hintsSeenRef.current, id]
    setHintsSeen(hintsSeenRef.current)
  }
  // A10:主菜单解锁=天数或里程碑(仓库见第一件装备/大事记见第一条记录/名人堂有第一位亡者)
  const dockUnlocked = (key: string): boolean => {
    if (day >= (DOCK_UNLOCK_DAY[key] ?? 1)) return true
    const milestone = DOCK_UNLOCK_MILESTONE[key]
    return milestone ? milestone({ inventoryCount: inventory.length, chronicleCount: chronicle.length, memorialCount: memorial.length }) : false
  }

  const dockUnlockedRef = useRef(dockUnlocked)
  dockUnlockedRef.current = dockUnlocked
  const [saveFailed, setSaveFailed] = useState(false)
  const changeProgress = (patch: Partial<RunUIState>) => {
    const next = runReducer(progressRef.current, { type: 'patch', patch })
    progressRef.current = next
    dispatchProgress({ type: 'replace', state: next })
  }
  const publishProgress = () => changeProgress({ activeRun: progressRef.current.activeRun ? { ...progressRef.current.activeRun } : null })
  const run = progress.activeRun?.kind === 'dungeon' ? progress.activeRun : null
  const towerRun = progress.activeRun?.kind === 'tower' ? progress.activeRun : null
  const battle = progress.activeRun?.battle ?? null
  const running = progress.playing && !!run
  const towerRunning = progress.playing && !!towerRun
  const setRun = (value: DungeonRun | null) => changeProgress({ activeRun: value })
  const setTowerRun = (value: TowerRun | null) => changeProgress({ activeRun: value })
  const setRunning = (value: boolean | ((v: boolean) => boolean)) => changeProgress({ playing: typeof value === 'function' ? value(progressRef.current.playing) : value })
  const setTowerRunning = setRunning
  // 兼容现有回调的可写入口，全都落在同一个 reducer 状态中。
  const runRef = {
    get current(): DungeonRun | null { const r = progressRef.current.activeRun; return r?.kind === 'dungeon' ? r : null },
    set current(value: DungeonRun | null) { changeProgress({ activeRun: value }) },
  }
  const towerRunRef = {
    get current(): TowerRun | null { const r = progressRef.current.activeRun; return r?.kind === 'tower' ? r : null },
    set current(value: TowerRun | null) { changeProgress({ activeRun: value }) },
  }
  const autoLoopRef = { get current() { return progressRef.current.autoLoop }, set current(v: boolean) { changeProgress({ autoLoop: v }) } }
  const pendingDepartureRef = { get current() { return progressRef.current.pendingDeparture }, set current(v: string | null) { changeProgress({ pendingDeparture: v }) } }
  const pendingConsequenceRef = { get current() { return progressRef.current.pendingConsequence }, set current(v: PendingConsequence | null) { changeProgress({ pendingConsequence: v }) } }
  const growthSnapshotRef = {
    get current() { return new Map(Object.entries(progressRef.current.growthSnapshot)) },
    set current(v: Map<string, RunUIState['growthSnapshot'][string]>) { changeProgress({ growthSnapshot: Object.fromEntries(v) }) },
  }
  const pendingEvent = pendingRunEvent(progress)
  const eventResult = progress.eventResult
  const eventImpacts = progress.eventImpacts
  const setPendingEvent = (v: ReturnType<typeof rollGuildEvent>) => changeProgress({ eventId: v?.id ?? null })
  const setEventResult = (v: string | null) => changeProgress({ eventResult: v })
  const setEventImpacts = (v: RunUIState['eventImpacts']) => changeProgress({ eventImpacts: v })
  const scarNotices = progress.notices
  const setScarNotices = (v: string[]) => changeProgress({ notices: v })
  const dungeonId = progress.dungeonId
  const setDungeonId = (v: string) => changeProgress({ dungeonId: v })
  const expeditionIds = progress.expeditionIds
  const setExpeditionIds = (v: string[] | ((ids: string[]) => string[])) => changeProgress({ expeditionIds: typeof v === 'function' ? v(progressRef.current.expeditionIds) : v })
  useEffect(() => {
    membersRef.current = members
  }, [members])

  const [kingdom, setKingdom] = useState(() => saved?.kingdom ?? newKingdomState())
  // 装备 2.0:星髓(拆解 T3 所得,灰冠兑换)
  const [starMarrow, setStarMarrow] = useState(() => saved?.starMarrow ?? 0)
  // 遗物安葬 2.0:阵亡装备待赎回清单
  const pendingRelics = relicItems(itemOwnership)
  // S1 创伤一期:疗养熟练度(维度→尝试次数)
  const [healingMastery, setHealingMastery] = useState<HealingMastery>(() => saved?.healingMastery ?? {})
  const [healingNotice, setHealingNotice] = useState('')
  const healingBusyRef = useRef(false)
  useEffect(() => { healingBusyRef.current = false }, [members])
  const [trainingReady, setTrainingReady] = useState(() => saved?.trainingReady ?? false)
  const trainingReadyRef = useRef(trainingReady)
  trainingReadyRef.current = trainingReady
  // K06 个人心愿层(U14):入职 50% 立愿;达成给士气+编年史,再 50% 立新愿
  const wishDungeonPool = () => Object.keys(dungeonMastery).map((id) => ({ id, name: DUNGEONS.find((d) => d.id === id)?.name ?? id }))
  const rollWishFor = (m: Member) => {
    m.wish = rollWish(guildRng, { slots: ['weapon', 'armor'], dungeons: wishDungeonPool(), towerBest, level: m.level }) ?? undefined
  }
  // K09 人物特性(U16):招募时机 55% 立特性;checkWishes 循环里为朴素成员补立
  const rollTraitFor = (m: Member) => {
    if (!assignTrait(m, guildRng)) return false
    logChronicle(chronicleRaw(day, m.name + ' 显露出特性：' + TRAIT_LABELS[m.trait!] + '。'))
    return true
  }
  const checkWishes = () => {
    const { changed, stories } = settleWishes(membersRef.current, {
      dungeons: wishDungeonPool(), towerBest,
      dungeonCleared: id => manual.includes(DUNGEON_FINAL_BOSS[id] ?? ''),
    }, guildRng)
    for (const text of stories) logChronicle(chronicleRaw(day, text))
    if (changed) setMembers([...membersRef.current])
    return changed
  }
  const kingdomRef = useRef(kingdom)
  const [royalNotice, setRoyalNotice] = useState('')
  const [saveTransfer, setSaveTransfer] = useState<{ mode: 'import' | 'export'; code: string } | null>(null)
  const updateKingdom = (next: typeof kingdom) => { kingdomRef.current = next; setKingdom(next) }

  const inventory = inventoryItems(itemOwnership)
  // 仓库排序(制作人反馈 2026-10-04):默认稀有度从高到低
  const [invSort, setInvSort] = useState<InvSort>('rarity-desc')
  const inventorySorted = useMemo(() => sortInventoryItems(inventory, invSort), [inventory, invSort])
  const lastDrops = progress.dropIds.map(id => itemOwnership.items[id]).filter((item): item is ItemInstance => !!item)
  const setLastDrops = (v: ItemInstance[] | ((items: ItemInstance[]) => ItemInstance[])) => {
    const old = progressRef.current.dropIds.map(id => itemOwnershipRef.current.items[id]).filter(Boolean)
    changeProgress({ dropIds: (typeof v === 'function' ? v(old) : v).map(item => item.id) })
  }
  const updateItemOwnership = (next: GuildItems, roster = membersRef.current) => {
    itemOwnershipRef.current = next
    setItemOwnership(next)
    // 保留远征成员对象的引用，只重绑物品视图；事件与战斗不能分叉成两份成员。
    const resolved = resolveMembers(roster, next)
    roster.forEach((m, i) => { m.equipment = resolved[i].equipment })
    membersRef.current = roster
    setMembers([...roster])
  }
  const receiveItems = (incoming: ItemInstance[], showDrops = false) => {
    const result = addInventoryItems(itemOwnershipRef.current, incoming)
    updateItemOwnership(result.state)
    if (showDrops) setLastDrops(items => [...items, ...result.items])
  }
  // 副本选择(节奏改版:多副本)——仅决定下一次出征打哪张图,不入存档
  const activeDungeon = DUNGEONS.find((d) => d.id === dungeonId) ?? BLACKMOSS
  const [memorial, setMemorial] = useState<DeadHero[]>(() => saved?.memorial ?? [])
  const [manual, setManual] = useState<string[]>(() => saved?.manual ?? [])
  const [protectOn, setProtectOn] = useState(() => saved?.protectOn ?? true)
  const [candidates, setCandidates] = useState<Member[]>([])
  const [screen, setScreen] = useState<'title' | 'game'>('title')
  // F13(2026-09-25):内置确认弹窗——微信等内置浏览器不支持 window.confirm/prompt,破坏性操作改游戏内弹窗
  const [confirmAsk, setConfirmAsk] = useState<{ text: string; okLabel?: string; onOk: () => void } | null>(null)
  const [battleSpeed, setBattleSpeed] = useState<1 | 2 | 3>(() => { try { return parseBattleSpeed(localStorage.getItem('gg-speed')) } catch { return 1 } })
  const [volume, setVolumeState] = useState(getVolume())
  const [muted, setMuted] = useState(isMuted())
  const [showCredits, setShowCredits] = useState(false)
  const [memberSheetId, setMemberSheetId] = useState<string | null>(null)
  const memberSheet = members.find((m) => m.id === memberSheetId) ?? null
  const [gold, setGold] = useState(() => saved?.gold ?? 150)
  const [statistics, setStatistics] = useState(() => saved?.statistics ?? newStatistics())
  const noteStatistics = (action: StatisticsAction | null) => {
    if (action) setStatistics((previous) => recordStatistics(previous, action))
  }
  const gainGold = (amount: number, source: GoldSource) => {
    if (amount <= 0) return
    setGold((g) => g + amount)
    noteStatistics({ type: 'gold', source, amount })
  }
  const [blessing, setBlessing] = useState(() => saved?.blessing ?? 0)
  const [recruitCooldown, setRecruitCooldown] = useState(() => saved?.recruitCooldown ?? 0)
  const [visitor, setVisitor] = useState<ReturnType<typeof rollVisitor> | null>(() => saved?.visitor ?? null)
  const eventResolvingRef = useRef(saved?.runState.eventResult != null)
  // 事件影响明细(反馈:选完要看得见改变)——chips 逐条列出本次结算的实际变化
  const [offlineNote, setOfflineNote] = useState<string | null>(null)
  const [chronicle, setChronicle] = useState<ChronicleEntry[]>(() => saved?.chronicle ?? [])
  const chronicleRef = useRef(chronicle)
  const [buildings, setBuildings] = useState<Record<string, number>>(() => saved?.buildings ?? {})
  const [day, setDay] = useState(() => saved?.day ?? 1)
  const [towerBest, setTowerBest] = useState(() => saved?.towerBest ?? 0)
  // 药水库存(经济改造):出征携带/战斗消耗/回城退回,仓库补货
  const [potions, setPotions] = useState(() => saved?.potions ?? { ...ECONOMY.startingPotions })
  // 已解锁混合职阶(宪法 v3,训练场一次性解锁)
  const [unlockedHybrids, setUnlockedHybrids] = useState<string[]>(() => saved?.unlockedHybrids ?? [])
  // 副本熟练度(宪法 v3.3 修正案):迷雾揭示进度
  const [dungeonMastery, setDungeonMastery] = useState<Record<string, number>>(() => saved?.dungeonMastery ?? {})
  // 延迟第二幕队列(反馈④事件大项):dueDay 到期后弹出后续事件
  const [pendingConsequences, setPendingConsequences] = useState<PendingConsequence[]>(() => saved?.pendingConsequences ?? [])
  // 事件二期:图鉴(见过的事件)+ 公会层跨天状态 + 稀有猎杀(下次出征首场,用后即逝)
  const [eventsSeen, setEventsSeen] = useState<string[]>(() => saved?.eventsSeen ?? [])
  const [guildBuffs, setGuildBuffs] = useState<StoredGuildBuff[]>(() => saved?.guildBuffs ?? [])
  const [rareHuntNext, setRareHuntNext] = useState(() => saved?.rareHuntNext ?? null)
  const offlineAppliedRef = useRef(false)

  // 读档登记已用名字：新招募不与存档英雄/英灵重名
  useEffect(() => {
    if (offlineAppliedRef.current) return
    offlineAppliedRef.current = true
    if (saved) {
      if (saved.generationState) restoreMemberGeneration(saved.generationState)
      seedMemberSeq([...initialGuild.members, ...(saved.visitor ? [saved.visitor.member] : [])])
      reserveNames([...saved.members.map((m) => m.name), ...saved.memorial.map((h) => h.name), ...(saved.visitor ? [saved.visitor.member.name] : [])])
      seedChronicle(saved.chronicle ?? [])
      // M1 P1 离线累积:离开的时间里,存活英雄们接零工
      const { hours, gold } = saved.runState.activeRun ? { hours: 0, gold: 0 } : offlineGain(initialGuild.members, saved.lastSeen, Date.now())
      if (gold > 0) {
        gainGold(gold, 'offline')
        setOfflineNote(`🕯 离开的 ${hours} 小时里,队员们接了些零工,赚了 ${gold} 金。`)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 训练资格存档，出征时转入该次run，整次远征有效。
  const continueDeepRef = useRef<((id?: string) => void) | null>(null)
  const resolveEventRef = useRef<((choiceIdx: number) => void) | null>(null)
  const dismissEventRef = useRef<(() => void) | null>(null)
  const startExpeditionRef = useRef<(() => void) | null>(null)
  const resumeHandledRef = useRef(false)
  const [resumeNotice, setResumeNotice] = useState(() => saveLoadNotice() || (saved?.runState.activeRun ? '已恢复上次远征进度，点击继续旅程后接着挑战。' : saved?.runState.eventId ? '已恢复上次待处理的事件，点击继续旅程后查看。' : ''))
  const logBoxRef = useRef<HTMLDivElement | null>(null)
  const logPinnedRef = useRef(true) // 战报钉底：用户上滚阅读即放手，滚回底部自动恢复跟随
  const eventCursorRef = useRef(0)
  const lastBattleRef = useRef<BattleState | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<BattleRenderer | null>(null)

  useEffect(() => {
    const renderer = new BattleRenderer()
    renderer.setMembers(membersRef.current)
    rendererRef.current = renderer
    renderer.mount(stageRef.current!).catch(() => {})
    // 指挥台：点击场上敌人 = 集火
    renderer.onUnitClick = (c) => {
      if (c.team !== 'enemy' || !c.alive) return
      const b = towerRunRef.current?.battle ?? runRef.current?.battle
      if (!b || b.status !== 'running') return
      setFocus(b, c.id)
      drainAndSync(b)
    }
    // 开发架调试钩子：透视 Pixi 舞台用
    ;(window as unknown as Record<string, unknown>).__br = renderer
    return () => renderer.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const drainAndSync = (state: BattleState) => {
    rendererRef.current?.setMembers(membersRef.current)
    if (state !== lastBattleRef.current) {
      lastBattleRef.current = state
      eventCursorRef.current = 0
      try {
        rendererRef.current?.setBattle(state, [])
      } catch (e) {
        // 渲染层异常不得拖死 React 提交：界面至少保持可玩、错误进控制台（D14 卡死修复）
        console.error('渲染同步失败', e)
      }
    }
    const fresh = state.events.slice(eventCursorRef.current)
    eventCursorRef.current = state.events.length
    try {
      rendererRef.current?.setMembers(membersRef.current)
      rendererRef.current?.setBattle(state, fresh)
    } catch (e) {
      console.error('渲染同步失败', e)
    }
    publishProgress()
  }

  useEffect(() => {
    if (screen !== 'game' || resumeHandledRef.current) return
    resumeHandledRef.current = true
    const active = progressRef.current.activeRun
    if (!saved?.runState.activeRun || !active) return
    setResumeNotice('已恢复上次进度；战斗、药水和已到账奖励均已保留。')
    if (active.kind === 'dungeon') {
      const d = runDungeon(active)
      rendererRef.current?.setTheme(d.id)
    }
    if (active.battle) {
      lastBattleRef.current = active.battle
      eventCursorRef.current = active.battle.events.length
      rendererRef.current?.setMembers(membersRef.current)
      rendererRef.current?.setBattle(active.battle, [])
    }
    if (active.autoMode && !pendingEvent) {
      if (active.phase === 'rest') window.setTimeout(() => active.kind === 'dungeon' ? continueDeepRef.current?.() : towerNextFloor(), 150)
      else if (active.kind === 'dungeon' && active.phase === 'victory') {
        backToGuild()
        window.setTimeout(() => { if (autoLoopRef.current) startExpeditionRef.current?.() }, 150)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])

  const syncAll = () => {
    const r = runRef.current
    setRun(r ? { ...r } : null)
    if (r?.battle) drainAndSync(r.battle)
  }

  const encounterGuild = (): EncounterGuild => ({
    factLedger: factLedgerRef.current,
    members: membersRef.current, manual, kingdom: kingdomRef.current,
    dungeonMastery, towerBest, recruitCooldown, day, buildings, chronicle: chronicleRef.current,
  })

  // 判定已由 sim 完成；这里仅将结果同步到公会状态和当前玩法。
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
    setStatistics(stats => o.statistics.reduce(recordStatistics, stats))
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
      // A11:试玩版通关版图一 → 「试玩版到此结束」画面
      if (__PLAYTEST__ && o.run.phase === 'victory' && o.run.dungeonId === 'thornhold') setPlaytestEnding(true)
      if (story) logChronicle(chronicleRaw(day, '📖 ' + story.text))
    } else {
      towerRunRef.current = o.run
      setTowerRun({ ...o.run })
    }
  }

  // 塔层与副本经过同一结算入口；推进/自动循环仍留在 UI 层。
  useEffect(() => {
    const current = towerRunRef.current
    if (!current) return
    const o = settleEncounter({ source: 'tower', run: current, guild: encounterGuild() })
    if (!o) return
    applyOutcome(o)
    const t = o.run
    setTowerRunning(false)
    if (t.phase === 'rest' && t.autoMode) {
      window.setTimeout(() => {
        const t2 = towerRunRef.current
        if (!t2 || t2.phase !== 'rest') return
        towerRest(t2, baseEffects(buildings).towerRestHealPct, membersRef.current)
        towerNext(t2, int(runRng(t2), 1, 100000) * 9973, membersRef.current)
        setTowerRun({ ...t2 })
        setTowerRunning(true)
        lastBattleRef.current = null
        drainAndSync(t2.battle!)
      }, 500)
    }
    drainAndSync(t.battle!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [towerRun?.battle?.status])

  // 在 React 同一批资产/阶段提交后保存；跳过 effect 中刚结算、资产尚未提交的旧渲染。
  // A13 节流:战斗进行中每 5 秒写一次断点(原每 tick ≈10 次/秒);战斗结束/节点边界立即写;写失败可见。
  useEffect(() => {
    if (progress !== progressRef.current) return
    const ar = progress.activeRun
    const combatRunning = !!ar?.battle && ar.battle.status === 'running'
    if (combatRunning) {
      const now = Date.now()
      if (!combatSaveDue(now, lastCombatSaveRef.current)) return
      lastCombatSaveRef.current = now
    } else lastCombatSaveRef.current = 0
    const ok = saveGuild({ trainingReady, rngState: guildRngRef.current.state(), rareHuntNext, statistics, starMarrow, ...serializeGuildItems(itemOwnershipRef.current, members), healingMastery, kingdom, memorial, manual, protectOn, gold, blessing, recruitCooldown, towerBest, chronicle, day, buildings, potions: run?.potions ?? towerRun?.potions ?? potions, unlockedHybrids, dungeonMastery, pendingConsequences, eventsSeen, guildBuffs, runState: checkpointRunState(progress, membersRef.current), visitor, generationState: memberGenerationState(), factLedger, hintsSeen, playMeta: { ...playMeta, startedAt: playMeta.startedAt ?? Date.now() } })
    setSaveFailed(!ok)
  }, [trainingReady, rareHuntNext, statistics, starMarrow, itemOwnership, healingMastery, kingdom, members, memorial, manual, protectOn, gold, blessing, recruitCooldown, towerBest, chronicle, day, buildings, potions, unlockedHybrids, dungeonMastery, pendingConsequences, eventsSeen, guildBuffs, run, towerRun, progress, visitor, pendingEvent, eventResult, factLedger, hintsSeen, playMeta])

  // 战报钉底：新战报到达时跟随滚动；用户上滚阅读时暂不抢滚动条，滚回底部自动恢复
  useEffect(() => {
    const box = logBoxRef.current
    if (!box || !logPinnedRef.current) return
    box.scrollTop = box.scrollHeight
  }, [battle?.log.length])

  useEffect(() => {
    if (screen !== 'game' || (!running && !towerRunning)) return
    const timer = setInterval(() => {
      // 高塔线:塔进行中由本循环推进(试玩 bug 修复——此前塔战斗没有任何 tick 驱动)
      const t = towerRunRef.current
      if (t && towerRunning && t.phase === 'battle' && t.battle && t.battle.status === 'running') {
        if (performance.now() - (rendererRef.current?.lastTickAt ?? 0) > 800) return
        stepBattle(t.battle)
        if (t.battle.status !== 'running') setTowerRunning(false)
        drainAndSync(t.battle)
        return
      }
      const r = runRef.current
      const b = r?.battle
      if (!r || !b || r.phase !== 'battle' || b.status !== 'running') return
      // 渲染停摆（遮挡/最小化 → rAF 停）则暂停模拟：没有画面，跑模拟只会堆积冻结动画
      if (performance.now() - (rendererRef.current?.lastTickAt ?? 0) > 800) return
      stepBattle(b)
      // 终局结算先于界面同步：同步若抛错，结算（血量写回/永久死亡/掉落）不能被跳过
      if (b.status !== 'running') {
        setRunning(false)
        settleBattleEnd(r)
        syncAll()
        return
      }
      drainAndSync(b)
    }, speedIntervalMs(battleSpeed, TICK_MS))
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, towerRunning, screen, battleSpeed])

  // 战斗终态兜底（D13 修复软锁）：×10 步进/暂停步进跳过实时循环时，
  // 终局结算（血量写回/永久死亡/掉落）依然必须发生。幂等由 settleBattleEnd 的
  // phase 守卫保证，实时循环里的调用与此处只会生效一次。
  useEffect(() => {
    const r = runRef.current
    const b = r?.battle
    if (!r || !b || r.phase !== 'battle') return
    if (b.status === 'running') return
    setRunning(false)
    settleBattleEnd(r)
    syncAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle?.status])

  // 远征队 = 花名册前三名幸存者（D11：亡者由招募补位）
  // M1 P0:出征队编组——显式编入/替补,不再固定'花名册前三个'
  // 团本编制:上限随所选副本(activeDungeon.size),3 人本照旧,5 人团本可上 5 人
  const expedition = (() => {
    const byId = new Map(members.map((m) => [m.id, m]))
    return expeditionIds.map((id) => byId.get(id)).filter((m): m is Member => !!m && m.alive)
  })()
  useEffect(() => {
    // 初次加载/远征减员后:自动补齐到所选副本编制(花名册顺序);换小图时裁到编制内
    setExpeditionIds((ids) => {
      const aliveIds = members.filter((m) => m.alive).map((m) => m.id)
      const kept = ids.filter((id) => aliveIds.includes(id))
      if (kept.length >= activeDungeon.size) return kept.slice(0, activeDungeon.size)
      return [...kept, ...aliveIds.filter((id) => !kept.includes(id))].slice(0, activeDungeon.size)
    })
  }, [members, dungeonId])
  const enterExpedition = (id: string) => {
    if (runRef.current || towerRunRef.current) return
    setExpeditionIds((ids) => {
      const aliveIds = members.filter((m) => m.alive).map((m) => m.id)
      const kept = ids.filter((x) => x !== id && aliveIds.includes(x))
      if (kept.length >= activeDungeon.size) return [...kept.slice(0, activeDungeon.size - 1), id] // 满员时编入=换下最后一位
      return [...kept, id]
    })
  }
  const leaveExpedition = (id: string) => {
    if (runRef.current || towerRunRef.current) return
    setExpeditionIds((ids) => ids.filter((x) => x !== id))
  }

  // 结算入口的阶段守卫确保指挥、快进和终局 effect 都不能重复发奖。
  const settleBattleEnd = (current: DungeonRun) => {
    if (runRef.current !== current) return // 忽略已应用结果替代掉的旧闭包。
    const o = settleEncounter({ source: 'dungeon', run: current, guild: encounterGuild() })
    if (!o) return
    applyOutcome(o)
    const r = o.run
    const endPhase = r.phase
    if (o.sound === 'victory') sfxVictory()
    if (o.sound === 'defeat') sfxDefeat()
    // 自动循环的按钮/状态机留给 #0.6，沿用原来的回城和推进边界。
    if (r.autoMode) {
      if (endPhase === 'rest') {
        window.setTimeout(() => continueDeepRef.current?.(), 150)
      } else if (endPhase === 'victory') {
        backToGuild()
        window.setTimeout(() => { if (autoLoopRef.current) startExpeditionRef.current?.() }, 150)
      } else if (endPhase === 'defeat') {
        autoLoopRef.current = false
        r.autoMode = false
        logChronicle(chronicleRaw(day, '挂机连刷结束:队伍全灭于' + runDungeon(r).name + '。'))
      } else if (endPhase === 'retreated') {
        autoLoopRef.current = false
        r.autoMode = false
        logChronicle(chronicleRaw(day, '挂机连刷结束:撤退保护把队伍带回了公会。'))
      }
    }
  }

  const equip = (m: Member, slot: Slot, itemId: string) => {
    if (runRef.current || towerRunRef.current || !membersRef.current.find(x => x.id === m.id)?.alive) return
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

  const lastRetreatRunRef = useRef<string | null>(null)
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
      setPendingConsequences((q) => { const at = q.findIndex(c => c.eventId === due.eventId && c.dueDay === due.dueDay); return q.filter((_, i) => i !== at) })
    }
    setDay((d) => d + 1)
    // 事件二期:过期的公会层状态自然消退
    setGuildBuffs((q) => q.filter((g) => g.endDay > day + 1))
    if (expedition.length < activeDungeon.size) return
    // M1 P0 成长快照:结算页要展示"这把你变强了什么"
    growthSnapshotRef.current = new Map(
      expedition.map((m) => [m.id, { level: m.level, power: powerScore(m), bondTotal: Object.values(m.bonds).reduce((s, n) => s + bondStars(n), 0), bonds: { ...m.bonds } }]),
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
        setRunning(true)
        syncAll()
      }
      return
    }
    // 挂机选路(U27①):逻辑住 sim 层——高熟练按已知信息选(血少休整/事件,血多精英),低熟练盲选
    if (!targetId && r.autoMode) {
      const m = dungeonMastery[runDungeon(r).id] ?? 0
      const alive = runMembers(r, membersRef.current).filter((x) => x.alive)
      const avgHp = alive.length ? alive.reduce((sum, x) => sum + x.hp / toCombatant(x).maxHp, 0) / alive.length : 1
      const picked = autoPickNode(mapOptions(r), { knows: revealTier(m) > 0, avgHp, rng: runRng(r) })
      if (picked) targetId = picked.id
    }
    if (!targetId) return // 不选路不能前进:没有「继续深入」
    changeProgress({ lastNodeResult: null }) // 选下一条路即刷新上一站的后果条
    const condsBefore = [...(r.conditions ?? [])]
    const node = moveTo(r, targetId, dungeonMastery[runDungeon(r).id] ?? 0)
    if (!node) return
    // 结算可见性(红线):新挂的路况当场提示一条,状态条在地图常驻
    for (const id of (r.conditions ?? []).filter((c) => !condsBefore.includes(c))) {
      logChronicle(chronicleRaw(day, '路况:' + (CONDITION_BY_ID[id]?.name ?? id) + '——' + (CONDITION_BY_ID[id]?.desc ?? '')))
    }
    if (node.kind === 'battle' || node.kind === 'elite' || node.kind === 'boss') {
      applyRestMorale(runMembers(r, membersRef.current).filter((x) => x.alive))
      const encId = node.kind === 'boss' ? nextBossEncounter(r) : node.encounterId
      const enc = runDungeon(r).encounters.find((e) => e.id === encId)
      const manualBonus = enc?.bossId && manual.includes(enc.bossId) ? MANUAL_BONUS : 0
      startStep(r, int(runRng(r), 1, 100000) * SEED_BASE, manualBonus, membersRef.current)
      setRunning(true)
      syncAll()
      return
    }
    if (node.kind === 'event') {
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
        changeProgress({ lastNodeResult: `❓ ${node.name}:这里没什么动静——也许来早了。` })
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
      changeProgress({ lastNodeResult: `⛺ ${node.name}:原地休整,回复 ${Math.round(REST_HEAL_PCT * healMult * 100)}% 生命${healMult < 1 ? '(疲惫:回复减半)' : ''}${healed.length ? ' —— ' + healed.join('、') : '(无人需要回复)'}` })
      setRun({ ...r })
      if (r.autoMode) window.setTimeout(() => continueDeepRef.current?.(), 700)
      return
    }
    if (node.kind === 'treasure' || node.kind === 'secret') {
      // 宝箱/暗道节点:不战斗,纯收获——金币+一件带品级的装备;暗道另已是跳层捷径
      const gold2 = 60 + Math.floor(runRng(r)() * 90)
      gainGold(gold2, 'event')
      const tier = dungeonItemTier(runDungeon(r).id)
      const bases = Object.keys(ITEM_BASES).filter((id) => ITEM_BASES[id].tier === tier)
      const baseId = bases[Math.floor(runRng(r)() * bases.length)]
      const item = rollDrop(baseId, runRng(r), { qualityBias: 0.3 })
      receiveItems([item], true)
      // 结算反馈红线:收获了什么必须当场可见
      changeProgress({ lastNodeResult: `🎁 ${node.name}:获得 ${gold2} 金与 ${describeItem(item)}(已入仓库)` })
      logChronicle(chronicleRaw(day, runDungeon(r).name + '的' + node.name + '开出了好东西。'))
      setRun({ ...r })
      if (r.autoMode) window.setTimeout(() => continueDeepRef.current?.(), 700)
      return
    }
  }
  continueDeepRef.current = chooseNode

  const backToGuild = () => {
    setResumeNotice('')
    const r = runRef.current
    if (r) noteStatistics(expeditionStatistics(r))
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
      const ev = rollGuildEvent(guildRng, { where: 'town' })
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
    goBack()
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
    setDetailOpen(new Set())
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

  const logChronicle = (e: ChronicleEntry) => {
    chronicleRef.current = [...chronicleRef.current, e]
    setChronicle(chronicleRef.current)
  }

  // ---- M1 P0 招募三路径(宪法红线 6:上门缘分不排队;悬赏/传闻受冷却;冷却防软锁减半)----
  const aliveCount = () => membersRef.current.filter((m) => m.alive).length

  const signVisitor = () => {
    if (!visitor || runRef.current || towerRunRef.current || aliveCount() >= ROSTER_CAP) return
    if (membersRef.current.some(m => m.id === visitor.member.id)) return
    // Reserve the recruit before a second click can replay this render's visitor.
    membersRef.current = [...membersRef.current, visitor.member]
    rollWishFor(visitor.member); rollTraitFor(visitor.member)
    updateItemOwnership(registerMemberItems(itemOwnershipRef.current, visitor.member))
    logChronicle(chronicleRecruit(day, visitor.member, '上门投奔'))
    setVisitor(null)
  }

  const hireBounty = (job: JobId) => {
    if (runRef.current || effectiveCooldown > 0 || gold < ECONOMY.bountyCost || aliveCount() >= ROSTER_CAP) return
    setGold((g) => g - ECONOMY.bountyCost)
    const m = bountyCandidate(guildRng, membersRef.current, job)
    rollWishFor(m); rollTraitFor(m)
    updateItemOwnership(registerMemberItems(itemOwnershipRef.current, m), [...membersRef.current, m])
    logChronicle(chronicleRecruit(day, m, '定向悬赏'))
    setRecruitCooldown(cooldownNeeded(aliveCount()))
  }

  const rollTale = () => {
    if (runRef.current || effectiveCooldown > 0 || aliveCount() >= ROSTER_CAP) return
    if (gold < ECONOMY.taleCost.gold || blessing < ECONOMY.taleCost.blessing) return
    setGold((g) => g - ECONOMY.taleCost.gold)
    setBlessing((b) => b - ECONOMY.taleCost.blessing)
    setCandidates(taleCandidates(guildRng, membersRef.current, 3, { hybrids: !__PLAYTEST__ }))
    setRecruitCooldown(cooldownNeeded(aliveCount()))
  }

  const hire = (m: Member) => {
    if (runRef.current || towerRunRef.current || membersRef.current.some(x => x.id === m.id) || aliveCount() >= ROSTER_CAP) return
    // 宪法 v3:招募即带专精;F06(2026-09-25):候选已定专精(生成时默认线/三选一可能混合线)——
    // 入职保留之,不再重 roll(否则玩家看中的专精在入职瞬间被替换)
    const recruited = m.spec ? m : { ...m, spec: rollSpec(m.job, guildRng) }
    rollWishFor(recruited); rollTraitFor(recruited)
    updateItemOwnership(registerMemberItems(itemOwnershipRef.current, recruited), [...membersRef.current, recruited])
    logChronicle(chronicleRecruit(day, recruited, '酒馆传闻'))
    setCandidates([])
  }

  // 大事事件:按权重结算选择并应用效果(效果声明在 data/guild-events.ts)
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
    logChronicle(chronicleRaw(day, ev.title + ':' + outcome.text))
    setEventResult(outcome.text)
    setEventImpacts(impacts)
    setMembers([...membersRef.current])
  }
  // F09 修复(2026-09-25):ref 改为渲染期赋值——旧写法在 resolveEvent 体内自赋值,
  // 首次自动事件(挂机)触发时 ref 尚为 null,自动选路静默失败、事件卡死
  resolveEventRef.current = resolveEvent

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
  dismissEventRef.current = dismissEvent

  // 挂机代打事件(试玩反馈二轮):远征途中触发的事件,队长随机择路;结果展示后自动翻页
  // F09(2026-09-25):守卫从 run.autoMode 改为 autoLoopRef——回城后 runRef 为 null,
  // 公会层事件的自动结算/翻页此前会失效,挂机连刷卡死在结果弹窗上
  useEffect(() => {
    if (screen !== 'game' || !pendingEvent || eventResult) return
    const r = runRef.current
    if (r ? !r.autoMode : !autoLoopRef.current) return
    if (r && r.phase !== 'rest') return
    const timer = setTimeout(() => {
      resolveEventRef.current?.(Math.floor(((runRef.current ? runRng(runRef.current) : guildRng))() * pendingEvent.choices.length))
    }, 900)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEvent, eventResult, screen])

  useEffect(() => {
    if (screen !== 'game' || !eventResult) return
    if (!autoLoopRef.current) return
    const timer = setTimeout(() => dismissEventRef.current?.(), 1200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventResult, screen])

  // 装备 2.0:拆解 T3 得星髓;灰冠兑换(信任 100 解锁)用星髓+金币换指定 T3
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
    if (t) resetAfterRun(membersRef.current)
    towerRunRef.current = null
    setTowerRun(null)
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
    setPotions((p) => ({ ...p, [kind]: p[kind] + 1 }))
    sfxCoin()
  }

  // 职阶切换(宪法 v3):基础专精间轻消耗;混合职阶需默契达标+公会一次性解锁(重消耗)
  const bondTotalOf = (m: Member) => Object.values(m.bonds).reduce((s2, n) => s2 + bondStars(n), 0)
  const changeVocation = (memberId: string, newSpecId: string) => {
    if (__PLAYTEST__ && isHybrid(newSpecId)) return // U26③:试玩版隐藏混合职阶
    if (runRef.current || towerRunRef.current) return
    const m = membersRef.current.find((x) => x.id === memberId)
    if (!m || m.spec === newSpecId) return
    const isHy = isHybrid(newSpecId)
    // K04 全局硬规则(U12):混合职阶的两条来源线都必须在该成员种族的允许线内
    if (isHy && !HYBRIDS[newSpecId].lines.every((l) => RACES[m.race ?? 'human'].allowedLines.includes(l))) return
    if (isHy) {
      if (!unlockedHybrids.includes(newSpecId)) {
        // 一次性解锁:钱+祝福,同时记录
        const c = ECONOMY.vocation
        if (gold < c.hybridUnlockGold || blessing < c.hybridUnlockBlessing) return
        if (bondTotalOf(m) < ECONOMY.hybridBondRequirement) return
        setGold((g) => g - c.hybridUnlockGold)
        setBlessing((b) => b - c.hybridUnlockBlessing)
        setUnlockedHybrids((hs) => [...hs, newSpecId])
      }
    } else {
      const c = ECONOMY.vocation
      if (gold < c.switchGold || blessing < c.switchBlessing) return
      setGold((g) => g - c.switchGold)
      setBlessing((b) => b - c.switchBlessing)
    }
    setMembers((ms) => ms.map((x) => (x.id === memberId ? { ...x, spec: newSpecId } : x)))
    const label = isHy ? HYBRIDS[newSpecId].name : specOf(m.job, newSpecId).name
    logChronicle(chronicleRaw(day, m.name + ' 在训练场改换行当,如今是' + label + '。'))
    sfxCoin()
  }

  // 精进(宪法 v3 精进层):Lv6+,当前专精的精进池二选一,按专精记录
  const advanceSpec = (memberId: string, skillId: string) => {
    if (runRef.current || towerRunRef.current) return
    const m = membersRef.current.find((x) => x.id === memberId)
    if (!m || m.level < 6 || isHybrid(m.spec)) return
    const spec = specOf(m.job, m.spec)
    const sk = spec.advancedSkills?.find((x) => x.id === skillId)
    if (!sk) return
    if (m.specAdvanced?.[spec.id]) return
    const c = ECONOMY.advancedCost
    if (gold < c.gold || blessing < c.blessing) return
    setGold((g) => g - c.gold)
    setBlessing((b) => b - c.blessing)
    setMembers((ms) => ms.map((x) => (x.id === memberId ? { ...x, specAdvanced: { ...(x.specAdvanced ?? {}), [spec.id]: skillId } } : x)))
    logChronicle(chronicleRaw(day, m.name + ' 精进了' + spec.name + '之道,习得【' + sk.name + '】。'))
    sfxCoin()
  }

  // 通用战技(DD Augment):祝福学,永久,跨专精携带
  const learnAugment = (memberId: string, augId: string) => {
    if (runRef.current || towerRunRef.current) return
    const m = membersRef.current.find((x) => x.id === memberId)
    if (!m || m.augments?.includes(augId)) return
    if (blessing < ECONOMY.augmentCost) return
    setBlessing((b) => b - ECONOMY.augmentCost)
    setMembers((ms) => ms.map((x) => (x.id === memberId ? { ...x, augments: [...(x.augments ?? []), augId] } : x)))
    logChronicle(chronicleRaw(day, m.name + ' 在训练场悟出了通用战技【' + (ECONOMY.augments as Record<string, { name: string; desc: string }>)[augId].name + '】。'))
    sfxCoin()
  }
  // 紧急招募:人手不足时免冷却(防软锁)
  const effectiveCooldown = members.filter((m) => m.alive).length < 3 ? 0 : recruitCooldown
  const towerUnlocked = manual.includes('talma')
  const inTowerBattle = towerRun?.phase === 'battle' && towerRun.battle != null
  const inBattle = run?.phase === 'battle' && battle != null
  const battleOver = inBattle && battle!.status !== 'running'
  // 指挥有感:boss 意图实时推导——蓄力中「分散」脉冲,咏唱中亮「打断咏唱」按钮(决策窗口可见)
  const intents = (inBattle || inTowerBattle) && battle!.status === 'running' ? bossIntents(battle!) : null
  // 屏幕栈状态:null = 大厅;远征/爬塔中快捷键不劫持(战斗界面是全屏态)。与 title/game 阶段状态相互独立
  const [hubScreen, setHubScreen] = useState<UIScreen | null>(null)
  // U29 状态机:关闭功能屏=返回上一级(backTargetOf)——功能坞屏回大厅,统计回大事记
  const goBack = () => setHubScreen((cur) => {
    if (!cur) return null
    const parent = backTargetOf(cur)
    return parent === 'hall' ? null : (parent as UIScreen)
  })
  // 透明面板(宪法 v3.2 缺陷二):展开显示乘区逐层明细的成员
  const [detailOpen, setDetailOpen] = useState<Set<string>>(new Set())
  const battleMapId = towerRun ? 'tower' : run ? runDungeon(run).id : activeDungeon.id
  const hasBoss = battle?.combatants.some(c => c.boss && c.alive)
  useEffect(() => { rendererRef.current?.setTheme(battleMapId) }, [battleMapId])
  useEffect(() => {
    setMusicMood(hubScreen === 'memorial' || battle?.status === 'guild-wipe' ? 'mourning'
      : (inBattle || inTowerBattle) && battle?.status === 'running' ? hasBoss ? 'boss' : 'battle'
      : towerRun || (run && ['rustmine', 'abyssaltar', 'dragonmaw'].includes(battleMapId)) ? 'cavern' : 'hub')
  }, [hubScreen, battle?.status, hasBoss, inBattle, inTowerBattle, battleMapId, !!towerRun, !!run])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (runRef.current || towerRunRef.current) return
      if (e.key === 'Escape') {
        goBack()
        return
      }
      const hit = HUB_DOCK.find((it) => it.hotkey.toLowerCase() === e.key.toLowerCase() && dockUnlocked(it.key))
      if (hit) setHubScreen((cur) => (cur === hit.key ? null : hit.key))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const finished = run != null && (run.phase === 'victory' || run.phase === 'defeat' || run.phase === 'retreated')
  const canExpedition = !run && !towerRun && expedition.length >= activeDungeon.size

  const royalContext = { manual, buildings, day }
  const acceptRoyal = (id: string) => {
    if (runRef.current || towerRunRef.current) return
    const next = acceptCommission(kingdomRef.current, id, royalContext)
    if (next === kingdomRef.current) return
    updateKingdom(next)
    const title = COMMISSIONS.find((q) => q.id === id)!.title
    setRoyalNotice(`已接下「${title}」。目标已登记，完成后回公会交付。`)
    logChronicle(chronicleRaw(day, `公会接下了灰冠王国的委托「${title}」。`))
  }
  const claimRoyal = (id: string, choice: RoyalRewardChoice) => {
    if (runRef.current || towerRunRef.current) return
    const previousRank = kingdomRank(kingdomRef.current)
    const result = claimCommission(kingdomRef.current, id, choice, day)
    if (!result) return
    // Reserve the receipt synchronously: rapid clicks cannot award both options.
    updateKingdom(result.state)
    const r = result.reward
    gainGold(r.gold, 'kingdom')
    setBlessing((b) => b + r.blessing)
    setPotions((p) => ({ heal: p.heal + r.heal, fury: p.fury + r.fury }))
    if (r.item) receiveItems([r.item])
    const nextRank = kingdomRank(result.state)
    const promotion = nextRank.name !== previousRank.name ? ` 晋升「${nextRank.name}」，补给优惠${Math.round(nextRank.discount * 100)}%。` : ''
    const rewardLine = `${r.gold}金${r.blessing ? `、祝福×${r.blessing}` : ''}${r.heal ? `、治疗药×${r.heal}` : ''}${r.fury ? `、爆发药×${r.fury}` : ''}${r.item ? `、${describeItem(r.item)}` : ''}`
    setRoyalNotice(`「${result.commission.title}」已结案：${rewardLine}；信任+${r.trust}。${promotion}`)
    logChronicle(chronicleRaw(day, `王国委托「${result.commission.title}」结案，获得${rewardLine}，王国信任+${r.trust}。${promotion}`))
    sfxCoin()
  }
  const travelRoyal = (q: CommissionDef) => {
    if (runRef.current || towerRunRef.current) return
    if (q.objective.kind === 'building') setHubScreen('base')
    else { setDungeonId(q.objective.dungeonId); goBack() }
  }

  const memberCard = (m: Member) => {
    const c = battle?.combatants.find((x) => x.memberId === m.id)
    const hp = c ? c.hp : m.hp
    const max = c ? c.maxHp : maxHpOf(m)
    const onExpedition = run != null ? runMembers(run, membersRef.current).includes(m) : expedition.includes(m)
    const toggleDetails = () => setDetailOpen(cur => {
      const next = new Set(cur)
      if (next.has(m.id)) next.delete(m.id)
      else next.add(m.id)
      return next
    })
  // K08 套装计数(成员侧直接数装备)
  const setCrown = Object.values(m.equipment).filter((e) => e && ITEM_BASES[e.baseId]?.setName === 'gray-crown').length
  const setHunt = Object.values(m.equipment).filter((e) => e && ITEM_BASES[e.baseId]?.setName === 'wind-hunt').length
    return (
      <div key={m.id} className="member-card">
        <div className="mc-head" role="button" tabIndex={0} aria-expanded={detailOpen.has(m.id)}
          style={{ cursor: 'pointer' }} title="点击或按 Enter / 空格展开属性明细" onClick={toggleDetails}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleDetails() }
          }}>
          <HeroPortrait member={m} />
          <span className="name">{m.name}</span>
          <span className="job">
            {RACES[m.race ?? 'human'].name}·{isHybrid(m.spec) ? HYBRIDS[m.spec!].name : specOf(m.job, m.spec).name}({JOBS[m.job].name}) Lv{m.level}
            {onExpedition ? ' · ⚔远征队' : ''}
          </span>
          <span className={`hp${c && !c.alive ? ' dead' : ''}`}>
            HP {hp}/{max}
            {c && !c.alive ? '（已倒下）' : ''}
          </span>
        </div>
        {detailOpen.has(m.id) && (
          <div className="stat-layers">
            {statLayers(m).map((l, i) => (
              <div key={i} className="stat-layer">
                <span className="sl-label">{l.label}</span>
                <span className={l.good ? 'good' : l.bad ? 'bad' : ''}>{l.text}</span>
              </div>
            ))}
            {(setCrown > 0 || setHunt > 0) && (
              <div className="stat-layer">
                <span className="sl-label">套装</span>
                <span>{[describeEquipmentSet('gray-crown', setCrown), describeEquipmentSet('wind-hunt', setHunt)].filter(Boolean).join(' · ')}</span>
              </div>
            )}
            {(m.scars?.length ?? 0) > 0 && (
              <div className="stat-layer">
                <span className="sl-label">创伤</span>
                <span>{m.scars!.map((sc) => scarStatName(sc.stat) + ' -' + sc.value).join(' · ')}</span>
              </div>
            )}
            {m.trait && (
              <div className="stat-layer">
                <span className="sl-label">特性</span>
                <span>{m.trait === 'drinker' ? '爱喝酒（庆功宴效果 +50%）' : m.trait === 'lucky' ? '幸运儿（掉宝率 +2%）' : m.trait === 'cool' ? '冷静（目睹阵亡冲击减半）' : m.trait}</span>
              </div>
            )}
            {m.wish && (
              <div className="stat-layer">
                <span className="sl-label">心愿</span>
                <span>{m.wish.text}{wishDone(m, m.wish, { dungeonCleared: (id) => manual.includes(DUNGEON_FINAL_BOSS[id] ?? ''), towerBest }) ? '（已达成!）' : ''}</span>
              </div>
            )}
            <button className="ms-open" onClick={() => setMemberSheetId(m.id)}>📋 人物档案(全部属性与装备明细)</button>
          </div>
        )}
        <div className="row">
          <span>{attrsLine(m)}</span>
          <span>{personalityLine(m)}</span>
          <span>战力 {powerScore(m)}</span>
          <span>{moraleReadout(m)}</span>
          {!run && m.alive && (
            expeditionIds.includes(m.id) ? (
              <button className="mini-btn" onClick={() => leaveExpedition(m.id)}>▼ 替补</button>
            ) : (
              <button className="mini-btn" onClick={() => enterExpedition(m.id)}>▲ 编入</button>
            )
          )}
        </div>
        <div className="mc-slots">
          {SLOTS.map((slot) => {
            const equipped = m.equipment[slot]
            const options = [
              ...(equipped ? [equipped] : []),
              ...inventory.filter((i) => slotsOf(i) === slot),
            ]
            return (
              <label key={slot} className="gear-control">
                <ArtCanvas paths={[itemIcon(equipped?.baseId ?? '', slot)]} label={SLOT_NAME[slot]} size={32} />
                <span>{SLOT_NAME[slot]}</span>
              <select
                aria-label={m.name + '的' + SLOT_NAME[slot]}
                className="slot-select"
                value={equipped?.id ?? ''}
                title={equipped ? describeItem(equipped) : `${SLOT_NAME[slot]}（空）`}
                onChange={(e) => equip(m, slot, e.target.value)}
              >
                <option value="">{SLOT_NAME[slot]}·空</option>
                {options.map((i) => (
                  <option key={i.id} value={i.id}>
                    {describeItem(i)}
                  </option>
                ))}
              </select>
              </label>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className={`game-shell${inBattle || inTowerBattle ? ' combat-shell' : ''}`}>
      {showCredits && <CreditsDialog onClose={() => setShowCredits(false)} />}
      {confirmAsk && (
        <div className="screen-overlay" style={{ zIndex: 120 }}>
          <div className="screen-panel" style={{ width: 'min(420px, 90vw)' }}>
            <div className="screen-head"><h2>⚠ 确认操作</h2></div>
            <p className="event-text">{confirmAsk.text}</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="primary" onClick={() => { confirmAsk.onOk(); setConfirmAsk(null) }}>{confirmAsk.okLabel ?? '确定'}</button>
              <button onClick={() => setConfirmAsk(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {screen === 'title' && (
        <div className="title-overlay">
          <div className="title-logo">黑苔公会</div>
          <div className="title-sub">GUILD OF BLACKMOSS</div>
          <div className="title-tagline">英雄会死，故事不会。</div>
          <div className="title-version">build {__BUILD_DATE__} · 熟练度/难度以本版为准</div>
          {offlineNote && <div className="title-offline">{offlineNote}</div>}
          {resumeNotice && <p className="title-offline" role="status">{resumeNotice}</p>}
          <div className="title-actions">
            <button onClick={() => { initAudio(); setScreen('game') }}>
              {saved ? '▶ 继续旅程' : '▶ 开始新公会'}
            </button>
            {saved && (
              <button
                onClick={() => setConfirmAsk({
                  text: '重新开始将清空当前进度，确定？',
                  okLabel: '✦ 清空并重新开始',
                  onOk: () => {
                    initAudio()
                    clearGuildSave()
                    restartGuild()
                    setScreen('game')
                  },
                })}
              >
                ✦ 开始新公会
              </button>
            )}
          </div>
          <div className="title-foot">
            M1 · 内部构建 · 暂定名《黑苔公会》
            <span className="title-saveops">
              <button className="mini-btn" onClick={() => { initAudio(); setMuted(toggleMute()) }}>{muted ? '🔇' : '🔊'}</button>
              <input className="mini-volume" type="range" min={0} max={100} value={Math.round(volume * 100)} aria-label="主音量" title="主音量"
                onChange={(e) => { initAudio(); const v = Number(e.target.value) / 100; setVolume(v); setVolumeState(v); if (muted) setMuted(toggleMute()) }} />
              <button className="mini-btn" onClick={() => setShowCredits(true)}>素材致谢</button>
              <button className="mini-btn" onClick={() => {
                const current = loadGuildSave()
                if (current) setSaveTransfer({ mode: 'export', code: exportSave(current) })
              }}>📤 导出存档</button>
              <button className="mini-btn" onClick={() => setSaveTransfer({ mode: 'import', code: '' })}>📥 导入存档</button>
            </span>
          </div>
        </div>
      )}
      {saveTransfer && <SaveTransferPanel mode={saveTransfer.mode} initialCode={saveTransfer.code} onClose={() => setSaveTransfer(null)} />}
      {memberSheet && <MemberPanel member={memberSheet} members={members} onClose={() => setMemberSheetId(null)} />}
      {playtestEnding && (
        <div className="screen-overlay" style={{ zIndex: 110 }}>
          <div className="screen-panel" style={{ width: 'min(460px, 92vw)' }}>
            <div className="screen-head"><h2>🏁 试玩版到此结束</h2></div>
            <p className="event-text">版图一的故事告一段落。感谢试玩——请点击下方按钮导出你的试玩记录,并把它发回给公会。</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', paddingBottom: 12 }}>
              <button className="primary" onClick={exportPlaytestReport}>📤 导出试玩记录</button>
              <button onClick={() => { initAudio(); makeWarReportCard() }}>📷 战报卡</button>
              <button onClick={() => setPlaytestEnding(false)}>继续随便逛逛</button>
            </div>
          </div>
        </div>
      )}
      <div className="app-header">
        <button className="credits-link" onClick={() => setShowCredits(true)}>素材图鉴 / 致谢</button>
        <h1>黑 苔 公 会</h1>
        <span className="slice-tag">佣兵纪元 · 任务板上的公会 —— 爬塔 / 招募 / 成长 / 演出</span>
        <span className="slice-tag" style={{ opacity: 0.55 }}>build {__BUILD_DATE__}</span>
      </div>
      {saveFailed && (
        <div className="save-warning" role="alert">⚠ 存档写入失败:{saveFailNotice() || '未知原因'}(游戏仍可继续)</div>
      )}
      {scarNotices.length > 0 && <details className="enc-notices" open={!(inBattle || inTowerBattle) || battle?.status !== 'running'}>
        <summary>{scarNotices[0]} <span>· 查看 {scarNotices.length} 项结算</span></summary>
        <div role="status">{scarNotices.map((notice, i) => <p className="hint" key={i}>{notice}</p>)}</div>
      </details>}
      {screen === 'game' && resumeNotice && <p className="hint" role="status">{resumeNotice}</p>}
      <div className={`layout${inBattle || inTowerBattle ? ' battle-mode' : ''}`}>
        <div className="panel hub-panel">
          <div className="hub-topbar">
            <span className="hub-title">🏰 黑苔公会</span>
            <span>第 {day} 日</span>
            <span>💰 {gold}</span>
            <span>🕯 {blessing}</span>
            <span>👥 {members.filter((m) => m.alive).length}/{ROSTER_CAP}</span>
            <span>🧪 {potions.heal}</span>
            <span>⚡ {potions.fury}</span>
            <span className="tb-volume">
              <button className="tb-mute" aria-label={muted ? "开启声音" : "静音"} title={muted ? "开启声音" : "静音"} onClick={() => { initAudio(); setMuted(toggleMute()) }}>{muted ? '🔇' : '🔊'}</button>
              <input className="tb-volume-slider" type="range" min={0} max={100} value={Math.round(volume * 100)} aria-label="主音量" title="主音量"
                onChange={(e) => { initAudio(); const v = Number(e.target.value) / 100; setVolume(v); setVolumeState(v); if (muted) setMuted(toggleMute()) }} />
              {__PLAYTEST__ && <button className="tb-mini" title="导出试玩记录 JSON" onClick={() => { initAudio(); exportPlaytestReport() }}>📤</button>}
              {__PLAYTEST__ && <button className="tb-mini" title="生成战报卡 PNG" onClick={() => { initAudio(); makeWarReportCard() }}>📷</button>}
            </span>
          </div>
          <h2>公会大厅</h2>
          <div className="hub-dock">
            {HUB_DOCK.map((it) => {
              const unlockDay = DOCK_UNLOCK_DAY[it.key] ?? 1
              const locked = !dockUnlocked(it.key)
              return (
              <button
                key={it.key}
                disabled={!!run || !!towerRun || locked}
                className={`dock-btn${hubScreen === it.key ? ' open' : ''}`}
                onClick={() => setHubScreen((cur) => (cur === it.key ? null : it.key))}
              >
                <span className="dock-icon"><ArtCanvas paths={[DOCK_ART[it.key] ?? '/assets/icons/book.png']} label="" size={32} /></span>
                <span className="dock-label">{locked ? `${it.label}·第${unlockDay}天` : it.label}</span>
                <span className="dock-key">{locked ? '🔒' : it.hotkey}</span>
              </button>
              )
            })}
          </div>
          {(() => {
            const masteryTotal = Object.values(dungeonMastery).reduce((a, b) => a + b, 0)
            const goals = guildGoals({ members, inventory, manual, expedition, towerBest, masteryTotal, kingdomDone: kingdom.completed.length })
            const cur = goals.find((g) => !g.done)
            const rank = guildRankOf(manual)
            const showFirstReturnTip = hintsSeen.includes('first-return-done') && !hintsSeen.includes('first-return-tip-done')
            return (
              <>
                {showFirstReturnTip && (
                  <div className="first-return-tip">
                    <span>💡 {FIRST_RETURN_TIP}</span>
                    <button onClick={() => dismissHint('first-return-tip-done')}>知道了</button>
                  </div>
                )}
                <p className="hub-goal">
                  🏅 公会位阶:{rank.name}{rank.promotion
                    ? ` —— 晋升委托:${rank.promotion.text}`
                    : '(位阶完整版随首轮试玩反馈开启)'}
                </p>
                <p className="hub-goal">
                  📋 当前目标:{cur ? cur.text : '全部达成!'}{cur?.progress ? `(${cur.progress})` : ''}
                </p>
              </>
            )
          })()}
          <button className="royal-hub-link" disabled={!!run || !!towerRun || !dockUnlocked('kingdom')} onClick={() => setHubScreen('kingdom')}>
            <span>♜ {kingdomRank(kingdom).name} · 信任 {kingdomTrust(kingdom)}</span>
            <span>{!dockUnlocked('kingdom') ? '第 4 天开放' : kingdom.active.some((r) => r.progress >= COMMISSIONS.find((q) => q.id === r.id)!.objective.target)
              ? '有委托可交付 →' : kingdom.active.length ? `在办委托 ${kingdom.active.length}/2 · 查看进度 →` : kingdom.completed.length === COMMISSIONS.length ? '本批委托已结案 · 回信档案 →' : '王国来函 · 查看委托 →'}</span>
          </button>
          {hubScreen === 'kingdom' && !run && !towerRun && <KingdomPanel state={kingdom} context={royalContext} notice={royalNotice} playtestLock={(d) => !playtestAllows(d)}
            onClose={() => goBack()} onAccept={acceptRoyal} onClaim={claimRoyal} onTravel={travelRoyal}
            onAbandon={(id) => { if (runRef.current || towerRunRef.current) return; updateKingdom(abandonCommission(kingdomRef.current, id)); setRoyalNotice('委托已撤销，可重新接取。王国信任不变。') }} />}
          <div className="inv-panel tower-entry">
            <h2>🗼 黑苔高塔 —— 最高纪录 第 {towerBest} 层</h2>
            <p className="hint">
              逐层深入，敌人逐层变强；每 3 层遭遇守塔 boss。第 5 层起药水减半，
              <b style={{ color: '#d48f8f' }}>第 9 层起撤退保护失效</b>。奖励逐层立即入账，随时可带着离开。
            </p>
            <p className="hint">
              ⚔ 大秘境：守塔 boss 必掉装备，层数越深奖励越厚。纪录只认亲手挑战——挂机者不受青史留名。
            </p>
            {towerUnlocked ? (
              <button className="branch-btn primary" disabled={!canExpedition} onClick={enterTower}>
                🗼 进入高塔（从第 1 层开始）
              </button>
            ) : (
              <p className="hint">🔒 击败深渊祭司·塔尔玛后解锁</p>
            )}
          </div>
          <p className="hint hub-keys">
            快捷键:Q 王国委托 · C 花名册 · T 酒馆 · B 仓库 · N 基地 · J 大事记 · H 名人堂 · K 手册 · Esc 关闭
          </p>
          <div className="end-actions">
            <button onClick={() => setConfirmAsk({ text: '确定重开公会？所有英雄、装备与纪念堂记录将全部清空。', okLabel: '☠ 确认清空', onOk: () => restartGuild() })}>☠ 重开公会</button>
          </div>
          {screen === 'game' && pendingEvent && (
            <div className="screen-overlay event-overlay">
              <div className="screen-panel event-modal">
                <div className="screen-head">
                  <h2>⚖ {pendingEvent.title}</h2>
                </div>
                {eventResult ? (
                  <>
                    <p className="event-result">{eventResult}</p>
                    {eventImpacts.length > 0 && (
                      <div className="event-impacts">
                        {eventImpacts.map((im, i) => (
                          <span key={i} className={`impact-chip${im.tone ? ` impact-${im.tone}` : ''}`}>{im.t}</span>
                        ))}
                      </div>
                    )}
                    <button onClick={dismissEvent}>知道了</button>
                  </>
                ) : (
                  <>
                    <p className="event-text">{pendingEvent.text}</p>
                    <div className="event-choices">
                      {pendingEvent.choices.map((c, i) => (
                        <button key={i} disabled={!!run && run.phase === 'battle'} onClick={() => resolveEvent(i)}>
                          {c.text}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                </div>
              </div>
            )}
            {hubScreen === 'tavern' && (
              <div className="screen-overlay fullpage">
                <div className="screen-panel">
                  <div className="screen-head">
                    <h2>🍺 酒馆</h2>
                    <button className="screen-close" onClick={() => goBack()}>✕ Esc</button>
                  </div>
                  <p className="screen-sub">
                    💰 {gold} · 🕯 祝福 {blessing} · 招募位 {members.filter((m) => m.alive).length}/{ROSTER_CAP}
                  </p>
            <p className="hint">
              {effectiveCooldown > 0
                ? `招募冷却：完成 ${effectiveCooldown} 场战斗后解除（上门访客不受影响）`
                : members.filter((m) => m.alive).length < 3
                  ? '⚠ 人手不足：紧急招募免冷却'
                  : '可招募'}
            </p>
            {visitor ? (
              <div className="member-card candidate">
                <div className="mc-head">
                  <HeroPortrait member={visitor.member} />
                  <span className="name">🚪 {visitor.member.name}</span>
                  <span className="job">
                    {JOBS[visitor.member.job].name} Lv{visitor.member.level} · {ROLE_NAME[JOBS[visitor.member.job].role]}
                  </span>
                  <span className="hp">战力 {powerScore(visitor.member)}</span>
                </div>
                <div className="row">
                  <span>{attrsLine(visitor.member)}</span>
                  <span>{personalityLine(visitor.member)}</span>
                </div>
                <p className="hint">“{visitor.story}”</p>
                <button onClick={signVisitor} disabled={!!run || members.filter((m) => m.alive).length >= ROSTER_CAP}>
                  ✋ 免费签下（缘分不排队）
                </button>
              </div>
            ) : members.filter((m) => m.alive).length < 3 ? (
              <div>
                <p className="hint">🚪 暂时没有访客——但公会正缺人手,守夜人去酒馆后巷喊一嗓子总会有人应。</p>
                <button
                  disabled={!!run}
                  onClick={() => setVisitor(rollVisitor(guildRng, membersRef.current, 0, { hybrids: !__PLAYTEST__ }))}
                >
                  🌙 在酒馆等一晚(必定有人上门)
                </button>
              </div>
            ) : (
              <p className="hint">🚪 暂时没有访客——每次回城都有概率有人上门。</p>
            )}
            <div className="tavern-row">
              <button
                disabled={!!run || gold < 60}
                onClick={() => { setGold((g) => g - 60); applyFeast(membersRef.current, baseEffects(buildings).feastBoost); for (const d of membersRef.current) { if (d.alive && d.trait === 'drinker') d.morale = Math.min(100, (d.morale ?? 60) + Math.round(baseEffects(buildings).feastBoost * 0.5)) } setMembers([...membersRef.current]); logChronicle(chronicleFeast(day, 60)); sfxCoin() }}
              >
                🍻 庆功宴（60 金）：全员士气 +30
              </button>
            </div>
            <div className="tavern-row">
              <span className="cmd-label">定向悬赏：</span>
              {START_JOBS.map((job) => (
                <button
                  key={job}
                  disabled={!!run || effectiveCooldown > 0 || gold < ECONOMY.bountyCost || members.filter((m) => m.alive).length >= ROSTER_CAP}
                  onClick={() => hireBounty(job)}
                >
                  {JOBS[job].name} {ECONOMY.bountyCost} 金
                </button>
              ))}
            </div>
            <div className="tavern-row">
              <button
                disabled={!!run || effectiveCooldown > 0 || gold < ECONOMY.taleCost.gold || blessing < ECONOMY.taleCost.blessing || members.filter((m) => m.alive).length >= ROSTER_CAP}
                onClick={rollTale}
              >
                🎲 酒馆传闻：{ECONOMY.taleCost.gold} 金 + {ECONOMY.taleCost.blessing} 祝福，三选一（品质更高）
              </button>
            </div>
            {candidates.length > 0 && (
              <div>
                <h2>来应征的冒险者（选一位入职）</h2>
                {candidates.map((m) => (
                  <div key={m.id} className="member-card candidate">
                    <div className="mc-head">
                      <HeroPortrait member={m} />
                      <span className="name">{m.name}</span>
                      <span className="job">
                        {RACES[m.race ?? 'human'].name}·{isHybrid(m.spec) ? HYBRIDS[m.spec!].name : specOf(m.job, m.spec).name}({JOBS[m.job].name}) Lv{m.level}
                      </span>
                      <div className="row">
                        <span className="hint">{isHybrid(m.spec) ? HYBRIDS[m.spec!].identity : specOf(m.job, m.spec).identity}</span>
                      </div>
                      <span className="hp">战力 {powerScore(m)}</span>
                    </div>
                    <div className="row">
                      <span>{attrsLine(m)} · {natureLine(m)}</span>
                    </div>
                    <div className="row">
                      <span>{personalityLine(m)}</span>
                    </div>
                    <button onClick={() => hire(m)}>✋ 招募入职</button>
                  </div>
                ))}
              </div>
            )}
                </div>
              </div>
            )}
            {hubScreen === 'warehouse' && (
              <div className="screen-overlay fullpage">
                <div className="screen-panel">
                  <div className="screen-head">
                    <h2>🎒 公会仓库</h2>
                    <button className="screen-close" onClick={() => goBack()}>✕ Esc</button>
                  </div>
          <div className="inv-panel">
            <h2>公会仓库（{inventory.length}）</h2>
            <div className="potion-supply">
              <span className="hint">
                🧪 治疗药 ×{potions.heal} · ⚡ 爆发药 ×{potions.fury} —— 出征携带,战斗消耗,回城退回
                {kingdomRank(kingdom).discount > 0 && ` · 王国补给优惠${Math.round(kingdomRank(kingdom).discount * 100)}%已计入售价`}
              </span>
              <div className="tavern-row">
                <button disabled={!!run || !!towerRun || gold < royalPotionCost('heal', kingdom)} onClick={() => buyPotion('heal')}>
                  🧪 补充治疗药（{royalPotionCost('heal', kingdom)} 金）
                </button>
                <button disabled={!!run || !!towerRun || gold < royalPotionCost('fury', kingdom)} onClick={() => buyPotion('fury')}>
                  ⚡ 补充爆发药（{royalPotionCost('fury', kingdom)} 金）
                </button>
              </div>
            </div>
            {pendingRelics.length > 0 && (
              <div className="potion-supply">
                <span className="hint">⚰ 遗物安葬（{pendingRelics.length}）——阵亡者的装备在此待赎,赎回费随品级与词条上涨;T3 可改拆星髓</span>
                {pendingRelics.map((r) => (
                  <div key={r.uid} className="tavern-row">
                    <span className="hint">⚰ {r.hero} 的 {describeItem(r.item)}</span>
                    <button disabled={!!run || !!towerRun || gold < r.redeem} onClick={() => redeemRelic(r.uid)}>
                      ⚰ 赎回（{r.redeem} 金）
                    </button>
                  </div>
                ))}
              </div>
            )}
            {kingdomTrust(kingdom) >= 100 && (
              <div className="potion-supply">
                <span className="hint">⚔ 灰冠兑换（信任 100 解锁 · 星髓 {starMarrow} · 拆解 T3 取得）——每件 2 星髓 + 800 金 + 10 祝福</span>
                <div className="tavern-row">
                  {EXCHANGE_LIST.map((bid) => (
                    <button key={bid} disabled={!!run || !!towerRun || starMarrow < 2 || gold < 800 || blessing < 10} onClick={() => exchangeT3(bid)}>
                      ⚔ 兑换 {ITEM_BASES[bid].name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {inventory.length > 0 && (
              <div className="tavern-row" role="group" aria-label="排序方式">
                <span className="hint">排序:</span>
                {(Object.keys(INV_SORT_LABEL) as InvSort[]).map((mode) => (
                  <button key={mode} className={invSort === mode ? 'active' : ''} onClick={() => setInvSort(mode)}>
                    {INV_SORT_LABEL[mode]}
                  </button>
                ))}
              </div>
            )}
            {inventory.length === 0 ? (
              <p className="hint">击败 boss 掉落装备（首次击杀保底一件）。从成员卡的下拉框穿戴。</p>
            ) : (
              inventorySorted.map((i) => (
                <div key={i.id} className="inv-item">
                  {describeItem(i)}
                  {ITEM_BASES[i.baseId].tier === 3 && (
                    <button className="sell-btn" onClick={() => dismantleT3(i.id)}>
                      ♻ 拆解 +2 星髓
                    </button>
                  )}
                  <button className="sell-btn" onClick={() => sellItem(i.id)}>
                    变卖 +{sellValue(i, fx.sellMult)} 金
                  </button>
                </div>
              ))
            )}
            {lastDrops.length > 0 && (
              <p className="hint" style={{ marginTop: 6 }}>
                本次远征共获得 {lastDrops.length} 件装备
              </p>
            )}
                </div>
              </div>
              </div>
            )}
            {hubScreen === 'base' && (
              <div className="screen-overlay fullpage">
                <div className="screen-panel">
                  <div className="screen-head">
                    <h2>🏰 公会基地</h2>
                    <button className="screen-close" onClick={() => goBack()}>✕ Esc</button>
                  </div>
          <div className="inv-panel">
            <h2>🏰 公会基地（第 {day} 日）</h2>
            <div className="potion-supply">
              <span>特权训练：150 金，下次远征所有胜场经验 +25%；资格可保存，出征使用一次。</span>
              <button disabled={trainingReady || gold < 150 || !!run || !!towerRun} onClick={() => {
                if (trainingReadyRef.current || gold < 150 || runRef.current || towerRunRef.current) return
                trainingReadyRef.current = true
                setTrainingReady(true)
                setGold(g => g - 150)
                logChronicle(chronicleRaw(day, '花费 150 金完成特权训练，下次远征经验 +25%。'))
                sfxCoin()
              }}>{trainingReady ? '✓ 已备好训练资格' : '购买特权训练（150 金）'}</button>
            </div>
            {healingNotice && <p className="hint" role="status">{healingNotice}</p>}
            {members.some((m) => m.alive && m.scars?.length) && (
              <div className="potion-supply">
                <span className="hint">🏥 疗养所——轻度：60 金 + 1 祝福，基础成功率 85%；重度：120 金 + 3 祝福，基础成功率 65%。每次治疗同维度熟练度 +5%，最多 +25%（成功率最高 100%）；轻度治疗失败后有 15% 概率恶化。当前熟练度：{Object.entries(healingMastery).map(([k, v]) => scarStatName(k as 'str') + ' + ' + Math.min(v * 5, 25) + '%').join(' · ') || '无'}</span>
                {members.filter((m) => m.alive && m.scars?.length).flatMap((m) =>
                  (m.scars ?? []).map((sc, si) => (
                    <div key={m.id + '-' + si} className="tavern-row">
                      <span className="hint">{m.name}:{scarStatName(sc.stat)} -{sc.value}({sc.text})</span>
                      <button disabled={!!run || !!towerRun || gold < healingTerms(sc).gold || blessing < healingTerms(sc).blessing} onClick={() => {
                        if (healingBusyRef.current || runRef.current || towerRunRef.current) return
                        const m2 = membersRef.current.find((x) => x.id === m.id)
                        if (!m2?.alive || m2.scars?.[si] !== sc) return
                        const mastery = healingMastery[sc.stat] ?? 0
                        const cost = healingTerms(sc, mastery)
                        if (gold < cost.gold || blessing < cost.blessing) return
                        const r = attemptHeal(m2, si, mastery, guildRng)
                        if (!r) return
                        healingBusyRef.current = true
                        setHealingMastery((q) => ({ ...q, [sc.stat]: (q[sc.stat] ?? 0) + r.masteryGain }))
                        setBlessing((b) => b - cost.blessing)
                        setGold((g) => g - cost.gold)
                        noteStatistics({ type: 'healing', gold: cost.gold, blessing: cost.blessing })
                        setMembers([...membersRef.current])
                        const outcome = r.result === 'success' ? '已治愈，属性恢复。' : r.result === 'worsen' ? '治疗失败，创伤恶化为重度。' : '治疗未起效，创伤保留。'
                        const notice = m2.name + ' 的' + scarStatName(sc.stat) + '创伤：' + outcome + ' 消耗 ' + cost.gold + ' 金、' + cost.blessing + ' 祝福；该维度疗养经验 +' + r.masteryGain + '。'
                        setHealingNotice(notice)
                        logChronicle(chronicleRaw(day, notice))
                      }}>
                        🏥 治疗（{healingTerms(sc).gold} 金 + {healingTerms(sc).blessing} 祝福，成功率 {Math.round(healingTerms(sc, healingMastery[sc.stat] ?? 0).rate * 100)}%）
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
            <div className="base-grid">
              {BUILDINGS.map((def) => {
                const lv = buildings[def.id] ?? 0
                const maxed = lv >= def.maxLevel
                const cost = maxed ? null : def.costs[lv]
                const affordable = cost != null && gold >= cost.gold && blessing >= (cost.blessing ?? 0)
                return (
                  <div key={def.id} className={`base-card${lv > 0 ? ' owned' : ''}`}>
                    <div className="base-head">
                      <span className="base-name">{def.icon} {def.name}</span>
                      <span className="base-lv">{lv > 0 ? 'Lv' + lv : '未建'}</span>
                    </div>
                    <p className="hint">{def.desc}</p>
                    {maxed ? (
                      <button disabled>已满级</button>
                    ) : (
                      <button disabled={!!run || !affordable} onClick={() => upgradeBuilding(def.id)}>
                        升到 Lv{lv + 1}：{cost!.gold} 金{cost!.blessing ? ` + ${cost!.blessing} 祝福` : ''}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="voc-panel">
              <h2>⚔ 训练场 —— 行当更换</h2>
              <div className="voc-tabs">
                {members.filter((m) => m.alive).map((m) => (
                  <button key={m.id} className={`voc-tab${trainSelId === m.id ? ' sel' : ''}`}
                    onClick={() => setTrainSelId(m.id)}>
                    {m.name}<span className="hint"> {isHybrid(m.spec) ? HYBRIDS[m.spec!].name : specOf(m.job, m.spec).name}</span>
                  </button>
                ))}
              </div>
              <p className="hint">
                换行当:{ECONOMY.vocation.switchGold} 金 + {ECONOMY.vocation.switchBlessing} 祝福。
                混合职阶首次解锁 {ECONOMY.vocation.hybridUnlockGold} 金 + {ECONOMY.vocation.hybridUnlockBlessing} 祝福,
                且要求本人默契 ≥ {ECONOMY.hybridBondRequirement} 星(共同远征积累)。🔒 = 公会尚未解锁该混合行当。
              </p>
              {members.filter((m) => m.alive && m.id === trainSelId).map((m) => {
                const cur = isHybrid(m.spec) ? HYBRIDS[m.spec!].name : specOf(m.job, m.spec).name
                const sameLine = Object.values(JOBS[m.job].specs).filter((sp) => sp.id !== m.spec)
                const bond = bondTotalOf(m)
                const canSwitch = !run && gold >= ECONOMY.vocation.switchGold && blessing >= ECONOMY.vocation.switchBlessing
                return (
                  <div key={m.id} className="voc-row">
                    <div className="voc-head">
                      <b>{m.name}</b>
                      <span className="hint">现为 {cur} · Lv{m.level} · 默契 {bond} 星</span>
                    </div>
                    <div className="voc-btns">
                      {sameLine.map((sp) => (
                        <details key={sp.id} className="voc-card">
                          <summary className={canSwitch ? '' : 'locked'} title={sp.identity}>
                            {sp.name}{m.spec === sp.id ? '(当前)' : ''}
                          </summary>
                          <div className="voc-card-body">
                            <p className="hint">{sp.identity}</p>
                            <p className="hint">{SPEC_PASSIVE_DESC[sp.passive ?? ''] ?? ''}{sp.statMods?.critChance ? ` 暴击 +${Math.round(sp.statMods.critChance * 100)}%。` : ''}</p>
                            <ul className="ms-list">
                              {sp.skills.map((sk) => <li key={sk.id}>{skillLine(sk)}</li>)}
                            </ul>
                            {SIGNATURE_SKILLS[sp.id] && (
                              <p className="hint">【招牌技】{SIGNATURE_SKILLS[sp.id].name}:{SIGNATURE_SKILLS[sp.id].desc}(冷却 {SIGNATURE_SKILLS[sp.id].cdTicks / 10} 秒)</p>
                            )}
                            {!canSwitch ? <p className="hint">⚠ 等级或资源不足,暂不能转职。</p> : (
                              <button disabled={!canSwitch} onClick={() => changeVocation(m.id, sp.id)}>转职为{sp.name}</button>
                            )}
                          </div>
                        </details>
                      ))}
                      {Object.values(HYBRIDS).map((hy) => {
                        const unlocked = unlockedHybrids.includes(hy.id)
                        const canBond = bond >= ECONOMY.hybridBondRequirement
                        const canPay = gold >= ECONOMY.vocation.hybridUnlockGold && blessing >= ECONOMY.vocation.hybridUnlockBlessing
                        // K04:种族不允许的混合线直接隐藏(硬规则,不给点了再拒绝的挫败)
                        const raceAllows = HYBRIDS[hy.id].lines.every((l) => RACES[m.race ?? 'human'].allowedLines.includes(l))
                        if (!raceAllows) return null
                        return (
                          <details key={hy.id} className="voc-card">
                            <summary className={canSwitch && canBond && (unlocked || canPay) ? '' : 'locked'}
                              title={hy.identity + (unlocked ? '' : '(首次解锁需额外花费)')}>
                              {hy.name}{unlocked ? '' : ' 🔒'}
                            </summary>
                            <div className="voc-card-body">
                              <p className="hint">{hy.identity}</p>
                              <ul className="ms-list">
                                {hy.skills.map((sk) => <li key={sk.id}>{skillLine(sk)}</li>)}
                              </ul>
                              {!canSwitch || m.spec === hy.id || !canBond || (!unlocked && !canPay) ? (
                                <p className="hint">{!canBond ? `需默契 ≥ ${ECONOMY.hybridBondRequirement} 星` : !unlocked && !canPay ? `首次解锁 ${ECONOMY.vocation.hybridUnlockGold} 金 + ${ECONOMY.vocation.hybridUnlockBlessing} 祝福` : ''}</p>
                              ) : (
                                <button disabled={!canSwitch} onClick={() => changeVocation(m.id, hy.id)}>转职为{hy.name}</button>
                              )}
                            </div>
                          </details>
                        )
                      })}
                    </div>
                    {!isHybrid(m.spec) && m.level >= 6 && (
                      <div className="voc-row2">
                        <span className="hint">精进:</span>
                        {(specOf(m.job, m.spec).advancedSkills ?? []).map((sk) => {
                          const chosen = m.specAdvanced?.[specOf(m.job, m.spec).id] === sk.id
                          const any = !!m.specAdvanced?.[specOf(m.job, m.spec).id]
                          return (
                            <button key={sk.id} disabled={any || !!run || gold < ECONOMY.advancedCost.gold || blessing < ECONOMY.advancedCost.blessing} title={sk.name} onClick={() => advanceSpec(m.id, sk.id)}>
                              {sk.name}{chosen ? ' ✓' : ''}
                            </button>
                          )
                        })}
                        {m.specAdvanced?.[specOf(m.job, m.spec).id] ? <span className="hint">已精进</span> : null}
                      </div>
                    )}
                    <div className="voc-row2">
                      <span className="hint">通用战技:</span>
                      {(Object.entries(ECONOMY.augments) as [string, { name: string; desc: string }][]).map(([id, ag]) => {
                        const learned = m.augments?.includes(id)
                        return (
                          <button key={id} disabled={!!run || !!learned || blessing < ECONOMY.augmentCost} title={ag.desc} onClick={() => learnAugment(m.id, id)}>
                            {ag.name}{learned ? ' ✓' : ' ' + ECONOMY.augmentCost + '🕯'}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
                </div>
              </div>
              </div>
            )}
            {hubScreen === 'statistics' && <StatisticsPanel statistics={statistics} day={day} onClose={() => goBack()} onBack={() => setHubScreen('chronicle')} />}
            {hubScreen === 'chronicle' && (
              <div className="screen-overlay fullpage">
                <div className="screen-panel">
                  <div className="screen-head">
                    <h2>📜 大事记</h2>
                    <button onClick={() => setHubScreen('statistics')}>战绩统计</button>
                    <button className="screen-close" onClick={() => goBack()}>✕ Esc</button>
                  </div>
          <div className="inv-panel">
            <h2>📜 编年史（第 {day} 日 · {chronicle.length} 则）</h2>
            <div className="chronicle-box">
              {chronicle.length === 0 ? (
                <p className="hint">还没有故事发生。故事从第一次出击开始。</p>
              ) : (
                chronicle.slice(-40).map((e) => (
                  <div key={e.seq} className="chronicle-row">
                    <span className="chronicle-day">第{e.day}日</span>
                    <span>{e.text}</span>
                  </div>
                ))
              )}
            </div>
                </div>
              </div>
              </div>
            )}
            {hubScreen === 'memorial' && (
              <div className="screen-overlay fullpage">
                <div className="screen-panel">
                  <div className="screen-head">
                    <h2>🕯 名人堂</h2>
                    <button className="screen-close" onClick={() => goBack()}>✕ Esc</button>
                  </div>
          <div className="inv-panel">
            <h2>
              🕯 纪念堂（{memorial.length} 位英灵 · 全队伤害 +
              {Math.round(memorialAura(memorial) * 100)}%，封顶 6%）
            </h2>
            {memorial.length > 0 && (
              <p className="hint">{(() => { const c = legacyCounts(memorial); return `传奇 ${c.legendary} · 青史 ${c.honored} · 凡逝 ${c.common}` })()}</p>
            )}
            {memorial.length === 0 ? (
              <p className="hint">还没有人牺牲。愿它一直空着。</p>
            ) : (
              memorial.map((h) => {
                const q = legacyQuality(h)
                const qLabel = q === 'legendary' ? '【传奇】' : q === 'honored' ? '【青史】' : '【凡逝】'
                const pct = q === 'legendary' ? 3 : q === 'honored' ? 2 : 1
                return (
                  <div key={h.id} className="inv-item memorial-item">
                    ⚰ {h.name}（{JOBS[h.job].name} Lv{h.level}）——{h.cause}
                    <div className="hint" style={{ fontSize: 12 }}>
                      {qLabel} 光环 +{pct}%{h.legacy?.deeds?.length ? ` · ${h.legacy.deeds.join(' · ')}` : ''}
                    </div>
                  </div>
                )
              })
            )}
                </div>
              </div>
              </div>
            )}
            {hubScreen === 'manual' && (
              <div className="screen-overlay fullpage">
                <div className="screen-panel">
                  <div className="screen-head">
                    <h2>📖 战术手册</h2>
                    <button className="screen-close" onClick={() => goBack()}>✕ Esc</button>
                  </div>
          <div className="inv-panel">
            <h2>📖 战术手册（已研习 boss 伤害 +5%）</h2>
            <p className="hint">
              {manual.length === 0 ? '尚未研习任何 boss。' : `已研习：${manual.map((id) => DUNGEONS.map((d) => d.bosses[id]?.name).find(Boolean) ?? id).join('、')}`}
            </p>
            <button
              className={protectOn ? 'active' : ''}
              onClick={() => setProtectOn((p) => !p)}
            >
              🛡 撤退保护：{protectOn ? '开（濒危自动撤离）' : '关（搏命模式）'}
            </button>
            <div className="inv-panel">
              <h2>☠ boss 机制图鉴(击败即研习,研习 boss 伤害 +5%)</h2>
              {DUNGEONS.map((d) => (
                <div key={d.id} className="inv-item">
                  <b>🗺 {d.name}</b>
                  {Object.values(d.bosses).map((boss) => {
                    const learned = manual.includes(boss.id)
                    return (
                      <div key={boss.id} style={{ marginTop: 6 }}>
                        {learned ? (
                          <>
                            <div>
                              👹 <b>{boss.name}</b>
                              <span className="hint">（{boss.maxHp} 血 / {boss.attack} 攻 / {boss.position === 'front' ? '前排' : '后排'}）</span>
                            </div>
                            {boss.mechanics.map((m) => (
                              <div key={m.id} className="hint" style={{ marginLeft: 14, marginTop: 2 }}>
                                ▸〔{MECHANIC_REGISTRY[m.kind]?.label ?? m.kind}〕<b>{m.name}</b> —— {mechanicBrief(m)}
                              </div>
                            ))}
                            <div className="hint" style={{ marginLeft: 14, marginTop: 2 }}>
                              🎁 固定掉落：{boss.dropTable.map((dr) => `${ITEM_BASES[dr.baseId]?.name ?? dr.baseId}（${Math.round(dr.chance * 100)}%）`).join('、')}
                            </div>
                          </>
                        ) : (
                          <div className="hint" style={{ marginTop: 2 }}>🔒 ??? ——击败后研习其招式</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <div className="inv-panel">
              <h2>📜 事件图鉴（见过 {eventsSeen.length} / {GUILD_EVENTS.length}）</h2>
              {GUILD_EVENTS.map((e) => {
                const seen = eventsSeen.includes(e.id)
                return (
                  <div key={e.id} className="inv-item">
                    {seen ? (
                      <>
                        <b>{e.title}</b>
                        <div className="hint">{e.text}</div>
                      </>
                    ) : (
                      <div className="hint">❓ ??? ——传闻里还没轮到你们的遭遇</div>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="inv-panel">
              <h2>👹 小怪特性图鉴（首次遭遇会收到提示）</h2>
              {Object.values(TRAIT_INFO).map((tr) => (
                <div key={tr.id} className="inv-item">
                  <b>{tr.name}</b> —— {tr.desc}
                  <div className="hint">💡 {tr.hint}</div>
                </div>
              ))}
            </div>
                </div>
              </div>
              </div>
            )}
            {hubScreen === 'roster' && (
              <div className="screen-overlay fullpage">
                <div className="screen-panel">
                  <div className="screen-head">
                    <h2>🛡 花名册</h2>
                    <button className="screen-close" onClick={() => goBack()}>✕ Esc</button>
                  </div>
                  <div className="inv-panel">
                    {members.filter((m) => m.alive).map(memberCard)}
                  </div>
                </div>
              </div>
            )}
        </div>

        <div className={`panel${inBattle || inTowerBattle ? ' battle-panel' : ''}`}>
          {(inBattle || inTowerBattle) && battle && <BattleIntel battle={battle} members={members} mapId={battleMapId} paused={inTowerBattle ? !towerRunning : !running} />}
          {/* 舞台常驻：渲染器挂载一次，非战斗阶段隐藏（避免 ref 为 null 导致挂载失败） */}
          <div className="stage" ref={stageRef} style={{ display: inBattle || inTowerBattle ? undefined : 'none' }} />

          {!run && !towerRun && (
            <>
              <h2>⚔ 作战板</h2>
              <p style={{ color: '#7a8191', marginBottom: 10 }}>
                选择路线：险路战斗更多、收获机会更多；稳路少打一场杂兵。血量全程延续，
                <b style={{ color: '#d48f8f' }}>战斗死亡即永久牺牲</b>，团灭将失去整支远征队。
              </p>
              <div className="dungeon-picker">
                {REGIONS.filter((rg) => !__PLAYTEST__ || rg.order === 1).map((rg) => {
                  const regionDungeons = DUNGEONS.filter((d) => [...rg.main, ...rg.side, rg.finale].includes(d.id))
                  const ordered = [...rg.main, ...rg.side, rg.finale].map((id) => regionDungeons.find((d) => d.id === id)!).filter(Boolean)
                  return (
                    <div key={rg.id} className="region-block">
                      <p className="region-name">🗺 {rg.name}</p>
                      <div className="region-dungeons">
                        {ordered.map((d) => {
                          const lock = dungeonLock(d.id, manual)
                          return (
                            <button
                              key={d.id}
                              className={d.id === dungeonId ? 'active' : ''}
                              disabled={!!run || !!lock || !playtestAllows(d.id)}
                              title={lock ?? undefined}
                              onClick={() => setDungeonId(d.id)}
                            >
                              🗺 {d.name}{d.size > 3 ? `（${d.size} 人团本）` : ''}{lock || !playtestAllows(d.id) ? ' 🔒' : ''}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {nextRegionLocked(manual) && (
                  <p className="hint">🔒 下一版图:{nextRegionLocked(manual)}</p>
                )}
              </div>
              <button
                className="branch-btn primary"
                disabled={!canExpedition}
                onClick={() => startExpedition()}
              >
                ⚔ 出发：{activeDungeon.name}——每趟地图随机生成(U27①),在地图上逐层选路
              </button>
              {!canExpedition && (
                <p style={{ color: '#d48f8f' }}>
                  {expedition.length < activeDungeon.size
                    ? `编制不足（${expedition.length}/${activeDungeon.size}）：去花名册编入队员，或去酒馆招募。`
                    : ''}
                </p>
              )}
            </>
          )}

          {run && inBattle && (
            <>
              <h2>
                {encName(run, run.battle?.encounterId ?? '')}（第 {run.battlesFought} 场）
              </h2>
              {/* ===== 团长指挥台（Q27）===== */}
              {battle && battle.status === 'running' && (
                <div className="cmd-bar">
                  <button
                    className={battle.commands.autoMode ? 'active' : ''}
                    onClick={() =>
                      cmd(
                        (b) => {
                          b.commands.autoMode = !b.commands.autoMode
                          autoLoopRef.current = b.commands.autoMode
                          if (runRef.current) runRef.current.autoMode = b.commands.autoMode
                        },
                        true,
                      )
                    }
                  >
                    🤖 挂机{battle.commands.autoMode ? '中（队长代打）' : ''}
                  </button>
                  <span className="cmd-label">│</span>
                  <span className="cmd-label">阵型</span>
                  {(Object.keys(STANCE_NAME) as Stance[]).map((s) => (
                    <button
                      key={s}
                      className={
                        (battle.commands.stance === s ? 'active' : '') +
                        (intents?.telegraphing && s === 'spread' ? ' urgent' : '')
                      }
                      disabled={battle.commands.autoMode}
                      onClick={() => {
                        sfxCmd()
                        cmd((b) => setStance(b, s))
                      }}
                    >
                      {STANCE_NAME[s]}
                    </button>
                  ))}
                  <span className="cmd-label">│</span>
                  <button
                    onClick={() => {
                      sfxCmd()
                      cmd(useHealPotion)
                    }}
                    disabled={
                      battle.commands.autoMode ||
                      battle.commands.healStock <= 0 ||
                      battle.commands.healCd > 0
                    }
                  >
                    💊 治疗药×{battle.commands.healStock}
                    {battle.commands.healCd > 0 ? `（${Math.ceil(battle.commands.healCd / 10)}s）` : ''}
                  </button>
                  <button
                    onClick={() => {
                      sfxCmd()
                      cmd(useFuryPotion)
                    }}
                    disabled={
                      battle.commands.autoMode ||
                      battle.commands.furyStock <= 0 ||
                      battle.commands.furyCd > 0
                    }
                  >
                    ⚡ 爆发药×{battle.commands.furyStock}
                    {battle.commands.furyCd > 0 ? `（${Math.ceil(battle.commands.furyCd / 10)}s）` : ''}
                  </button>
                  <span className="cmd-label">│</span>
                  <button
                    className={battle.commands.protectRetreat ? 'active' : ''}
                    disabled={battle.commands.autoMode}
                    onClick={() =>
                      cmd((b) => {
                        b.commands.protectRetreat = !b.commands.protectRetreat
                      })
                    }
                  >
                    🛡 保护{battle.commands.protectRetreat ? '开' : '关'}
                  </button>
                  {intents?.casting && intents.casterId && !battle.commands.autoMode && (
                    <button
                      className="urgent"
                      onClick={() => {
                        if (!intents?.casterId) return
                        sfxCmd()
                        cmd((b) => setFocus(b, intents.casterId))
                      }}
                    >
                      ⚔ 打断咏唱！
                    </button>
                  )}
                  {battle.commands.focusId && (
                    <button
                      className="focus-tag"
                      disabled={battle.commands.autoMode}
                      onClick={() => cmd((b) => setFocus(b, undefined))}
                    >
                      ✕ 取消集火
                    </button>
                  )}
                  {battle.commands.extractingUntil !== undefined ? (
                    <button disabled>
                      🏳 撤离中…{Math.max(0, Math.ceil((battle.commands.extractingUntil - battle.tick) / 10))}s
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        sfxCmd()
                        retreat()
                      }}
                      disabled={battle.commands.autoMode}
                    >
                      🏳 撤退令
                    </button>
                  )}
                </div>
              )}
              <div className="enc-row">
                <button onClick={() => setRunning((r) => !r)} disabled={battleOver}>
                  {running ? '⏸ 暂停' : '⏵ 继续'}
                </button>
                <button onClick={stepTen} disabled={battleOver || running}>
                  ⏩ ×10 tick
                </button>
                <button onClick={finishBattle} disabled={battleOver || running}>
                  ⏭ 跑到结束
                </button>
                <button
                  className="speed-btn"
                  disabled={battleOver}
                  title="实时推进速度"
                  onClick={() => { const next = nextBattleSpeed(battleSpeed); setBattleSpeed(next); try { localStorage.setItem('gg-speed', String(next)) } catch { /* 会话级回落 */ } }}
                >
                  ⏩ {battleSpeed}×
                </button>
                <span className="tick-info">tick {battle?.tick ?? 0}</span>
              </div>
              {(inBattle || inTowerBattle) && battle && battle.status === 'running' && !battleOver && (
                <BattleHints
                  hints={BATTLE_HINTS.filter((h) => !hintsSeen.includes(h.id) && (h.applies?.({ hasSignature: battle.combatants.some((c) => c.team === 'guild' && c.alive && !!c.specId && SIGNATURE_SKILLS[c.specId]) }) ?? true)).map(({ id, text }) => ({ id, text }))}
                  onDismiss={dismissHint}
                />
              )}
              {(inBattle || inTowerBattle) && battle && battle.status === 'running' && (
                <SignatureBar
                  battle={battle}
                  casterId={intents?.casterId}
                  focusId={battle.commands.focusId}
                  onUse={(memberId, targetId) => { setPlayMeta((m: PlayMeta) => ({ ...m, signatureUses: (m.signatureUses ?? 0) + 1 })); useSignature(battle, memberId, targetId) }}
                />
              )}
              {battle && !battleOver && (
                <p className="hint">
                  点击场上敌人 = 集火 · boss 蓄力出现红条倒计时 = 切「分散」减伤 · boss 出现紫条咏唱 = 点「打断咏唱！」 ·
                  狂暴前 = 爆发药或撤退令 · 倒下即永久牺牲
                </p>
              )}
              {battleOver && (
                <div
                  className={`result-banner ${
                    battle!.status === 'guild-win'
                      ? 'win'
                      : battle!.status === 'retreated'
                        ? 'win'
                        : 'wipe'
                  }`}
                >
                  {battle!.status === 'guild-win'
                    ? '★ 战斗胜利'
                    : battle!.status === 'retreated'
                      ? '🏳 已撤离'
                      : '✝ 队伍全灭'}
                </div>
              )}
              {battleOver && progress.lastSummary && (
                <div className="battle-summary">
                  {progress.lastSummary.deaths.length > 0 && (
                    <div className="bs-row">
                      <span className="bs-label">阵亡</span>
                      <span className="bs-text">
                        {progress.lastSummary.deaths.map((d) =>
                          d.name + '(' + d.cause + (d.killerName ? ' · 出手者 ' + d.killerName : '') + ')',
                        ).join(';')}
                      </span>
                    </div>
                  )}
                  {progress.lastSummary.wiped && progress.lastSummary.topDamage.length > 0 && (
                    <div className="bs-row">
                      <span className="bs-label">败因</span>
                      <span className="bs-text">
                        {progress.lastSummary.topDamage.map((t) => t.name + ' 输出 ' + t.amount).join(' · ')}
                      </span>
                    </div>
                  )}
                  {progress.lastSummary.moments.length > 0 && (
                    <div className="bs-row">
                      <span className="bs-label">关键时刻</span>
                      <span className="bs-text">{progress.lastSummary.moments.join(' · ')}</span>
                    </div>
                  )}
                </div>
              )}
              {battle && (
                <div
                  className="log-box"
                  ref={logBoxRef}
                  onScroll={(e) => {
                    const box = e.currentTarget
                    logPinnedRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40
                  }}
                >
                  {battle.log.map((entry, i) => (
                    <div key={i} className={`log-${entry.kind}`}>
                      <span className="log-tick">[{entry.tick}]</span>
                      {entry.text}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {towerRun?.phase === 'battle' && battle && (
            <>
              <h2>🗼 黑苔高塔 · 第 {towerRun.floor} 层{towerFloorIsBoss(towerRun.floor) ? '（守塔者）' : ''}</h2>
              <div className="cmd-bar">
                <button
                  className={battle.commands.autoMode ? 'active' : ''}
                  onClick={() => cmdTower((b) => { b.commands.autoMode = !b.commands.autoMode; if (towerRunRef.current) towerRunRef.current.autoMode = b.commands.autoMode }, true)}
                >
                  🤖 挂机{battle.commands.autoMode ? '中（自动深入）' : ''}
                </button>
                <span className="cmd-label">│</span>
                <span className="cmd-label">阵型</span>
                {(Object.keys(STANCE_NAME) as Stance[]).map((st) => (
                  <button
                    key={st}
                    className={
                      (battle.commands.stance === st ? 'active' : '') +
                      (intents?.telegraphing && st === 'spread' ? ' urgent' : '')
                    }
                    disabled={battle.commands.autoMode}
                    onClick={() => {
                      sfxCmd()
                      cmdTower((b) => setStance(b, st))
                    }}
                  >
                    {STANCE_NAME[st]}
                  </button>
                ))}
                <span className="cmd-label">│</span>
                <button
                  onClick={() => {
                    sfxCmd()
                    cmdTower((b) => useHealPotion(b))
                  }}
                  disabled={battle.commands.autoMode || battle.commands.healStock <= 0 || battle.commands.healCd > 0}
                >
                  💊 治疗药×{battle.commands.healStock}
                </button>
                <button
                  onClick={() => {
                    sfxCmd()
                    cmdTower((b) => useFuryPotion(b))
                  }}
                  disabled={battle.commands.autoMode || battle.commands.furyStock <= 0 || battle.commands.furyCd > 0}
                >
                  ⚡ 爆发药×{battle.commands.furyStock}
                </button>
                {intents?.casting && intents.casterId && !battle.commands.autoMode && (
                  <button
                    className="urgent"
                    onClick={() => {
                      if (!intents?.casterId) return
                      sfxCmd()
                      cmdTower((b) => setFocus(b, intents.casterId))
                    }}
                  >
                    ⚔ 打断咏唱！
                  </button>
                )}
                <button
                  className="focus-tag"
                  onClick={() => {
                    sfxCmd()
                    cmdTower((b) => orderRetreat(b))
                  }}
                >
                  🏳 撤退令
                </button>
              </div>
              <div className="enc-row">
                <button onClick={() => setTowerRunning((r) => !r)} disabled={battle.status !== 'running'}>
                  {towerRunning ? '⏸ 暂停' : '⏵ 继续'}
                </button>
                <button
                  onClick={() => {
                    const current = towerRunRef.current?.battle
                    if (!current || current.status !== 'running') return
                    setTowerRunning(false)
                    for (let i = 0; i < 10 && current.status === 'running'; i++) stepBattle(current)
                    drainAndSync(current)
                  }}
                  disabled={battle.status !== 'running'}
                >
                  ⏭ ×10 tick
                </button>
                <span className="tick-info">tick {battle.tick}</span>
                <span className="tick-info">· 塔内金币已入账 {towerRun.goldEarned}{towerRun.insuredFloor ? ' · 🛡 本层已投保' : ''}</span>
              </div>
              <div className="log-box">
                {battle.log.map((entry, i) => (
                  <div key={i} className={`log-${entry.kind}`}>
                    <span className="log-tick">[{entry.tick}]</span>
                    {entry.text}
                  </div>
                ))}
              </div>
            </>
          )}

          {towerRun && towerRun.phase === 'rest' && (
            <>
              <h2>🗼 第 {towerRun.floor} 层突破</h2>
              <div className="result-banner win">
                幸存者回复 20% 生命。第 9 层起撤退保护失效——量力而行。
              </div>
              <div className="end-actions">
                <button
                  onClick={() => {
                    const t = towerRunRef.current
                    if (!t) return
                    const premium = insureNextTowerFloor(t, gold)
                    if (!premium) return
                    setGold((g) => g - premium)
                    setTowerRun({ ...t })
                    logChronicle(chronicleRaw(day, '为第 ' + (t.floor + 1) + ' 层投了保(保费 ' + premium + ' 金)——下一层若有人倒下,装备免费归还。'))
                  }}
                  disabled={gold < (towerRun.floor + 1) * 40 || towerRun.insuredNextFloor === towerRun.floor + 1}
                >
                  {towerRun.insuredNextFloor === towerRun.floor + 1 ? '✓ 下一层已投保' : `🛡 投保第 ${towerRun.floor + 1} 层（${(towerRun.floor + 1) * 40} 金，阵亡装备免赎回）`}
                </button>
                <button onClick={towerNextFloor}>⬆ 深入第 {towerRun.floor + 1} 层</button>
                <button onClick={leaveTower}>🏰 带着奖励离开</button>
              </div>
            </>
          )}

          {towerRun && towerRun.phase === 'ended' && (
            <>
              <h2>塔内征程结束</h2>
              <div className={`result-banner ${towerRun.result === 'defeated' ? 'wipe' : 'win'}`}>
                {towerRun.result === 'defeated'
                  ? '✝ 高塔吞没了远征队——已得奖励保留，阵亡者入纪念堂'
                  : '🏰 你带着收获离开了高塔'}
              </div>
              <div className="end-actions">
                <button onClick={leaveTower}>← 返回公会</button>
              </div>
            </>
          )}

          {run && (run.phase === 'rest' || finished) && kingdom.active.length > 0 && <div className="royal-field-status" role="status">
            <b>♜ 王国委托</b>
            {kingdom.active.map((record) => {
              const q = COMMISSIONS.find((entry) => entry.id === record.id)!
              return <div key={record.id}>{q.title} · {record.progress}/{q.objective.target}{record.progress >= q.objective.target ? ' · 已达成，返回公会交付' : ''}</div>
            })}
          </div>}
          {run && run.kind === 'dungeon' && run.phase === 'rest' && (
            <MapScreen
              run={run}
              mastery={dungeonMastery[runDungeon(run).id] ?? 0}
              drops={lastDrops}
              notice={progress.lastNodeResult}
              onChoose={(id) => continueDeepRef.current?.(id)}
              onRetreat={retreat}
            />
          )}

          {finished && (
            <ResultScreen
              run={run!}
              dungeonName={runDungeon(run!).name}
              members={membersRef.current}
              snapshot={growthSnapshotRef.current}
              drops={lastDrops}
              story={progress.notices.find((n) => n.startsWith('📖')) ?? null}
              onBack={backToGuild}
            />
          )}
        </div>
      </div>
    </div>
  )
}

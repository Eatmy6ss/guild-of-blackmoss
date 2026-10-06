import { MemberCard } from './ui/MemberCard'
import { BattleIntel } from './ui/art/BattleIntel'
import { CreditsDialog } from './ui/art/Credits'
import { KingdomPanel } from './ui/screens/KingdomPanel'
import { SaveTransferPanel } from './ui/SaveTransferPanel'
import { StatisticsPanel } from './ui/screens/StatisticsPanel'
import { newStatistics, recordStatistics, type StatisticsAction, type GoldSource } from './sim/statistics'
import { COMMISSIONS, type CommissionDef } from './data/kingdom'
import { acceptCommission, abandonCommission, claimCommission, newKingdomState, kingdomRank, type RoyalRewardChoice } from './sim/kingdom'
import { useEffect, useRef, useState, useReducer } from 'react'
import type { BattleState, DeadHero, ItemInstance, JobId, Member } from './sim/types'
import { generateMember, bondStars, seedMemberSeq, reserveNames, rollSpec, memberGenerationState, restoreMemberGeneration } from './sim/gen'
import { RACES } from './data/races'
import { guildRankOf } from './sim/rank'
import { applyFeast } from './sim/morale'
import { chronicleFeast, chronicleRecruit, seedChronicle, type ChronicleEntry } from './sim/chronicle'
import { TICK_MS, stepBattle, setFocus, useSignature } from './sim/combat'
import { DOCK_UNLOCK_DAY, DOCK_UNLOCK_MILESTONE } from './data/tutorial'
import { normalizeLedger, type FactLedger } from './sim/fact-ledger'
import { WEAPON_FAMILIES } from './data/weapon-families'
import { MemberPanel } from './ui/screens/MemberPanel'
import { renderWarReportCard, downloadWarReportCard } from './ui/war-report-card'
import { type DungeonRun } from './sim/run'


import { describeItem } from './sim/loot'
import { settleEncounter, type EncounterGuild } from './sim/settlement'
import { createStatefulRng, newRngSeed, int, type Rng } from './sim/rng'
import { loadGuildSave, saveGuild, clearGuildSave, exportSave, saveLoadNotice, saveFailNotice, combatSaveDue, type GuildSave, type PendingConsequence, type StoredGuildBuff } from './state/save'
import { createGuildItems, itemStateFromSave, resolveMembers, inventoryItems, relicItems, serializeGuildItems, addInventoryItems, registerMemberItems, type GuildItems } from './state/item-registry'
import { runDungeon, runRng } from './sim/run-core'
import { runReducer, initialRunState, checkpointRunState, pendingRunEvent, type RunUIState } from './sim/run-state'
import { BattleRenderer } from './ui/battle/BattleRenderer'
import { initAudio, setMusicMood, toggleMute, isMuted, setVolume, getVolume, sfxVictory, sfxDefeat, sfxCoin, sfxCmd } from './ui/audio'
import { bossIntents } from './sim/mechanics'
import { BLACKMOSS, DUNGEONS } from './data/dungeons'
import { towerRest, towerNext, type TowerRun } from './sim/tower'
import { ChronicleScreen } from './ui/screens/ChronicleScreen'
import { MemorialScreen } from './ui/screens/MemorialScreen'
import { ManualScreen } from './ui/screens/ManualScreen'
import { RosterScreen } from './ui/screens/RosterScreen'
import { MapScreen } from './ui/screens/MapScreen'
import { ResultScreen } from './ui/screens/ResultScreen'
import { TavernScreen } from './ui/screens/TavernScreen'
import { BaseScreen } from './ui/screens/BaseScreen'
import { ExpeditionBoard } from './ui/screens/ExpeditionBoard'
import { TitleScreen } from './ui/screens/TitleScreen'
import { WarehouseScreen } from './ui/screens/WarehouseScreen'
import { HUB_DOCK, backTargetOf, type Screen } from './ui/screens'
import { EventModal } from './ui/screens/EventModal'
import { BattleScreen } from './ui/screens/BattleScreen'
import { TowerBattleScreen, TowerRestScreen, TowerEndedScreen } from './ui/screens/TowerScreens'
import { HallScreen } from './ui/screens/HallScreen'
import { createAppControllers } from './ui/controllers'
import { type InvSort } from './ui/inventory-sort'
import { speedIntervalMs, parseBattleSpeed } from './ui/battle/speed'
import { ECONOMY } from './data/economy'
import { baseEffects } from './data/base'
import { rollVisitor, bountyCandidate, taleCandidates, cooldownNeeded, offlineGain } from './sim/tavern'
import { rollWish, settleWishes } from './sim/wish'
import { assignTrait, TRAIT_LABELS } from './sim/member-traits'
import { attemptHeal, healingTerms, scarStatName, type HealingMastery } from './sim/scars'
import { DUNGEON_FINAL_BOSS } from './data/regions'
import { rollGuildEvent } from './sim/guild-events'
import { rollDrop } from './sim/loot'
import { chronicleRaw } from './sim/chronicle'
import { specOf } from './data/jobs'
import { HYBRIDS, isHybrid } from './data/vocations'
import { playtestAllows } from './data/regions'

// M0 D11 开发架：公会层——永久死亡、纪念堂、撤退保护、招募三选一、战术手册。
// 花名册 = 全体成员（含亡者记录）；远征队 = 花名册前三名幸存者。

const START_JOBS = ['guard', 'priest', 'ranger'] as const


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
  const expedition = (() => {
    const byId = new Map(members.map((m) => [m.id, m]))
    return expeditionIds.map((id) => byId.get(id)).filter((m): m is Member => !!m && m.alive)
  })()

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
  const [screen, setScreen] = useState<Screen>('title')
  // R5.2/U33⑦:真 go()/back() 状态机——单一 screen 取代 screen('title'|'game')/hubScreen/memberSheetId 三套状态
  const go = (to: Screen) => setScreen(to)
  const back = () => setScreen((cur) => backTargetOf(cur))
  const screenRef = useRef<Screen>('title')
  screenRef.current = screen
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
    if (screen === 'title' || resumeHandledRef.current) return
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
      if (active.phase === 'rest') window.setTimeout(() => active.kind === 'dungeon' ? continueDeepRef.current?.() : towerNextFloor(), 750)
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

  const logChronicle = (e: ChronicleEntry) => {
    chronicleRef.current = [...chronicleRef.current, e]
    setChronicle(chronicleRef.current)
  }
  const aliveCount = () => membersRef.current.filter((m) => m.alive).length

  const continueScreen = (): Screen => towerRunRef.current
    ? 'tower'
    : runRef.current ? (runRef.current.phase === 'battle' ? 'battle' : 'map') : 'hall'

  const lastRetreatRunRef = useRef<string | null>(null)
  const retreatRef = useRef<() => void>(() => {})
  const backToGuildRef = useRef<() => void>(() => {})

  const bondTotalOf = (m: Member) => Object.values(m.bonds).reduce((s2, n) => s2 + bondStars(n), 0)
  const leaveExpedition = (id: string) => {
    if (runRef.current || towerRunRef.current) return
    setExpeditionIds((ids) => ids.filter((x) => x !== id))
  }
  const enterExpedition = (id: string) => {
    if (runRef.current || towerRunRef.current) return
    setExpeditionIds((ids) => {
      const aliveIds = members.filter((m) => m.alive).map((m) => m.id)
      const kept = ids.filter((x) => x !== id && aliveIds.includes(x))
      if (kept.length >= activeDungeon.size) return [...kept.slice(0, activeDungeon.size - 1), id] // 满员时编入=换下最后一位
      return [...kept, id]
    })
  }
  const applyRetreatDeductionRef: { current: null | ((r: DungeonRun) => void) } = { current: null }
  // R5.2d(U33⑦):远征/塔/经济控制器迁 src/ui/controllers.ts(正文逐字,deps 解构;行为零变)
  const ctl = createAppControllers({
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
    setDungeonId, setSaveTransfer, setTowerRunning, eventResolvingRef, eventCursorRef, sfxCoin,
    blessing, kingdomRef, expeditionIds, resolveEventRef, dismissEventRef, eventResult,
  })
  const { applyOutcome, applyRetreatDeduction, settleBattleEnd, equip, redeemRelic, retreat, cmd, resolveEvent, dismissEvent,
    startExpedition, chooseNode, backToGuild, restartGuild, dismantleT3, exchangeT3, sellItem,
    enterTower, cmdTower, towerNextFloor, leaveTower, stepTen, finishBattle, upgradeBuilding, buyPotion } = ctl
  applyRetreatDeductionRef.current = applyRetreatDeduction
  startExpeditionRef.current = startExpedition
  continueDeepRef.current = chooseNode
  retreatRef.current = retreat
  backToGuildRef.current = backToGuild
  useEffect(() => {
    if (screen === 'title' || !pendingEvent || eventResult) return
    const r = runRef.current
    if (r ? !r.autoMode : !autoLoopRef.current) return
    if (r && r.phase !== 'rest') return
    const timer = setTimeout(() => {
      resolveEventRef.current?.(Math.floor(((runRef.current ? runRng(runRef.current) : guildRng))() * pendingEvent.choices.length))
    }, 1800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEvent, eventResult, screen])
  useEffect(() => {
    if (screen === 'title' || !eventResult) return
    if (!autoLoopRef.current) return
    const timer = setTimeout(() => dismissEventRef.current?.(), 2400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventResult, screen])
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
  useEffect(() => {
    const box = logBoxRef.current
    if (!box || !logPinnedRef.current) return
    box.scrollTop = box.scrollHeight
  }, [battle?.log.length])
  useEffect(() => {
    if (screen === 'title' || (!running && !towerRunning)) return
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
  useEffect(() => {
    // 初次加载/远征减员后:自动补齐到所选副本编制(花名册顺序);换小图时裁到编制内
    setExpeditionIds((ids) => {
      const aliveIds = members.filter((m) => m.alive).map((m) => m.id)
      const kept = ids.filter((id) => aliveIds.includes(id))
      if (kept.length >= activeDungeon.size) return kept.slice(0, activeDungeon.size)
      return [...kept, ...aliveIds.filter((id) => !kept.includes(id))].slice(0, activeDungeon.size)
    })
  }, [members, dungeonId])


  // 判定已由 sim 完成；这里仅将结果同步到公会状态和当前玩法。
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
  // U29 状态机:关闭功能屏=返回上一级(backTargetOf)——功能坞屏回大厅,统计回大事记
  const goBack = back
  // 透明面板(宪法 v3.2 缺陷二):展开显示乘区逐层明细的成员
  const battleMapId = towerRun ? 'tower' : run ? runDungeon(run).id : activeDungeon.id
  const hasBoss = battle?.combatants.some(c => c.boss && c.alive)
  useEffect(() => { rendererRef.current?.setTheme(battleMapId) }, [battleMapId])
  useEffect(() => {
    setMusicMood(screen === 'memorial' || battle?.status === 'guild-wipe' ? 'mourning'
      : (inBattle || inTowerBattle) && battle?.status === 'running' ? hasBoss ? 'boss' : 'battle'
      : towerRun || (run && ['rustmine', 'abyssaltar', 'dragonmaw'].includes(battleMapId)) ? 'cavern' : 'hub')
  }, [screen, battle?.status, hasBoss, inBattle, inTowerBattle, battleMapId, !!towerRun, !!run])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      // R5.2b/U33⑦:Esc 只有一个监听(App 层),按屏特判
      if (e.key === 'Escape') {
        const cur = screenRef.current
        if (cur === 'map' && runRef.current?.phase === 'rest') {
          // 地图 Esc=撤退确认(写明 R5.1e 的撤退代价);retreat 经 ref 调用(防首帧闭包)
          const r = runRef.current
          const g = Math.floor((r.earnedGold ?? 0) / 2)
          const m = Math.floor((r.earnedMastery ?? 0) / 2)
          setConfirmAsk({ text: `撤退回城?本趟金币 −${g}、${runDungeon(r).name}熟练度 −${m}(装备照拿,药水照退)。`, okLabel: '🏳 撤退回城', onOk: () => retreatRef.current?.() })
          return
        }
        if (cur === 'result') { backToGuildRef.current?.(); return } // 结算屏 Esc=返回公会
        if (cur === 'member') setMemberSheetId(null)
        if (runRef.current || towerRunRef.current) return // 战斗/塔内 Esc 无效(防误触,与旧一致)
        back()
        return
      }
      if (runRef.current || towerRunRef.current) return
      const hit = HUB_DOCK.find((it) => it.hotkey.toLowerCase() === e.key.toLowerCase() && dockUnlocked(it.key))
      if (hit) setScreen((cur) => (cur === hit.key ? 'hall' : hit.key))
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
    if (q.objective.kind === 'building') go('base')
    else { setDungeonId(q.objective.dungeonId); goBack() }
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
            <button onClick={() => { initAudio(); go(continueScreen()) }}>
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
                    go('hall')
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
      {screen === 'member' && memberSheet && <MemberPanel member={memberSheet} members={members} onClose={() => { setMemberSheetId(null); back() }}
              inventory={inventory} onEquip={(slot, itemId) => equip(memberSheet, slot, itemId)} />}
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
      {screen !== 'title' && resumeNotice && <p className="hint" role="status">{resumeNotice}</p>}
      {screen === 'title' && <TitleScreen hasSave={!!saved} offlineNote={offlineNote} resumeNotice={resumeNotice}
        muted={muted} volume={volume} buildDate={__BUILD_DATE__}
        onEnter={() => { initAudio(); go(continueScreen()) }}
        onRestart={() => setConfirmAsk({
          text: '重新开始将清空当前进度，确定？',
          okLabel: '✦ 清空并重新开始',
          onOk: () => { initAudio(); clearGuildSave(); restartGuild(); go('hall') },
        })}
        onToggleMute={() => { initAudio(); setMuted(toggleMute()) }}
        onVolume={(v: number) => { initAudio(); setVolume(v); setVolumeState(v); if (muted) setMuted(toggleMute()) }}
        onShowCredits={() => setShowCredits(true)}
        onExportSave={() => { const current = loadGuildSave(); if (current) setSaveTransfer({ mode: 'export', code: exportSave(current) }) }}
        onImportSave={() => setSaveTransfer({ mode: 'import', code: '' })}
      />}
      <div className={`layout${inBattle || inTowerBattle ? ' battle-mode' : ''}`}>
        <HallScreen
          screen={screen} day={day} gold={gold} blessing={blessing} members={members} potions={potions}
          muted={muted} volume={volume} towerBest={towerBest} towerUnlocked={towerUnlocked}
          canExpedition={canExpedition} busy={!!run || !!towerRun} kingdom={kingdom}
          dungeonMastery={dungeonMastery} inventory={inventory as never} expedition={expedition as never} manual={manual}
          hintsSeen={hintsSeen} playtest={!!__PLAYTEST__} dockUnlocked={dockUnlocked} go={go}
          enterTower={enterTower} restartAsk={() => setConfirmAsk({ text: '确定重开公会？所有英雄、装备与纪念堂记录将全部清空。', okLabel: '☠ 确认清空', onOk: () => restartGuild() })}
          initAudio={initAudio} setMuted={setMuted} toggleMute={toggleMute} setVolume={setVolume} setVolumeState={setVolumeState}
          exportPlaytestReport={exportPlaytestReport} makeWarReportCard={makeWarReportCard} dismissHint={dismissHint}
        >
          {screen === 'kingdom' && !run && !towerRun && <KingdomPanel state={kingdom} context={royalContext} notice={royalNotice} playtestLock={(d) => !playtestAllows(d)}
            onClose={() => goBack()} onAccept={acceptRoyal} onClaim={claimRoyal} onTravel={travelRoyal}
            onAbandon={(id) => { if (runRef.current || towerRunRef.current) return; updateKingdom(abandonCommission(kingdomRef.current, id)); setRoyalNotice('委托已撤销，可重新接取。王国信任不变。') }} />}
          {screen !== 'title' && pendingEvent && (
            <EventModal event={pendingEvent} result={eventResult} impacts={eventImpacts}
              inBattle={!!run && run.phase === 'battle'} onResolve={resolveEvent} onDismiss={dismissEvent} />
          )}
            {screen === 'tavern' && <TavernScreen gold={gold} blessing={blessing} members={members}
              visitor={visitor} candidates={candidates} effectiveCooldown={effectiveCooldown} busy={!!run || !!towerRun}
              onFeast={() => { setGold((g) => g - 60); applyFeast(membersRef.current, baseEffects(buildings).feastBoost); for (const d of membersRef.current) { if (d.alive && d.trait === 'drinker') d.morale = Math.min(100, (d.morale ?? 60) + Math.round(baseEffects(buildings).feastBoost * 0.5)) } setMembers([...membersRef.current]); logChronicle(chronicleFeast(day, 60)); sfxCoin() }}
              onWaitNight={() => setVisitor(rollVisitor(guildRng, membersRef.current, 0, { hybrids: !__PLAYTEST__ }))}
              onSign={signVisitor} onBounty={hireBounty} onTale={rollTale} onHire={hire} onBack={goBack} />}
            {screen === 'warehouse' && <WarehouseScreen inventory={inventory} potions={potions} gold={gold} kingdom={kingdom}
              pendingRelics={pendingRelics} starMarrow={starMarrow} blessing={blessing} busy={!!run || !!towerRun}
              invSort={invSort} onSortChange={setInvSort} onBuyPotion={buyPotion} onRedeemRelic={redeemRelic}
              onDismantle={dismantleT3} onSell={sellItem} onExchange={exchangeT3}
              lastDropCount={lastDrops.length} sellMult={baseEffects(buildings).sellMult} onBack={goBack} />}
            {screen === 'base' && <BaseScreen day={day} gold={gold} blessing={blessing} members={members}
              busy={!!run || !!towerRun} trainingReady={trainingReady} healingNotice={healingNotice}
              healingMastery={healingMastery} buildings={buildings} unlockedHybrids={unlockedHybrids}
              weaponTraining={(members.find((m) => m.id === trainSelId)?.weaponLearned ?? [])}
              busyUntilDay={(members.find((m) => m.id === trainSelId)?.busyUntilDay ?? 0)}
              today={day} trainingLevel={buildings.training ?? 0}
              trainSelId={trainSelId} bondTotal={bondTotalOf}
              onBuyTraining={() => {
                if (trainingReadyRef.current || gold < 150 || runRef.current || towerRunRef.current) return
                trainingReadyRef.current = true
                setTrainingReady(true)
                setGold(g => g - 150)
                logChronicle(chronicleRaw(day, '花费 150 金完成特权训练，下次远征经验 +25%。'))
                sfxCoin()
              }}
              onLearnFamily={(f) => {
                const m2 = membersRef.current.find((x) => x.id === trainSelId)
                if (!m2?.alive || runRef.current || towerRunRef.current) return
                if ((m2.weaponLearned ?? []).includes(f) || gold < 100) return
                const days = (buildings.training ?? 0) >= 2 ? 1 : 2
                setMembers((ms) => ms.map((x) => x.id === m2.id
                  ? { ...x, weaponLearned: [...new Set([...(x.weaponLearned ?? []), f])], busyUntilDay: day + days }
                  : x))
                setGold((g) => g - 100)
                logChronicle(chronicleRaw(day, `${m2.name} 开始${WEAPON_FAMILIES[f as keyof typeof WEAPON_FAMILIES]?.name ?? f}专修——第 ${day + days} 天归队。`))
                sfxCoin()
              }}
              onHeal={(memberId, si, scar) => {
                if (healingBusyRef.current || runRef.current || towerRunRef.current) return
                const m2 = membersRef.current.find((x) => x.id === memberId)
                if (!m2?.alive) return
                const cur = m2.scars?.[si]
                // 陈旧索引守卫:渲染后伤疤数组若已位移,拒绝误治
                if (!cur || cur !== scar) return
                const mastery = healingMastery[cur.stat] ?? 0
                const cost = healingTerms(cur, mastery)
                if (gold < cost.gold || blessing < cost.blessing) return
                const r = attemptHeal(m2, si, mastery, guildRng)
                if (!r) return
                healingBusyRef.current = true
                setHealingMastery((q) => ({ ...q, [cur.stat]: (q[cur.stat] ?? 0) + r.masteryGain }))
                setBlessing((b) => b - cost.blessing)
                setGold((g) => g - cost.gold)
                noteStatistics({ type: 'healing', gold: cost.gold, blessing: cost.blessing })
                setMembers([...membersRef.current])
                const outcome = r.result === 'success' ? '已治愈，属性恢复。' : r.result === 'worsen' ? '治疗失败，创伤恶化为重度。' : '治疗未起效，创伤保留。'
                const notice = m2.name + ' 的' + scarStatName(cur.stat) + '创伤：' + outcome + ' 消耗 ' + cost.gold + ' 金、' + cost.blessing + ' 祝福；该维度疗养经验 +' + r.masteryGain + '。'
                setHealingNotice(notice)
                logChronicle(chronicleRaw(day, notice))
              }}
              onUpgrade={upgradeBuilding}
              onSelectMember={setTrainSelId}
              onChangeVocation={changeVocation}
              onAdvanceSpec={advanceSpec}
              onLearnAugment={learnAugment}
              onBack={goBack} />}
            {screen === 'chronicle' && <ChronicleScreen chronicle={chronicle} day={day} onOpenStatistics={() => go('statistics')} onBack={goBack} />}
            {screen === 'memorial' && <MemorialScreen memorial={memorial} onBack={goBack} />}
            {screen === 'manual' && <ManualScreen manual={manual} eventsSeen={eventsSeen} protectOn={protectOn} onToggleProtect={() => setProtectOn((p) => !p)} onBack={goBack} />}
            {screen === 'roster' && <RosterScreen members={members} renderMemberCard={(m) => (
              <MemberCard member={m} battle={battle} run={run} expedition={expedition}
                onOpen={(id) => { setMemberSheetId(id); go('member') }}
                onEnter={enterExpedition} onLeave={leaveExpedition}
                inventory={inventory} expeditionIds={expeditionIds} onEquip={equip} />
            )} onBack={goBack} />}
            {screen === 'statistics' && <StatisticsPanel statistics={statistics} day={day} onClose={() => back()} onBack={() => go('chronicle')} />}
        </HallScreen>

        <div className={`panel${inBattle || inTowerBattle ? ' battle-panel' : ''}`}>
          {(inBattle || inTowerBattle) && battle && <BattleIntel battle={battle} members={members} mapId={battleMapId} paused={inTowerBattle ? !towerRunning : !running} />}
          {/* 舞台常驻：渲染器挂载一次，非战斗阶段隐藏（避免 ref 为 null 导致挂载失败） */}
          <div className="stage" ref={stageRef} style={{ display: inBattle || inTowerBattle ? undefined : 'none' }} />
          {!run && !towerRun && <ExpeditionBoard dungeonId={dungeonId} manual={manual}
            expeditionCount={expedition.length} activeDungeonSize={activeDungeon.size} activeDungeonName={activeDungeon.name}
            canExpedition={canExpedition} busy={!!run || !!towerRun} playtestMode={!!__PLAYTEST__}
            onSelectDungeon={setDungeonId} onDepart={() => startExpeditionRef.current?.()} />}


          {screen === 'battle' && run && inBattle && battle && (
            <BattleScreen
              run={run} battle={battle} inBattle={inBattle} inTowerBattle={inTowerBattle}
              battleOver={battleOver} running={running} battleSpeed={battleSpeed} intents={intents}
              hintsSeen={hintsSeen} lastSummary={progress.lastSummary ?? null} encName={encName}
              cmd={cmd} autoLoopSet={(v) => { autoLoopRef.current = v }} runAutoSet={(v) => { if (runRef.current) runRef.current.autoMode = v }}
              sfxCmd={sfxCmd} setRunning={setRunning} stepTen={stepTen} finishBattle={finishBattle}
              setBattleSpeed={setBattleSpeed} dismissHint={dismissHint}
              onSignatureUse={() => setPlayMeta((m: PlayMeta) => ({ ...m, signatureUses: (m.signatureUses ?? 0) + 1 }))}
              useSignatureCmd={(b, mid, tid) => useSignature(b, mid, tid)}
              logBoxRef={logBoxRef} logPinnedRef={logPinnedRef} retreat={retreat}
            />
          )}

          {screen === 'tower' && towerRun?.phase === 'battle' && battle && (
            <TowerBattleScreen
              towerRun={towerRun} battle={battle} intents={intents} towerRunning={towerRunning}
              cmdTower={cmdTower} sfxCmd={sfxCmd} towerRunRef={towerRunRef}
              setTowerRunning={setTowerRunning} drainAndSync={drainAndSync}
            />
          )}

          {screen === 'tower' && towerRun && towerRun.phase === 'rest' && (
            <TowerRestScreen
              towerRun={towerRun} gold={gold} setGold={setGold} towerRunRef={towerRunRef}
              setTowerRun={setTowerRun} logChronicle={logChronicle} chronicleRaw={chronicleRaw} day={day}
              towerNextFloor={towerNextFloor} leaveTower={leaveTower}
            />
          )}

          {screen === 'tower' && towerRun && towerRun.phase === 'ended' && (
            <TowerEndedScreen towerRun={towerRun} leaveTower={leaveTower} />
          )}

          {run && (run.phase === 'rest' || finished) && kingdom.active.length > 0 && <div className="royal-field-status" role="status">
            <b>♜ 王国委托</b>
            {kingdom.active.map((record) => {
              const q = COMMISSIONS.find((entry) => entry.id === record.id)!
              return <div key={record.id}>{q.title} · {record.progress}/{q.objective.target}{record.progress >= q.objective.target ? ' · 已达成，返回公会交付' : ''}</div>
            })}
          </div>}
          {screen === 'map' && run && run.kind === 'dungeon' && run.phase === 'rest' && (
            <MapScreen
              run={run}
              mastery={dungeonMastery[runDungeon(run).id] ?? 0}
              drops={lastDrops}
              notice={progress.lastNodeResult}
              onChoose={(id) => continueDeepRef.current?.(id)}
              onRetreat={retreat}
            />
          )}

          {/* U33 自测反馈②:结算=独立弹层(石框鎏金 overlay,压过事件弹层),不再整页替换 */}
          {screen === 'result' && finished && (
            <div className="screen-overlay result-overlay">
              <div className="screen-panel result-modal">
                <ResultScreen
                  run={run!}
                  dungeonName={runDungeon(run!).name}
                  members={membersRef.current}
                  snapshot={growthSnapshotRef.current}
                  drops={lastDrops}
                  story={progress.notices.find((n) => n.startsWith('📖')) ?? null}
                  onBack={backToGuild}
                  onAgain={() => { backToGuild(); window.setTimeout(() => startExpeditionRef.current?.(), 120) }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

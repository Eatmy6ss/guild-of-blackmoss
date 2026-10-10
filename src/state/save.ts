import { SIGNATURE_SKILLS } from '../data/signature'
import { normalizeLedger } from '../sim/fact-ledger'
import type { DeadHero, Member } from '../sim/types'
import { readItemFields, itemStateFromSave, resolveMembers, serializeGuildItems, assertItemOwnership, type StoredItemFields } from './item-registry'
import { JOBS } from '../data/jobs'
import { WEAPON_FAMILIES } from '../data/weapon-families'
import { RACES } from '../data/races'
import { isHybrid } from '../data/vocations'
import { maxHpOf, type MemberGenerationState } from '../sim/gen'
import type { ChronicleEntry } from '../sim/chronicle'
import { newKingdomState, normalizeKingdom, type KingdomState } from '../sim/kingdom'
import { newStatistics, normalizeStatistics, type GameplayStatistics } from '../sim/statistics'
import { sanitizeBio } from '../sim/bio'
import { sanitizeIntelEntries } from '../sim/intel'
import { AFFIX_RENAMES } from '../data/affixes'
import { initialRunState, validateRunState, type RunUIState } from '../sim/run-state'
import type { Visitor } from '../sim/tavern'

// 公会存档(save-systems:版本号 + 迁移链 + 防御式加载)
// v21：公会资产与现有远征/事件断点同批落盘，恢复后继续原模拟与结算。

// 键名保持:内部用 schema version 迁移,不换键。
// A11:试玩构建(__PLAYTEST__)使用独立键,与开发/正式存档完全隔离。
declare const __PLAYTEST__: boolean
const KEY = (typeof __PLAYTEST__ !== 'undefined' && __PLAYTEST__) ? 'guild-game-playtest-v1' : 'guild-game-save-v1'

export const SAVE_VERSION = 32

/** A13:战斗运行中的存档节流窗(原每 tick 写一次 ≈10 次/秒;现断点粒度 5 秒,战斗结束立即写) */
export const COMBAT_SAVE_INTERVAL_MS = 5000
export function combatSaveDue(now: number, last: number): boolean {
  return now - last >= COMBAT_SAVE_INTERVAL_MS
}

let unreadableSave = false
let loadNotice = ''
export const saveLoadNotice = () => loadNotice

/** 最近一次保存失败的原因(空串=上次保存成功):区分程序校验失败与浏览器存储问题 */
let saveFailReason = ''
export const saveFailNotice = () => saveFailReason
/** 最近一次读档失败的真实异常(诊断用;玩家侧横幅也引用) */
export let lastLoadError = ''

export interface PendingConsequence {
  /** 当次真实选择；老队列缺省时不猜来源。 */
  originFactId?: number
  eventId: string
  dueDay: number
}

/** 公会层持续状态(事件二期:跨天传奇,出征时全队生效) */
export interface StoredGuildBuff {
  buff: { id: string; name: string; desc: string; mods: { atk?: number; def?: number; hp?: number; heal?: number } }
  endDay: number
}

export interface GuildSave extends StoredItemFields {
  /** v22: 结构化事实账本(说书人查询层;编年史继续存成品句子) */
  factLedger: import('../sim/fact-ledger').FactLedger
  /** A10:一次性引导提示的已读标记(可选字段,旧档缺省=待展示) */
  hintsSeen?: string[]
  /** A11:试玩期轻计数(出发/撤退/玩家手动招牌技;可选,免迁移) */
  playMeta?: { startedAt?: number; expeditions?: number; retreats?: number; signatureUses?: number }
  runState: RunUIState
  /** 事件已兑现的访客要随结果保存，避免刷新丢掉这项报酬。 */
  visitor: Visitor | null
  generationState: MemberGenerationState | null
  /** v19: 公会随机序列的当前位置，刷新/导出后续接。 */
  rngState: number
  /** v18: 已立约、尚未用于下一次远征的稀有猎杀 */
  rareHuntNext?: { mult: number; rewardMult: number } | null
  /** v17: only measured settlements, never reconstructed historical totals */
  statistics: GameplayStatistics
  /** v16：已购买、尚未用于远征的训练资格 */
  trainingReady: boolean
  /** v12: 王国委托、进度和一次性领取记录 */
  kingdom: KingdomState
  /** v13: 星髓(拆解 T3 装备所得,灰冠兑换用) */
  starMarrow: number
  /** v15: 疗养熟练度(维度→尝试次数,DESIGN 14.2) */
  healingMastery: Record<string, number>
  /** v29(U36):情报条目(条目化记录,买时见文本,验证后见真伪) */
  intelEntries?: import('../sim/intel').IntelEntry[]
  /** v29(U36):情报贩子货源(每出发日+1,上限 INTEL_STOCK_CAP) */
  intelStock?: number
  version: number
  memorial: DeadHero[]
  manual: string[]
  protectOn: boolean
  /** v2:公会经济(金币/英灵祝福/招募冷却) */
  gold: number
  blessing: number
  recruitCooldown: number
  /** v3:黑苔高塔最高纪录层数 */
  towerBest: number
  /** v4:上次存档时间戳(离线累积用) */
  lastSeen: number
  /** v5:编年史(灵魂层)与公会日 */
  chronicle: ChronicleEntry[]
  day: number
  /** v6:公会基地建筑等级 */
  buildings: Record<string, number>
  /** v7:药水库存(出征携带/战斗消耗/回城退回) */
  potions: { heal: number; fury: number }
  /** v8:已解锁的混合职阶(公会级,训练场一次性解锁) */
  unlockedHybrids: string[]
  /** v9:副本熟练度(逐段选路迷雾揭示) */
  dungeonMastery: Record<string, number>
  /** v10:延迟第二幕队列(巫师3式后果,dueDay 到期弹出) */
  pendingConsequences?: PendingConsequence[]
  /** v11:事件图鉴(见过的事件 id)+ 公会层持续状态(跨天传奇) */
  eventsSeen?: string[]
  guildBuffs?: StoredGuildBuff[]
}

/** 迁移链:每级一个纯函数,旧形态 → 新形态(save-systems 模式 3) */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  // U42 #9.2 自动施法偏好:autoCastOff 关单(技能 id 字符串数组),形态非法重置为空(=全开);
  // 老档缺省=主动技默认自动。占位语义见 26/27 先例(防 while 落默认分支重置资产)。
  31: (d) => {
    const members = Array.isArray(d.members) ? d.members : []
    d.members = members.map((m) => {
      const off = (m as { autoCastOff?: unknown } | null | undefined)?.autoCastOff
      if (off === undefined) return m
      if (Array.isArray(off) && off.every((s) => typeof s === 'string')) return m
      return { ...(m as Record<string, unknown>), autoCastOff: [] }
    })
    return d
  },
  // 旧人物分支也使用 v23，但仍是 steps 路线；按结构识别，不能只看版本号。
  30: (d) => {
    d = migrateStoryRecovery(d)
    const state = d.runState as Partial<RunUIState> | undefined
    if (!state || typeof state !== 'object' || Array.isArray(state)) return d
    const next = { ...state, lastNodeResult: state.lastNodeResult === undefined ? null : state.lastNodeResult }
    const run = state.activeRun as unknown as Record<string, any> | null
    if (run?.kind === 'dungeon' && run.schema === 1 && run.map === undefined &&
        Array.isArray(run.steps) && run.steps.length > 0 && run.steps.every((s: unknown) => typeof s === 'string') &&
        Number.isInteger(run.stepIdx) && run.stepIdx >= 0 && run.stepIdx <= run.steps.length) {
      // 旧路线不能重放；保留已落袋资产，不模拟胜负或再发奖励。
      Object.assign(next, { activeRun: null, playing: false, autoLoop: false,
        eventId: null, eventResult: null, eventImpacts: [], pendingDeparture: null, pendingConsequence: null,
        notices: [...(state.notices ?? []), '旧版远征路线已失效，队伍已撤回。公会资产与已获得的装备保留，请重新出发。'] })
      const stock = run.battle?.commands
      const potions = stock ? { heal: stock.healStock, fury: stock.furyStock } : run.potions
      if (potions && [potions.heal, potions.fury].every(n => Number.isSafeInteger(n) && n >= 0)) d.potions = potions
    }
    return { ...d, runState: next }
  },
  // R1.1(U27①):副本远征改读分层地图——旧 steps/routeNodes 格式的进行中远征按撤退处理:
  // 成员带着现有状态回城,不扣东西,通知一句;高塔断点不受影响。
  22: (d) => {
    const runState = d.runState as { activeRun?: { kind?: string } | null; notices?: string[] } | undefined
    if (runState?.activeRun?.kind === 'dungeon') {
      d.runState = {
        ...runState,
        activeRun: null,
        notices: [...(runState.notices ?? []), '旧路线已失效,队伍已撤回'],
      }
    }
    return d
  },
  // R1.2(U27②):路况状态入档——v23 的进行中远征补空状态
  23: (d) => {
    const runState = d.runState as { activeRun?: { kind?: string; conditions?: string[] } | null } | undefined
    if (runState?.activeRun?.kind === 'dungeon' && !Array.isArray(runState.activeRun.conditions)) {
      runState.activeRun.conditions = []
    }
    return d
  },
  // R3/W2(U31):训练场武器专修——v24 补空已学族表(非法 id 由 migrate 收口再滤一遍)
  24: (d) => ({ ...d, weaponTraining: Array.isArray(d.weaponTraining) ? d.weaponTraining : [] }),
  // R5.3d(U33⑥):按人学武器——v25 的公会级已学族发给每位在世成员,删除公会字段(非法族 id 滤除)
  25: (d) => {
    const guild = (Array.isArray(d.weaponTraining) ? d.weaponTraining : []).filter(
      (f): f is string => typeof f === 'string' && f in WEAPON_FAMILIES,
    )
    const members = Array.isArray(d.members) ? d.members : []
    d.members = members.map((m) => {
      const alive = m && typeof m === 'object' && (m as { alive?: boolean }).alive !== false
      return alive && !(m as { weaponLearned?: string[] }).weaponLearned
        ? { ...m, weaponLearned: [...guild] }
        : m
    })
    delete d.weaponTraining
    return d
  },
  // R4.2(U32① 疗养所稳定制):Scar 增可选字段 faint/faintSince,老档无需数据变更——
  // 占位迁移防止 while 循环落进默认步骤(默认步骤会重置金币/祝福/招募冷却)
  26: (d) => d,
  // R4.3(U30)酒馆情报:intel 可选字段(副本→真假),老档缺省=无待用情报;占位防默认步骤
  27: (d) => d,
  // U36 情报条目化:v28 的 intel 布尔表作废(真伪/文本不再隐藏),换 intelEntries+intelStock
  28: (d) => { delete (d as Record<string, unknown>).intel; return d },
  // #2.1 词条 tier 化:老装备 rolls 里被删的多档词条 id 映射到存活词条(值保留,重掷才按 tier 重取)
  29: (d) => {
    const items = d.items as Record<string, { rolls?: { affixId: string }[] }> | undefined
    if (items && typeof items === 'object') {
      for (const item of Object.values(items)) {
        if (!Array.isArray(item?.rolls)) continue
        item.rolls = item.rolls.map((r) => {
          const to = AFFIX_RENAMES[r?.affixId]
          return to ? { ...r, affixId: to } : r
        })
      }
    }
    return d
  },
  // A2 事实账本(ROADMAP §3.3):v22 起记录,旧档为空账本(编年史不迁移)
  21: (d) => ({ ...d, factLedger: { nextId: 1, facts: [] } }),
  20: (d) => ({ ...d, runState: initialRunState(), visitor: null, generationState: null }),
  19: (d) => {
    const result = readItemFields(d, true)
    return { ...d, ...result.fields, itemMigrationIssues: result.issues }
  },
  18: (d) => ({ ...d, rngState: legacyRngState(d) }),
  17: (d) => ({ ...d, rareHuntNext: null }),
  16: (d) => ({ ...d, statistics: newStatistics(typeof d.day === 'number' ? Math.max(1, Math.floor(d.day)) : 1) }),
  15: (d) => ({ ...d, trainingReady: d.trainingReady === true }),
  14: (d) => ({ ...d, healingMastery: {} }),
  13: (d) => ({ ...d, pendingRelics: [] }),
  12: (d) => ({ ...d, starMarrow: 0 }),
  11: (d) => ({ ...d, kingdom: newKingdomState() }),
  // v1 → v2:补经济三字段(exp/bonds 的补齐也在这一级做,老档一次迁移到位)
  1: (d) => {
    const members = (d.members as Member[] | undefined)?.map((m) => ({
      ...m,
      exp: m.exp ?? 0,
      bonds: m.bonds ?? {},
    }))
    return { ...d, members, gold: 150, blessing: 0, recruitCooldown: 0, towerBest: 0 }
  },
  2: (d) => ({ ...d, towerBest: 0 }),
  // v3 → v4:补离线累积时间戳
  3: (d) => ({ ...d, lastSeen: Date.now() }),
  // v4 → v5:补编年史与公会日
  4: (d) => ({ ...d, chronicle: [], day: 1 }),
  // v5 → v6:补公会基地建筑
  5: (d) => ({ ...d, buildings: {} }),
  // v6 → v7:补药水库存(经济改造前每场白送,迁移给一份初始量)
  6: (d) => ({ ...d, potions: { heal: 3, fury: 3 } }),
  // v7 → v8:混合职阶解锁记录
  7: (d) => ({ ...d, unlockedHybrids: [] }),
  // v8 → v9:副本熟练度
  8: (d) => ({ ...d, dungeonMastery: {} }),
  // v9 → v10:延迟第二幕队列
  9: (d) => ({ ...d, pendingConsequences: (d.pendingConsequences as unknown[] | undefined) ?? [] }),
  // v10 → v11:事件图鉴+公会层状态
  10: (d) => ({ ...d, eventsSeen: (d.eventsSeen as string[] | undefined) ?? [], guildBuffs: (d.guildBuffs as unknown[] | undefined) ?? [] }),
}

function migrateStoryRecovery(d: Record<string, unknown>): Record<string, unknown> {
  const runState = d.runState as RunUIState | undefined
  const battle = runState?.activeRun?.battle
  if (!battle?.commands || !Object.hasOwn(battle.commands, 'signature')) return d
  const commands = { ...battle.commands } as typeof battle.commands & { signature?: unknown }
  const old = commands.signature as { memberId?: unknown; skillId?: unknown; targetId?: unknown } | null
  delete commands.signature
  const member = Array.isArray(battle.combatants) && old && typeof old.memberId === 'string'
    ? battle.combatants.find(c => c.team === 'guild' && c.memberId === old.memberId) : undefined
  const skill = member?.specId ? SIGNATURE_SKILLS[member.specId] : undefined
  if (old && member && skill && skill.id === old.skillId && typeof old.memberId === 'string' &&
      (old.targetId === undefined || typeof old.targetId === 'string')) {
    const slots = commands.signatures ?? {}
    if (!Object.hasOwn(slots, old.memberId)) commands.signatures = {
      ...slots, [old.memberId]: { memberId: old.memberId, skillId: skill.id, ...(old.targetId === undefined ? {} : { targetId: old.targetId }) },
    }
  }
  return { ...d, runState: { ...runState, activeRun: { ...runState!.activeRun, battle: { ...battle, commands } } } }
}

/** 来源编号是可选证据。损坏时只降级为无来源，不能让后果留在队列中反复兑现。 */
function normalizeConsequenceOrigin<T>(value: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, 'originFactId')) return value
  const entry = value as Record<string, unknown>
  if (Number.isSafeInteger(entry.originFactId) && (entry.originFactId as number) > 0) return value
  const cleaned = { ...entry }
  delete cleaned.originFactId
  return cleaned as T
}

/** 老档没有序列，按已有公会时间/日期建立稳定起点；迁移不访问随机数或改资产。 */
function legacyRngState(d: Record<string, unknown>): number {
  const time = typeof d.lastSeen === 'number' && Number.isFinite(d.lastSeen) ? d.lastSeen : 7777
  const day = typeof d.day === 'number' && Number.isFinite(d.day) ? d.day : 1
  return (time ^ Math.imul(day, 7919)) >>> 0
}

/** 纯函数迁移:供 loadGuildSave 与 smoke 直接验证 */
export function migrate(data: Record<string, unknown>): GuildSave {
  let v = (data.version as number) ?? 1
  let d = { ...data }
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v]
    d = step ? step(d) : { ...d, gold: 150, blessing: 0, recruitCooldown: 0 }
    v += 1
    d.version = v
  }
  d.trainingReady = d.trainingReady === true
  d.rngState = typeof d.rngState === 'number' && Number.isInteger(d.rngState) && d.rngState >= 0 && d.rngState <= 0xffffffff
    ? d.rngState : legacyRngState(d)
  d.starMarrow = typeof d.starMarrow === 'number' ? d.starMarrow : 0
  d.pendingRelics = Array.isArray(d.pendingRelics) ? d.pendingRelics : []
  d.healingMastery = d.healingMastery && typeof d.healingMastery === 'object' ? d.healingMastery : {}
  d.intelEntries = sanitizeIntelEntries(d.intelEntries)
  if (typeof d.intelStock === 'number' && Number.isFinite(d.intelStock)) d.intelStock = Math.max(0, Math.min(9, Math.floor(d.intelStock)))
  else delete d.intelStock // 不注入缺省键:逐字节往返对照要求老档对象不变(App 侧取缺省)
  d.kingdom = normalizeKingdom(d.kingdom)
  d.statistics = normalizeStatistics(d.statistics, typeof d.day === 'number' ? d.day : 1)
  d.factLedger = normalizeLedger(d.factLedger)
  if (Array.isArray(d.pendingConsequences)) d.pendingConsequences = d.pendingConsequences.map(normalizeConsequenceOrigin)
  const progress = d.runState as RunUIState | undefined
  if (progress?.pendingConsequence) {
    const pendingConsequence = normalizeConsequenceOrigin(progress.pendingConsequence)
    if (pendingConsequence !== progress.pendingConsequence) d.runState = { ...progress, pendingConsequence }
  }
  const hunt = d.rareHuntNext as GuildSave['rareHuntNext']
  d.rareHuntNext = hunt && Number.isFinite(hunt.mult) && hunt.mult >= 1 &&
    Number.isFinite(hunt.rewardMult) && hunt.rewardMult >= 1
    ? { mult: hunt.mult, rewardMult: hunt.rewardMult } : null
  if (!d.items || typeof d.items !== 'object' || Array.isArray(d.items)) throw new Error('存档缺少物品注册表')
  const repaired = readItemFields(d, false)
  const issues = [...(Array.isArray(d.itemMigrationIssues) ? d.itemMigrationIssues : []), ...repaired.issues]
  Object.assign(d, repaired.fields)
  delete d.itemMigrationIssues
  if (issues.length) console.warn('公会装备归属已修复：' + [...new Set(issues)].join(' '))
  return d as unknown as GuildSave
}

function validate(d: GuildSave): boolean {
  return (
    d.version === SAVE_VERSION &&
    Array.isArray(d.members) &&
    validateRunState(d.runState, d.members) &&
    (d.visitor === null || (d.visitor && typeof d.visitor.story === 'string' &&
      d.visitor.member && typeof d.visitor.member.id === 'string' &&
      !!JOBS[d.visitor.member.job] && typeof d.visitor.member.alive === 'boolean' &&
      Number.isFinite(d.visitor.member.hp) && !!d.visitor.member.attrs && !!d.visitor.member.equipment)) &&
    (d.generationState === null || (d.generationState && Number.isSafeInteger(d.generationState.seq) && d.generationState.seq >= 0 && Array.isArray(d.generationState.usedNames) && d.generationState.usedNames.every(n => typeof n === 'string'))) &&
    typeof d.rngState === 'number' &&
    typeof d.items === 'object' && Number.isSafeInteger(d.itemSeq) &&
    Array.isArray(d.members) &&
    d.members.length > 0 &&
    typeof d.gold === 'number' &&
    typeof d.blessing === 'number' &&
    typeof d.recruitCooldown === 'number' &&
    typeof d.towerBest === 'number' &&
    typeof d.lastSeen === 'number' &&
    Array.isArray(d.chronicle) &&
    typeof d.day === 'number' &&
    d.buildings !== undefined &&
    d.potions !== undefined &&
    typeof d.potions.heal === 'number' &&
    typeof d.potions.fury === 'number' &&
    Array.isArray(d.unlockedHybrids) &&
    d.dungeonMastery !== undefined
  )
}

/** 成员消毒(宪法 v3.1):被砍 spec/非法种族回落——老档与新数据表之间永远安全 */
export function sanitizeMembers(members: Member[]): Member[] {
  return members.map((m) => {
    const out = { ...m }
    const okSpec = out.spec && (isHybrid(out.spec) || !!JOBS[out.job]?.specs[out.spec])
    if (!okSpec) out.spec = undefined
    if (out.race && !RACES[out.race]) out.race = undefined
    void 0
    // 六维改革:老档缺体/精/运 → 补中性值 3
    out.attrs = {
      str: out.attrs.str ?? 3,
      agi: out.attrs.agi ?? 3,
      int: out.attrs.int ?? 3,
      vit: out.attrs.vit ?? 3,
      spr: out.attrs.spr ?? 3,
      lck: out.attrs.lck ?? 3,
    }
    // Legacy preview saves used -1 as full health; resolve before hub events use HP.
    if (out.alive && out.hp === -1) out.hp = maxHpOf(out)
    // R4.1 生平:bio 消毒(可选字段,老档 undefined 合法;非法条目逐条丢弃)
    // 不给无 bio 的成员引入新键——迁移对照测试要求老档对象逐字节不变
    const cleanBio = sanitizeBio(out.bio)
    if (cleanBio) out.bio = cleanBio
    return out
  })
}

/** 消毒沿用真实装备投影，随后仍存 UID，避免读档误把字符串当装备计算满血。 */
function sanitizeSavedMembers(save: GuildSave): void {
  const items = itemStateFromSave(save)
  save.members = serializeGuildItems(items, sanitizeMembers(resolveMembers(save.members, items))).members
  if (save.visitor) save.visitor = { ...save.visitor, member: sanitizeMembers([save.visitor.member])[0] }
}

/** 防御式加载:解析 → 逐级迁移 → 消毒 → 校验,任何异常回退为无存档 */
export function loadGuildSave(): GuildSave | null {
  unreadableSave = false
  loadNotice = ''
  lastLoadError = ''
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return parseGuildSave(raw)
  } catch (e) {
    lastLoadError = e instanceof Error ? e.message : String(e)
    console.warn('主存档读取失败(诊断):', lastLoadError)
    try {
      const backup = localStorage.getItem(KEY + '.bak')
      if (backup) {
        const recovered = parseGuildSave(backup)
        loadNotice = '当前存档无法读取，已恢复上一份有效备份，请核对远征进度。'
        console.warn(loadNotice, '(主存档异常:', lastLoadError + ')')
        return recovered
      }
    } catch (e2) {
      lastLoadError = `主:${lastLoadError};备份:${e2 instanceof Error ? e2.message : String(e2)}`
    }
    unreadableSave = true
    saveFailReason = '存档与备份均无法读取(只读保护中)——原始数据已保留;请导出存档并反馈,或重开公会。诊断:' + lastLoadError
    loadNotice = '当前存档与备份无法读取，原始数据已保留。请确认后重开公会；自动保存暂已停止。'
    console.warn(loadNotice, '诊断:', lastLoadError)
    return null
  }
}

function parseGuildSave(raw: string): GuildSave {
  const migrated = migrate(JSON.parse(raw) as Record<string, unknown>)
  if (!validate(migrated)) throw new Error('存档或远征断点不完整')
  sanitizeSavedMembers(migrated)
  return migrated
}

export function saveGuild(s: Omit<GuildSave, 'version' | 'lastSeen'>): boolean {
  if (unreadableSave) {
    saveFailReason = '存档与备份此前无法读取,处于只读保护——请重开公会或导入有效存档。诊断:' + (lastLoadError || '未知')
    return false
  }
  saveFailReason = ''
  try {
    assertItemOwnership(itemStateFromSave(s))
    if (!validateRunState(s.runState, s.members)) throw new Error('无效远征断点')
  } catch (e) {
    saveFailReason = '存档内容未通过校验(程序缺陷,请把此提示反馈给开发者):' + (e instanceof Error ? e.message : String(e))
    console.warn('存档未写入：', saveFailReason)
    return false
  }
  try {
    const prev = localStorage.getItem(KEY)
    if (prev) {
      try { parseGuildSave(prev); localStorage.setItem(KEY + '.bak', prev) } catch { /* 坏原档不覆盖好备份。 */ }
    }
    localStorage.setItem(KEY, JSON.stringify({ ...s, version: SAVE_VERSION, lastSeen: Date.now() }))
    return true
  } catch {
    // 隐私模式/配额不足等存储不可用:保留原文案语义
    saveFailReason = '浏览器存储已满或不可用(隐私模式/配额不足),近期进度可能未保存,建议导出存档备份。'
    return false
  }
}

/** 仅在玩家确认导入后解除坏档保护；预览不会覆盖原始数据或解锁自动保存。 */
export function replaceGuildSave(s: GuildSave): boolean {
  if (!validate(s)) return false
  const blocked = unreadableSave
  unreadableSave = false
  if (!saveGuild(s)) { unreadableSave = blocked; return false }
  loadNotice = ''
  return true
}

/** 导出存档为可复制的文本码(unicode 安全) */
export function exportSave(s: GuildSave): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(s))))
}

/** 导入文本码:解析 → 迁移 → 校验,失败返回 null(不落盘,由调用方决定) */
export function importSave(text: string): GuildSave | null {
  try {
    const json = decodeURIComponent(escape(atob(text.trim())))
    const migrated = migrate(JSON.parse(json) as Record<string, unknown>)
    if (!validate(migrated)) return null
    sanitizeSavedMembers(migrated)
    return migrated
  } catch {
    return null
  }
}

export function clearGuildSave(): void {
  unreadableSave = false
  loadNotice = ''
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 同上
  }
}

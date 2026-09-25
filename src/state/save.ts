import type { DeadHero, ItemInstance, Member } from '../sim/types'
import { JOBS } from '../data/jobs'
import { RACES } from '../data/races'
import { isHybrid } from '../data/vocations'
import type { ChronicleEntry } from '../sim/chronicle'
import { newKingdomState, normalizeKingdom, type KingdomState } from '../sim/kingdom'

// 公会存档(save-systems:版本号 + 迁移链 + 防御式加载)
// 只在公会阶段落盘(远征中不写):刷新/关闭浏览器后恢复公会资产,
// 进行中的远征视为放弃(远征前状态为准)。正式存档(离线累积/多栏位)按 M1 路线再做。

const KEY = 'guild-game-save-v1' // 键名保持:内部用 schema version 迁移,不换键

export const SAVE_VERSION = 15

export interface PendingConsequence {
  eventId: string
  dueDay: number
}

/** 公会层持续状态(事件二期:跨天传奇,出征时全队生效) */
export interface StoredGuildBuff {
  buff: { id: string; name: string; desc: string; mods: { atk?: number; def?: number; hp?: number; heal?: number } }
  endDay: number
}

export interface GuildSave {
  /** v12: 王国委托、进度和一次性领取记录 */
  kingdom: KingdomState
  /** v13: 星髓(拆解 T3 装备所得,灰冠兑换用) */
  starMarrow: number
  /** v14: 遗物安葬 2.0——阵亡者装备待赎回清单(赎回制) */
  pendingRelics: { item: import('../sim/types').ItemInstance; hero: string; redeem: number }[]
  /** v15: 疗养熟练度(维度→尝试次数,DESIGN 14.2) */
  healingMastery: Record<string, number>
  version: number
  members: Member[]
  inventory: ItemInstance[]
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
  d.starMarrow = typeof d.starMarrow === 'number' ? d.starMarrow : 0
  d.pendingRelics = Array.isArray(d.pendingRelics) ? d.pendingRelics : []
  d.healingMastery = d.healingMastery && typeof d.healingMastery === 'object' ? d.healingMastery : {}
  d.kingdom = normalizeKingdom(d.kingdom)
  return d as unknown as GuildSave
}

function validate(d: GuildSave): boolean {
  return (
    d.version === SAVE_VERSION &&
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
    return out
  })
}

/** 防御式加载:解析 → 逐级迁移 → 消毒 → 校验,任何异常回退为无存档 */
export function loadGuildSave(): GuildSave | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const migrated = migrate(JSON.parse(raw) as Record<string, unknown>)
    if (!validate(migrated)) return null
    migrated.members = sanitizeMembers(migrated.members)
    return migrated
  } catch {
    return null
  }
}

export function saveGuild(s: Omit<GuildSave, 'version' | 'lastSeen'>): void {
  try {
    const prev = localStorage.getItem(KEY)
    if (prev) localStorage.setItem(KEY + '.bak', prev) // 上一份好存档做备份,写坏可回退
    localStorage.setItem(KEY, JSON.stringify({ ...s, version: SAVE_VERSION, lastSeen: Date.now() }))
  } catch {
    // 隐私模式等存储不可用:静默降级为无存档
  }
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
    migrated.members = sanitizeMembers(migrated.members)
    return migrated
  } catch {
    return null
  }
}

export function clearGuildSave(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 同上
  }
}

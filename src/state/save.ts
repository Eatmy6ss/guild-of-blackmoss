import type { DeadHero, ItemInstance, Member } from '../sim/types'

// 公会存档(save-systems:版本号 + 迁移链 + 防御式加载)
// 只在公会阶段落盘(远征中不写):刷新/关闭浏览器后恢复公会资产,
// 进行中的远征视为放弃(远征前状态为准)。正式存档(离线累积/多栏位)按 M1 路线再做。

const KEY = 'guild-game-save-v1' // 键名保持:内部用 schema version 迁移,不换键

export const SAVE_VERSION = 2

export interface GuildSave {
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
}

/** 迁移链:每级一个纯函数,旧形态 → 新形态(save-systems 模式 3) */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2:补经济三字段(exp/bonds 的补齐也在这一级做,老档一次迁移到位)
  1: (d) => {
    const members = (d.members as Member[] | undefined)?.map((m) => ({
      ...m,
      exp: m.exp ?? 0,
      bonds: m.bonds ?? {},
    }))
    return { ...d, members, gold: 150, blessing: 0, recruitCooldown: 0 }
  },
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
  return d as unknown as GuildSave
}

function validate(d: GuildSave): boolean {
  return (
    d.version === SAVE_VERSION &&
    Array.isArray(d.members) &&
    d.members.length > 0 &&
    typeof d.gold === 'number' &&
    typeof d.blessing === 'number' &&
    typeof d.recruitCooldown === 'number'
  )
}

/** 防御式加载:解析 → 逐级迁移 → 校验,任何异常回退为无存档 */
export function loadGuildSave(): GuildSave | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const migrated = migrate(JSON.parse(raw) as Record<string, unknown>)
    return validate(migrated) ? migrated : null
  } catch {
    return null
  }
}

export function saveGuild(s: Omit<GuildSave, 'version'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, version: SAVE_VERSION }))
  } catch {
    // 隐私模式等存储不可用:静默降级为无存档
  }
}

export function clearGuildSave(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 同上
  }
}

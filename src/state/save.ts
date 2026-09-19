import type { DeadHero, ItemInstance, Member } from '../sim/types'

// M0 会话级存档（M0 计划：localStorage 顶替正式存档，正式存档在 M1）。
// 只在公会阶段落盘（远征中不写）：刷新/关闭浏览器后恢复公会资产，
// 进行中的远征视为放弃（远征前状态为准）。正式存档（离线累积/多栏位）M1 再做。

const KEY = 'guild-game-save-v1'

export interface GuildSave {
  v: 1
  members: Member[]
  inventory: ItemInstance[]
  memorial: DeadHero[]
  manual: string[]
  protectOn: boolean
}

export function loadGuildSave(): GuildSave | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as GuildSave
    if (s?.v !== 1 || !Array.isArray(s.members) || s.members.length === 0) return null
    return s
  } catch {
    return null
  }
}

export function saveGuild(s: Omit<GuildSave, 'v'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, v: 1 }))
  } catch {
    // 隐私模式等存储不可用：M0 静默降级为无存档
  }
}

export function clearGuildSave(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 同上
  }
}

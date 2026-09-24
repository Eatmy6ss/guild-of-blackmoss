import type { Member } from '../sim/types'

// 版图→副本→路线三级(宪法 v3.3 缺陷④):版图是世界的层次;解锁链以 boss 首杀(manual)为进度。
export interface RegionDef {
  id: string
  name: string
  order: number
  /** 主线副本(顺序即推进线) */
  main: string[]
  /** 支线副本(主线过半后开放) */
  side: string[]
  /** 版图压轴(主线全通解锁;通关=下一版图钥匙) */
  finale: string
}

export const REGIONS: RegionDef[] = [
  {
    id: 'blackmoss-wild',
    name: '黑苔荒野',
    order: 1,
    main: ['blackmoss', 'rustmine', 'ashfield'],
    side: ['frostgrave', 'abyssaltar'],
    finale: 'thornhold',
  },
  {
    id: 'dragonridge',
    name: '龙脊山脉',
    order: 2,
    main: ['emberpass', 'scalehaven', 'fireridge'],
    side: ['pilgrim-path', 'forge-works'],
    finale: 'dragonmaw',
  },
]

/** 每个副本的"通关"标志 = 末位 boss 首杀 */
export const DUNGEON_FINAL_BOSS: Record<string, string> = {
  blackmoss: 'talma',
  rustmine: 'delveanchor',
  ashfield: 'moldreke',
  frostgrave: 'velhola',
  abyssaltar: 'malsau',
  thornhold: 'victor',
  emberpass: 'kazraxes',
  scalehaven: 'ignathos',
  fireridge: 'valselon',
  'pilgrim-path': 'oengus',
  'forge-works': 'gramas',
  dragonmaw: 'valosaris',
}

/** 副本锁定检查:返回 null = 可进,否则为锁定原因 */
export function dungeonLock(dungeonId: string, killed: string[]): string | null {
  const region = REGIONS.find((r) => [...r.main, ...r.side, r.finale].includes(dungeonId))
  if (!region) return null
  // F01 修复(2026-09-25):补上版图间门槛——RegionDef 注释里的"通关=下一版图钥匙"此前未实现,
  // 新档可直接进版图二入口;现要求前一版图的团本(毕业考)首杀
  const regionIdx = REGIONS.indexOf(region)
  if (regionIdx > 0 && dungeonId === region.main[0] && !killed.includes(DUNGEON_FINAL_BOSS[REGIONS[regionIdx - 1]!.finale])) {
    return `通关${REGIONS[regionIdx - 1]!.name}·团本后开放`
  }
  const mainCleared = region.main.filter((id) => killed.includes(DUNGEON_FINAL_BOSS[id])).length
  const idx = region.main.indexOf(dungeonId)
  if (idx >= 0) {
    if (idx === 0) return null
    const prev = region.main[idx - 1]
    return killed.includes(DUNGEON_FINAL_BOSS[prev]) ? null : `通关${regionNameOf(prev)}后开放`
  }
  if (region.side.includes(dungeonId)) {
    return mainCleared >= 2 ? null : `主线推进过半后开放(${mainCleared}/2)`
  }
  if (region.finale === dungeonId) {
    return mainCleared >= region.main.length ? null : `主线全通后开放(${mainCleared}/${region.main.length})`
  }
  return null
}

/** 下一版图是否解锁(= 当前末位版图 finale 通关) */
export function nextRegionLocked(killed: string[]): string | null {
  const last = REGIONS[REGIONS.length - 1]
  return killed.includes(DUNGEON_FINAL_BOSS[last.finale]) ? null : `通关${last.name}·团本后开放`
}

function regionNameOf(dungeonId: string): string {
  for (const r of REGIONS) {
    const d = [...r.main, ...r.side, r.finale].indexOf(dungeonId)
    if (d >= 0) return r.name
  }
  return ''
}
void (undefined as unknown as Member)

import type { TerrainId } from '../sim/dungeon-map'

// 风险地形的当场回报(R5/U33①):危险地形在掷路况的同时当场给一样好处,中性地形无回报。
// 数值全部是 C4 结构占位,G3 平衡窗口统调。地图悬停框在档 2 起与路况风险并列显示本表。

export interface TerrainReward {
  id: TerrainId
  /** 悬停框一句话(回报;与「走这里可能:×」并列) */
  desc: string
  /** 在本节点打仗:掉落率倍率(settlement 消费) */
  dropMult?: number
  /** 非战斗节点:进入时按此概率捞到 1 件装备 */
  lootChance?: number
  /** 在本节点打仗:熟练度收益倍率(settlement 消费) */
  masteryMult?: number
  /** 进入节点:英灵祝福 +N */
  blessing?: number
  /** 进入节点:全队幸存者回复 N% 最大生命 */
  healPct?: number
}

export const TERRAIN_REWARDS: Partial<Record<TerrainId, TerrainReward>> = {
  water: { id: 'water', desc: '水边摸排:掉落率 ×1.5;非战斗节点有 25% 捞到 1 件装备', dropMult: 1.5, lootChance: 0.25 },
  wild: { id: 'wild', desc: '林野历练:本节点的战斗熟练度收益 ×2', masteryMult: 2 },
  grave: { id: 'grave', desc: '祭奠亡者:英灵祝福 +2', blessing: 2 },
  camp: { id: 'camp', desc: '营地喘息:全队回复 15% 生命', healPct: 0.15 },
}

export function terrainRewardOf(terrain: TerrainId): TerrainReward | undefined {
  return TERRAIN_REWARDS[terrain]
}

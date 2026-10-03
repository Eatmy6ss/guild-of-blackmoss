// 副本分层地图(U27①,redesign R1.1):每趟随机生成,删除固定路线。
// 本文件在 R1.4 先行导出地形词表供事件分池引用;生成器 generateMap 随 R1.1 落地。

/** 地形词表(事件分池草案 §1,九类) */
export type TerrainId = 'water' | 'wild' | 'road' | 'camp' | 'under' | 'ruin' | 'grave' | 'sanctum' | 'lava'

export const TERRAIN_NAMES: Record<TerrainId, string> = {
  water: '水域',
  wild: '林野',
  road: '道路',
  camp: '营地',
  under: '地下',
  ruin: '废墟',
  grave: '墓地',
  sanctum: '圣所',
  lava: '熔岩',
}

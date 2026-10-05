// 界面状态机(U27⑥/U29,redesign §4;R5.2/U33⑦ 落地为真 go()/back()):
// 单一 screen 状态取代 screen('title'|'game')/hubScreen/memberSheetId 三套状态;
// 地图/战斗/结算/高塔都是 Screen 值——run.phase 只是数据,界面由 go() 驱动。
// Esc 统一返回(backTargetOf 逐级);地图 Esc=撤退确认、结算 Esc=返回公会、战斗/高塔 Esc 无效(App 层处理)。
// smithy/infirmary/training/shrine 为 R4 设施拆分预留(当前并入 base),状态机先收全集。

export type Screen =
  | 'title' | 'hall'
  | 'roster' | 'member' | 'tavern' | 'warehouse' | 'base' | 'kingdom'
  | 'chronicle' | 'memorial' | 'manual' | 'expedition' | 'statistics'
  | 'map' | 'battle' | 'result' | 'tower'
  | 'smithy' | 'infirmary' | 'training' | 'shrine'

/** 当前实装的功能坞屏(R4 把 base 拆成 smithy/infirmary/training/shrine 后并入全集) */
export type HubScreen =
  | 'kingdom' | 'roster' | 'tavern' | 'warehouse' | 'base'
  | 'chronicle' | 'memorial' | 'manual' | 'expedition' | 'statistics'

/** 返回上一级(§4:Esc 统一返回):单人档案回花名册,统计回大事记,其余功能坞屏回大厅。
 *  远征屏族(map/battle/result/tower)的返回语义由 Esc 层特判(撤退确认/返回公会/无效),
 *  本表给保守缺省:map/battle/tower 原地不动,result 回大厅。 */
export function backTargetOf(screen: Screen): Screen {
  if (screen === 'member') return 'roster'
  if (screen === 'statistics') return 'chronicle'
  if (screen === 'result') return 'hall'
  if (screen === 'map' || screen === 'battle' || screen === 'tower') return screen
  if (screen === 'title') return 'title'
  return 'hall'
}

/** 大厅功能坞(顺序即展示顺序):图标 + 名称 + 快捷键 */
export const HUB_DOCK: { key: HubScreen; icon: string; label: string; hotkey: string }[] = [
  { key: 'kingdom', icon: '♜', label: '王国委托', hotkey: 'Q' },
  { key: 'roster', icon: '🛡', label: '花名册', hotkey: 'C' },
  { key: 'tavern', icon: '🍺', label: '酒馆', hotkey: 'T' },
  { key: 'warehouse', icon: '🎒', label: '仓库', hotkey: 'B' },
  { key: 'base', icon: '🏰', label: '基地', hotkey: 'N' },
  { key: 'chronicle', icon: '📜', label: '大事记', hotkey: 'J' },
  { key: 'memorial', icon: '🕯', label: '名人堂', hotkey: 'H' },
  { key: 'manual', icon: '📖', label: '手册', hotkey: 'K' },
]

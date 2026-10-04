// 界面状态机(U27⑥/U29,redesign §4):所有界面切换只走 go();Esc 统一返回上一级(backTargetOf)。
// 大厅是家:功能点进去是独立全屏界面(不再叠在大厅上面),入口=按钮卡片,美术之后换场景。
// smithy/infirmary/training/shrine 为 R4 设施拆分预留(当前并入 base),状态机先收全集。

export type Screen =
  | 'title' | 'hall'
  | 'roster' | 'member' | 'tavern' | 'warehouse' | 'base' | 'kingdom'
  | 'chronicle' | 'memorial' | 'manual' | 'expedition' | 'statistics'
  | 'map' | 'battle' | 'result'
  | 'smithy' | 'infirmary' | 'training' | 'shrine'

/** 当前实装的功能坞屏(R4 把 base 拆成 smithy/infirmary/training/shrine 后并入全集) */
export type HubScreen =
  | 'kingdom' | 'roster' | 'tavern' | 'warehouse' | 'base'
  | 'chronicle' | 'memorial' | 'manual' | 'expedition' | 'statistics'

/** 返回上一级(§4:Esc 统一返回):单人档案回花名册,统计回大事记,其余功能坞屏回大厅 */
export function backTargetOf(screen: Screen): Screen {
  if (screen === 'member') return 'roster'
  if (screen === 'statistics') return 'chronicle'
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

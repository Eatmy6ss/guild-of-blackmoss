// A10 新手最小引导(U24 确认要做;ROADMAP §3.6):
// 不做剧情化教学——三件套:战斗一次性提示/首次回城指向大事记与位阶/主菜单前几天逐步解锁。
// hintsSeen 存 GuildSave(可选字段,旧档缺省=提示待展示),不另开支线。

/** 主菜单逐步解锁(第 N 天起可用;手册/花名册/酒馆=第一天核心循环) */
export const DOCK_UNLOCK_DAY: Record<string, number> = {
  roster: 1,
  tavern: 1,
  manual: 1,
  warehouse: 2,
  chronicle: 1,
  kingdom: 4,
  base: 4,
  memorial: 5,
}

/** 里程碑提前解锁:锁定的入口在其功能首次相关时立即开放(纯天数会与游戏事件打架) */
export const DOCK_UNLOCK_MILESTONE: Record<string, (ctx: { inventoryCount: number; chronicleCount: number; memorialCount: number }) => boolean> = {
  warehouse: (c) => c.inventoryCount > 0,
  chronicle: (c) => c.chronicleCount > 0,
  memorial: (c) => c.memorialCount > 0,
}

export interface BattleHint {
  id: string
  text: string
  /** 适用条件(返回 false 则本局不弹) */
  applies?: (ctx: { hasSignature: boolean }) => boolean
}

/** 首次进入战斗的三条一次性提示(规格:招牌技/集火/撤退各一次) */
export const BATTLE_HINTS: BattleHint[] = [
  { id: 'hint-focus', text: '点击场上敌人 = 全队集火;打断敌方读条最快的方式就是集火它。' },
  {
    id: 'hint-signature',
    text: '【招牌技】按钮亮起时就能用——打断咏唱、斩杀残血、冰封后排,时机是你的武器。',
    applies: ({ hasSignature }) => hasSignature,
  },
  { id: 'hint-retreat', text: '情况不对?「撤退令」保住队伍——有人濒危时,撤退保护还会自动兜底。' },
]

/** 首次远征归来:指向大事记(说书人)与位阶晋升委托 */
export const FIRST_RETURN_TIP =
  '📖 这一趟的故事记进了《大事记》(J)——每位佣兵的一生都在那里。' +
  '接下来,朝着大厅顶上的「公会位阶」晋升委托努力:打赢第一头首领,铜牌就是你的。'

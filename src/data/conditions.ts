// 路况状态(U27②,redesign R1.2;R5/U33① 双刃化):走过的地形给队伍挂状态。
// 每条路况都有坏处(desc 前半)与好处(upside;desc 后半);部分状态按时消退(expires)。
// 数值是 C4 冻结期的结构占位,调参等 G3 平衡窗口。

import type { TerrainId } from '../sim/dungeon-map'

/** 触发器:terrain=进节点按 chance 掷;after-elite=精英战打完必触发;battle-streak=连走 N 个战斗节点 */
export type ConditionTrigger = 'terrain' | 'after-elite' | 'battle-streak'

/** 双刃的好处面(R5/U33①):与 battle/map 同构,由 sim 各消费点读取 */
export interface ConditionUpside {
  /** 我方火抗加算(湿透;灼热地形用得上) */
  fireRes?: number
  /** 敌方攻击间隔倍率(阴寒冻慢;>1=更慢) */
  enemySlow?: number
  /** 本趟经验倍率(疲惫) */
  expMult?: number
  /** 掉落率倍率(暴露:该场 ×2) */
  dropMult?: number
  /** 后两层暗道无视档位直接显示(迷途的好处) */
  secretReveal?: boolean
}

export interface RouteCondition {
  id: string
  name: string
  /** 写清坏处与好处,禁止只写氛围 */
  desc: string
  trigger: ConditionTrigger
  /** terrain 触发:哪些地形可能触发 */
  from?: TerrainId[]
  /** 基础触发率(熟练度修正在 sim 层乘) */
  chance: number
  /** battle-streak:连续几个战斗节点后触发 */
  streak?: number
  /** 战斗修正(坏处面):我方乘区(与事件 runBuff 同通道;enemy.atk 走敌方难度通道) */
  battle?: { atk?: number; def?: number; hp?: number; heal?: number; enemy?: { atk?: number } }
  /** 地图/远征层修正(坏处面) */
  map?: { eliteWeight?: number; restHeal?: number; revealPenalty?: number; potionLoss?: number }
  /** 好处面(R5/U33①) */
  upside?: ConditionUpside
  /** 按时消退(R5.1b):打完一场后 / 走过一层后;缺省=持续到本趟结束 */
  expires?: 'next-battle' | 'next-layer'
  /** 走到哪种地形会解除 */
  clearedBy?: TerrainId[]
}

/** 首批 6 条(U27②;R5/U33① 双刃化) */
export const ROUTE_CONDITIONS: RouteCondition[] = [
  {
    id: 'soaked', name: '湿透',
    desc: '浑身泡透了,还泡坏了 1 瓶治疗药,受疗 ×0.9——但火抗 +0.15,往灼热的地方走反而不虚。走到营地烤干解除。',
    trigger: 'terrain', from: ['water'], chance: 0.5,
    battle: { heal: 0.9 }, map: { potionLoss: 1 }, upside: { fireRes: 0.15 }, clearedBy: ['camp'],
  },
  {
    id: 'startled', name: '惊动',
    desc: '打了精英,整片巢穴都听见了——后续层精英出没更多(真权重 ×2),但精英回报也丰厚(金/验 ×2、熟练 +2、掉落保底绿)。',
    trigger: 'after-elite', chance: 1,
    map: { eliteWeight: 2 },
  },
  {
    id: 'tired', name: '疲惫',
    desc: '连着硬仗没喘过气,休整回复减半——但将士用命,本趟经验 ×1.2。',
    trigger: 'battle-streak', chance: 1, streak: 2,
    map: { restHeal: 0.5 }, upside: { expMult: 1.2 },
  },
  {
    id: 'lost', name: '迷途',
    desc: '林子长得都一样,下一层的选项一片漆黑——但慌乱中反而留意到暗道的踪迹(后两层有暗道就直接显示)。走过一层后自动解除。',
    trigger: 'terrain', from: ['wild'], chance: 0.4,
    map: { revealPenalty: 1 }, upside: { secretReveal: true }, expires: 'next-layer',
  },
  {
    id: 'exposed', name: '暴露',
    desc: '营地的火光被盯上了,下一场战斗敌方攻击 ×1.15——但穷寇易逐,那一场掉落率 ×2。打完一场后自动解除。',
    trigger: 'terrain', from: ['camp'], chance: 0.4,
    battle: { enemy: { atk: 1.15 } }, upside: { dropMult: 2 }, expires: 'next-battle',
  },
  {
    id: 'chill', name: '阴寒',
    desc: '墓地的寒气钻进骨头,攻击 ×0.92——但敌人冻得更慢(攻击间隔 ×1.1)。走到圣所暖过来解除。',
    trigger: 'terrain', from: ['grave'], chance: 0.5,
    battle: { atk: 0.92 }, upside: { enemySlow: 1.1 }, clearedBy: ['sanctum'],
  },
]

export const CONDITION_BY_ID: Record<string, RouteCondition> = Object.fromEntries(ROUTE_CONDITIONS.map((c) => [c.id, c]))

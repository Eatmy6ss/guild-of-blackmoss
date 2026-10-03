// 路况状态(U27②,redesign R1.2):走过的地形给队伍挂状态,持续到本趟结束,
// 改变后续战斗与地图。数值是 C4 冻结期的结构占位,调参等 G3 平衡窗口。

import type { TerrainId } from '../sim/dungeon-map'

/** 触发器:terrain=进节点按 chance 掷;after-elite=精英战打完必触发;battle-streak=连走 N 个战斗节点 */
export type ConditionTrigger = 'terrain' | 'after-elite' | 'battle-streak'

export interface RouteCondition {
  id: string
  name: string
  /** 写清实际效果与解除方式,禁止只写氛围 */
  desc: string
  trigger: ConditionTrigger
  /** terrain 触发:哪些地形可能触发 */
  from?: TerrainId[]
  /** 基础触发率(熟练度修正在 sim 层乘) */
  chance: number
  /** battle-streak:连续几个战斗节点后触发 */
  streak?: number
  /** 战斗修正:我方乘区(与事件 runBuff 同通道;enemy.atk 走敌方难度通道) */
  battle?: { atk?: number; def?: number; hp?: number; heal?: number; enemy?: { atk?: number } }
  /** 地图/远征层修正 */
  map?: { eliteWeight?: number; restHeal?: number; revealPenalty?: number; potionLoss?: number }
  /** 走到哪种地形会解除 */
  clearedBy?: TerrainId[]
}

/** 首批 6 条(U27②) */
export const ROUTE_CONDITIONS: RouteCondition[] = [
  {
    id: 'soaked', name: '湿透',
    desc: '浑身泡透了——受疗 ×0.9,还泡坏了 1 瓶治疗药。走到营地烤干解除。',
    trigger: 'terrain', from: ['water'], chance: 0.5,
    battle: { heal: 0.9 }, map: { potionLoss: 1 }, clearedBy: ['camp'],
  },
  {
    id: 'startled', name: '惊动',
    desc: '打了精英,整片巢穴都听见了——后续层精英出没更多(权重 ×2),直到本趟结束。',
    trigger: 'after-elite', chance: 1,
    map: { eliteWeight: 2 },
  },
  {
    id: 'tired', name: '疲惫',
    desc: '连着硬仗没喘过气——休整节点回复减半。',
    trigger: 'battle-streak', chance: 1, streak: 2,
    map: { restHeal: 0.5 },
  },
  {
    id: 'lost', name: '迷途',
    desc: '林子长得都一样——下一层的迷雾揭示降一级。',
    trigger: 'terrain', from: ['wild'], chance: 0.4,
    map: { revealPenalty: 1 },
  },
  {
    id: 'exposed', name: '暴露',
    desc: '营地的火光被盯上了——下一场战斗敌方攻击 ×1.15。',
    trigger: 'terrain', from: ['camp'], chance: 0.4,
    battle: { enemy: { atk: 1.15 } },
  },
  {
    id: 'chill', name: '阴寒',
    desc: '墓地的寒气钻进骨头——攻击 ×0.92。走到圣所暖过来解除。',
    trigger: 'terrain', from: ['grave'], chance: 0.5,
    battle: { atk: 0.92 }, clearedBy: ['sanctum'],
  },
]

export const CONDITION_BY_ID: Record<string, RouteCondition> = Object.fromEntries(ROUTE_CONDITIONS.map((c) => [c.id, c]))

// #0.2 统一敌人缩放入口(2026-09-27,实施计划批次 0)
// 反接缝规则:全项目对敌人数值做乘算的地方必须收敛到这里。
// createBattle(初始怪/boss)与 summon 机制(增援)都走 applyEnemyScaling;
// 高塔怪在 startTowerFloor 已预缩放，显式标记防止再次应用场次倍率。

import type { Combatant, EnemyDef } from './types'

export const ELITE_ENEMY_MULT = 1.25
export const TOWER_SCALING_PER_FLOOR = 0.15
export interface DifficultyModifiers {
  elite?: boolean
  rareHunt?: number
  towerFloor?: number
}
export function towerEnemyScale(floor: number): number {
  return 1 + TOWER_SCALING_PER_FLOOR * (floor - 1)
}

/** 敌人缩放因子(power 含曲线系数×精英倍率;difficulty 为地图修正) */
export interface EnemyScaleFactors {
  power: number
  hpFactor: number
  difficultyAttack: number
  difficultyHp: number
  elite?: boolean
}

export const NO_SCALING: EnemyScaleFactors = { power: 1, hpFactor: 1, difficultyAttack: 1, difficultyHp: 1 }

function scaledStats(base: Pick<EnemyDef, 'maxHp' | 'attack'>, f: EnemyScaleFactors) {
  return {
    maxHp: Math.max(1, Math.round(base.maxHp * f.power * f.hpFactor * f.difficultyHp)),
    attack: Math.max(1, Math.round(base.attack * f.power * f.difficultyAttack)),
  }
}

/** 初始与召唤共用单舍入语义；预缩放定义不再乘算，精英身份仍继承。 */
export function applyEnemyScaling(c: Combatant, f: EnemyScaleFactors): void {
  if (f.elite) c.elite = true
  if (c.enemyDef?.difficultyScaled) return
  Object.assign(c, scaledStats(c, f))
  c.hp = c.maxHp
}

// ---- #0.8 难度模型(2026-09-27):rating 决定总量,形状由数据表自带 ----

/** 全项目唯一的敌人缩放入口:按副本 rating 等比缩放(几何总量) */
export function scaleEnemy<T extends EnemyDef>(base: T, rating: number, refRating = 1): T {
  if (base.difficultyScaled) return { ...base }
  const k = rating / refRating
  return {
    ...base,
    ...scaledStats(base, { ...NO_SCALING, power: k }),
    defense: Math.max(0, Math.round(base.defense * k)),
  }
}

/** 等效强度估算(I7 单调性断言用):攻血几何均值 */
export function ratingOfEnemy(e: Pick<EnemyDef, 'attack' | 'maxHp'>): number {
  return Math.sqrt(Math.max(1, e.attack) * Math.max(1, e.maxHp))
}

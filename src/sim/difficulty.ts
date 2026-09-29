// #0.2 统一敌人缩放入口(2026-09-27,实施计划批次 0)
// 反接缝规则:全项目对敌人数值做乘算的地方必须收敛到这里。
// createBattle(初始怪/boss)与 summon 机制(增援)都走 applyEnemyScaling;
// 高塔怪在 startTowerFloor 已预缩放,其 dungeon 无曲线因子,天然不会二次放大。

import type { Combatant, EnemyDef } from './types'

/** 敌人缩放因子(power 含曲线系数×精英倍率;difficulty 为地图修正) */
export interface EnemyScaleFactors {
  power: number
  hpFactor: number
  difficultyAttack: number
  difficultyHp: number
}

export const NO_SCALING: EnemyScaleFactors = { power: 1, hpFactor: 1, difficultyAttack: 1, difficultyHp: 1 }

/** 对单个敌人应用缩放(唯一乘算点,单舍入语义)。幂等性由调用方保证(预缩放者传 NO_SCALING)。 */
export function applyEnemyScaling(c: Combatant, f: EnemyScaleFactors): void {
  c.maxHp = Math.max(1, Math.round(c.maxHp * f.power * f.hpFactor * f.difficultyHp))
  c.hp = c.maxHp
  c.attack = Math.max(1, Math.round(c.attack * f.power * f.difficultyAttack))
}

// ---- #0.8 难度模型(2026-09-27):rating 决定总量,形状由数据表自带 ----

/** 全项目唯一的敌人缩放入口:按副本 rating 等比缩放(几何总量) */
export function scaleEnemy(base: EnemyDef, rating: number, refRating = 1): EnemyDef {
  const k = rating / refRating
  return {
    ...base,
    maxHp: Math.max(1, Math.round(base.maxHp * k)),
    attack: Math.max(1, Math.round(base.attack * k)),
    defense: Math.max(0, Math.round(base.defense * k)),
  }
}

/** 等效强度估算(I7 单调性断言用):攻血几何均值 */
export function ratingOfEnemy(e: Pick<EnemyDef, 'attack' | 'maxHp'>): number {
  return Math.sqrt(Math.max(1, e.attack) * Math.max(1, e.maxHp))
}

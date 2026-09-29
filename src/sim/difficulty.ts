import type { DungeonDef, EnemyDef } from './types'

export const ENEMY_HP_MULT = 1.1
export const ELITE_ENEMY_MULT = 1.25
export const TOWER_SCALING_PER_FLOOR = 0.15

export type EnemyRole = 'trash' | 'elite' | 'boss'
export interface DifficultyModifiers {
  elite?: boolean
  /** Only supplied for the first encounter of a rare hunt. */
  rareHunt?: number
  towerFloor?: number
}
export interface DifficultyInput {
  // #0.2 preserves the existing curve. Rating/archetype migration belongs to #0.8.
  dungeon: Pick<DungeonDef, 'enemyPower' | 'difficultyMods' | 'expectedLevel'>
  role: EnemyRole
  modifiers?: DifficultyModifiers
}

export function towerEnemyScale(floor: number): number {
  return 1 + TOWER_SCALING_PER_FLOOR * (floor - 1)
}

/** Only construction-time enemy HP/attack multiplication lives here. Buffs are separate. */
export function scaleEnemy<T extends EnemyDef>(base: T, input: DifficultyInput): T {
  // Tower definitions already have their floor applied, including the summon pool.
  if (base.difficultyScaled) return { ...base }
  const { dungeon, modifiers = {} } = input
  const encounterScale = (modifiers.elite ? ELITE_ENEMY_MULT : 1) * (modifiers.rareHunt ?? 1)
  const towerScale = modifiers.towerFloor === undefined ? 1 : towerEnemyScale(modifiers.towerFloor)
  const power = (dungeon.enemyPower ?? 1) * encounterScale * towerScale
  const hpFactor = dungeon.expectedLevel === undefined ? 1 : ENEMY_HP_MULT
  const hpMod = dungeon.difficultyMods?.enemyHp ?? 1
  const attackMod = dungeon.difficultyMods?.enemyAttack ?? 1
  if (power === 1 && hpFactor === 1 && hpMod === 1 && attackMod === 1) {
    return { ...base, difficultyScaled: true }
  }
  return {
    ...base,
    difficultyScaled: true,
    maxHp: Math.round(base.maxHp * power * hpFactor * hpMod),
    // Preserve the existing boss two-stage rounding; ordinary enemies round once.
    attack: input.role === 'boss'
      ? Math.round(Math.round(base.attack * power) * attackMod)
      : Math.round(base.attack * power * attackMod),
  }
}

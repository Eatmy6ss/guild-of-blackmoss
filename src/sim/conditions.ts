// 路况状态机(U27②,redesign R1.2):纯函数,状态挂在 DungeonRun.conditions(id 集合,不叠层只刷新)。
// 触发率 = chance × 熟练度修正(0-34 档 ×1 / 60-79 档 ×0.75 / 80+ 档 ×0.5;R1.3 定档)。

import type { DungeonRun } from './run'
import type { MapNode } from './dungeon-map'
import { runRng } from './run-core'
import { CONDITION_BY_ID, type RouteCondition } from '../data/conditions'
import { nodeById } from './dungeon-map'

/** 熟练度 → 触发率修正(与 R1.3 的四档表对齐;中两档 35-59 仍 ×1) */
export function conditionChanceMod(mastery: number): number {
  if (mastery >= 80) return 0.5
  if (mastery >= 60) return 0.75
  return 1
}

export function activeConditions(run: Pick<DungeonRun, 'conditions'>): RouteCondition[] {
  return (run.conditions ?? []).map((id) => CONDITION_BY_ID[id]).filter(Boolean)
}

export function hasCondition(run: Pick<DungeonRun, 'conditions'>, id: string): boolean {
  return (run.conditions ?? []).includes(id)
}

function addCondition(run: DungeonRun, id: string): boolean {
  // 同一状态不叠层,再次触发只刷新(集合语义)
  if (hasCondition(run, id)) return false
  run.conditions = [...(run.conditions ?? []), id]
  return true
}

function removeCondition(run: DungeonRun, id: string): void {
  run.conditions = (run.conditions ?? []).filter((c) => c !== id)
}

/** 精英权重(惊动):后续层生成/翻新时消费 */
export function eliteWeightMult(run: Pick<DungeonRun, 'conditions'>): number {
  let mult = 1
  for (const c of activeConditions(run)) mult *= c.map?.eliteWeight ?? 1
  return mult
}

/** 休整节点回复倍率(疲惫) */
export function restHealMult(run: Pick<DungeonRun, 'conditions'>): number {
  let mult = 1
  for (const c of activeConditions(run)) mult *= c.map?.restHeal ?? 1
  return mult
}

/** 迷雾揭示降级层数(迷途) */
export function revealPenaltyLayers(run: Pick<DungeonRun, 'conditions'>): number {
  let n = 0
  for (const c of activeConditions(run)) n += c.map?.revealPenalty ?? 0
  return n
}

/** 战斗乘区:我方 mods(与事件 runBuff 同通道)+ 敌方 enemyMods(暴露) */
export function conditionBattleMods(run: Pick<DungeonRun, 'conditions'>): {
  mods: { atk?: number; def?: number; hp?: number; heal?: number }
  enemyMods: { atk?: number }
} {
  const mods: { atk?: number; def?: number; hp?: number; heal?: number } = {}
  const enemyMods: { atk?: number } = {}
  for (const c of activeConditions(run)) {
    if (!c.battle) continue
    for (const [k, v] of Object.entries(c.battle)) {
      if (k === 'enemy') {
        for (const [ek, ev] of Object.entries(c.battle.enemy ?? {})) {
          const key = ek as 'atk'
          enemyMods[key] = (enemyMods[key] ?? 1) * (ev as number)
        }
        continue
      }
      const key = k as 'atk' | 'def' | 'hp' | 'heal'
      mods[key] = (mods[key] ?? 1) * (v as number)
    }
  }
  return { mods, enemyMods }
}

/** 走上节点(R1.2):先按地形解除,再掷地形触发器与连战计数。返回本次新挂上的状态名(供界面提示)。 */
export function enterNodeConditions(run: DungeonRun, node: MapNode, mastery: number): string[] {
  const gained: string[] = []
  // 1) 解除:走到 clearedBy 地形
  for (const c of activeConditions(run)) {
    if (c.clearedBy?.includes(node.terrain)) removeCondition(run, c.id)
  }
  // 2) 地形触发器
  const mod = conditionChanceMod(mastery)
  for (const c of Object.values(CONDITION_BY_ID)) {
    if (c.trigger !== 'terrain' || !c.from?.includes(node.terrain)) continue
    if (runRng(run)() < c.chance * mod) {
      if (addCondition(run, c.id)) gained.push(c.name)
    }
  }
  // 3) 连战计数(疲惫):路径尾部连续战斗节点数
  for (const c of Object.values(CONDITION_BY_ID)) {
    if (c.trigger !== 'battle-streak') continue
    const need = c.streak ?? 2
    let streak = 0
    for (let i = run.path.length - 1; i >= 0; i--) {
      const n = nodeById(run.map, run.path[i] ?? '')
      if (n && (n.kind === 'battle' || n.kind === 'elite')) streak++
      else break
    }
    if (streak >= need) {
      if (addCondition(run, c.id)) gained.push(c.name)
    }
  }
  // 4) 立即生效的 map 效果:泡坏药水(湿透)
  for (const c of activeConditions(run)) {
    const loss = c.map?.potionLoss ?? 0
    if (loss > 0 && run.potions.heal > 0) {
      run.potions = { ...run.potions, heal: Math.max(0, run.potions.heal - loss) }
    }
  }
  return gained
}

/** 精英战打完(惊动):挂状态 + 后续层精英权重翻倍的确定性落实(把未来层的战斗节点翻成精英)。
 *  写时克隆地图:settlement 对 run 是浅拷贝(common.map 与输入共享),原地改会穿透输入方(run-recovery 抓过)。 */
export function triggerAfterElite(run: DungeonRun): string | null {
  const cond = Object.values(CONDITION_BY_ID).find((c) => c.trigger === 'after-elite')
  if (!cond) return null
  const currentLayer = nodeById(run.map, run.nodeId)?.layer ?? 0
  const weight = cond.map?.eliteWeight ?? 2
  let flipped = 0
  let map = run.map
  for (const layer of map.layers) {
    for (const n of layer) {
      if (n.layer <= currentLayer) continue
      if (n.kind !== 'battle' || !n.encounterId) continue
      if (flipped === 0) {
        // 首次需要翻节点时才克隆(输入不变契约)
        map = { ...run.map, layers: run.map.layers.map((l) => l.map((x) => ({ ...x }))) }
      }
      const target = map.layers[n.layer]!.find((x) => x.id === n.id)!
      if (runRng(run)() < 1 / weight) {
        target.kind = 'elite'
        flipped++
      }
    }
  }
  if (flipped > 0) run.map = map
  return addCondition(run, cond.id) || flipped > 0 ? cond.name : null
}
